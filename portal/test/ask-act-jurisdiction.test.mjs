import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {statuteTitleFile,shippedStatuteTitles} from '../../scripts/build_ask_statute_titles.mjs'
import {loadStatuteTitles,territoryAfterStatutes,normaliseStatuteTitle,statuteTitleSegments} from '../src/ask-statute-titles.mjs'
const b=await build({stdin:{contents:"export {extractAskConstraints,constrainStep} from './src/ask-constraints';export {inferPeriod} from './src/agentic-ask'",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const rows=JSON.parse(readFileSync(new URL('./fixtures/ask-act-jurisdiction.json',import.meta.url)))
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const titleFile=JSON.parse(readFileSync(new URL('../public/ask-statute-titles.json',import.meta.url)))
const known=new Set(titleFile.titles)
for(const row of rows)for(const [catalogue,titles] of [['present',known],['absent',null]])test(`ACT jurisdiction table (${catalogue}): ${row.question}`,()=>{
 const c=api.extractAskConstraints(row.question,api.inferPeriod(row.question),scope,{},titles)
 const search=api.constrainStep({tool:'search',args:{}},c,{state:{},since:{},until:{}})
 const expected=titles===null?undefined:row.jurisdiction??undefined
 assert.equal(c.jurisdiction,expected)
 assert.equal(search.args.state,expected)
 if(row.since){assert.equal(search.args.since,row.since);assert.equal(search.args.until,row.until)}
})

const separators=['.','?','!',';',':',',','—','–','-','\n']
for(const separator of separators)for(const [catalogue,titles]of [['present',known],['absent',null]]){
 const boundary=separator==='\n'?'\n':` ${separator} `
 for(const [kind,question,expected] of [
  ['clause',`While MPs debated climate change${boundary}ACT senators discussed housing.`,'act'],
  ['parenthesized title',`What did MPs say about the Australian Capital Territory (Example${boundary}Policy) ACT 2020?`,undefined],
  ['Treasury title',`What did MPs say about the Treasury Laws Amendment (A${boundary}B and C) Act 2020?`,undefined],
 ])test(`separator ${JSON.stringify(separator)} / ${kind} / catalogue ${catalogue}`,()=>{
  const catalogueWithFixture=titles===null||kind==='clause'?titles:new Set([...titles,normaliseStatuteTitle(question.slice('What did MPs say about the '.length,-1))])
  const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},catalogueWithFixture)
  const jurisdiction=titles===null?undefined:expected
  assert.equal(c.jurisdiction,jurisdiction)
  assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,jurisdiction)
 })
}
for(const [catalogue,titles]of [['present',known],['absent',null]])test(`every shipped catalogue title leaves jurisdiction and search state unset (${catalogue})`,()=>{
 const failures=[]
 for(const title of known){
  const question=`What did MPs say about the ${title}?`
  const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},titles)
  const state=api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state
  if(c.jurisdiction!==undefined||state!==undefined)failures.push({title,jurisdiction:c.jurisdiction,state})
 }
 assert.equal(known.size,1602)
 assert.deepEqual(failures,[])
})
for(const [catalogue,titles]of [['present',known],['absent',null]])test(`original shipped title spellings preserve parenthesized punctuation and select no jurisdiction (${catalogue})`,()=>{
 const raw=shippedStatuteTitles().titles,identities=new Set(),failures=[]
 let bracketedPunctuation=0
 for(const title of raw){
  identities.add(normaliseStatuteTitle(title))
  const segments=[...statuteTitleSegments(title)]
  // These are the original source spellings: normalization in the asset removes punctuation.
  for(const [parenthesized]of title.matchAll(/\((?:[^()]|\([^()]*\))*\)/g))if(/[.?!;:,—–-]/.test(parenthesized)){
    bracketedPunctuation++
    assert.ok(segments.some(s=>s.text.includes(parenthesized)),title)
  }
  const question=`What did MPs say about the ${title}?`
  const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},titles)
  const state=api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state
  if(c.jurisdiction!==undefined||state!==undefined)failures.push({title,jurisdiction:c.jurisdiction,state})
 }
 assert.deepEqual(identities,known)
 assert.ok(bracketedPunctuation>0,'real titles exercise bracket protection')
 assert.deepEqual(failures,[])
})
test('nested brackets retain title punctuation and compound hyphens while the next clause stays separate',()=>{
 const title='Australian Capital Territory (Example [A, B—C] and Self-Government) ACT 2020'
 for(const titles of [new Set([...known,normaliseStatuteTitle(title)]),null]){
  assert.deepEqual([...statuteTitleSegments(title)].map(s=>s.text),[title])
  for(const [question,expected]of [[`What changed under the ${title}?`,undefined],[`${title}, ACT senators discussed housing.`,'act']]){
   const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},titles)
   const jurisdiction=titles===null?undefined:expected
   assert.equal(c.jurisdiction,jurisdiction)
   assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,jurisdiction)
  }
 }
})
test('statute removal preserves independently named jurisdictions and explicit filters',()=>{
 const title='Aboriginal Land Rights (Northern Territory) Act'
 for(const [question,filters,expected] of [
  [`What did MPs say about the ${title}?`,{},undefined],
  [`What did ACT senators say about the ${title}?`,{},'act'],
  [`In Queensland, what did MPs say about the ${title}?`,{},'qld'],
  [`In federal parliament, what did MPs say about the ${title}?`,{},'federal'],
  [`What did MPs say about the ${title}?`,{state:'vic'},'vic'],
 ]){
  const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,filters,known)
  assert.equal(c.jurisdiction,expected,question)
  assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,expected,question)
 }
})
test('an Act abbreviation followed by a year stays inside a statute title segment',()=>{
 for(const titles of [known,null])for(const question of [
  'What changed under the Australian Capital Territory Act. 1988?',
  'What changed under the Australian Capital Territory (Self-Government) Act. 1988?',
  'Climate Change Act. 2022; ACT senators discussed housing.',
 ]){
  const expected=titles!==null&&question.startsWith('Climate')?'act':undefined
  const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},titles)
  assert.equal(c.jurisdiction,expected,question)
  assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,expected,question)
 }
})
test('generic dated and parenthesized statute exclusions supplement a loaded catalogue',()=>{
 for(const titles of [known,null])for(const suffix of ['Example Act 1888','Example (Self-Government) Act']){
  const title=`Australian Capital Territory ${suffix}`
  assert.equal(known.has(normaliseStatuteTitle(title)),false,'synthetic title is absent from the real catalogue')
  for(const [prefix,expected] of [['What changed under the ',undefined],['ACT senators discussed the ','act']]){
   const question=prefix+title+'?'
   const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},titles)
   const jurisdiction=titles===null?undefined:expected
   assert.equal(c.jurisdiction,jurisdiction,question)
   assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,jurisdiction,question)
  }
 }
})

