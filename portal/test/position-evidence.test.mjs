import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const bundle=await build({entryPoints:[new URL('../src/position-evidence.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const helpers=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const {firstSpeechTurn,positionEvidence,positionProposalQuote,normalizePositionDraft}=helpers;
const proposal='I proposed a five-year GST moratorium on essential building materials for homes up to $1 million to improve housing affordability.';
const other='Housing affordability is an investor problem, and my home state is Western Australia.';

test('the first speaker cannot inherit policy claims after a recorded time boundary',()=>{
 for(const boundary of ['\n\n1:08 pm\n\n','\n\n13.08 pm\n\n','(Time expired)\n\n']){
  const text=proposal+boundary+other;
  assert.equal(firstSpeechTurn(text),proposal);assert.ok(positionEvidence(text,'housing affordability').includes('five-year'));assert.ok(!positionEvidence(text,'housing affordability').includes('investor'));
 }
});
test('a leading timestamp is allowed but a following turn is excluded',()=>{
 assert.equal(firstSpeechTurn('2:27 pm\r\n\r\n'+proposal+'\r\n\r\n2:28 pm\r\n\r\n'+other),proposal);
 assert.equal(firstSpeechTurn(proposal+' We met at 1:08 pm to discuss it.'),proposal+' We met at 1:08 pm to discuss it.');
});
test('ministerial replies and named interventions are not treated as the first person speaking',()=>{
 for(const boundary of ['\n\nI thank Senator Hanson for her question. ','\n\nSenator Example: ','\n\nThe PRESIDENT: ','\n\nSenator Hanson, I will remind you of your language. '])assert.equal(firstSpeechTurn(proposal+boundary+other),proposal);
});
test('later topic matches cannot make an unrelated first turn look relevant',()=>{
 assert.equal(positionEvidence('I spoke about banking laws and audit standards.\n\n1:08 pm\n\n'+other,'housing affordability'),'');
 assert.equal(positionEvidence(proposal,'quantum zoning on Mars'),'');
 assert.equal(positionEvidence('x'.repeat(500001),'housing'),'');
});
test('bounded evidence preserves complete small proposals and never borrows a stronger later match',()=>{
 assert.equal(positionEvidence(proposal,'housing affordability'),proposal);
 const text=('A detailed statement about agriculture and taxation. '.repeat(180))+proposal+'\n\n1:08 pm\n\n'+other;
 const excerpt=positionEvidence(text,'housing affordability');assert.ok(excerpt.includes('five-year'));assert.ok(excerpt.length<5620);assert.ok(!excerpt.includes('Western Australia'));
});
test('a long preamble cannot hide the proposed rules and eligibility limits',()=>{
 const preamble='Housing affordability needs careful debate and public consideration. '.repeat(110);
 const rules='This bill will require affordable housing on surplus public land. My proposed law defines affordable rent as a maximum of 75% of market rent or 30% of household income, if that is lower. Rules survive resale.';
 const excerpt=positionEvidence(preamble+rules+'\n\n1:08 pm\n\n'+other,'housing affordability');
 assert.match(excerpt,/75% of market rent or 30%/);assert.match(excerpt,/if that is lower/);assert.ok(!excerpt.includes('Western Australia'));assert.ok(excerpt.length<5620);
});
test('quote normalisation repairs only source spacing and one missing outer brace',()=>{
 const snippet='One Nationtoday announces a five-year moratorium onGSTbeing charged. 🏠 It applies to homes.';
 const answer=JSON.stringify({points:[{citations:[{id:'s1',quote:'One Nation today announces a five-year moratorium on GST being charged.'},{id:'s1',quote:'🏠 It applies to homes.'}]}]}).slice(0,-1);
 const out=JSON.parse(normalizePositionDraft(answer,[{id:'s1',snippet}]));
 assert.equal(out.points[0].citations[0].quote,snippet.split(' 🏠')[0]);assert.equal(out.points[0].citations[1].quote,'🏠 It applies to homes.');
});
test('normalisation never repairs fabricated words, numbers, IDs or inner syntax',()=>{
 const citations=[{id:'s1',quote:proposal.replace('five-year','ten-year')},{id:'unknown',quote:proposal},{id:'s1',quote:'A made-up policy with $5 million.'}];
 assert.deepEqual(JSON.parse(normalizePositionDraft(JSON.stringify({points:[{citations}]}),[{id:'s1',snippet:proposal}])).points[0].citations,citations);
 assert.equal(normalizePositionDraft('{"points":[{"broken":]',[]),'{"points":[{"broken":]');
});

const source=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function documentedPositionAnswer('),end=source.indexOf('/** A failed summary',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness({rows,texts={},recover=true,unavailable=false}={}){
 let query,generated,generationBody,reads=0;
 const fn=runInNewContext(code+';documentedPositionAnswer',{...helpers,URL,Request,canonicalSpeaker:s=>s,EVIDENCE_GAP_ANSWER:'This selection does not establish their position on that topic.',
  searchWindow:async(e,args)=>{query=args;return rows===null?null:{results:rows||[{slug:'speech-1',speaker:'Example MP',title:'Example MP — 2025-02-11',date:'2025-02-11',kind:'speech',resource:'rid'}]};},
  apiResource:async(r,u,slug)=>{reads++;return unavailable?Response.json({error:'down'},{status:503}):Response.json(texts[slug]||{speaker:'Example MP',text:proposal+'\n\n1:08 pm\n\n'+other});},
  quotedPositionAnswer:()=>null, positionExcerptsAnswer:(payload)=>({...payload,answer_status:'evidence_only'}), recoverPositionAnswer:async(payload,body)=>{generated=payload;generationBody=body;return recover?{...payload,answer:'Verified proposal',answer_status:undefined}:null;},
 });
 return {run:(question='What rent limit did he propose?')=>fn({question,speaker:'Example MP',kind:'speech',from:'2025',to:'2026',chamber:'senate',topic:'housing'},{query:'housing affordability'},{},{}),get query(){return query},get generated(){return generated},get generationBody(){return generationBody},get reads(){return reads}};
}
test('position retrieval honors filters and passes only original first-turn text to generation',async()=>{
 const h=harness();await h.run();assert.equal(h.query.topK,20);assert.equal(h.query.url.searchParams.get('speaker'),'Example MP');assert.equal(h.query.url.searchParams.get('from'),'2025');assert.equal(h.query.url.searchParams.get('chamber'),'senate');assert.equal(h.query.url.searchParams.get('topic'),'housing');
 assert.equal(h.generated.sources[0].snippet,proposal);assert.equal(h.generated.sources[0].href,'/doc/speech-1');assert.equal(h.generated.scope.speaker,'Example MP');assert.equal(h.generationBody.position_question,'What rent limit did he propose?');
});
test('wrong people and generated records never enter source reads or generation',async()=>{
 const rows=[{slug:'speech-1',speaker:'Another MP'},{slug:'da-summary-1',speaker:'Example MP'}];const h=harness({rows});const out=await h.run();assert.equal(h.reads,0);assert.equal(h.generated,undefined);assert.equal(out.answer_status,'evidence_gap');
 const mismatched=harness({texts:{'speech-1':{speaker:'Another MP',text:proposal}}});assert.equal((await mismatched.run()).answer_status,'evidence_gap');assert.equal(mismatched.generated,undefined);
});
test('source and generation failures cannot replay unverified retrieval snippets',async()=>{
 await assert.rejects(harness({unavailable:true}).run(),/Original speeches unavailable/);
 await assert.rejects(harness({rows:null}).run(),/Speech retrieval failed/);
 // A failed summary falls back to the originals that were read (verified first-turn text), never to retrieval snippets.
 const h=harness({recover:false});const out=await h.run();assert.equal(out.answer_status,'evidence_only');assert.equal(out.sources.length,1);assert.equal(out.sources[0].snippet,proposal);assert.equal(Object.keys(out.citations).length,0);
 const none=harness({recover:false,texts:{'speech-1':{speaker:'Example MP',text:'Procedural remarks only.'}}});const gap=await none.run();assert.equal(gap.answer_status,'evidence_gap');assert.equal(gap.sources.length,0);
});
test('position source reads are bounded to twelve original documents',async()=>{
 const rows=Array.from({length:20},(_,i)=>({slug:'speech-'+i,speaker:'Example MP',kind:'speech'}));const h=harness({rows});await h.run();assert.equal(h.reads,12);
});

test('fallback selects a concrete proposal, never a procedural or irrelevant passage',()=>{
 const gst='One Nationtoday announces a policy for a five-year moratorium onGSTbeing charged on essential building materials for homes up to the value of $1 million.';
 assert.equal(positionProposalQuote('I move the motion. '+gst,'housing affordability'),gst);
 assert.equal(positionProposalQuote('I proposed an inquiry into the NDIS and its administration.','housing affordability'),'');
 assert.equal(positionProposalQuote('I move that the Senate take note of housing questions.','housing affordability'),'');
 assert.equal(positionProposalQuote('I spoke about agriculture.\n\n1:08 pm\n\n'+gst,'housing affordability'),'');
});

test('an explicit policy cap keeps its immediate capacity qualification',()=>{
 const policy="One Nation's policy is to cap immigration at approximately 130,000 per year, numbers we can actually accommodate.";
 const condition='When we can, then we can look at increasing those numbers over a period of time.';
 assert.equal(positionProposalQuote(policy+' '+condition+' We have no problem with immigration.','immigration cap'),policy+' '+condition);
 assert.equal(positionProposalQuote('A long procedural speech about migration.','immigration'),'');
 assert.equal(positionProposalQuote(policy+' '+condition,'housing affordability'),'');
});

test('proposal duration excludes policy age and costing horizons',()=>{
 for(const text of ['I proposed retaining a five-year-old housing policy to improve housing affordability.','I proposed a four-year-old housing scheme for housing affordability.','I proposed a four-year costing policy to improve housing affordability.','I proposed a housing plan costing $1.4 billion over four years.'])assert.equal(positionProposalQuote(text,'housing affordability','How long would it last?'),'');
 assert.equal(positionProposalQuote(proposal,'housing affordability','How long would it last?'),proposal);
});

test('eligibility without verified criteria preserves scope and never calls generation',async()=>{
 const h=harness();const out=await h.run('Who would be eligible?');
 assert.equal(h.generated,undefined);assert.equal(out.answer_status,'evidence_gap');assert.equal(out.scope.speaker,'Example MP');assert.equal(out.sources.length,0);assert.match(out.answer,/couldn’t verify who would qualify/);
});
