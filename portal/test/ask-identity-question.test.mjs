import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'

const built=await build({stdin:{contents:"export {identityPerson} from './src/ask-followup';export {groundAnswerPayload} from './src/research-grounding';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))

// Production Ask, 13 Nov 2026: "Who was responsible for robodebt" was read as a question about a person
// named "responsible for robodebt", so research searched for that "person" and the answer became
// "OPAX found no public record matching the full name responsible for robodebt."
const eventQuestions=[
  'Who was responsible for robodebt?','who was responsible for robodebt','Who is responsible for the NDIS rollout?',
  'Who was behind robodebt?','Who was sacked over robodebt?','Who was involved in robodebt?','Who was accountable for robodebt?',
  'Who was blamed for robodebt?','who is running for Grayndler','Who was prime minister in 2016?','Who is Prime Minister Anthony Albanese?',
  'Who is the member for Grayndler?','Who was elected in Wentworth?','Who is shadow treasurer?','Who was treasurer before Chalmers?',
  'Who is suing Lehrmann?','who was fired yesterday','Who was found guilty?','Who is investigating robodebt?','Who is funding Teals?',
]
const names=[
  ['Who is Paul Graham?','Paul Graham'],['who is anthony albanese','anthony albanese'],['Who was Theresa May?','Theresa May'],
  ['Who is Will Hodgman?','Will Hodgman'],['Who is Senator Penny Wong?','Penny Wong'],['Who was Catherine King?','Catherine King'],
  ["Who is Kristina Keneally?",'Kristina Keneally'],['Who was Robert Menzies','Robert Menzies'],
  ['Who is Dale Last?','Dale Last'],['Who is Moira Were?','Moira Were'],['who is fred nile','fred nile'],['Who is Ted O’Brien?','Ted O’Brien'],
]

test('questions about events, roles and stances are not read as a person\'s name',()=>{
  for(const q of eventQuestions)assert.equal(api.identityPerson(q),null,q)
})

test('who-is questions with a full name still name the person',()=>{
  for(const [q,name] of names)assert.equal(api.identityPerson(q),name,q)
})

test('a researched answer to "who was responsible" is kept, not replaced by a no-record line',()=>{
  const q='Who was responsible for robodebt?'
  const text='Report of the Royal Commission into the Robodebt Scheme (7 July 2023): as Minister for Social Services in 2015, Scott Morrison took the income averaging proposal to Cabinet.'
  const source={resource:'fact-1',slug:'',title:'Royal Commission into the Robodebt Scheme, report',href:'https://robodebt.royalcommission.gov.au/',url:'https://robodebt.royalcommission.gov.au/',snippet:text,cited:true,kind:'record'}
  const answer='The Royal Commission into the Robodebt Scheme found that Scott Morrison, as Minister for Social Services in 2015, took the income averaging proposal to Cabinet.'
  const payload={answer,answer_decision:'answer',citations:{'fact-1/t/body/0':[[0,Array.from(answer).length]]},sources:[source],research:{pre_writer_sources:[source]}}
  const out=api.groundAnswerPayload(payload,q)
  assert.doesNotMatch(String(out.answer),/no public record matching the full name/)
  assert.match(String(out.answer),/Royal Commission/)
  assert.notEqual(out.answer_decision,'limitation')
})
