// Reload only the worktree's local Miniflare store. No network or remote D1.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../portal/node_modules/typescript/lib/typescript.js';
import {Miniflare,convertV4MiniflareOptions} from '../portal/node_modules/miniflare/dist/src/index.js';
const root=new URL('../portal/',import.meta.url),sqlRoot=new URL('private/dt-api/sql/',root);
const manifest=JSON.parse(await readFile(new URL('manifest.json',sqlRoot),'utf8'));
const config=ts.parseConfigFileTextToJson('wrangler.jsonc',await readFile(new URL('wrangler.jsonc',root),'utf8')).config;
const databaseId=config.d1_databases.find(d=>d.binding==='TABLE_DB')?.database_id;
if(!databaseId||!manifest.files.every(p=>/^\d{4}-[a-z-]+\.sql$/.test(p)))throw Error('Local load configuration invalid');
const options=convertV4MiniflareOptions({host:process.env.OPAX_TEST_HOST,workers:[{name:'tables',modules:true,script:'export default{fetch(){return new Response("local")}}',compatibilityDate:'2026-09-01',d1Databases:{TABLE_DB:databaseId}}]});
options.resourcePersistencePath=fileURLToPath(new URL('.wrangler/state/v3/',root));options.unsafeEnableSharedStorage=false;
const mf=new Miniflare(options);let files=0,statements=0;
try{
 const db=await mf.getD1Database('TABLE_DB','tables');
 for(const file of manifest.files){const sql=await readFile(new URL(file,sqlRoot),'utf8'),batch=[];let start=0,quoted=false;
  for(let i=0;i<sql.length;i++){if(sql[i]==="'"){if(quoted&&sql[i+1]==="'")i++;else quoted=!quoted;}else if(sql[i]===';'&&!quoted){batch.push(sql.slice(start,i+1));start=i+1;}}
  for(let i=0;i<batch.length;i+=100)await db.batch(batch.slice(i,i+100).map(s=>db.prepare(s)));
  statements+=batch.length;files++;
 }
 console.log(JSON.stringify({local:true,files,statements,rows:manifest.counts,fingerprint:manifest.privacyFingerprint}));
}catch{console.error('Local table reload failed; source values are not logged.');process.exitCode=1;}finally{await mf.dispose();}
