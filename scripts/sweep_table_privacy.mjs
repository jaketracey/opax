import {readFile} from 'node:fs/promises';
import ts from '../portal/node_modules/typescript/lib/typescript.js';
import {sourceTableDonorIdentities} from './table_identity_source.mjs';
import {compileHashedIdentityCheck} from '../portal/src/table-identity-hashes.mjs';
import {tableIdentityIndex,tableRegistryFingerprint} from './load_tables.mjs';
import {createHash} from 'node:crypto';
import {TABLE_DATASETS} from '../portal/src/table-datasets.mjs';
import {Miniflare,convertV4MiniflareOptions} from '../portal/node_modules/miniflare/dist/src/index.js';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--local'))throw Error('This read-only sweep requires --local');
const policy=await tableIdentityIndex();
const config=ts.parseConfigFileTextToJson('wrangler.jsonc',await readFile(new URL('../portal/wrangler.jsonc',import.meta.url),'utf8')).config;
const databaseId=config.d1_databases.find(d=>d.binding==='TABLE_DB')?.database_id;
if(!databaseId||/^0{8}-/.test(databaseId))throw Error('Configured local table database identity unavailable');
const options=convertV4MiniflareOptions({workers:[{name:'tables',modules:true,script:'export default{fetch(){return new Response("local")}}',compatibilityDate:'2026-09-01',d1Databases:{TABLE_DB:databaseId}}]});
options.resourcePersistencePath=process.env.OPAX_TABLE_LOCAL_DIR || fileURLToPath(new URL('../portal/.wrangler/state/v3/',import.meta.url));
options.unsafeEnableSharedStorage=false;
const mf=new Miniflare(options);
try {
  const db=await mf.getD1Database('TABLE_DB','tables');
  const hashes=(await db.prepare('SELECT hash,words FROM table_private_identity').all()).results;
  const storedFingerprint=await db.prepare("SELECT value FROM table_meta WHERE key='privacy_fingerprint'").first('value');
  const build=JSON.parse(await readFile(new URL('../portal/src/table-registry-fingerprint.json',import.meta.url),'utf8'));
  const actualFingerprint=createHash('sha256').update(hashes.map(e=>e.hash).sort().join('\n')).digest('hex');
  const fingerprintMatches=storedFingerprint===build.fingerprint&&actualFingerprint===build.fingerprint&&tableRegistryFingerprint(policy)===build.fingerprint;
  const compactLengths=JSON.parse(await db.prepare("SELECT value FROM table_meta WHERE key='privacy_stripped_lengths'").first('value'));
  const blocked=compileHashedIdentityCheck(hashes,compactLengths),source=sourceTableDonorIdentities();
  const guard={labels:source.labels.length,labelsRejected:source.labels.filter(blocked).length,identifiers:source.identifiers.length,identifiersRejected:source.identifiers.filter(blocked).length};
  const result={databaseId,fingerprintMatches,storedIdentityHashes:hashes.length,guard,privateIdentityHashes:policy.phrases.size,rowsScanned:0,withheldIdentities:0,datasets:{}};
  for (const [name,config]of Object.entries(TABLE_DATASETS).filter(([,c])=>c.privacy)) {
    const table='table_'+name.replaceAll('-','_');let last=0,count=0;
    while(true){const page=await db.prepare(`SELECT * FROM ${table} WHERE rowid>? ORDER BY rowid LIMIT 200`).bind(last).all();if(!page.results.length)break;
      for(const row of page.results){last=row.rowid;count++;if((['contracts','suppliers'].includes(name) ? policy.recipientCheck : policy.check)(Object.values(row).join(' ')))result.withheldIdentities++;}}
    result.datasets[name]=count;result.rowsScanned+=count;
    const facet=await db.prepare(`SELECT key,value FROM ${table}_facets GROUP BY key,value LIMIT 100000`).all();
    for(const row of facet.results)if((['contracts','suppliers'].includes(name) ? policy.recipientCheck : policy.check)(row.value))result.withheldIdentities++;
  }
  console.log(JSON.stringify(result));if(!fingerprintMatches||result.withheldIdentities||!result.rowsScanned||guard.labelsRejected!==guard.labels||guard.identifiersRejected!==guard.identifiers)process.exitCode=1;
} catch(error) {console.error(JSON.stringify({error:'Local D1 privacy sweep failed',missingTable:/no such table/i.test(String(error)),busy:/busy|locked/i.test(String(error)),codes:[...String(error).matchAll(/\b(?:SQLITE_[A-Z_]+|D1_[A-Z_]+|ERR_[A-Z_]+)\b/g)].map(m=>m[0])}));process.exitCode=1;}finally{await mf.dispose();}
