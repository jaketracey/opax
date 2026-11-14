// The "do not name" who line (leadWithWho, UNNAMED_WHO_LEAD) never opens an answer whose own sentences name a person
// or office: the next sentence naming a minister read as the answer contradicting itself. Speakers do not count.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {importBundle} from './fixtures/import-bundle.mjs'

const bundled=await build({stdin:{contents:"export * from './src/research-who-lead'; export * from './src/research-grounding';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await importBundle(bundled.outputFiles[0].text,'ask-who-unnamed-line')
const speech=(resource,speaker,snippet,title)=>({resource,slug:'',title,url:'https://example.org/'+resource,snippet,kind:'speech',speaker,chamber:'house',date:'2020-02-04',cited:true})
/** An answer of lines, each cited to its source when one is given, as the loop writes it (uncited lines have none). */
function answer(lines){
  let text='',at=0
  const citations={},sources=[]
  for(const [line,source] of lines){
    if(text){text+='\n';at+=1}
    if(source){(citations[source.resource+'/t/body/0']??=[]).push([at,at+line.length]);if(!sources.includes(source))sources.push(source)}
    text+=line;at+=line.length
  }
  return {answered:true,answer:text,citations,sources,answer_decision:'answer',research:{mode:'loop'}}
}
const lead=payload=>String(payload.answer).split('\n')[0]

test('sports-rorts shape: an uncited sentence naming the minister means the line does not open the answer',()=>{
  const q='Who was responsible for the sports rorts affair?'
  const s=speech('sp-1','Casey Example','The Auditor-General found the minister\'s office ran a parallel assessment process.','Community Sport Infrastructure Program')
  const named='Bridget McKenzie, as Minister for Sport, approved the Community Sport Infrastructure Program grants in the lead-up to the 2019 election.'
  const out=api.groundAnswerPayload(answer([[named],['Casey Example told the House the Auditor-General found the minister\'s office "ran a parallel assessment process".',s]]),q)
  assert.equal(lead(out),named)
  assert.ok(!out.answer.includes(api.UNNAMED_WHO_LEAD))
})

test('robodebt shape: a sentence naming a member by full name, title and surname, or possessive drops the line',()=>{
  const q='Who was responsible for robodebt?'
  const s=speech('sp-2','Jordan Sample','The royal commission found the robodebt scheme was a crude and cruel mechanism, neither fair nor legal.','Robodebt')
  const finding='The Royal Commission into the Robodebt Scheme found responsibility lay with the ministers who approved and defended the scheme.'
  for(const named of ['Scott Morrison took the proposal to Cabinet as Social Services Minister in 2015.','Mr Morrison took the proposal to Cabinet in 2015.','Scott Morrison\'s department took the proposal to Cabinet in 2015.']){
    const out=api.groundAnswerPayload(answer([[finding],[named],['Jordan Sample said the commission found the scheme was "a crude and cruel mechanism, neither fair nor legal".',s]]),q)
    assert.ok(!out.answer.includes(api.UNNAMED_WHO_LEAD),named)
    assert.equal(lead(out),finding,named)
  }
})

test('an office named as the subject of a finding drops the line',()=>{
  const q='Who is to blame for the sports rorts affair?'
  const s=speech('sp-3','Jamie Example','This minister pork-barrelled sports grants into marginal seats.','Community Sport Infrastructure Program')
  const finding='The Auditor-General found the Minister for Sport\'s office ran a parallel assessment process.'
  const out=api.groundAnswerPayload(answer([['Jamie Example said the minister "pork-barrelled sports grants into marginal seats".',s],[finding]]),q)
  assert.equal(lead(out),finding)
  assert.ok(!out.answer.includes(api.UNNAMED_WHO_LEAD))
})

test('a genuinely unnamed answer, whose only names are its speakers, still opens on the line',()=>{
  const q='Who decided to buy the Example land?'
  const a=speech('sp-4','Casey Sample','The Auditor-General found the department did not conduct appropriate due diligence before it bought the land.','Example land')
  const b=speech('sp-5','Bill Shorten','The then minister must have signed off on the purchase.','Example land')
  const out=api.groundAnswerPayload(answer([['Casey Sample said the Auditor-General found the department did not conduct appropriate due diligence before it bought the land.',a],['Bill Shorten, the member for Maribyrnong, told the House the then minister must have signed off on the purchase.',b]]),q)
  assert.equal(lead(out),api.UNNAMED_WHO_LEAD)
})

test('namesSomeone reads subjects, roles and members, never a speaker attribution',()=>{
  for(const text of ['Bridget McKenzie, as Minister for Sport, approved the grants.','Scott Morrison took the proposal to Cabinet.','Senator McKenzie resigned in 2020.','Minister Jane Example approved the scheme.','The Department of Health approved the scheme.'])assert.equal(api.namesSomeone(text),true,text)
  for(const text of ['Bill Shorten told the House the scheme was unlawful.','Bill Shorten (Labor) said the scheme was unlawful.','Bill Shorten, the member for Maribyrnong, said the scheme was unlawful.','The then minister must have signed off.','The Royal Commission found the scheme was unlawful.'])assert.equal(api.namesSomeone(text),false,text)
})
