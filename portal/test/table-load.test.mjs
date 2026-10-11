import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {identityVariants,identityCandidates} from '../src/table-identities.mjs';
import {tableSchema} from '../../scripts/table-schema.mjs';
const org=JSON.parse(await readFile(new URL('../public/graph/money.json',import.meta.url))).nodes.find(n=>n.kind==='donor'&&isOrganisationDonor(n));
test('individual type evidence overrides organisation-looking names',()=>{
  for (const kind of ['individual','person','sole_trader','sole proprietor']) assert.equal(isOrganisationRecipient({name:org.label,kind}),false);
  assert.equal(isOrganisationRecipient({name:org.label,identity:{type:'IND',kind:'company'}}),false);
  assert.equal(isOrganisationRecipient({name:org.label,abr:{etype:'IND'}}),false);
  assert.equal(isOrganisationRecipient({name:org.label,id:'person:fixture-id',kind:'company'}),false);
  assert.equal(isOrganisationRecipient({name:org.label,kind:'company'}),true);
  assert.equal(isOrganisationRecipient({}),false);
});
test('checked-in schema matches the typed dataset and FTS generator',async()=>{
  const checked=await readFile(new URL('../table-migrations/0001_tables.sql',import.meta.url),'utf8');assert.equal(checked,tableSchema());assert.equal((checked.match(/USING fts5/g)||[]).length,10);
});
test('private identifier variants are derived from exports and cover spaced and encoded forms',async()=>{
  const files=JSON.parse(await readFile(new URL('../public/suppliers.json',import.meta.url))).suppliers;
  const supplier=files.find(s=>s.abn);const value=String(supplier.abn),normal=value.replace(/\D/g,'');
  assert.ok(identityVariants(value).includes(normal));
  assert.ok(identityCandidates(normal.split('').join(' '),[1,11]).has(normal));
  const encoded=encodeURIComponent(org.label);assert.ok(identityCandidates(encoded, [org.label.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').length]).has(identityVariants(org.label)[0]));
});

test('private encoded identifiers remain rejected beside a literal percent sign',async()=>{
  const {tableIdentityIndex}=await import('../../scripts/load_tables.mjs');
  const policy=await tableIdentityIndex();
  const value=[...policy.recipientPhrases].find(p=>p.includes(' ') && /[a-z]/.test(p));
  assert.ok(value,'runtime recipient identity coverage');
  assert.equal(policy.check('100% '+encodeURIComponent(value)),true);
  assert.equal(policy.check('100% '+encodeURIComponent(encodeURIComponent(value))),true);
  const encoded=[...new TextEncoder().encode(value)].map(n=>'%'+n.toString(16).padStart(2,'0')).join('');
  assert.equal(policy.check('%FF'+encoded),true);
  assert.equal(policy.check(encodeURIComponent('%FF'+encoded)),true);
});
