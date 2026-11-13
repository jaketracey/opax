import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'

const bundled=await build({stdin:{contents:"export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const legacyTitle='Divisions are matched by a word in the division or bill title, so related divisions under other titles are missed, and a recorded vote is not a statement of reasons; the speeches hold those.'
const title='Divisions are matched by words in their titles; divisions filed under other titles may be missed.'
const ranked='That count comes from ranked matching, so it is not a complete total.'
const source=(resource,snippet,extra={})=>({resource,slug:'',title:'Selected public record',href:'https://example.org/record',url:'https://example.org/record',snippet,cited:true,kind:'record',...extra})
const span=(answer,text)=>{const at=answer.indexOf(text);return [Array.from(answer.slice(0,at)).length,Array.from(answer.slice(0,at+text.length)).length]}
const citedText=(payload,id)=>Array.from(payload.answer).slice(...payload.citations[id][0]).join('')
function fixture(finding,caveat=legacyTitle){
  const answer=caveat+'\n\n'+finding
  return {answer,citations:{'division/t/body/0':[span(answer,finding)],'coverage/t/body/0':[span(answer,caveat)]},sources:[source('division',finding),source('coverage',caveat,{coverage:true})]}
}

test('a single recorded vote loses the incidental title caveat without losing its Unicode citation',()=>{
  const finding='🏠 David Pocock voted aye on the housing bill.'
  const out=api.normaliseWrittenPayload(fixture(finding),'How did David Pocock vote on the housing bill?')
  assert.equal(out.answer,finding)
  assert.equal(out.coverage,undefined)
  assert.equal(citedText(out,'division/t/body/0'),finding)
  assert.equal(out.citations['coverage/t/body/0'],undefined)
  assert.equal(out.sources.find(s=>s.resource==='coverage').cited,false)
})

test('an aggregate division count moves its applicable caveat into the existing coverage metadata once',()=>{
  const finding='Labor voted in 31 divisions with bill in the title: all aye in 13, all no in 18, split in 0.'
  const input={...fixture(finding),coverage:{matched:true,since:'2024-07-01',until:'2026-11-10',as_of:'2026-11-10',note:title}}
  const out=api.normaliseWrittenPayload(input,'Since 1 July 2024, how many recorded votes have there been in the Senate?')
  assert.equal(out.answer,finding)
  assert.deepEqual(out.coverage,{...input.coverage,note:title})
  assert.equal(citedText(out,'division/t/body/0'),finding)
  assert.doesNotMatch(out.coverage.note,/statement of reasons|why a member/)
  assert.deepEqual(api.normaliseWrittenPayload(out),out)
})

test('ranked-matching boilerplate is absent from a representation answer and its note field',()=>{
  const finding='Stirling Griff was a senator for South Australia.'
  const input={...fixture(finding,ranked),coverage:{as_of:'2026-11-10',note:ranked}}
  const out=api.normaliseWrittenPayload(input,'Which state or territory was Stirling Griff a senator for?')
  assert.equal(out.answer,finding)
  assert.deepEqual(out.coverage,{as_of:'2026-11-10'})
  assert.equal(citedText(out,'division/t/body/0'),finding)
})

test('a ranked record count keeps the sample qualification beside the answer',()=>{
  const finding='The selected records contain 12 matching bills.'
  const out=api.normaliseWrittenPayload(fixture(finding,ranked),'How many matching bills were found?')
  assert.equal(out.answer,finding)
  assert.equal(out.coverage.note,ranked)
  assert.equal(citedText(out,'division/t/body/0'),finding)
  const concise=api.normaliseCoveragePayload(fixture('There were 12 in this selection.',ranked),'How many matching bills were found?')
  assert.equal(concise.coverage.note,ranked)
})

test('new tool note wording is relevant to speech counts and irrelevant to one speech',()=>{
  const note='The selected passages are a ranked sample, not a complete speech count.'
  const count=api.normaliseCoveragePayload(fixture('The selected records contain 12 speeches.',note),'How many speeches were found?')
  assert.equal(count.coverage.note,note)
  const speech=api.normaliseCoveragePayload(fixture('David Pocock discussed housing affordability.',note),'What did David Pocock say about housing?')
  assert.equal(speech.coverage,undefined)
  assert.equal(speech.answer,'David Pocock discussed housing affordability.')
})

test('vote reasons notes only qualify a question about reasons',()=>{
  const note='A recorded vote does not establish why a member voted that way.'
  const input=fixture('David Pocock voted aye.',note)
  const descriptive=api.normaliseCoveragePayload(input,'How did David Pocock vote?')
  assert.equal(descriptive.coverage,undefined)
  const reasons=api.normaliseCoveragePayload(input,'Why did David Pocock vote aye?')
  assert.equal(reasons.answer,'David Pocock voted aye.')
  assert.equal(reasons.coverage.note,note)
})

test('a substantive coverage limitation remains the answer, including its explanation',()=>{
  const finding='The selected records do not establish the total number of divisions.'
  const input={...fixture(finding),answer_status:'coverage_only',answer_decision:'limitation'}
  assert.deepEqual(api.normaliseCoveragePayload(input,'How many Senate divisions were there?'),input)
  const explanation=fixture(legacyTitle,legacyTitle)
  assert.equal(api.normaliseCoveragePayload(explanation).answer,explanation.answer)
})

test('literal source quotations and unrelated existing coverage notes survive',()=>{
  const finding='The report states “Divisions are matched by words in their titles; divisions filed under other titles may be missed.”'
  const input={answer:finding,citations:{'report/t/body/0':[[0,Array.from(finding).length]]},sources:[source('report',finding)],coverage:{matched:true,note:'The register records declared interests, not their market value.'}}
  assert.deepEqual(api.normaliseCoveragePayload(input,'What does the report say?'),input)
})

test('duplicate claims leave distinct owners and later Unicode citation anchors intact',()=>{
  const first='🏠 Avery Example received $100,000.'
  const second='Blake Sample received $100,000.'
  const answer=first+'\n\n'+second+'\n\n'+second
  const input={answer,citations:{'a/t/body/0':[span(answer,first)],'b/t/body/0':[span(answer,second)]},sources:[source('a',first),source('b',second)]}
  const out=api.normaliseWrittenPayload(input)
  assert.equal(out.answer,first+'\n\n'+second)
  assert.equal(citedText(out,'a/t/body/0'),first)
  assert.equal(citedText(out,'b/t/body/0'),second)
})

test('JSON and chunked SSE remove answer caveats before releasing the final payload',async()=>{
  const finding='🏠 David Pocock voted aye on the housing bill.'
  const input={...fixture(finding),conversation_id:'conversation-7',research:{mode:'loop',rounds:2,trail:[],sources:[]},coverage:{matched:true,as_of:'2026-11-10'}}
  const expected=await(await api.withAnswerLanguage(Response.json(input),'How did David Pocock vote on the housing bill?')).json()
  assert.equal(expected.answer,finding)
  const progress='event: progress\ndata: {"label":"Reading records"}\n\n'
  const wire=progress+'event: delta\ndata: '+JSON.stringify({text:input.answer})+'\n\nevent: done\ndata: '+JSON.stringify(input)+'\n\n'
  const stream=new ReadableStream({start(controller){const bytes=new TextEncoder().encode(wire);for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close()}})
  const response=await api.withAnswerLanguage(new Response(stream,{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}),'How did David Pocock vote on the housing bill?')
  const result=await response.text()
  assert.doesNotMatch(result,/event: delta/)
  assert.ok(result.startsWith(progress))
  assert.deepEqual(JSON.parse(result.match(/event: done\ndata: (.+)/)[1]),expected)
  assert.equal(response.headers.get('x-opax-cache'),'HIT')
  assert.equal(expected.conversation_id,input.conversation_id)
  const {claim_audit,...research}=expected.research
  assert.deepEqual(research,input.research)
})

test('clean SSE deltas replay unchanged when only metadata is present',async()=>{
  const answer='Stirling Griff was a senator for South Australia.'
  const input={answer,citations:{'person/t/body/0':[[0,answer.length]]},sources:[source('person',answer)],coverage:{as_of:'2026-11-10'}}
  const delta='event: delta\ndata: '+JSON.stringify({text:answer})+'\n\n'
  const wire=delta+'event: done\ndata: '+JSON.stringify(input)+'\n\n'
  const result=await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}))).text()
  assert.ok(result.startsWith(delta))
  assert.deepEqual(JSON.parse(result.match(/event: done\ndata: (.+)/)[1]),input)
})

