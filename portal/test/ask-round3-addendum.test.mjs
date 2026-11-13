import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
const built=await build({stdin:{contents:"export * from './src/ask-followup';export * from './src/ask-remuneration';export * from './src/ask-constraints';export * from './src/research-writing';export * from './src/research-grounding';export * from './src/research-loop';export * from './src/agentic-ask';export {callTool} from './src/tools/index';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const row={record_id:'tp-2025-26-d24f6c0f21f948d1bed236f4cd45c0ed',name:'Paul Graham',body:'Australian Postal Corporation',position:'Group CEO & MD',year:'2025-26',total:3127416}
const source=(r,i=1)=>({resource:'fact-'+i,slug:'',title:'Annual report',kind:'record',url:'https://www.transparency.gov.au/report',href:'https://www.transparency.gov.au/report',snippet:`${r.name} (${r.position}), ${r.body}, ${r.year} annual report: total remuneration $${r.total.toLocaleString('en-AU')}.`,cited:true,remuneration:r})
const input=(question,rows)=>({question,period:{kind:'all',label:''},facts:rows.map((raw,i)=>{const r={...raw,record_id:raw.record_id.replace(/20\d{2}-\d{2}/,raw.year)};return {id:i+1,text:source(r,i+1).snippet,source:source(r,i+1)}})})
const bounds=p=>{for(const ranges of Object.values(p.citations))for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(p.answer).length)}
const asset=async path=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))

test('standalone full-name identity keeps a partial-name record answer as written',()=>{
  for(const [title,snippet,kind] of [['Graham Perrett','Person: Graham Perrett, Labor.','person'],['Paul Fletcher','Person: Paul Fletcher, Liberal.','person'],['Paul Marks','Paul Marks provided $3,530,000 in disclosed receipts.','record'],['Graham Associates','Graham Associates is listed as a lobbyist.','record']]){
    const s={...source(row),title,snippet,kind,remuneration:undefined}
    const p=api.groundAnswerPayload({answer:snippet,answer_decision:'answer',sources:[s],citations:{'fact-1/t/body/0':[[0,snippet.length]]}},'Who is Paul Graham?')
    assert.equal(p.answer_decision,'answer');assert.equal(p.answer,snippet);bounds(p)
  }
  for(const snippet of ['Paul Graham provided disclosed political receipts.','Paul Graham is listed in the lobbyist register.']){
    const s={...source(row),title:'Paul Graham',snippet,remuneration:undefined}
    const p=api.groundAnswerPayload({answer:snippet,answer_decision:'answer',sources:[s],citations:{'fact-1/t/body/0':[[0,snippet.length]]}},'Who is Paul Graham?')
    assert.equal(p.answer_decision,'answer');assert.match(p.answer,/Paul Graham/);bounds(p)
  }
})

test('private-person clarification and unsupported-allegation refusal stay protected',()=>{
  for(const [question,answer,decision] of [
    ['What do you know about John Smith from Ballarat?','Please name the person, place, period or public record you mean so I can answer the whole question.','clarification'],
    ['Who is Paul Graham?','I cannot provide private information about a private person. OPAX can help with public parliamentary and disclosure records.','refusal'],
    ['Prove that donations bribed senators.','The public record does not establish that donations bought votes.','refusal'],
  ]){
    const p=api.groundAnswerPayload({answer,answer_decision:decision,sources:[],citations:{}},question)
    assert.equal(p.answer,answer);assert.equal(p.answer_decision,decision);assert.deepEqual(p.citations,{})
  }
})

test('annual-report-only identity describes position, body and years, latest first',()=>{
  const older={...row,year:'2024-25',total:3302619}
  const p=api.proseFallback(input('Who is Paul Graham?',[older,row]))
  assert.match(p.answer,/Paul Graham.*Group CEO & MD.*Australian Postal Corporation/)
  assert.ok(p.answer.indexOf('2025-26')<p.answer.indexOf('2024-25'));assert.doesNotMatch(p.answer,/Roster|Person:|Perrett|Fletcher/);bounds(p)
})

test('a named remuneration history uses reporting-year order despite inherited ranking words',()=>{
  const p=api.proseFallback(input('What was the highest paid agency head named Paul Graham?',[{...row,year:'2024-25',total:3302619},row,{...row,year:'2023-24',total:2687562}]))
  const years=p.answer.match(/20\d{2}-\d{2}/g);assert.deepEqual([...new Set(years)],['2025-26','2024-25','2023-24']);bounds(p)
})

test('head roles exclude deputies, assistants and functional chiefs',()=>{
  for(const role of ['Secretary','Secretary of Defence','Group CEO & MD','Managing Director and Chief Executive Officer','Acting Director-General','Commissioner','Commissioner of Taxation','Australian Statistician'])assert.equal(api.isAgencyHead(role),true,role)
  for(const role of ['Deputy Secretary','Associate Secretary','Assistant Commissioner','Second Commissioner','Chief Investment Officer','Chief Financial Officer and Company Secretary','Executive Director Products & Markets *acting CEO for 1 month','Deputy Chief Executive, Acting Chief Executive'])assert.equal(api.isAgencyHead(role),false,role)
  assert.equal(api.remunerationName('GAETJENS Philip G'),'Philip Gaetjens')
  assert.equal(api.remunerationName('Dr Raphael Arndt'),'Raphael Arndt')
  assert.equal(api.remunerationName('S Rue'),'S Rue')
})

