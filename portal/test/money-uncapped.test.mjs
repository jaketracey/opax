import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {moneyGold} from '../../scripts/gold_money.mjs';
import {donationGraph} from '../public/money-receipts.js';
import {resolveFlow,receiptTypeNote} from '../public/money-explain.js';
import {makeQuizContext} from '../public/quiz.js';
const read = file => JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const graph = read('../public/graph/money-receipts.json');
const summary = read('../public/graph/money-industry-totals.json');
const audit = read('../../docs/reports/2026-11-14-shared-money-identities.json');
const b = await build({stdin:{contents:"export {tool} from './src/tools/money-totals';export {rankedMoneyAnswer} from './src/ask-money';export {federalPartyMoneyAnswer} from './src/ask-money-routing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'});
const api = await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const facts = moneyGold(graph);

test('uncapped donation totals reproduce every industry/party figure in the independent audit', () => {
  for (const industry of Object.keys(audit.independent_before_folds)) {
    const measures = audit.industries_after_folds[industry];
    const rows = facts.industryByParty(industry).rows;
    assert.deepEqual(rows.slice(0,5).map(r => ({recipient:r.party,aud:r.total_aud})),measures.top5,industry);
    assert.equal(rows.reduce((s,r)=>s+r.total_aud,0),measures.aud,industry);
    assert.deepEqual(Object.fromEntries(rows.map(r=>[r.party,r.total_aud])),summary.industries[industry]);
  }
});

test('uncapped bracket census lists all ties and keeps the reviewed receipt pin', () => {
  assert.deepEqual(graph.meta.bracket_aliases.counts,audit.counts);
  assert.deepEqual(audit.counts,{"bracket_form_entities":431,"bracket_split_entities":88,"folded":0,"ambiguous":10,"kind_mismatch":13,"state_mismatch":0,"no_base":343,"transaction_qualifier":3,"state_branch":20,"entity_qualifier":6,"organisation_qualifier":36,"identity_qualifier":0});
  const tied=audit.decisions.filter(d=>d.status==='ambiguous');
  assert.equal(tied.length,10);assert.ok(tied.every(d=>d.candidate_sha256.length>1));
  assert.ok(audit.decisions.every(d=>/^[a-f0-9]{64}$/.test(d.source_sha256)));
  assert.equal(audit.samples_checked_by_eye.length,5);
  const reviewed=graph.nodes.filter(n=>n.kind==='donor'&&n.total===891049&&n.count===23);
  assert.equal(reviewed.length,1);assert.equal(reviewed[0].by_type.donation_received,881049);
});

test('Ask fossil-fuel facts include off-map donors and cannot read poisoned drawing edges', async () => {
  const reads=[];
  const assets={fetch:async request=>{
    const path=new URL(request.url).pathname;reads.push(path);
    assert.notEqual(path,'/graph/money.json','a factual ranking must never read drawing edges');
    return path==='/graph/money-receipts.json'?Response.json(graph):new Response('',{status:404});
  }};
  const out=await api.rankedMoneyAnswer({question:'Who receives the most disclosed receipts from fossil fuel donors?'},assets);
  assert.equal(out.answer_status,'calculated');
  assert.match(out.answer,/\| Liberal \| \$1,961,350 \| 56% \|/);
  assert.match(out.answer,/\| Labor \| \$981,002 \| 28% \|/);
  assert.doesNotMatch(out.answer,/includes loans/);
  assert.ok(reads.includes('/graph/money-receipts.json'));
  // The full register contains an organisation labelled "To". It must not consume the period grammar.
  const dated=await api.federalPartyMoneyAnswer({question:'Who receives the most funding from fossil fuel donors last few years since 2023'},assets);
  assert.equal(dated.answer_status,'calculated');
  assert.equal(dated.measure,'donations');
  assert.match(dated.money_reading,/2022–23 to 2024–25/);
});

test('money_totals uses uncapped donation cells for party and industry ranks', async () => {
  const env={asset:async path=>path==='/graph/money-receipts.json'?graph:null};
  const party=await api.tool.handler(env,{group_by:'party',limit:20});
  assert.equal(party.measure,'donations');
  const liberal=party.rows.find(r=>r.party==='Liberal');
  assert.equal(liberal.total_aud,Object.values(summary.industries).reduce((sum,rows)=>sum+(rows.Liberal||0),0));
  const industries=await api.tool.handler(env,{group_by:'industry',party:'Labor',limit:20});
  assert.equal(industries.rows.find(r=>r.industry==='unions').total_aud,74821446);
});

test('Explain and quiz industry/party facts use uncapped donations; donor receipts stay labelled all types', () => {
  const flow=resolveFlow({jur:'federal',industry:'fossil_fuels',to:'party:Liberal'},graph,null);
  assert.equal(flow.total,1961350);
  assert.match(receiptTypeNote(flow),/donations only.*uncapped/);
  const party=resolveFlow({jur:'federal',to:'party:Liberal'},graph,null);
  assert.equal(party.donations,true);
  const ctx=makeQuizContext({money:graph});
  for(const [industry,parties] of Object.entries(summary.industries)) {
    if(industry==='other')continue;
    assert.equal(Math.round(ctx.industries.get(industry)?.total || 0),Math.round(Object.values(parties).reduce((a,b)=>a+b,0)),industry);
  }
  assert.equal(ctx.parties.find(n=>n.label==='Liberal').total,party.total);
  const projected=donationGraph(graph);
  assert.ok(projected.edges.every(e=>!e.total || e.by_type?.donation_received===e.total));
});

test('the gold money fixture is reproducible offline from uncapped donations', () => {
  const gold=read('./fixtures/agentic-ask-gold.json');
  for(const q of gold.questions.filter(q=>q.category==='money')) {
    if(q.expected.donors)assert.deepEqual(q.expected.donors,facts.topDonors(q.expected.party),q.id);
    if(q.expected.industry)assert.deepEqual(q.expected.industry,facts.industryByParty(q.expected.industry.industry),q.id);
  }
});


test('the map loader reads the capped federal file independently of factual data', async () => {
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const start=app.indexOf('function loadMoneyFile('),end=app.indexOf('\n}',start)+2;
  const paths=[];
  const load=runInNewContext(app.slice(start,end)+';loadMoneyFile',{
    MONEY_JURISDICTIONS:{federal:{file:'/graph/money.json'}},moneyFiles:{},
    loadMoneyData:()=>{throw Error('the map must not use the uncapped factual loader');},
    fetch:async path=>{paths.push(path);return Response.json({drawing:true});},
  });
  assert.equal((await load('federal')).drawing,true);
  assert.deepEqual(paths,['/graph/money.json']);
});
