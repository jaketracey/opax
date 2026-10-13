import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {identityVariants,identityCandidates} from '../src/table-identities.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
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
test('the original D1 schema upgrades to the typed record projections',async()=>{
  const checked=await readFile(new URL('../table-migrations/0001_tables.sql',import.meta.url),'utf8');
  const upgrade=await readFile(new URL('../table-migrations/0002_vote_records.sql',import.meta.url),'utf8');
  const registered=await readFile(new URL('../table-migrations/0002_instrument_registered.sql',import.meta.url),'utf8');
  const local=await tableDatabase({datasets:{}});
  try {
    for(const name of ['divisions','votes','instruments']) {
      await local.db.exec(`DROP TABLE table_${name}_fts;\nDROP TABLE table_${name}_facets;\nDROP TABLE table_${name};`);
    }
    await local.db.exec(checked); await local.db.exec(upgrade); await local.db.exec(registered);
    for(const name of ['divisions','votes','instruments']) {
      const columns=await local.db.prepare(`PRAGMA table_info(table_${name})`).all();
      assert.deepEqual(new Set(columns.results.map(c=>c.name)),new Set(['rowid','search',...TABLE_DATASETS[name].columns.map(c=>c.key)]));
    }
    assert.equal((tableSchema().match(/USING fts5/g)||[]).length,10);
  } finally {await local.close();}
});
test('private identifier variants are derived from exports and cover spaced and encoded forms',async()=>{
  const files=JSON.parse(await readFile(new URL('../public/suppliers.json',import.meta.url))).suppliers;
  const supplier=files.find(s=>s.abn);const value=String(supplier.abn),normal=value.replace(/\D/g,'');
  assert.ok(identityVariants(value).includes(normal));
  assert.ok(identityCandidates(normal.split('').join(' '),[1,11]).has(normal));
  const encoded=encodeURIComponent(org.label);assert.ok(identityCandidates(encoded, [org.label.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').length]).has(identityVariants(org.label)[0]));
});