test('the no-question boundary normalises legacy punctuation and remaps citations',async()=>{
  const raw='Disclosed receipt: Example Holdings → Example Party — $20,000.00 in disclosed political receipts; 2 records. Aggregated connection, not an individual gift.'
  const input={answer:raw,citations:{'receipt/t/body/0':[[0,Array.from(raw).length]]},sources:[source('receipt',raw)]}
  const out=await(await api.withAnswerLanguage(Response.json(input))).json()
  assert.equal(out.answer,raw.replace(' — ', ', '))
  assert.deepEqual(out.citations,{'receipt/t/body/0':[[0,Array.from(out.answer).length]]})
  assert.deepEqual(out.sources,input.sources)
})

test('specific limitations recover applicable note-only sources without treating spare records as notes',()=>{
  const limitation='The selected records do not establish which donor gave the most.'
  const row='Example Party received $20,000 in disclosed receipts from Company A in 2024.'
  const answer=limitation+'\n\n'+row
  const listNote='This is a list of what OPAX found, not a ranking.'
  const receiptNote='Disclosed party receipts can include loans and other non-gift amounts.'
  const input={answer,answer_decision:'limitation',citations:{'receipt/t/body/0':[span(answer,row)]},sources:[source('receipt',row),source('scope',listNote,{coverage:true,cited:false}),source('basis',receiptNote,{coverage:true,cited:false}),source('duplicate-note',receiptNote,{coverage:true,cited:false}),source('ordinary',"Salary entitlements exclude allowances and outside income.",{cited:false}),source('unrelated',title,{coverage:true,cited:false})]}
  const out=api.normaliseCoveragePayload(input,'Who gave the most to Example Party?')
  assert.equal(out.answer,answer)
  assert.deepEqual(out.citations,input.citations)
  assert.equal(out.coverage.note,listNote+' '+receiptNote)
  assert.doesNotMatch(out.coverage.note,/salary|Divisions/i)
  assert.deepEqual(api.normaliseCoveragePayload(out,'Who gave the most to Example Party?'),out)
})