test('agency-head retrieval ranks a settled year before pagination and keeps a larger older row separate',async()=>{
  const out=await api.callTool({asset,origin:'https://opax.test'},'annual_reports',{view:'agency_heads',limit:3})
  assert.equal(out.error,undefined,JSON.stringify(out).slice(0,400))
  const current=out.rows.filter(r=>!r.historical),historical=out.rows.filter(r=>r.historical)
  assert.equal(current.length,3);assert.ok(current.every(r=>r.year==='2024-25'&&api.isAgencyHead(r.position)))
  assert.equal(current[0].name,'Paul Graham');assert.equal(current[0].total,3302619)
  assert.ok(current.every((r,i)=>!i||current[i-1].total>=r.total))
  assert.equal(historical.length,1);assert.ok(historical[0].year<'2024-25');assert.ok(historical[0].checks.length)
  const facts=out.citations.filter(c=>c.remuneration).map((c,i)=>({id:i+1,text:c.text,source:{...source(c.remuneration,i+1),snippet:c.text}}))
  const p=api.groundAnswerPayload(api.proseFallback({question:'what was the highest paid agency head',period:{kind:'all',label:''},facts}),'what was the highest paid agency head')
  assert.match(p.answer,/^Paul Graham.*highest.*2024-25.*\$3,302,619/s)
  assert.match(p.answer,/Robert Stefanic.*separately.*2020-21.*termination.*\$0/s);assert.match(p.answer,/components do not add up/i)
  assert.doesNotMatch(p.answer,/Deputy Secretary|GAETJENS|\b2025-26\b/);bounds(p)
})

test('explicit-year head rankings and named histories retain their requested scope',async()=>{
  const out=await api.callTool({asset,origin:'https://opax.test'},'annual_reports',{view:'agency_heads',year:'2021-22',limit:3})
  assert.equal(out.rows[0].name,'Stephen Rue');assert.ok(out.rows.every(r=>r.year==='2021-22'&&!r.historical))
  const history=await api.callTool({asset,origin:'https://opax.test'},'annual_reports',{view:'remuneration',person:'Paul Graham',limit:8})
  assert.deepEqual(history.rows.map(r=>r.year),[...history.rows.map(r=>r.year)].sort().reverse())
  const period={kind:'all',label:''},named={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
  const constraints=api.extractAskConstraints('what was the highest paid agency head',period,named)
  const step=api.constrainStep({tool:'annual_reports',args:{view:'remuneration',position:'Secretary',year:'2021-22'}},constraints,{view:{},position:{},year:{}})
  assert.equal(step.args.view,'agency_heads');assert.equal(step.args.position,undefined);assert.equal(step.args.year,undefined)
})

test('standalone identity re-reads remuneration even without conversation history',async()=>{
  const calls=[],model=new MockLanguageModelV4({doGenerate:{content:[{type:'tool-call',toolName:'answer',toolCallId:'done',input:JSON.stringify({facts:[2]})}],finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]}})
  const data={meta:{snapshot_at:'2026-11-12',counts:{years:['2025-26']}},bodies:[{id:'post',name:row.body}],headline:[]},file={year:'2025-26',tables:{t:{body_id:'post',body:row.body,source_url:'https://www.transparency.gov.au/report'}},rows:[{kind:'kmp',table_id:'t',...row}]}
  const research=api.createResearch({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}});research.write=undefined
  const deps={asset:async path=>(calls.push(path),path==='/annual-reports/index.json'?data:path==='/annual-reports/remuneration-2025-26.json'?file:null),kb:async()=>({})}
  const run=await api.runAgentic('Who is Paul Graham?',{...deps,research},async()=>{},40000,{kind:'all',label:''},{},{people:[],parties:[],bills:[],ambiguous:false,unresolved:true})
  assert.equal(run.steps[0].tool,'annual_reports');assert.equal(run.steps[0].args.person,'Paul Graham');assert.equal(run.answered,true);assert.match(run.qualitative.answer,/Paul Graham/)
})

test('identity and head-intent reader patterns are bounded and handle adversarial near misses',()=>{
  const started=performance.now()
  for(const tail of [' '.repeat(200000)+'!','a'.repeat(200000),' who is'.repeat(30000)]){
    assert.equal(api.identityPerson('Who is '+tail),null);assert.equal(api.agencyHeadRanking(tail),false)
  }
  for(let i=0;i<2000;i++){api.identityPerson('Who is '+'Paul '.repeat(55)+'?');api.agencyHeadRanking('highest '+'agency '.repeat(40)+'heax')}
  assert.ok(performance.now()-started<1500)
  assert.equal(api.identityPerson('Who is Paul Graham?'),'Paul Graham')
  assert.equal(api.identityPerson('Who is the highest paid agency head?'),null)
})
