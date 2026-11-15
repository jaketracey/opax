import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {donorDisclosure,receiptTypeLine,receiptSplit,otherReceiptsLine} from '../public/donor-disclosure.js';
import {partyMoneyData} from '../public/register-tables.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const drawing=read('../public/graph/money.json');
const full=read('../public/graph/money-receipts.json');
// The 19 older exceptions, identified only by published organisation IDs. The
// shared spelling lookup now reconciles these too; none is silently skipped.
const olderExceptions=new Set([
  'donor:shop distributive and allied employees association',
  'donor:construction forestry maritime mining and energy union',
  'donor:communications electrical and plumbing union of australia',
  'donor:australian workers union', 'donor:electrical trades union of australia',
  'donor:transport workers union of australia', 'donor:health services union',
  'donor:tabcorp', 'donor:australian services union', 'donor:pricewaterhousecoopers',
  'donor:mining and energy union', 'donor:australian rail tram and bus industry union',
  'donor:deloitte touche tohmatsu', 'donor:merck sharp dohme australia',
  'donor:slater and gordon', 'donor:sporting shooters association of australia',
  'donor:j j richards sons', 'donor:spirits cocktails australia', 'donor:sarina russo group',
]);

test('every drawn donor has the same typed totals in the uncapped file, including all 19 older exceptions',()=>{
  assert.equal(olderExceptions.size,19);
  const nodes=new Map(full.nodes.map(n=>[n.id,n]));
  for(const donor of drawing.nodes.filter(n=>n.kind==='donor')) {
    assert.ok(nodes.has(donor.id),donor.id);
    assert.deepEqual(nodes.get(donor.id).by_type,donor.by_type,
      `${olderExceptions.has(donor.id)?'formerly excepted':'drawn'} ${donor.id}`);
  }
  for(const graph of [drawing,full]) {
    const bank=graph.nodes.find(n=>n.id==='donor:national australia bank');
    assert.ok(bank.aliases.every(name=>!/\(Loan\)/i.test(name)), 'the Loan identity is not advertised as an alias of the plain bank');
  }
});

test('Loan suffix policy keeps all three disclosed donation amounts and every party row names Loan',()=>{
  for(const [label,amount] of [
    ['Comscrv (No. 2092) Pty Ltd - Loan',899628],
    ['National Building Foundation - Loan',75000],
    ['Supporters Foundation - Loan',48440],
  ]) {
    const donor=full.nodes.find(n=>n.label.toLowerCase()===label.toLowerCase());
    assert.ok(donor,label);
    assert.equal(donor.by_type.donation_received,amount,label);
    assert.deepEqual(receiptSplit(donor).donations,[amount,donor.count]);
    assert.ok(!donor.donation_exclusions);
    assert.match(donorDisclosure(donor).name,/Loan$/i);
    for(const edge of full.edges.filter(e=>e.source===donor.id)) {
      const rows=partyMoneyData(full,edge.target).rows;
      const row=rows.find(r=>r.href===donorDisclosure(donor).href);
      assert.ok(row,label);assert.match(row.label,/Loan$/i);
    }
  }
});

test('returned receipt page line explains the AEC wording and giving exclusion',()=>{
  const returned={by_type:{donation_received:20000},by_type_year:{'2020-21':{donation_received:[20000,1]}},
    donation_exclusions:{by_type:{donation_received:20000},by_type_year:{'2020-21':{donation_received:[20000,1]}}}};
  assert.match(receiptTypeLine(returned),/Donation Received: \$20,000.*The AEC records \$20,000 as returned or refunded; OPAX leaves it out of donations/);
});

test('subscriptions and untyped receipts keep their AEC non-donation clause alongside returned money',()=>{
  const row={by_type:{subscription:10,unknown:5,donation_received:20},by_type_year:{'2020-21':{
    subscription:[10,1],unknown:[5,1],donation_received:[20,1]}},
    donation_exclusions:{by_type:{donation_received:20},by_type_year:{'2020-21':{donation_received:[20,1]}}}};
  const line=otherReceiptsLine('Alex Hart','Labor',receiptSplit(row));
  assert.match(line,/\$10 in subscriptions and \$5 in receipts the return gave no type for.*which the AEC doesn't class as donations\./);
  assert.match(line,/\$20 in receipts explicitly marked returned or refunded \(excluded from donations\)/);
});
