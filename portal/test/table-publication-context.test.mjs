// Derive collisions in memory; diagnostics never include identity fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tableIdentityIndex} from '../../scripts/load_tables.mjs';
import {compileIdentityCheck} from '../src/table-identities.mjs';
import {tablePrivacy,tablePrivacyGuard} from '../src/table-privacy.ts';
import {contractRows,contractsTableConfig} from '../public/contracts-table.js';
import {applyQuery,toCSV} from '../public/datatable.js';

test('verified agency identities preserve procurement without relaxing private queries',async t=>{
  const root=new URL('../public/',import.meta.url);
  const registry=JSON.parse(await readFile(new URL('table-private-identities.json',root),'utf8'));
  const agencies=JSON.parse(await readFile(new URL('agencies.json',root),'utf8'));
  const policy=await tableIdentityIndex();
  const strict=compileIdentityCheck(policy.recipientPhrases);
  const collisions=agencies.agencies.filter(agency=>strict(agency.name));
  assert.ok(collisions.length>0,'runtime publication collision coverage');
  const assets={fetch:async request=>Response.json(new URL(request.url).pathname==='/agencies.json'?agencies:registry)};
  const guard=await tablePrivacyGuard(assets);
  for(const agency of collisions){
    assert.equal(policy.recipientCheck(agency.name),false,'authoritative agency publication');
    assert.equal(guard.recipientCheck(agency.name),true,'hashed agency publication');
    assert.equal(policy.check(agency.name),true,'query policy retained');
    const request=surface=>new Request('https://local.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:agency.name,...surface?{surface}:{}})});
    assert.equal((await(await tablePrivacy(request('data'),assets)).json()).safe,true,'browser publication');
    assert.equal((await(await tablePrivacy(request(),assets)).json()).safe,false,'browser query rejection');
    const rows=contractRows([{id:'CN9000',title:'Procurement services',supplier:'Fixture organisation Pty Ltd',recipient_kind:'organisation',agency:agency.name,amount:50,start_date:'2025-01-01'}],guard);
    const config=contractsTableConfig({supplierId:'s-fixture',rows,privacyCheck:value=>!policy.check(value),dataPrivacyCheck:guard.recipientCheck});
    assert.equal(applyQuery(rows,config,{}).total,1,'organisation procurement retained');
    assert.ok(toCSV(rows,config).includes(agency.name),'public agency retained in CSV');
    const privateRows=contractRows([{id:'CN9001',title:'Procurement services',recipient_kind:'individual',agency:agency.name,amount:50,start_date:'2025-01-01'}],guard);
    assert.equal(privateRows.length,1);assert.equal(privateRows[0].aggregate.count,1,'individual remains neutral');
  }
  const bare=[...policy.recipientPhrases].find(value=>!value.startsWith('stripped:')&&strict(value)&&policy.recipientCheck(value));
  assert.ok(bare,'runtime private recipient coverage');
  for(const agency of collisions){
    assert.equal(policy.recipientCheck(agency.name+' '+bare),true,'private field remains blocked');
    assert.equal(guard.recipientCheck(agency.name+' '+bare),false,'hashed private field remains blocked');
  }
  t.diagnostic(JSON.stringify({authoritativeAgencyCollisions:collisions.length,privateFieldLeaks:0,queryRejections:collisions.length}));
});
