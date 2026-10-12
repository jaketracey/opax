// Public synthetic cap scopes in local D1. Does not replace endpoint responses.
import {writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
export async function seedVoteCaps(output) {
  const sql=[];
  for(const kind of ['divisions','votes']) {
    const table='table_'+kind,scope=kind==='divisions' ? 'bill' : 'person';
    sql.push(`DELETE FROM ${table}_facets WHERE rowid IN (SELECT rowid FROM ${table} WHERE id LIKE 'csv-cap-%');`);
    sql.push(`DELETE FROM ${table} WHERE id LIKE 'csv-cap-%';`);
    const columns=kind==='divisions' ? ['id','title','date','chamber','outcome','ayes','noes','href','bill','sitting','jurisdiction','search'] : ['id','title','date','vote','party_position','href','person','jurisdiction','search'];
    const values=kind==='divisions' ? ["'csv-cap-'||x","'Fixture organisation '||x||' Pty Ltd'","'2026-08-19'","'Senate'","'Agreed'","x","0","'/doc/division-fixture'","'[\"csv-cap-fixture\"]'","'[]'","'federal'","'Fixture organisation '||x||' Pty Ltd'"] : ["'csv-cap-'||x","'Fixture organisation '||x||' Pty Ltd'","'2026-08-19'","'For the bill'","'Not recorded'","'/bill/au-federal-fixture'","'csv-cap-fixture'","'federal'","'Fixture organisation '||x||' Pty Ltd'"];
    sql.push(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50001) INSERT INTO ${table} (${columns.join(',')}) SELECT ${values.join(',')} FROM n;`);
    sql.push(`INSERT INTO ${table}_facets (key,value,rowid) SELECT '${scope}','csv-cap-fixture',rowid FROM ${table} WHERE id LIKE 'csv-cap-%';`);
    sql.push(`INSERT INTO ${table}_facets (key,value,rowid) SELECT '${kind==='divisions' ? 'outcome' : 'vote'}','${kind==='divisions' ? 'Agreed' : 'For the bill'}',rowid FROM ${table} WHERE id LIKE 'csv-cap-%';`);
    sql.push(`INSERT INTO ${table}_fts (${table}_fts) VALUES ('rebuild');`);
  }
  const path=resolve(output,'cap-review.sql');await writeFile(path,sql.join('\n')+'\n');
  try {
    await promisify(execFile)(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','opax-tables','--local','--file',path],{env:{...process.env,WRANGLER_SEND_METRICS:'false'},maxBuffer:1024*1024});
  } catch {throw new Error('Local public cap seed failed');}
}
