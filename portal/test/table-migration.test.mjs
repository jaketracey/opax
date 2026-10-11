import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {tableSchema} from '../../scripts/table-schema.mjs';

test('an existing 0001 D1 database upgrades without losing procurement records', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({workers:[{
    name:'upgrade', modules:true, script:'export default {fetch(){return new Response("local")}}',
    compatibilityDate:'2026-09-01', d1Databases:{TABLE_DB:'upgrade-test'},
  }]}));
  try {
    const db = await mf.getD1Database('TABLE_DB', 'upgrade');
    const apply = async sql => {
      const statements = sql.replace(/^--.*$/gm, '').split(';').map(s=>s.trim()).filter(Boolean);
      for (let i=0; i<statements.length; i+=50) await db.batch(statements.slice(i,i+50).map(s=>db.prepare(s)));
    };
    await apply(await readFile(new URL('../table-migrations/0001_tables.sql', import.meta.url), 'utf8'));
    const columns = async table => (await db.prepare('PRAGMA table_info('+table+')').all()).results.map(c=>c.name);
    assert.ok(!(await columns('table_contracts')).includes('supplier_id'));
    assert.ok(!(await columns('table_suppliers')).includes('recipient_kind'));
    await db.prepare("INSERT INTO table_contracts (id,title,amount,search) VALUES ('CN1','Maintenance',100,'maintenance')").run();
    await db.prepare("INSERT INTO table_suppliers (id,name,total,search) VALUES ('s-fixture','Fixture organisation',100,'fixture organisation')").run();
    await apply(await readFile(new URL('../table-migrations/0002_procurement_recipient.sql', import.meta.url), 'utf8'));
    await apply(tableSchema());
    assert.ok((await columns('table_contracts')).includes('supplier_id'));
    assert.ok((await columns('table_contracts')).includes('recipient_kind'));
    assert.ok((await columns('table_suppliers')).includes('recipient_kind'));
    await db.prepare("UPDATE table_contracts SET supplier_id='s-fixture',recipient_kind='organisation' WHERE id='CN1'").run();
    await db.prepare("UPDATE table_suppliers SET recipient_kind='organisation' WHERE id='s-fixture'").run();
    const row = await db.prepare('SELECT c.id,c.amount,s.total FROM table_contracts c JOIN table_suppliers s ON s.id=c.supplier_id WHERE c.recipient_kind=s.recipient_kind').first();
    assert.deepEqual(row, {id:'CN1', amount:100, total:100});
  } finally { await mf.dispose(); }
});
