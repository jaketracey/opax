import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const b=await build({stdin:{contents:"export * from './src/ask-writing-rules';export * from './src/ask-money-overview';export * from './src/ask-records';export * from './src/ask-scope';export * from './src/ask-rewrite';export * from './src/agentic-ask';export * from './src/research-writing';export * from './src/search-summary';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const facts={measure:'receipts_all',measure_label:'disclosed receipts, all types',ranked_by:'recipient',selection:'Financial years 2020–21',rows:[{name:'Example Party',amount:'$100',records:'1'}],derived:[]}
const prompts={overview:api.moneyOverviewPrompt(facts),records:api.RECORD_GROUNDING,position:api.POSITION_GROUNDING,rewrite:api.REWRITE_SYSTEM+' '+api.rewritePrompt('Example question'),planner:api.plannerPrompt().system+' '+api.plannerPrompt().user,writer:api.writingPrompt({question:'How much?',period:{label:'all years'},facts:[]}),search:api.SEARCH_SUMMARY_SYSTEM+' '+api.summaryPrompt('Example',{},[])}
for(const [name,prompt]of Object.entries(prompts))test(name+' carries one shared contract and positive answer instructions',()=>{
 assert.equal(prompt.split(api.ASK_EVIDENCE_RULES).length-1,1)
 const outside=prompt.replace(api.ASK_EVIDENCE_RULES,'')
 assert.ok((outside.match(/\b(?:do not|never|must not|cannot)\b/gi)??[]).length<=3)
 assert.match(prompt,/Arithmetic belongs to the calculator/)
 assert.match(prompt,/name the people they name/)
})