for(const [label,finding,note,question] of [
  ['salary','Avery Example earned an annual salary of $277,602.','Salary entitlements exclude allowances, expenses, superannuation and outside income.','What salary did Avery Example earn?'],
  ['contracts','Example Department awarded $100,000 in contracts.','These are published contract values, including amendments, rather than payments.','What was the value of Example Department contracts?'],
  ['topics','Avery Example recorded 87 speeches about housing.','Topic-labelled speech records are incomplete, with older years and known Hansard gaps undercounted.','How many housing speeches did Avery Example make?'],
  ['receipts','Example Party received $20,000 in disclosed receipts.','Disclosed party receipts can include loans and other non-gift amounts. These totals cover the published selection and exclude undisclosed receipts below the disclosure threshold.','How much did Example Party receive?'],
  ['period','Avery Example received $20,000 in 2005.','OPAX could not confirm that these records fall in the requested period, so check their dates.','How much did Avery Example receive in 2005?'],
])test('legacy '+label+' caveats move out of the answer with their applicable basis preserved',()=>{
  const out=api.normaliseWrittenPayload(fixture(finding,note),question)
  assert.equal(out.answer,finding)
  assert.equal(out.coverage.note,note)
  assert.equal(citedText(out,'division/t/body/0'),finding)
  assert.equal(out.sources.find(s=>s.resource==='coverage').cited,false)
})

test('explicit coverage-source citations identify a caveat without classifying factual salary or scope sentences',()=>{
  const finding='Avery Example earned an annual salary of $277,602.'
  const scope='These figures cover 2005–06.'
  const note='Part-year office holders are omitted from this series.'
  const answer=finding+'\n\n'+scope+'\n\n'+note
  const input={answer,citations:{'pay/t/body/0':[span(answer,finding)],'basis/t/body/0':[span(answer,scope),span(answer,note)]},sources:[source('pay',finding),source('basis',scope+' '+note,{coverage:true})]}
  const out=api.normaliseWrittenPayload(input,'What salary did Avery Example earn in 2005–06?')
  assert.equal(out.answer,finding+'\n\n'+scope)
  assert.equal(out.coverage.note,note)
  assert.equal(citedText(out,'basis/t/body/0'),scope)
  assert.equal(out.sources.find(s=>s.resource==='basis').cited,true)
})

