import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
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
  const local=await tableDatabase({datasets:{}});
  try {
    for(const name of ['divisions','votes']) {
      await local.db.exec(`DROP TABLE table_${name}_fts;\nDROP TABLE table_${name}_facets;\nDROP TABLE table_${name};`);
    }
    await local.db.exec(checked); await local.db.exec(upgrade);
    for(const name of ['divisions','votes']) {
      const columns=await local.db.prepare(`PRAGMA table_info(table_${name})`).all();
      assert.deepEqual(new Set(columns.results.map(c=>c.name)),new Set(['rowid','search',...TABLE_DATASETS[name].columns.map(c=>c.key)]));
    }
    assert.equal((tableSchema().match(/USING fts5/g)||[]).length,10);
  } finally {await local.close();}
});
