// Ask passage excerpts no longer cut at a decimal point, section number, abbreviation or initial (BACKLOG A31).
// Found in a probe: an excerpt cut "would build 1.2 million homes" to "would build 1.".
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {sentenceSpans} from '../src/sentence-bounds.mjs'

const built=await build({stdin:{contents:"export {passageExcerpt} from './src/research-evidence';export {sentenceParts} from './src/research-claim-audit.mjs';export {shortTranscriptQuote} from './src/transcript-answer'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',logLevel:'silent'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))

// Each text is one sentence and must stay whole.
const whole=[
 ['probe shape','The government said it would build 1.2 million homes over five years.'],
 ['decimal','Inflation fell to 0.5 per cent in the quarter, the Treasurer told the House.'],
 ['dollar decimal','The program will cost $3.4bn across the forward estimates period.'],
 ['section abbreviation','The member raised s. 44 of the Constitution in the debate today.'],
 ['section number','The amendment changes section 7.1 of the bill as introduced.'],
 ['Mr.','I thank Mr. Albanese for his remarks on the housing bill.'],
 ['Dr.','The committee heard from Dr. Ngata about the hospital waiting lists.'],
 ['No.','The minister tabled report No. 12 on the national housing accord.'],
 ['e.g.','Some measures, e.g. Rent assistance, were extended to more households.'],
 ['i.e.','The second reading, i.e. The debate on principle, resumed on Tuesday.'],
 ['etc.','Schools, hospitals, roads etc. Were all named in the budget papers.'],
 ['approx.','The scheme covers approx. Forty thousand households across the state.'],
 ['dotted initials','The report by R.A. Simms examined the funding of regional councils.'],
 ['single initial','The submission from J. Smith opposed the change to the rules.'],
]
const ends=[
 ['full stop','The member spoke on the bill. The member then sat down.',['The member spoke on the bill.','The member then sat down.']],
 ['after a figure','Funding rose to $1.2 million. The minister welcomed it.',['Funding rose to $1.2 million.','The minister welcomed it.']],
 ['question','Will the minister act? The House waits.',['Will the minister act?','The House waits.']],
 ['closing quote','He said “we will build homes.” The debate went on.',['He said “we will build homes.”','The debate went on.']],
]

// Each case runs through the passage excerpt Ask quotes, the answer splitter and the shared helper.
for(const [name,text] of whole)test(`excerpt keeps whole: ${name}`,()=>{
 assert.equal(api.passageExcerpt(`Members met early. ${text} The House adjourned.`,text,40).text,text)
 assert.deepEqual(sentenceSpans(text).map(s=>s.text),[text])
 assert.deepEqual(api.sentenceParts(text).map(s=>s.text),[text])
})
for(const [name,text,want] of ends)test(`sentenceSpans still splits: ${name}`,()=>{
 const spans=sentenceSpans(text)
 assert.deepEqual(spans.map(s=>s.text),want)
 for(const s of spans)assert.equal(text.slice(s.at,s.at+s.text.length),s.text)
})

test('passageExcerpt keeps a cited figure whole (probe shape)',()=>{
 const passage='Housing is the issue. The government said it would build 1.2 million homes over five years. Members opposite disagreed.'
 assert.equal(api.passageExcerpt(passage,'how many homes would the government build').text,'The government said it would build 1.2 million homes over five years.')
})
test('passageExcerpt still picks one sentence at a true sentence end',()=>{
 assert.equal(api.passageExcerpt('Housing debate resumed today. The member said the bill fails renters entirely.','bill renters fails').text,'The member said the bill fails renters entirely.')
})
test('shortTranscriptQuote keeps initials with the surname',()=>{
 assert.equal(api.shortTranscriptQuote('Thank you. The witness R.A. Simms said housing support had doubled. That was the plan.','housing support'),'The witness R.A. Simms said housing support had doubled.')
})
test('shortTranscriptQuote keeps an honorific with its name',()=>{
 assert.equal(api.shortTranscriptQuote('Dr. Ngata told the housing inquiry that the waiting list had doubled.','housing inquiry'),'Dr. Ngata told the housing inquiry that the waiting list had doubled.')
})
