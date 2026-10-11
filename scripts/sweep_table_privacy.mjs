import {tableIdentityIndex} from './load_tables.mjs';
import {TABLE_DATASETS} from '../portal/src/table-datasets.mjs';
import {Miniflare,convertV4MiniflareOptions} from '../portal/node_modules/miniflare/dist/src/index.js';
import {fileURLToPath} from 'node:url';
const policy=await tableIdentityIndex();
const options=convertV4MiniflareOptions({workers:[{name:'tables',modules:true,script:'export default{fetch(){return new Response("local")}}',compatibilityDate:'2026-09-01',d1Databases:{TABLE_DB:'00000000-0000-0000-0000-000000000000'}}]});
options.resourcePersistencePath=fileURLToPath(new URL('../portal/.wrangler/state/v3/',import.meta.url));
options.unsafeEnableSharedStorage=false;
const mf=new Miniflare(options);
try {
  const db=await mf.getD1Database('TABLE_DB','tables');
  const result={privateIdentityHashes:policy.phrases.size,rowsScanned:0,withheldIdentities:0,datasets:{}};
  for (const [name,config]of Object.entries(TABLE_DATASETS).filter(([,c])=>c.privacy)) {
    const check=['contracts','suppliers'].includes(name) ? policy.recipientCheck : policy.check;
    const table='table_'+name.replaceAll('-','_');let last=0,count=0;
    while(true){const page=await db.prepare(`SELECT * FROM ${table} WHERE rowid>? ORDER BY rowid LIMIT 200`).bind(last).all();if(!page.results.length)break;
      for(const row of page.results){last=row.rowid;count++;if(check(Object.values(row).join(' ')))result.withheldIdentities++;}}
    result.datasets[name]=count;result.rowsScanned+=count;
    const facet=await db.prepare(`SELECT key,value FROM ${table}_facets GROUP BY key,value LIMIT 100000`).all();
    for(const row of facet.results)if(check(row.value))result.withheldIdentities++;
  }
  console.log(JSON.stringify(result));if(result.withheldIdentities)process.exitCode=1;
} catch(error) {console.error(JSON.stringify({error:'Local D1 privacy sweep failed',missingTable:/no such table/i.test(String(error)),busy:/busy|locked/i.test(String(error)),codes:[...String(error).matchAll(/\b(?:SQLITE_[A-Z_]+|D1_[A-Z_]+|ERR_[A-Z_]+)\b/g)].map(m=>m[0])}));process.exitCode=1;}finally{await mf.dispose();}
