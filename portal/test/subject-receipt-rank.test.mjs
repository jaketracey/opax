import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('    const rank',app.indexOf('    const donorScope = isParty'));
const end=app.indexOf('    // The party\'s table counts',start);
assert.ok(start>=0&&end>start);
const rankCode=app.slice(start,end)+';rank';

for(const isParty of [false,true]) test(`${isParty?'party':'donor'} rank computes each receipt projection once and preserves ties`,()=>{
  const nodes=Object.freeze(Array.from({length:40},(_,i)=>Object.freeze({id:`fixture-${i}`,total:(i%7)*100,order:i})));
  const before=JSON.stringify(nodes);
  for(const node of [nodes[0],nodes[17],nodes[39],{id:'missing'}]){
    const donors=[...nodes];let projections=0;
    const figures=n=>{projections++;return {total:n.total};};
    const rank=runInNewContext(rankCode,{donors,node,isParty,receiptFigures:isParty?()=>assert.fail('wrong receipt measure'):figures,partyReturnFigures:isParty?figures:()=>assert.fail('wrong receipt measure')});
    const expected=[...nodes].sort((a,b)=>b.total-a.total).findIndex(n=>n.id===node.id)+1;
    assert.equal(rank,expected);
    assert.equal(projections,nodes.length,'ranking must not recompute every year/type cell in each comparison');
  }
  assert.equal(JSON.stringify(nodes),before,'ranking does not change the shared graph');
});
