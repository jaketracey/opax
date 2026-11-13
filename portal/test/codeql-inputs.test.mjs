import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {runInNewContext} from 'node:vm'
import {trimQuestionEnd, questionSpaces, wordsInOrder, comparisonParts} from '../src/question-text.mjs'
import {adverbsOnly} from '../src/research-claim-audit.mjs'
import {selectedDonorFacts} from '../src/research-coherence.mjs'
import {answerStyleChecks} from '../src/research-answer-style.mjs'
import {repeatedTableKeys} from '../public/datatable-query.js'
import {moduleReferences} from '../../scripts/stamp_assets.mjs'

async function load(file, names) {
  const path=new URL(file,import.meta.url).pathname
  const built=await build({stdin:{contents:readFileSync(path,'utf8')+`\nexport {${names}};`,resolveDir:dirname(path),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'})
  return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text+'\n//# sourceURL='+file).toString('base64'))
}
const scope=await load('../src/ask-scope.ts','stanceRequest,namedPositionRequest,withoutTopicPeriod,nextTopic')
const industry=await load('../src/ask-money-industry.ts','')
const family=await load('../src/ask-money-family.ts','')
const money=await load('../src/ask-money.ts','')
const followup=await load('../src/ask-money-followup.ts','')
const routing=await load('../src/ask-money-routing.ts','')
const coverage=await load('../src/research-coverage.ts','')
const daily=await load('../src/daily-post.ts','decodeEntities')
const seo=await load('../src/seo-content.ts','')
const graph={meta:{generated:'2026-11-01'},nodes:[{id:'party:Labor',kind:'party',label:'Labor'},{id:'donor:example',kind:'donor',label:'Example Supplier',industry:'mining'}],edges:[{source:'donor:example',target:'party:Labor',total:1000,count:1,years:[[2020,1000,1]]}]}
const assets={fetch:async()=>Response.json(graph)}
const punctuation='!'.repeat(100_000), spaces='\t'.repeat(100_000), words='a and '.repeat(10_000)
// Best of up to three runs. A real ReDoS on these 100,000-character inputs is slow every time, while one slow run
// on a loaded machine is the scheduler (84.6 ms on the deploy runner, 13 Nov). A run over 2 s fails at once.
async function fast(action) {
  let best=Infinity, result
  for (let run=0; run<3; run++) {
    const start=performance.now()
    result=await action()
    const elapsed=performance.now()-start
    best=Math.min(best,elapsed)
    if (best<50||elapsed>2000) break
  }
  assert.ok(best<50,`adversarial input took ${best.toFixed(2)} ms (best of up to three runs)`)
  return result
}

test('punctuation and whitespace scans retain the question and finish under 50 ms',async()=>{
  assert.equal(await fast(()=>trimQuestionEnd('Who funds Labor?'+punctuation)),'Who funds Labor')
  assert.equal(await fast(()=>questionSpaces('who'+spaces+'funds Labor')),'who funds Labor')
  assert.equal(await fast(()=>trimQuestionEnd('?'.repeat(100_000)+'x')), '?'.repeat(100_000)+'x')
})

test('industry grammar consumes long punctuation, spaces and repeated delimiters under 50 ms',async()=>{
  for(const question of ['Who receives money from mining'+punctuation+'x',spaces+'x','Who gets '+spaces+'x','How much has '+spaces+'x','How much has A'+spaces+'got from '+spaces+'x','How much has A'+spaces+'given to '+spaces+'x','A'+spaces+'donations to '+spaces+'x','How much has '+words+'received from '+words+'x'])await fast(()=>industry.industryMoneyIntent(question))
  assert.deepEqual(industry.industryMoneyIntent('How much has Example Supplier given to Labor in 2020?'),{subject:'Example Supplier',recipient:'Labor',total:true,period:'in 2020'})
  assert.deepEqual(industry.industryMoneyIntent('mining donations to Labor?'),{subject:'mining',recipient:'Labor',total:true,period:''})
  assert.deepEqual(industry.industryMoneyIntent('İnvented Example donations to Labor?'),{subject:'İnvented Example',recipient:'Labor',total:true,period:''})
  assert.deepEqual(industry.industryMoneyIntent('Who takes the most mining money?'),{subject:'mining',total:false,period:''})
})

test('money family, ranking, routing and follow-up suffixes finish under 50 ms',async()=>{
  assert.ok(await fast(()=>family.federalPartyRankingIntent('Who funds Labor?'+punctuation)))
  await fast(()=>family.federalPartyRankingIntent('Who funds Labor?'+punctuation+'x'))
  await fast(()=>money.isMoneyRanking({question:'Who receives from '+spaces+'mining'+punctuation}))
  assert.equal((await fast(()=>routing.federalPartyMoneyAnswer({question:'And what about Labor?'+punctuation,context:[{author:'user',text:'Who Labor top donors?'}]},assets))).answer_status,'calculated') // an informal ranking carries forward as its stated reading
  await fast(()=>followup.fundingFollowUp({question:'And '+spaces+'?'.repeat(100_000),context:[{author:'user',text:'Who funds Labor?'}]},graph,'federal',money.isMoneyRanking))
  await fast(()=>followup.fundingFollowUp({question:'And mining'+spaces+'x?',context:[{author:'user',text:'Who funds Labor?'}]},graph,'federal',money.isMoneyRanking))
  const corrected=await fast(()=>money.fundingResearchFollowUp({question:'And in 2020?',context:[{author:'user',text:'Who funds Labor in 1990?'+spaces}]},assets))
  assert.match(corrected.question,/2020/)
  await fast(()=>coverage.donationCoverageLimit('Who funds Labor in 1990?'+punctuation,'Federal AEC disclosed receipts, financial years 1998-99'))
})

test('stance and topic parsing consume long terminal runs under 50 ms',async()=>{
  const questions=['Did Avery Example support housing?','What is Avery Example’s stance on housing?','Where does Avery Example stand on housing?','What did Avery Example think about housing?','Was Avery Example against housing?']
  for(const question of questions){
    const parsed=await fast(()=>scope.stanceRequest(question+'?'.repeat(100_000)))
    assert.equal(parsed.topic,'housing')
    await fast(()=>scope.stanceRequest(question+'?'.repeat(100_000)+'x'))
  }
  assert.equal((await fast(()=>scope.namedPositionRequest('What did Avery Example say about housing'+'?'.repeat(100_000)))).topic,'housing')
  assert.equal(await fast(()=>scope.withoutTopicPeriod('housing'+spaces+'in 2020'+punctuation)),'housing')
  for(const question of ['What is his stance on '+spaces+'housing?','What about '+spaces+'housing?','How has he said on '+spaces+'housing?'])assert.equal(await fast(()=>scope.nextTopic(question,'tax')),'housing')
})

test('comparison and ordered word parsing finish under 50 ms',async()=>{
  assert.equal(await fast(()=>comparisonParts('How do '+words+'x')),null)
  assert.deepEqual(comparisonParts('How do Avery and Blake differ on housing?!'),['How do Avery and Blake differ on housing','Avery','Blake','housing'])
  assert.deepEqual(comparisonParts('How do İnvented Example AND Blake DIFFER ON housing?'),['How do İnvented Example AND Blake DIFFER ON housing','İnvented Example','Blake','housing'])
  for(const text of ['take'.repeat(25_000),'money'.repeat(25_000)])assert.deepEqual(await fast(()=>selectedDonorFacts(text,[])),[])
  await fast(()=>wordsInOrder('this term'.repeat(10_000),'this term','last term'))
  await fast(()=>answerStyleChecks('this term'.repeat(10_000),'The selected records do not establish a comparison.'))
  assert.equal(wordsInOrder('Money received from Example','money','from'),true)
  assert.equal(wordsInOrder('money\nfrom','money','from'),false)
})

test('claim audit adverbs cannot backtrack over joined or failing word runs',async()=>{
  assert.equal(await fast(()=>adverbsOnly('0ly'.repeat(30_000)+'!')),false)
  assert.equal(adverbsOnly(' slowly quickly '),true)
  assert.equal(adverbsOnly(' quietlynot '),false)
})

test('table query names are parsed by delimiter under 50 ms',async()=>{
  const key='a.f.'.repeat(25_000)+'x', params=new URLSearchParams([[key,'a'],[key,'b']])
  assert.ok((await fast(()=>repeatedTableKeys(params,null))).has(key))
  const broken='a.f.'.repeat(8_000)+'\nx', invalid=new URLSearchParams([[broken,'a'],[broken,'b']])
  assert.deepEqual([...(await fast(()=>repeatedTableKeys(invalid,null)))],[])
  assert.deepEqual([...repeatedTableKeys(new URLSearchParams('t.q=a&t.q=b&t.f.x=a&t.f.x=b'),null)],['t.q','t.f.x'])
})

test('asset reference filenames are literal even with regex metacharacters and backslashes',()=>{
  const root=mkdtempSync(join(tmpdir(),'opax-codeql-assets-'))
  try{
    const pub=join(root,'public'),src=join(root,'src');mkdirSync(pub);mkdirSync(src)
    const name='literal+[x]\\name.js';writeFileSync(join(pub,name),'')
    writeFileSync(join(pub,'index.html'),`<script src="/${name}?v=abc"></script><script src="/literalxxxxxname.js"></script>`)
    assert.deepEqual(moduleReferences(pub,src).get(name),[{from:'index.html',stamp:'abc'}])
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('daily post entities decode exactly once and tolerate invalid numeric references',()=>{
  assert.equal(daily.decodeEntities('&#38;quot;'),'&quot;')
  assert.equal(daily.decodeEntities('&amp;quot;'),'&quot;')
  assert.equal(daily.decodeEntities('&#x26;apos;'),'&apos;')
  assert.equal(daily.decodeEntities('A &amp; B'),'A & B')
  assert.doesNotThrow(()=>daily.decodeEntities('&#99999999;'))
})

test('SEO heading and breadcrumb labels stay inert at the HTML output boundary',()=>{
  const input='<h1>&lt;img src=x onerror=example&gt;</h1>'
  const html=seo.answerBlock(seo.headingOf(input),'', '', [{label:'Parent',href:'/money'},{label:seo.headingOf(input)}])
  const dom=new JSDOM(html)
  assert.equal(dom.window.document.querySelector('img'),null)
  assert.match(dom.window.document.querySelector('h1').textContent,/<img/)
  const trail=seo.printedTrail('<nav class="crumbs prerender-crumbs"><span class="crumb-label">Home</span><span class="crumb-label">&lt;img src=x onerror=example&gt;</span></nav>')
  const crumbs=new JSDOM(seo.crumbsHTML(trail))
  assert.equal(crumbs.window.document.querySelector('img'),null)
  assert.match(crumbs.window.document.querySelector('nav').textContent,/<img/)
})

test('pay and no-answer links reject external origins, credentials and URL control characters',()=>{
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)))
  const dom=new JSDOM('<main></main>',{url:'https://opax.com.au/ask'}),{document,location}=dom.window,root=document.querySelector('main')
  const api=runInNewContext(slice('function safeAnswerLink','\n/** Render links')+slice('function renderNoAnswer','\nfunction renderAnswer(')+slice('function renderPayNextSteps','\nfunction renderMoneyNextSteps')+';({renderNoAnswer,renderPayNextSteps})',{document,location,URL})
  for(const href of ['//outside.test/path','/\\outside.test/path','javascript:example','https://opax.com.au@outside.test/','/money\npath','/subject/person/a/../../money']){
    root.replaceChildren();api.renderPayNextSteps(root,[{href,label:'Open'}])
    for(const a of root.querySelectorAll('a'))assert.equal(new URL(a.getAttribute('href'),'https://opax.com.au').origin,'https://opax.com.au')
    api.renderNoAnswer(root,{next_step:{href,label:'Open'}})
    assert.equal(root.querySelector('a').getAttribute('href'),'/ask?view=search')
  }
  root.replaceChildren();api.renderPayNextSteps(root,[{href:'/money?from=2020',label:'Receipts'}])
  assert.equal(root.querySelector('a').href,'https://opax.com.au/money?from=2020')
  api.renderNoAnswer(root,{next_step:{href:'/subject/person/avery-example',label:'Avery Example'}})
  assert.equal(root.querySelector('a').getAttribute('href'),'/subject/person/avery-example')
})

for(const [name,path,expectedPath] of [['normalised slashes','/money/..//outside.test/path','//outside.test/path'],['encoded slashes','/money/..%2F%2Foutside.test/path','/money/..%2F%2Foutside.test/path'],['backslash','/money/..\\outside.test','/outside.test']])test(`pay links assign explicit same-origin URLs after ${name}`,()=>{
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)))
  for(const origin of ['https://opax.com.au','https://www.opax.com.au','http://127.0.0.1:8912']){
    const dom=new JSDOM('<main></main>',{url:origin+'/ask'}),{document,location}=dom.window,root=document.querySelector('main')
    const api=runInNewContext(slice('function safeAnswerLink','\n/** Render links')+slice('function renderPayNextSteps','\nfunction renderMoneyNextSteps')+';({renderPayNextSteps})',{document,location,URL})
    api.renderPayNextSteps(root,[{href:path,label:'Open records'}])
    const a=root.querySelector('a')
    assert.ok(a,'an internal pay path remains available')
    // Verify the assigned attribute too: a second parse must retain the origin.
    assert.equal(a.getAttribute('href'),origin+expectedPath)
    assert.equal(new URL(a.getAttribute('href'),location.href).origin,origin)
    assert.equal(a.origin,origin)
    assert.equal(a.textContent,'Open records')
    root.replaceChildren();api.renderPayNextSteps(root,[{href:'/subject/person/avery-example?year=2020',label:'Avery Example'}])
    assert.equal(root.querySelector('a').href,origin+'/subject/person/avery-example?year=2020')
  }
})