test('the title asset is derived exactly from shipped bill and FRL title metadata',()=>{
 assert.deepEqual(titleFile,statuteTitleFile())
 assert.equal(titleFile.count,known.size)
 assert.ok(known.has('fair work act'));assert.ok(known.has('climate change act'))
 assert.ok(titleFile.sources.some(s=>s.path==='/instruments/index.json'))
 assert.equal(normaliseStatuteTitle('Fair Work Act 2009'),'fair work act')
})
test('known title identity wins over an adjacent territory noun and retains separate territory mentions',()=>{
 assert.equal(territoryAfterStatutes('fair work ACT government policy',known),false)
 assert.equal(territoryAfterStatutes('mystery ACT. Election results follow.',known),false)
 assert.equal(territoryAfterStatutes('😀 fair work ACT government policy',known),false)
 assert.equal(territoryAfterStatutes('the ACT government debated the fair work ACT',known),true)
 const title=new Set(['one two three four five six seven eight act'])
 assert.equal(territoryAfterStatutes('one two three four five six seven eight ACT budget',title),false)
 const longer='zero one two three four five six seven eight ACT budget'
 assert.equal(territoryAfterStatutes(longer,new Set(['zero one two three four five six seven eight act'])),false)
 assert.equal(territoryAfterStatutes(longer,new Set(['unrelated statute act'])),true)
 assert.equal(territoryAfterStatutes(longer,new Set()),false)
})
test('asset load failures never infer an ACT filter, including for genuine territory references',async()=>{
 const signal=new AbortController().signal
 for(const asset of [async()=>null,async()=>({schema:1,titles:[]}),async()=>({schema:1,titles:['not a title']}),async()=>{throw Error('fixture missing')},()=>new Promise(()=>{})]){
  const titles=await loadStatuteTitles(asset,signal,5)
  assert.equal(titles,null)
  assert.equal(territoryAfterStatutes('Climate Change ACT 2022',titles),false)
  for(const q of ['List ACT senators','List ACT election results','the ACT 2022 election','A.C.T. budget','Australian Capital Territory budget']){
   assert.equal(territoryAfterStatutes(q,titles),false)
   const c=api.extractAskConstraints(q,api.inferPeriod(q),scope,{},titles)
   assert.equal(c.jurisdiction,undefined)
   assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,undefined)
  }
 }
 assert.deepEqual(await loadStatuteTitles(async()=>titleFile,signal),known)
 const controller=new AbortController();controller.abort();assert.equal(await loadStatuteTitles(()=>new Promise(()=>{}),controller.signal),null)
})
test('uncatalogued territory statute constructions retain no ACT filter in either mode',()=>{
 const unknown=new Set(known)
 const titles=[
  'Australian Capital Territory (Self-Government) Amendment Act',
  'Australian Capital Territory (Planning and Land Management) Amendment Act',
  'A.C.T. (Planning and Land Management (Amendment)) Regulations',
 ]
 for(const title of titles)unknown.delete(normaliseStatuteTitle(title))
 for(const catalogue of [unknown,null])for(const title of titles){
  const question=`What did MPs say about the ${title}?`
  const c=api.extractAskConstraints(question,api.inferPeriod(question),scope,{},catalogue)
  assert.equal(c.jurisdiction,undefined,question)
  assert.equal(api.constrainStep({tool:'search',args:{}},c,{state:{}}).args.state,undefined,question)
 }
})
test('absent catalogue clears stale and model-selected ACT filters while retaining other constraints',()=>{
 const q='List ACT senators speaking about housing between 2010 and 2015'
 const c=api.extractAskConstraints(q,api.inferPeriod(q),scope,{state:'act'},null)
 assert.equal(c.jurisdiction,undefined)
 assert.deepEqual(api.constrainStep({tool:'search',args:{state:'act',jurisdiction:'act'}},c,{state:{},jurisdiction:{},since:{},until:{},chamber:{}}).args,{since:'2010-01-01',until:'2015-12-31',chamber:'senate'})
 const other=api.extractAskConstraints('Queensland government grants',api.inferPeriod('all'),scope,{},null)
 assert.equal(other.jurisdiction,'qld')
})
