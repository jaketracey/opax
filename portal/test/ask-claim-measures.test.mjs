import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const b=await build({entryPoints:[new URL('../src/ask-claim-measures.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
const {claimMeasureConsistent,guardClaimMeasures,MEASURE_GAP}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const speech={resource:'speech',kind:'speech',snippet:'Labor MPs discussed gambling and a $100 donation.',url:'https://example.org/hansard'}
const count={resource:'count',kind:'count',snippet:'Labor: 682 chamber speeches labelled gambling.',url:'/search?topic=gambling'}
const vote={resource:'vote',kind:'record',snippet:'Labor: 87 divisions, all aye in 82.',url:'/doc/division-1'}
const mentions={resource:'mentions',kind:'count',snippet:'Labor: 682 mentions of gambling.',url:'/search?topic=gambling'}
const money={resource:'money',kind:'receipt',snippet:'Labor: $682 in disclosed receipts from gambling donors.',url:'/money?industry=gambling'}
const payload=(answer,sources,ranges)=>({answer,sources,citations:ranges??Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,Array.from(answer).length]]]))})

for(const evidence of [count,vote,mentions,speech])test(`money claims require financial evidence, not ${evidence.kind}: ${evidence.resource}`,()=>{
 for(const claim of ['Labor takes the most money from the gambling lobby, with 682 chamber speeches labelled gambling.',
  'Labor receives the most donations from gambling.', 'Labor received $682.', 'Labor was paid $682.',
  'Labor donated to the campaign.', 'Labor is paid by miners.', 'Labor received 682.', 'Labor received $1.25 million.',
  'Labor received money from gambling, as the senator said.']){
  assert.equal(claimMeasureConsistent(claim,[evidence]),false,claim)
  const checked=guardClaimMeasures(payload(claim,[evidence]))
  assert.equal(checked.answer,MEASURE_GAP,claim)
  assert.deepEqual(checked.citations,{})
 }
})
test('speech, vote and mention claims cannot be supported by receipt amounts',()=>{
 for(const claim of ['Labor MPs gave the most speeches labelled gambling.', 'Labor recorded 682 chamber speeches.',
  'Labor voted in 87 divisions.', 'Labor had the most mentions of gambling.', 'Labor MPs spoke about gambling.',
  'A senator said Labor received money.'])assert.equal(claimMeasureConsistent(claim,[money]),false,claim)
 assert.equal(claimMeasureConsistent('Labor MPs gave 682 speeches labelled gambling.',[count]),true)
 assert.equal(claimMeasureConsistent('Labor voted in 87 divisions.',[vote]),true)
 assert.equal(claimMeasureConsistent('Labor had 682 mentions of gambling.',[mentions]),true)
 assert.equal(claimMeasureConsistent('Labor received $682 in disclosed receipts.',[money]),true)
})
test('money tools with record citations retain their financial provenance',()=>{
 const source={...money,kind:'record',receipt:{party:'Labor',amount:682}}
 assert.equal(claimMeasureConsistent('Labor received $682.',[source]),true)
 assert.equal(claimMeasureConsistent('Labor received $682.',[{...money,kind:'record'}]),true)
 assert.equal(claimMeasureConsistent('Labor received $682.',[{...speech,receipt:{amount:682}}]),false)
})
test('uncited or unrelated financial sources cannot rescue a speech-backed money claim',()=>{
 const answer='Labor takes the most money from gambling.'
 const out=guardClaimMeasures(payload(answer,[count,money],{'count/t/body/0':[[0,answer.length]]}))
 assert.equal(out.answer,MEASURE_GAP)
 assert.equal(guardClaimMeasures(payload(answer,[money],{})).answer,MEASURE_GAP)
 assert.equal(guardClaimMeasures(payload(answer,[],{})).answer,MEASURE_GAP)
})
test('separate sentences retain their own citations, including Unicode and footnote endpoints',()=>{
 const first='🦘 Labor MPs gave 682 speeches labelled gambling. ',second='Labor received $682 in disclosed receipts.'
 const start=Array.from(first).length,answer=first+second
 const ranges={'count/t/body/0':[[start-3,start-2]],'money/t/body/0':[[Array.from(answer).length-1,Array.from(answer).length]]}
 assert.equal(guardClaimMeasures(payload(answer,[count,money],ranges)).answer,answer)
 const swapped={'money/t/body/0':ranges['count/t/body/0'],'count/t/body/0':ranges['money/t/body/0']}
 assert.equal(guardClaimMeasures(payload(answer,[count,money],swapped)).answer,MEASURE_GAP)
})
test('a joined claim needs both measures and an attributed quotation remains a speech report',()=>{
 const answer='Labor received $682 and its MPs gave 682 speeches labelled gambling.'
 assert.equal(claimMeasureConsistent(answer,[money]),false)
 assert.equal(claimMeasureConsistent(answer,[count]),false)
 assert.equal(claimMeasureConsistent(answer,[count,money]),true)
 const reported='A senator said Labor received $100 from gambling donors.'
 assert.equal(guardClaimMeasures(payload(reported,[speech])).answer,reported)
})
test('one unsupported sentence is removed and the rest of the answer stands',()=>{
 const first='John Howard said the GST would replace a raft of inefficient taxes. ',second='The government received $682 in disclosed receipts.',third=' He argued it was fairer.'
 const answer=first+second+third
 const a=Array.from(first).length,b=a+Array.from(second).length,c=Array.from(answer).length
 const out=guardClaimMeasures(payload(answer,[speech],{'speech/t/body/0':[[0,a-1],[b+1,c]]}))
 assert.equal(out.answer,'John Howard said the GST would replace a raft of inefficient taxes. He argued it was fairer.')
 assert.notEqual(out.answer_decision,'limitation')
 const ranges=out.citations['speech/t/body/0']
 assert.equal(ranges.length,2)
 const kept=Array.from(out.answer)
 assert.equal(kept.slice(ranges[0][0],ranges[0][1]).join(''),'John Howard said the GST would replace a raft of inefficient taxes.'.slice(0,a-1))
 assert.equal(kept.slice(ranges[1][0],ranges[1][1]).join(''),'He argued it was fairer.')
 assert.deepEqual(out.sources.map(s=>s.resource),['speech'])
})
test('a removed sentence takes its own citations and sources with it',()=>{
 const first='Labor MPs gave 682 speeches labelled gambling. ',second='Labor received $682 in disclosed receipts.'
 const answer=first+second,a=Array.from(first).length,c=Array.from(answer).length
 const out=guardClaimMeasures(payload(answer,[count,speech],{'count/t/body/0':[[0,a-1]],'speech/t/body/0':[[a,c]]}))
 assert.equal(out.answer,'Labor MPs gave 682 speeches labelled gambling.')
 assert.deepEqual(Object.keys(out.citations),['count/t/body/0'])
 assert.deepEqual(out.sources.map(s=>s.resource),['count'])
})
test('a speech question with speech citations is never replaced',()=>{
 const answer='John Howard said on 13 August 1998 that the GST would be part of a new tax system. He told the House it would lower income tax.'
 const out=guardClaimMeasures(payload(answer,[speech]))
 assert.equal(out.answer,answer)
})
test('a failing sentence inside a bullet removes the whole bullet, not half of it',()=>{
 const a='- John Howard said the GST would stay at 10 per cent.\n',b='- He said Olympic tickets would carry GST. SOCOG received $682 in disclosed receipts, while a rebate would not extend to premium tickets.\n',c='- He argued it was fairer.'
 const answer=a+b+c,la=Array.from(a).length,lb=Array.from(b).length,lc=Array.from(c).length
 const out=guardClaimMeasures(payload(answer,[speech],{'speech/t/body/0':[[2,la-1],[la+2,la+lb-1],[la+lb+2,la+lb+lc]]}))
 assert.equal(out.answer,a+c)
 const kept=Array.from(out.answer),ranges=out.citations['speech/t/body/0']
 assert.deepEqual(ranges.map(([s,e])=>kept.slice(s,e).join('')),['John Howard said the GST would stay at 10 per cent.','He argued it was fairer.'])
})
test('a failing last bullet takes its preceding line break with it',()=>{
 const a='- John Howard said the GST would replace a raft of inefficient taxes.\n',b='- The Liberal Party received $682 in disclosed receipts, while donations rose.'
 const out=guardClaimMeasures(payload(a+b,[speech],{'speech/t/body/0':[[2,Array.from(a).length-1],[Array.from(a).length+2,Array.from(a+b).length]]}))
 assert.equal(out.answer,a.trimEnd())
})
