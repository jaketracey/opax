import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {donorAssociated,donorAssociatedTo,donorDisplayText,donorLabelHTML} from '../public/donor-disclosure.js'
import {gradeFollowUp} from '../../scripts/research_followups.mjs'

// Jake's rule, 11 November 2026, the same for every party: a donor the AEC associated-entity register ties to
// the receiving party stays in every ranking and total with its amounts untouched, and wherever its name is
// shown it carries "associated entity of <party>, per AEC register", in the register's own wording.
// Vapold (Liberal, Victorian Division) and the SDA (Labor branches) are the two pinned cases.
const built=await build({stdin:{contents:"export {partyDonations} from './src/agentic-tools';export {factSheet,inferPeriod} from './src/agentic-ask';export {writingFacts,proseFallback} from './src/research-writing';export {groundAnswerPayload} from './src/research-grounding';export {rankedMoneyAnswer} from './src/ask-money';export * from './src/tools/index'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const graph=JSON.parse(await readFile(new URL('../public/graph/money.json',import.meta.url),'utf8'))
const realFetch=globalThis.fetch
globalThis.fetch=async()=>{throw Error('Associated-entity tests must never call a public service.')}
test.after(()=>{globalThis.fetch=realFetch})
const deps={kb:async()=>{throw new Error('no KB')},asset:async path=>path==='/graph/money.json'?structuredClone(graph):null,origin:'https://opax.com.au'}
const assets={fetch:async req=>new Response(await readFile(new URL('../public'+new URL(req.url).pathname,import.meta.url)))}
const env={origin:'https://offline.test',asset:async path=>path==='/graph/money.json'?structuredClone(graph):null,ASSETS:assets}
const node=id=>graph.nodes.find(n=>n.id===id)
const VAPOLD=/^associated entity of Liberal Party of Australia \(Victorian Division\), per AEC register \(returns \d{4}-\d{2} to \d{4}-\d{2}\)$/
const SDA=/^associated entity of Labor, per AEC register \(returns \d{4}-\d{2} to \d{4}-\d{2}; \d+ party entries\)$/
const cases=[
 {party:'Liberal',query:{party:'Liberal'},id:'donor:vapold',name:'Vapold Pty Ltd',tag:VAPOLD,question:'Top donors to the Liberal Party'},
 {party:'Labor',query:{party:'Labor',from_year:2019,to_year:2019},id:'donor:shop distributive and allied employees association',name:'Shop Distributive & Allied Employees Association',tag:SDA,question:'Who gave the most money to Labor in 2019-20?'},
]

test('the export flags both parties\' associated entities from the AEC register and leaves their amounts alone',()=>{
 assert.match(graph.meta.associated_register_url,/^https:\/\/transparency\.aec\.gov\.au\//)
 assert.equal(graph.nodes.filter(n=>n.associatedTag).length,graph.meta.associated_entity_nodes)
 for(const c of cases){
  const n=node(c.id)
  assert.match(n.associatedTag,c.tag,c.name)
  assert.deepEqual(n.associatedWith.map(a=>[a.party,a.source]),[[c.party,'aec_assoc_entity']],c.name)
  const flows=graph.edges.filter(e=>e.source===c.id&&e.target.startsWith('party:'))
  assert.ok(flows.length&&flows.every(e=>e.total>0),`${c.name} keeps its receipts`)
 }
 // Only the AEC register decides: an ordinary corporate donor carries nothing.
 assert.equal(node('donor:westpac banking corporation').associatedTag,undefined)
})

test('the tag rides only on receipts to the party the register names',()=>{
 for(const c of cases){
  const n=node(c.id)
  assert.match(donorAssociatedTo(n,c.party),c.tag)
  assert.equal(donorAssociatedTo(n,c.party==='Labor'?'Liberal':'Labor'),undefined)
 }
 assert.equal(donorAssociatedTo(node('donor:westpac banking corporation'),'Liberal'),undefined)
})

test('donor names on pages and the map carry the tag linked to the AEC register, for both parties',()=>{
 for(const c of cases){
  const n=node(c.id)
  assert.match(donorDisplayText(n),new RegExp('\\(associated entity of '))
  const html=donorLabelHTML(n)
  assert.match(html,/<span class="donor-assoc"><a href="https:\/\/transparency\.aec\.gov\.au\/RegisterOfEntities\?clientType=associatedentity" rel="external noopener" target="_blank">Associated entity of /)
  assert.equal(donorAssociated(n).associatedUrl,graph.meta.associated_register_url)
 }
 assert.doesNotMatch(donorLabelHTML(node('donor:westpac banking corporation')),/donor-assoc/)
})

test('party_receipts keeps each associated entity at its rank and names it with the tag',async()=>{
 for(const c of cases){
  const r=await api.partyDonations(deps,{...c.query,limit:15})
  const row=r.data.rows.find(x=>x.donor===c.name)
  assert.ok(row,c.name);assert.match(row.associated_entity,c.tag)
  assert.equal(r.data.rows[0].donor,c.name,`${c.name} is not moved down the ranking`)
  assert.ok(r.cite.some(x=>x.label.startsWith(`${c.name} (associated entity of `)),`${c.name} citation label`)
  assert.ok(r.data.rows.filter(x=>x!==row).every(x=>!x.associated_entity||/associated entity of/.test(x.associated_entity)))
 }
 const westpac=(await api.partyDonations(deps,{party:'Liberal',limit:15})).data.rows.find(x=>x.donor==='Westpac Banking Corporation')
 assert.ok(westpac&&!('associated_entity' in westpac))
})

test('the written Ask answer names the top associated entity with its tag, for both parties',async()=>{
 for(const c of cases){
  const r=await api.partyDonations(deps,{...c.query,limit:5})
  const sheet=api.factSheet([r])
  assert.ok(sheet.facts.some(f=>f.text.includes(`${c.name} (associated entity of `)),`${c.name} fact`)
  const input={question:c.question,period:api.inferPeriod(c.question),facts:api.writingFacts(undefined,sheet.facts,sheet.notes)}
  const out=api.proseFallback(input)
  const lead=out.answer.split('\n')[0]
  assert.ok(lead.startsWith(`${c.name} (associated entity of `),lead)
  assert.match(lead,/provided the most disclosed funding/)
  assert.equal(api.groundAnswerPayload(out,c.question).answer,out.answer,'the grounding checks keep the tagged line')
 }
})

test('the calculated money ranking names the associated entity with its tag in the lead and the table',async()=>{
 for(const c of cases){
  // This path names the map node (its label), the tool path the disclosure's own spelling.
  const out=await api.rankedMoneyAnswer({question:c.question},assets),name=node(c.id).label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  assert.equal(out?.answer_status,'calculated',c.question)
  const tag=c.tag.source.slice(1,-1)
  assert.match(out.answer,new RegExp(`are from \\*\\*${name}: \\$[\\d,]+\\*\\* \\(${tag}\\) across`),c.question)
  assert.match(out.answer,new RegExp(`\\| \\[${name}\\]\\([^)]*\\) \\(${tag}\\) \\|`),c.question)
 }
 const westpac=await api.rankedMoneyAnswer({question:'Who gives the most money to One Nation?'},assets)
 assert.doesNotMatch(westpac.answer,/associated entity of/)
})

test('money_totals donor rows to the named party carry the tag',async()=>{
 const out=await api.callTool(env,'money_totals',{party:'Liberal',group_by:'donor',limit:3})
 const row=out.rows?.find(r=>r.donor==='Vapold Pty Ltd')
 assert.ok(row,JSON.stringify(out).slice(0,400));assert.match(row.associated_entity,VAPOLD)
 assert.ok(out.citations.some(c=>c.text.startsWith('Vapold Pty Ltd (associated entity of Liberal Party of Australia (Victorian Division), per AEC register')))
})

test('follow-up grading fails an answer that drops the tag from an associated entity',()=>{
 const turn={question:'Top donors to the Liberal Party',standalone:'Top donors to the Liberal Party',context_all:['Liberal'],decision:'answer',
  rows:[{donor:'Vapold Pty Ltd',associated_entity:node('donor:vapold').associatedTag,total_aud:1000,receipts:1}]}
 const tagged=`Vapold Pty Ltd (${node('donor:vapold').associatedTag}) provided the most disclosed funding to Liberal: $1,000.`
 const bare='Vapold Pty Ltd provided the most disclosed funding to Liberal: $1,000.'
 const payload=answer=>({answer,asked_as:turn.standalone,citations:{'fact-1/t/body/0':[[0,answer.length]]},sources:[{resource:'fact-1',kind:'export',cited:true,snippet:answer}]})
 assert.equal(gradeFollowUp(turn,payload(tagged)).owners_figures,'pass')
 assert.equal(gradeFollowUp(turn,payload(bare)).owners_figures,'fail')
})
