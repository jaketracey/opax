import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {receiptTypeNote} from '../public/money-explain.js';
import {donationGraph} from '../public/money-receipts.js';
import {receiptFigures,receiptGraph,receiptSplit} from '../public/donor-disclosure.js';
const read = file => JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const full = read('../public/graph/money-receipts.json');
const drawing = read('../public/graph/money.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const bundle = await build({stdin:{contents:"export {tool} from './src/tools/money-totals';export {receiptAnswer} from './src/voice-money';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'});
const {tool,receiptAnswer} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function series(amount,count,type='donation_received') {
  return {total:amount,count,by_type:{[type]:amount},by_type_year:{'2020-21':{[type]:[amount,count]}}};
}

test('returned donations stay labelled receipts and never count as giving, including FY queries', async () => {
  const returned={...series(20000,1),donation_exclusions:series(20000,1)};
  const graph={meta:{uncapped:true,receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:[
    {id:'party:Labor',kind:'party',label:'Labor',...series(25000,2),donation_exclusions:series(20000,1)},
    {id:'base',kind:'donor',label:'Alex Hart',...series(5000,1)},
    {id:'returned',kind:'donor',label:'Alex Hart (Donation Returned)',...returned},
  ],edges:[{source:'base',target:'party:Labor',...series(5000,1)},
    {source:'returned',target:'party:Labor',...returned}]};
  assert.equal(receiptFigures(returned).total,20000);
  for (const row of [returned,receiptGraph(graph).edges[1]]) {
    assert.deepEqual(receiptSplit(row).donations,[0,0]);
    assert.deepEqual(receiptSplit(row,2020,2020).donations,[0,0]);
    assert.deepEqual(receiptSplit(row).all,[20000,1]);
  }
  assert.match(receiptTypeNote({jur:'federal',edges:receiptGraph(graph).edges,total:25000}), /explicitly marked returned or refunded and excluded from donation figures/);
  const gifts=donationGraph(graph);
  assert.equal(gifts.nodes.find(n=>n.id==='party:Labor').total,5000);
  assert.equal(gifts.edges.reduce((sum,e)=>sum+e.total,0),5000);
  const env={asset:async path=>path==='/graph/money-receipts.json'?graph:null};
  for (const args of [{group_by:'party'}, {group_by:'party',financial_year:'2020-21'}]) {
    const out=await tool.handler(env,args);
    assert.equal(out.rows[0].total_aud,5000);
    assert.equal(out.rows[0].receipts,1);
  }
  const own=await tool.handler(env,{donor:'Alex Hart'});
  assert.equal(own.rows[0].total_aud,5000);
  const receipts=await tool.handler(env,{donor:'Alex Hart (Donation Returned)',measure:'all_types'});
  assert.equal(receipts.rows[0].total_aud,20000);
  const excluded=await tool.handler(env,{donor:'Alex Hart (Donation Returned)',measure:'donations'});
  assert.equal(excluded.rows.length,0);
  assert.equal(excluded.other_receipts[0].returned_receipts_aud,20000);
  assert.equal(excluded.other_receipts[0].receipts,1);
  assert.ok(excluded.notes.some(note=>note.includes('explicitly marked returned or refunded')));
  for (const window of [{},{from:'2020',to:'2020'}]) {
    const answer=receiptAnswer(graph,'How much in donations to Labor?','federal','https://example.test',{measure:'donations',...window});
    assert.equal(answer.total_aud,5000);
    assert.equal(answer.receipts,1);
    assert.equal(answer.all_types_aud,25000);
    const all=receiptAnswer(graph,'How much in receipts to Labor?','federal','https://example.test',{measure:'receipts_all',...window});
    assert.equal(all.total_aud,25000);
    assert.equal(all.receipts,2);
  }
});

test('both reviewed live transaction identities remain separate with original receipt types', () => {
  for (const [prefix,amount,count,baseAmount,baseCount,type] of [
    ['baeaf63c772b',20000,1,5000,1,'donation_received'],
    ['be1fd9c7a97d',190000,8,385000,7,'other_receipt'],
  ]) {
    const decision=full.meta.bracket_aliases.decisions.find(d=>d.source_sha256.startsWith(prefix));
    assert.equal(decision.status,'transaction_qualifier');
    const source=full.nodes.find(n=>hash(n.id)===decision.source_sha256);
    const base=full.nodes.find(n=>hash(n.id)===decision.candidate_sha256[0]);
    assert.deepEqual([source.total,source.count],[amount,count]);
    assert.deepEqual(source.by_type,{[type]:amount});
    assert.deepEqual([base.total,base.count],[baseAmount,baseCount]);
    assert.ok(!base.aliases.includes(source.label));
  }
});

test('separate state branches drawn on the map also exist in the uncapped source', () => {
  const branch=drawing.nodes.find(n=>hash(n.id).startsWith('68ba2871982a'));
  assert.ok(branch);
  const uncapped=full.nodes.find(n=>n.id===branch.id);
  assert.ok(uncapped);
  assert.deepEqual([receiptFigures(uncapped).total,receiptFigures(uncapped).count],[745200,16]);
  assert.deepEqual(uncapped.by_type,branch.by_type);
});