test('a salary exclusion attached to a representation answer is dropped as irrelevant',()=>{
  const finding='Stirling Griff was a senator for South Australia.'
  const note='Salary entitlements exclude allowances, expenses, superannuation and outside income.'
  const out=api.normaliseWrittenPayload({...fixture(finding,note),coverage:{note}},'Which state did Stirling Griff represent?')
  assert.equal(out.answer,finding)
  assert.deepEqual(out.coverage,{})
})

test('untyped limitation explanations stay together in the answer body',()=>{
  const finding='I cannot establish the requested historical salary.'
  const note='Salary entitlements exclude allowances, expenses, superannuation and outside income.'
  const input=fixture(finding,note)
  assert.deepEqual(api.normaliseCoveragePayload(input,'What was the salary in 1900?'),input)
})

test('legacy raw receipt rows become cited prose at the final response boundary',async()=>{
  const answer='Disclosed receipt: Example Holdings → Example Party — $20,000.00 in disclosed political receipts; 2 records. Aggregated connection, not an individual gift.'
  const receipt={source:'Example Holdings',party:'Example Party',amount:20000,period:'2024–25',jurisdiction:'federal'}
  const input={answer,citations:{'receipt/t/body/0':[[0,Array.from(answer).length]]},sources:[source('receipt',answer,{receipt})]}
  for(const question of [undefined,'How much did Example Party receive from Example Holdings?']){
    const out=question?await(await api.withAnswerLanguage(Response.json(input),question)).json():api.normaliseWrittenPayload(input)
    assert.doesNotMatch(out.answer,/Disclosed receipt:|Aggregated connection|→|—|; 2 records/)
    assert.match(out.answer,/Example Party.*20,000|20,000.*Example Party/)
    assert.equal(Object.keys(out.citations).length,1)
  }
})

test('mixed raw receipt rows and supported speech points retain both claims and their citations',async()=>{
  const raw='Disclosed receipt: Example Holdings → Example Party — $20,000.00 in disclosed political receipts; 2 records. Aggregated connection, not an individual gift. Mining.'
  const speech='Avery Example argued the contract should be published.'
  const receipt={source:'Example Holdings',party:'Example Party',amount:20000,period:'2024–25',jurisdiction:'federal'}
  for(const separator of ['\n\n',' ']){
    const answer=raw+separator+speech
    const input={answer,citations:{'receipt/t/body/0':[span(answer,raw)],'speech/t/body/0':[span(answer,speech)]},sources:[source('receipt',raw,{receipt}),source('speech',speech,{kind:'speech',speaker:'Avery Example'})]}
    const out=api.normaliseWrittenPayload(input)
    assert.doesNotMatch(out.answer,/Disclosed receipt:|Aggregated connection|→|—|; 2 records|Mining\./)
    assert.match(out.answer,/Example Party.*20,000|20,000.*Example Party/)
    assert.match(out.answer,/Avery Example argued the contract should be published/)
    assert.equal(citedText(out,'speech/t/body/0'),speech)
  }
})

test('raw receipt repair cannot replace the raw owner with an unrelated already-written financial point',async()=>{
  const raw='Disclosed receipt: Company A → Example Party — $20,000.00 in disclosed political receipts; 2 records. Aggregated connection, not an individual gift.'
  const point='Example Party received $50,000 from Company B in 2024.'
  const answer=raw+'\n\n'+point
  const input={answer,citations:{'a/t/body/0':[span(answer,raw)],'b/t/body/0':[span(answer,point)]},sources:[source('a',raw,{receipt:{source:'Company A',party:'Example Party',amount:20000,period:'2024',jurisdiction:'federal'}}),source('b',point,{receipt:{source:'Company B',party:'Example Party',amount:50000,period:'2024',jurisdiction:'federal'}})]}
  const out=api.normaliseWrittenPayload(input)
  assert.match(out.answer,/Company A/)
  assert.match(out.answer,/20,000/)
  assert.match(out.answer,/Company B/)
  assert.match(out.answer,/50,000/)
  assert.equal(citedText(out,'b/t/body/0'),point)
  assert.doesNotMatch(out.answer,/Disclosed receipt:|Aggregated connection|→|—|; 2 records/)
})

