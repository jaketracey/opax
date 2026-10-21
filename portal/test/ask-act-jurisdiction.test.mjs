import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {statuteTitleFile} from '../../scripts/build_ask_statute_titles.mjs'
import {loadStatuteTitles,territoryAfterStatutes,normaliseStatuteTitle} from '../src/ask-statute-titles.mjs'
const b=await build({stdin:{contents:"export {extractAskConstraints,constrainStep} from './src/ask-constraints';export {inferPeriod} from './src/agentic-ask'",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const rows=JSON.parse(readFileSync(new URL('./fixtures/ask-act-jurisdiction.json',import.meta.url)))
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const titleFile=JSON.parse(readFileSync(new URL('../public/ask-statute-titles.json',import.meta.url)))
const known=new Set(titleFile.titles)
for(const row of rows)test(`ACT jurisdiction table: ${row.question}`,()=>{
 const c=api.extractAskConstraints(row.question,api.inferPeriod(row.question),scope,{},known)
 const search=api.constrainStep({tool:'search',args:{}},c,{state:{},since:{},until:{}})
 assert.equal(c.jurisdiction,row.jurisdiction??undefined)
 assert.equal(search.args.state,row.jurisdiction??undefined)
 if(row.since){assert.equal(search.args.since,row.since);assert.equal(search.args.until,row.until)}
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
 assert.equal(territoryAfterStatutes('zero one two three four five six seven eight ACT budget',new Set(['zero one two three four five six seven eight act'])),true)
})
test('asset load failures use a bounded title heuristic and keep positive territory syntax',async()=>{
 const signal=new AbortController().signal
 for(const asset of [async()=>null,async()=>({schema:1,titles:[]}),async()=>({schema:1,titles:['not a title']}),async()=>{throw Error('fixture missing')},()=>new Promise(()=>{})]){
  const titles=await loadStatuteTitles(asset,signal,5)
  assert.equal(titles,null)
  assert.equal(territoryAfterStatutes('Climate Change ACT 2022',titles),false)
  assert.equal(territoryAfterStatutes('List ACT senators',titles),true)
  assert.equal(territoryAfterStatutes('List ACT election results',titles),true)
  assert.equal(territoryAfterStatutes('the ACT 2022 election',titles),true)
 }
 assert.deepEqual(await loadStatuteTitles(async()=>titleFile,signal),known)
 const controller=new AbortController();controller.abort();assert.equal(await loadStatuteTitles(()=>new Promise(()=>{}),controller.signal),null)
})
