import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {tableSchema, tableName} from '../../scripts/table-schema.mjs';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';

test('an existing 0001 D1 database upgrades without losing procurement records', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({workers:[{
    name:'upgrade', modules:true, script:'export default {fetch(){return new Response("local")}}',
    compatibilityDate:'2026-09-01', d1Databases:{TABLE_DB:'upgrade-test', FRESH_DB:'fresh-test'},
  }]}));
  try {
    const db = await mf.getD1Database('TABLE_DB', 'upgrade');
    const fresh = await mf.getD1Database('FRESH_DB', 'upgrade');
    const apply = async (sql, target=db) => {
      const statements = sql.replace(/^--.*$/gm, '').split(';').map(s=>s.trim()).filter(Boolean);
      for (let i=0; i<statements.length; i+=50) await target.batch(statements.slice(i,i+50).map(s=>target.prepare(s)));
    };
    await apply(await readFile(new URL('../table-migrations/0001_tables.sql', import.meta.url), 'utf8'));
    const columns = async table => (await db.prepare('PRAGMA table_info('+table+')').all()).results.map(c=>c.name);
    assert.ok(!(await columns('table_contracts')).includes('supplier_id'));
    assert.ok(!(await columns('table_suppliers')).includes('recipient_kind'));
    await db.prepare("INSERT INTO table_contracts (id,title,amount,search) VALUES ('CN1','Maintenance',100,'maintenance')").run();
    await db.prepare("INSERT INTO table_suppliers (id,name,total,search) VALUES ('s-fixture','Fixture organisation',100,'fixture organisation')").run();
    await apply(await readFile(new URL('../table-migrations/0002_procurement_recipient.sql', import.meta.url), 'utf8'));
    await apply(await readFile(new URL('../table-migrations/0002_grants_projection.sql', import.meta.url), 'utf8'));
    await apply(await readFile(new URL('../table-migrations/0002_vote_records.sql', import.meta.url), 'utf8'));
    await apply(tableSchema());
    await apply(tableSchema(), fresh);
    const shape = async (target, table) => {
      const columns = (await target.prepare('PRAGMA table_info('+table+')').all()).results
        .map(({name,type,notnull,pk})=>({name,type,notnull,pk})).sort((a,b)=>a.name.localeCompare(b.name));
      const indexes = (await target.prepare('PRAGMA index_list('+table+')').all()).results
        .map(({name,unique})=>({name,unique})).sort((a,b)=>a.name.localeCompare(b.name));
      return {columns,indexes};
    };
    for (const name of Object.keys(TABLE_DATASETS)) {
      assert.deepEqual(await shape(db,tableName(name)),await shape(fresh,tableName(name)), 'upgraded and fresh dataset schemas agree: '+name);
    }
    assert.ok((await columns('table_contracts')).includes('supplier_id'));
    assert.ok((await columns('table_contracts')).includes('recipient_kind'));
    assert.ok((await columns('table_suppliers')).includes('recipient_kind'));
    await db.prepare("UPDATE table_contracts SET supplier_id='s-fixture',recipient_kind='organisation' WHERE id='CN1'").run();
    await db.prepare("UPDATE table_suppliers SET recipient_kind='organisation' WHERE id='s-fixture'").run();
    const row = await db.prepare('SELECT c.id,c.amount,s.total FROM table_contracts c JOIN table_suppliers s ON s.id=c.supplier_id WHERE c.recipient_kind=s.recipient_kind').first();
    assert.deepEqual(row, {id:'CN1', amount:100, total:100});
  } finally { await mf.dispose(); }
});