test('a dated prose fallback puts the period warning in coverage.note and preserves original spans',async()=>{
  const answer='🏠 Avery Example opposed the housing proposal.'
  const input={answer,citations:{'speech/t/body/0':[[0,Array.from(answer).length]]},sources:[source('speech',answer,{kind:'speech',date:'2004-07-01'})],coverage:{note:'The speech is an individual contribution.'}}
  const out=await(await api.withFallbackPeriod(Response.json(input),{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'})).json()
  assert.equal(out.answer,answer)
  assert.deepEqual(out.citations,input.citations)
  assert.equal(out.answer_status,undefined)
  assert.equal(out.coverage.matched,false)
  assert.equal(out.coverage.as_of,'2004-07-01')
  assert.match(out.coverage.note,/^The speech is an individual contribution\. These records may not cover 2005-01-01 to 2005-12-31: a returned source is dated 2004-07-01\.$/)
})

test('note-only coverage does not block dated source acceptance',async()=>{
  const answer='Avery Example opposed the housing proposal.'
  const input={answer,citations:{'speech/t/body/0':[[0,answer.length]]},sources:[source('speech',answer,{kind:'speech',date:'2005-07-01'})],coverage:{note:'The speech is an individual contribution.'}}
  const out=await(await api.withFallbackPeriod(Response.json(input),{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'})).json()
  assert.deepEqual(out,input)
})

test('out-of-period financial figures are kept with the period warning in coverage.note',async()=>{
  const answer='Avery Example received $20,000.'
  const input={answer,citations:{'receipt/t/body/0':[[0,answer.length]]},sources:[source('receipt',answer,{date:'2004-07-01'})],coverage:{note:'Disclosed receipts can include loans.'}}
  const out=await(await api.withFallbackPeriod(Response.json(input),{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'})).json()
  assert.equal(out.answer,answer)
  assert.deepEqual(out.citations,input.citations)
  assert.equal(out.coverage.matched,false)
  assert.match(out.coverage.note,/^Disclosed receipts can include loans\. These records may not cover 2005-01-01 to 2005-12-31: a returned source is dated 2004-07-01\.$/)
})

for(const kind of ['contract','grant'])test('equal values on distinct titled '+kind+' records both survive semantic deduplication',()=>{
  const first='Example Company received $20,000 for the Library Renewal project.'
  const second='Example Company received $20,000 for the River Restoration project.'
  const answer=first+'\n\n'+second
  const input={answer,citations:{'library/t/body/0':[span(answer,first)],'river/t/body/0':[span(answer,second)]},sources:[source('library',first,{kind,title:'Library Renewal'}),source('river',second,{kind,title:'River Restoration'})]}
  const out=api.normaliseWrittenPayload(input)
  assert.equal(out.answer,answer)
  assert.equal(citedText(out,'library/t/body/0'),first)
  assert.equal(citedText(out,'river/t/body/0'),second)
})

test('equal receipt amounts from distinct donors are separate facts with or without typed metadata',()=>{
  const first='Labor received $20,000 from Company A in 2024.'
  const second='Labor received $20,000 from Company B in 2024.'
  const answer=first+'\n\n'+second
  for(const typed of [false,true]){
    const extra=donor=>typed?{receipt:{source:donor,party:'Labor',amount:20000,period:'2024',jurisdiction:'federal'}}:{}
    const input={answer,citations:{'a/t/body/0':[span(answer,first)],'b/t/body/0':[span(answer,second)]},sources:[source('a',first,extra('Company A')),source('b',second,extra('Company B'))]}
    assert.equal(api.normaliseWrittenPayload(input).answer,answer)
  }
  const oneSource={answer,citations:{'receipts/t/body/0':[[0,answer.length]]},sources:[source('receipts',answer)]}
  assert.equal(api.normaliseWrittenPayload(oneSource).answer,answer)
})

test('a true paraphrase of the same scoped receipt is removed once',()=>{
  const first='Labor received $20,000 from Company A in 2024.'
  const second='Labor received $20,000 in disclosed receipts from Company A in 2024.'
  const answer=first+'\n\n'+second
  const input={answer,citations:{'a/t/body/0':[[0,answer.length]]},sources:[source('a',answer,{receipt:{source:'Company A',party:'Labor',amount:20000,period:'2024',jurisdiction:'federal'}})]}
  assert.equal(api.normaliseWrittenPayload(input).answer,first)
})
