import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {answerStyleChecks,gradeRow} from '../../scripts/research_eval_grade.mjs'
const b=await build({stdin:{contents:"export * from './src/research-writing';export * from './src/research-response';export * from './src/research-loop';export {runAgentic,extractNamedScope} from './src/agentic-ask';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const source=(resource,text,kind='record')=>({resource,slug:'',title:text,snippet:text,href:'https://example.org/records',url:'https://example.org/records',cited:true,kind})
const fact=(id,text,kind='record')=>({id,text,source:source('f-'+id,text,kind)})
const period={kind:'all',label:''}
const salary=[fact(1,'Avery Example: $277,602 a year as Prime Minister, 2005-01-01 to 2005-06-30; base $106,770 plus 160%.'),fact(2,'Avery Example: $288,990 a year as Prime Minister, 2005-07-01 to 2005-12-31; base $111,150 plus 160%.'),fact(3,'Blake Sample: $170,000 a year as Minister, 2005-01-01 to 2005-12-31; base $106,770 plus 60%.')]
const good='Avery Example earned $277,602 as Prime Minister until 30 June 2005.'
for(const [name,bad] of [
 ['invented recipient','Banana Alliance received $277,602.'],
 ['invented recipient after value','$277,602 was paid to Banana Alliance.'],
 ['wrong person before value','Blake Sample received $277,602.'],
 ['wrong person after value','$277,602 was paid to Blake Sample.'],
 ['date before value','From 1 July 2005 Avery Example received $277,602.'],
 ['another percentage','Blake Sample received a loading of 160%.'],
 ['short invented quote','Avery Example said “I love corruption”.']
])test('review grounding: '+name+' removes only the bad clause',()=>{
 const input={question:'What did Avery Example earn in 2005?',period,facts:salary}
 assert.equal(api.boundFigures(bad,salary),false)
 assert.equal(api.verifyWrittenAnswer({sentences:[{text:bad,facts:[1,2,3]}]},input),null)
 const out=api.verifyWrittenAnswer({sentences:[{text:good+' '+bad,facts:[1,2,3]}]},input)
 assert.ok(out);assert.match(out.answer,/277,602.*30 June 2005/)
 assert.doesNotMatch(out.answer,new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
})
test('review grounding: structured atoms retain entity metric value unit chamber period and evidence',()=>{
 const fs=api.writingFacts(undefined,[{id:1,text:salary[0].text,cite:{kind:'record',url:'https://example.org',label:salary[0].text}}])
 const a=fs.flatMap(f=>f.atoms??[]).find(a=>a.value==='277602')
 assert.equal(a.entity,'Avery Example');assert.equal(a.metric,'salary');assert.equal(a.unit,'AUD/year');assert.equal(a.period.since,'2005-01-01');assert.equal(a.period.until,'2005-06-30');assert.ok(a.evidenceId);assert.equal(a.chamber,'federal')
})
test('review coverage: every percentage resolves to retained source text',()=>{
 const fs=api.writingFacts(undefined,[{id:1,text:'Avery Example: 87 chamber speeches labelled housing.',cite:{kind:'count',url:'https://example.org',label:'count'}}],['Topic labels cover 73% of the record.','Topic labels cover 91% of the 2010s record.'])
 const out=api.verifyWrittenAnswer({sentences:[{text:'Avery Example recorded 87 chamber speeches about housing.',facts:[1]},{text:'Topic labels cover 73% of the record and 91% of the 2010s record.',facts:[2,3],coverage:true}]},{question:'Who spoke most about housing?',period,facts:fs})
 for(const value of ['73%','91%'])assert.ok(out.sources.some(s=>s.snippet.includes(value)&&Object.keys(out.citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))),value)
})
const mining=[fact(1,'Labor: $165,050, 13 disclosed receipt records.'),fact(2,'Liberal: $125,483, 15 disclosed receipt records.'),fact(3,'Nationals: $82,815, 10 disclosed receipt records.'),{...fact(4,'Period: 2005–06.'),coverage:true},{...fact(5,'Coverage: Only receipts included in the published map are ranked; this is a selection, not an exhaustive industry total.'),coverage:true}]
test('review period: a verified financial year supports an ordinary written claim',()=>{
 const out=api.verifyWrittenAnswer({sentences:[{text:'Labor received the most disclosed mining funding in 2005–06, with $165,050.',facts:[1,4]}]},{question:'Who gets most from mining in 2005?',period,facts:mining})
 assert.ok(out);assert.match(out.answer,/Labor received the most.*2005–06/)
})
test('review fallback: ranking retains subject period runners-up and selection',()=>{
 const out=api.proseFallback({question:'Who gets most from mining in 2005?',period,facts:mining})
 assert.match(out.answer.split(/(?<=[.!?])\s/)[0],/Labor.*(?:most|led|largest).*mining.*2005–06.*165,050|2005–06.*Labor.*(?:most|led|largest).*mining.*165,050/)
 assert.match(out.answer,/Liberal.*125,483.*Nationals.*82,815/)
 assert.match(out.answer,/selection|published map/)
})
test('review fallback: missing historical salary retains December 1999 boundary',()=>{
 const facts=[fact(1,"OPAX's pay records cover 1999-12-07 to 2026-10-19; the requested period 1990-01-01 to 1990-12-31 is not fully covered.")]
 assert.match(api.proseFallback({question:'Who was paid most in 1990?',period,facts}).answer,/December 1999/)
})
test('review dedupe: equal counts for distinct people both survive',()=>{
 const facts=[fact(1,'Avery Example: 87 chamber speeches labelled housing.','count'),fact(2,'Blake Sample: 87 chamber speeches labelled housing.','count')]
 const out=api.verifyWrittenAnswer({sentences:[{text:'Avery Example recorded 87 chamber speeches about housing.',facts:[1]},{text:'Blake Sample recorded 87 chamber speeches about housing.',facts:[2]}]},{question:'Compare Avery Example and Blake Sample on housing.',period,facts})
 assert.match(out.answer,/Avery Example/);assert.match(out.answer,/Blake Sample/)
})
test('review dedupe: an overlapping clause does not delete new detail or its citation',()=>{
 const a='Avery Example received $100,000.',b='Avery Example received $100,000, and Blake Sample received $200,000.'
 const answer=a+'\n\n'+b,at=answer.indexOf(b)
 const out=api.normaliseWrittenPayload({answer,sources:[source('f',b)],citations:{'f/t/body/0':[[at,answer.length]]}})
 assert.equal((out.answer.match(/100,000/g)||[]).length,1);assert.match(out.answer,/Blake Sample received \$200,000/);assert.ok(out.citations['f/t/body/0'])
})
test('review fallback: year rows do not repeat the entire comparison interval',()=>{
 const facts=[fact(1,'2023: 815 chamber speeches labelled immigration in federal parliament from 2023-01-01 to 2024-12-31.','count'),fact(2,'2024: 985 chamber speeches labelled immigration in federal parliament from 2023-01-01 to 2024-12-31.','count')]
 const out=api.proseFallback({question:'Compare immigration speeches each year in 2023 and 2024.',period,facts})
 assert.match(out.answer,/2023.*815/);assert.match(out.answer,/2024.*985/);assert.doesNotMatch(out.answer,/from 2023-01-01 to 2024-12-31/)
})
test('review comparison: both named terms and counts survive a percentage-only draft',()=>{
 const facts=[fact(1,'47th Parliament: 354 chamber speeches labelled gambling (0.7% of 51096 topic-labelled speeches).','count'),fact(2,'48th Parliament: 40 chamber speeches labelled gambling (0.7% of 5380 topic-labelled speeches).','count')]
 const input={question:'Compare gambling speeches in the 47th and 48th Parliaments.',period,facts}
 const out=api.verifyWrittenAnswer({sentences:[{text:'Both parliaments had a share of 0.7% of topic-labelled speeches.',facts:[1,2]}]},input)??api.proseFallback(input)
 for(const term of ['47th','48th','354','40'])assert.ok(out.answer.includes(term),term)
})
test('review rubric: bananas fail; selected subject ranking amount and coverage are required',()=>{
 const evidence={sources:mining.map(f=>f.source),cited:mining.map(f=>f.source),texts:mining.map(f=>f.text),entries:[],researchSources:[]}
 assert.equal(answerStyleChecks('Who gets most from mining in 2005?','Bananas are yellow and the sky is blue.',evidence).direct_first_sentence,'fail')
 assert.equal(answerStyleChecks('Who gets most from mining in 2005?','Labor recorded $165,050, 13 disclosed receipt records.',evidence).direct_first_sentence,'fail')
 const q={question:'Compare Avery Example and Blake Sample on housing.',must:[{type:'required_components',entities:['Avery Example','Blake Sample'],coverage:true}]}
 assert.equal(gradeRow(q,{answer:'Avery Example recorded 87 speeches.',sources:[source('f','Avery Example: 87 speeches. Coverage: incomplete record.')],citations:{'f/t/body/0':[[0,35]]}}).axes.required_components,'fail')
})
test('review deadline: writer has a reserved slice inside the unchanged allowance',()=>{
 assert.equal(api.researchPhaseWallMs(15000),11000);assert.equal(api.researchPhaseWallMs(12000),8000)
})

test('review grounding: a count cannot borrow another fact\'s period',()=>{
 const facts=[fact(1,'Avery Example: 87 chamber speeches from 2005-01-01 to 2005-12-31.','count'),fact(2,'Blake Sample: 99 chamber speeches from 2010-01-01 to 2010-12-31.','count')]
 assert.equal(api.boundFigures('Avery Example recorded 87 chamber speeches in 2010.',facts),false)
})

test('review clarification: temporal fallback preserves a request for the full name',async()=>{
 const payload={answer:'Please give the full name of the person you mean so I can distinguish their records.',sources:[],citations:{}}
 const response=await api.withFallbackPeriod(Response.json(payload),{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'})
 assert.deepEqual(await response.json(),payload)
})
test('review T01 wording: this term versus last term requires both raw counts as well as share',()=>{
 const facts=[fact(1,'47th Parliament: 354 chamber speeches labelled gambling (0.7% of 51096 topic-labelled speeches).','count'),fact(2,'48th Parliament: 40 chamber speeches labelled gambling (0.7% of 5380 topic-labelled speeches).','count')]
 const input={question:'Is gambling debated more in federal parliament this term than last term?',period,facts}
 const out=api.verifyWrittenAnswer({sentences:[{text:'Both parliaments show the same share of 0.7% of topic-labelled speeches.',facts:[1,2]}]},input)??api.proseFallback(input)
 for(const term of ['47th','48th','354','40'])assert.ok(out.answer.includes(term),term)
})
test('review metric association: a person cannot borrow a count from another topic',()=>{
 const facts=[fact(1,'Avery Example: 87 chamber speeches labelled housing.','count'),fact(2,'Avery Example: 99 chamber speeches labelled climate.','count')]
 assert.equal(api.boundFigures('Avery Example recorded 99 chamber speeches about housing.',facts),false)
})

test('review ambiguity: clarify before inference and report zero usage',async()=>{
 const fail=async()=>{throw Error('must clarify without inference')}
 const run=await api.runAgentic('What did Example say in 2005?',{research:fail,generate:fail,kb:fail,asset:fail},undefined,40000,{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'},{},{people:[],parties:[],bills:[],ambiguous:true,unresolved:false})
 assert.match(run.answer,/Please give the full name/);assert.equal(run.research.mode,'loop');assert.equal(run.cost_usd,0);assert.deepEqual(run.research.turns,[])
})
test('review deadline: long selection leaves four seconds for the real writing handoff',async()=>{
 const previous=Date.now;let now=1700000000000,remaining
 Date.now=()=>now
 const text=salary[0].text,qualitative={answer:text,sources:[source('f',text)],citations:{'f/t/body/0':[[0,text.length]]}}
 const research=Object.assign(async()=>{now+=10950;return {steps:[],results:[],selected:[],rounds:1,tokens:{input:0,output:0},costUsd:0,qualitative}},{writingWallMs:15000,write:async(input,stats,signal,ms)=>{remaining=ms;return api.proseFallback(input)}})
 try{const run=await api.runAgentic('What did Avery Example earn in 2005?',{research,generate:async()=>{throw Error('no planner')},asset:async()=>({}),kb:async()=>({})},undefined,40000,period,{},{people:[],parties:[],bills:[],ambiguous:false,unresolved:false});assert.equal(run.answered,true);assert.ok(remaining>=4000&&remaining<=4050,String(remaining))}finally{Date.now=previous}
})
test('review rubric: comparison sides come from the question even if one side has no selected evidence',()=>{
 const q={question:'Compare Avery Example and Blake Sample on housing.',must:[{type:'required_components'}]}
 const answer='Avery Example recorded 87 housing speeches.'
 assert.equal(gradeRow(q,{answer,sources:[source('f','Avery Example: 87 housing speeches.')],citations:{'f/t/body/0':[[0,answer.length]]}}).axes.required_components,'fail')
})
test('review rubric: equal amounts for different metrics are distinct claims',()=>{
 assert.equal(answerStyleChecks('What did Avery Example receive?','Avery Example received $100,000 in salary. Avery Example received $100,000 in grants.').no_duplicates,'pass')
})

test('review actual ambiguity: a bare surname export cannot mask multiple full identities',()=>{
 const roster={people:[{name:'Example'},{name:'Avery Example'},{name:'Blake Example'}]}
 const named=api.extractNamedScope('How much was Example paid in 2005?',roster,{bills:[]})
 assert.equal(named.ambiguous,true);assert.deepEqual(named.people,[])
})
test('review rubric: a calculator heading supplies an entity, not an entire expected sentence',()=>{
 const text='**Example Party** received the most disclosed funding from mining donors in this published selection: **$165,050**.\n\n| Recipient party | Disclosed receipts | Records |\n| Example Party | $165,050 | 13 |'
 const ev={sources:[source('f',text)],texts:[text]}
 assert.equal(answerStyleChecks('Which party got the most mining receipts?','Example Party received the most mining funding, with $165,050.',ev).direct_first_sentence,'pass')
})
test('review rubric: an explicit verified coverage limitation can answer first without a ranking amount',()=>{
 const text='The requested period, 2005-01-01 to 2005-12-31, is not covered: no historical total or ranking for that period can be established.'
 assert.equal(answerStyleChecks('Who was the highest paid state politician in 2005?',text,{sources:[source('coverage',text)],texts:[text]}).direct_first_sentence,'pass')
})
test('review repair: removing a bad lead must not leave a runner-up as the opening answer',()=>{
 const facts=[fact(1,'Avery Example: 99 chamber speeches labelled housing.','count'),fact(2,'Blake Sample: 87 chamber speeches labelled housing.','count')]
 const out=api.verifyWrittenAnswer({sentences:[{text:'Avery Example led with 999 chamber speeches about housing.',facts:[1]},{text:'Blake Sample followed with 87 chamber speeches about housing.',facts:[2]}]},{question:'Who spoke most about housing?',period,facts})
 // Speech rankings are outside the donor repair allowlist: retry rather than emit a runner-up fragment.
 assert.equal(out,null)
})
test('review mixed points: equal amounts for different people survive the final append',()=>{
 const a='Avery Example received $100,000.',b='Blake Sample received $100,000.'
 const one={answer:a,citations:{'a/t/body/0':[[0,a.length]]},sources:[source('a',a)]},two={answer:b,citations:{'b/t/body/0':[[0,b.length]]},sources:[source('b',b)]}
 const out=api.appendWrittenPoints(one,two);assert.match(out.answer,/Avery Example/);assert.match(out.answer,/Blake Sample/);assert.ok(out.citations['b/t/body/0'])
})
test('review pay boundary: a coverage-only writer answer says the boundary once',()=>{
 const fs=api.writingFacts(undefined,[{id:1,text:"OPAX's pay records cover 1999-12-07 to 2026-10-19; the requested period 1990-01-01 to 1990-12-31 is not fully covered.",cite:{kind:'record',url:'https://example.org',label:'Pay coverage'}}])
 const out=api.verifyWrittenAnswer({sentences:[{text:'The pay records start on 7 December 1999, so the highest paid politician in 1990 cannot be identified.',facts:[1]},{text:'The available pay records cover 1999-12-07 to 2026-10-19.',facts:[1]}]},{question:'Who was the highest paid politician in 1990?',period,facts:fs})
 assert.ok(out);assert.equal(out.answer.split('\n\n').length,1);assert.match(out.answer,/December 1999/)
})
test('review comparison grounding: current-term count cannot be called higher when its atom is lower',()=>{
 const facts=[fact(1,'47th Parliament: 354 chamber speeches labelled gambling (0.7% of 51096 topic-labelled speeches).','count'),fact(2,'48th Parliament: 40 chamber speeches labelled gambling (0.7% of 5380 topic-labelled speeches).','count')]
 const bad='Comparing the 47th Parliament with 354 gambling speeches and the 48th Parliament with 40, the current-term count is far higher.'
 assert.equal(api.boundFigures(bad,facts),false)
})
test('review mixed points: trim a repeated clause and preserve the new amount and span',()=>{
 const a='Avery Example received $100,000.',b='Avery Example received $100,000, and Blake Sample received $200,000.'
 const out=api.appendWrittenPoints({answer:a,citations:{'a/t/body/0':[[0,a.length]]},sources:[source('a',a)]},{answer:b,citations:{'b/t/body/0':[[0,b.length]]},sources:[source('b',b)]})
 assert.equal((out.answer.match(/100,000/g)||[]).length,1);assert.match(out.answer,/Blake Sample received \$200,000/)
 const range=out.citations['b/t/body/0'][0];assert.equal(Array.from(out.answer).slice(...range).join(''),'Blake Sample received $200,000.')
})
test('review pay boundary: a generic first limitation cannot hide the known start date',()=>{
 const fs=api.writingFacts(undefined,[{id:1,text:"OPAX's pay records cover 1999-12-07 to 2026-10-19; the requested period 1990-01-01 to 1990-12-31 is not fully covered.",cite:{kind:'record',url:'https://example.org',label:'Pay coverage'}}])
 const out=api.verifyWrittenAnswer({sentences:[{text:'The highest paid politician in 1990 cannot be identified because the requested period is not fully covered.',facts:[1]},{text:'The available pay records begin on 7 December 1999.',facts:[1]}]},{question:'Who was the highest paid politician in 1990?',period,facts:fs})
 assert.ok(out);assert.match(out.answer,/December 1999/);assert.equal(out.answer.split('\n\n').length,1)
})
test('review units: a Census age cannot become a population with the same value',()=>{
 const text='Sample District (Federal, House of Representatives): median age 51 years (2021 Census (ABS))',facts=[fact(1,text,'export')]
 assert.equal(api.boundFigures('Sample District has a population of 51 people.',facts),false)
 assert.equal(api.boundFigures('Sample District has a median age of 51 years.',facts),true)
 const fs=api.writingFacts(undefined,[{id:1,text,cite:{kind:'export',url:'https://example.org',label:text}}]);assert.equal(fs[0].atoms.find(a=>a.value==='51').unit,'years')
 const out=api.proseFallback({question:'Which electorate has the oldest median age?',period,facts});assert.match(out.answer,/Sample District.*median age.*51 years.*2021 Census \(ABS\)/)
})

test('review direct salary lead: the peak rate leads even when earlier rates were selected first',()=>{
 const facts=[fact(1,'Avery Example: $340,704 a year as Prime Minister, 2010-01-01 to 2010-06-23; base $131,040 plus 160%.'),fact(2,'Blake Sample: $340,704 a year as Prime Minister, 2010-06-24 to 2010-07-31; base $131,040 plus 160%.'),fact(3,'Blake Sample: $353,704 a year as Prime Minister, 2010-08-01 to 2010-12-31; base $136,040 plus 160%.')]
 const input={question:'Who was the highest paid politician in 2010?',period,facts}
 const out=api.verifyWrittenAnswer({sentences:[{text:'Earlier in the year, Avery Example and then Blake Sample each had a Prime Minister salary of $340,704 a year.',facts:[1,2]},{text:'The highest paid politician in 2010 was Blake Sample, whose Prime Minister salary was $353,704 a year from 2010-08-01 to 2010-12-31.',facts:[3]}]},input)
 assert.match(out.answer.split('\n\n')[0],/highest paid.*Blake Sample.*353,704/)
 assert.doesNotMatch(api.proseFallback(input).answer.split('\n\n')[0],/Avery Example/)
 assert.match(api.proseFallback(input).answer.split('\n\n')[0],/Blake Sample.*353,704/)
})

test('review rubric: salary ranking uses the peak selected rate rather than the first chronological row',()=>{
 const text='Avery Example: $340,704 a year as Prime Minister, 2010-01-01 to 2010-06-23; base $131,040 plus 160%. Blake Sample: $353,704 a year as Prime Minister, 2010-08-01 to 2010-12-31; base $136,040 plus 160%.'
 const evidence={sources:[source('pay',text,'pay')]}
 assert.equal(answerStyleChecks('Who was the highest paid politician in 2010?','In 2010 Blake Sample was the highest paid politician, earning $353,704 a year.',evidence).direct_first_sentence,'pass')
 assert.equal(answerStyleChecks('Who was the highest paid politician in 2010?','Avery Example was the highest paid politician in 2010, earning $340,704 a year.',evidence).direct_first_sentence,'fail')
})

test('review rubric: an explicit incomplete-period boundary is a direct coverage answer',()=>{
 const answer="No politician's pay for 1990 can be identified, because OPAX's pay records only cover 1999-12-07 to 2026-10-19, so the period 1990-01-01 to 1990-12-31 is not fully covered."
 const evidence={sources:[source('pay',"OPAX's pay records cover 1999-12-07 to 2026-10-19; the requested period 1990-01-01 to 1990-12-31 is not fully covered.",'pay')]}
 assert.equal(answerStyleChecks('Who was the highest paid politician in 1990?',answer,evidence).direct_first_sentence,'pass')
})

test('review direct ranking lead: an ancillary year total cannot precede the named leader',()=>{
 const facts=[fact(1,'2022: 38 chamber speeches labelled gambling.','count'),fact(2,'Avery Example: 21 chamber speeches labelled gambling.','count')]
 const out=api.verifyWrittenAnswer({sentences:[{text:'Avery Example spoke most about gambling, with 21 chamber speeches.',facts:[2]},{text:'Yearly federal gambling speech counts were 38 in 2022.',facts:[1]}]},{question:'Who spoke most about gambling since 2022?',period,facts})
 assert.match(out.answer.split('\n\n')[0],/Avery Example.*most.*21/)
 assert.match(api.proseFallback({question:'Who spoke most about gambling since 2022?',period,facts}).answer.split('\n\n')[0],/Avery Example.*21/)
 const evidence={sources:facts.map(f=>f.source)}
 assert.equal(answerStyleChecks('Who spoke most about gambling since 2022?','Avery Example spoke most about gambling, with 21 chamber speeches.',evidence).direct_first_sentence,'pass')
 assert.equal(answerStyleChecks('Who spoke most about gambling since 2022?','In 2022 there were the most gambling speeches, with 38.',evidence).direct_first_sentence,'fail')
})

test('review fallback scope: the 1999 start cannot explain an unavailable historical chamber ranking in 2005',()=>{
 const facts=[{...fact(1,"OPAX's pay records cover 2005-01-01 to 2005-12-31, but this export does not date party or chamber changes. A historical chamber ranking cannot be established from its current roster labels."),coverage:true},{...fact(2,'Coverage: Federal parliamentary salary records start on 7 December 1999 and run to 2026-10-19.'),coverage:true}]
 const out=api.proseFallback({question:'Who was the highest paid senator in 2005?',period:{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'},facts})
 assert.match(out.answer,/does not date historical party or chamber changes/)
 assert.doesNotMatch(out.answer,/1999.*so.*cannot/)
})

test('review rubric: equal term shares joined by while belong to distinct claims',()=>{
 const answer='The 47th Parliament recorded 354 gambling speeches, 0.7% of 51096 topic-labelled speeches, while the 48th Parliament recorded 40 gambling speeches, also 0.7% of 5380 topic-labelled speeches.'
 assert.equal(answerStyleChecks('Compare gambling speeches in both parliaments.',answer).no_duplicates,'pass')
})

test('review rubric: an explicit unavailable chamber ranking is recognized as a decline',()=>{
 const answer='The selected records do not identify who the highest paid senator in 2005 was, because this export does not date party or chamber changes and its roster labels cannot establish a historical party or chamber ranking.'
 const q={question:'Who was the highest paid senator in 2005?',expected:{unanswerable:'Historical chamber changes are not dated.'},must:[{type:'mentions',any:['chamber']}]}
 assert.equal(gradeRow(q,{answer,sources:[],citations:{}}).axes.decline,'pass')
})
