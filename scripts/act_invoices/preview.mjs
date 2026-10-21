/** Explicit local candidate: full staged rows in an isolated D1, outbound denied. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {buildTableSQL} from '../load_tables.mjs';
import {localMiniflare} from '../../portal/test/local-miniflare.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const out=resolve(root,'portal/private/act-invoices/preview');
if(process.env.OPAX_ACT_INVOICES_PREVIEW!=='candidate')throw Error('Explicit local candidate required');
await mkdir(out,{recursive:true});
const require=createRequire(resolve(root,'portal/package.json')),{build}=require('esbuild');
const bundled=await build({entryPoints:[resolve(root,'portal/src/index.ts')],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'preview-no-og',setup(b){
 b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'preview'}));
 b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));
}}]});
const info=JSON.parse(await readFile(resolve(root,'data/staged/act-invoices/hub.json'),'utf8'));
const series=await readFile(resolve(root,'data/staged/act-invoices/series.jsonl'),'utf8');
const rows=series.trimEnd().split('\n').map(line=>({row:{...JSON.parse(line),dataset_id:info.dataset_id,source_url:info.source_url,licence:info.licence,licence_url:info.licence_url,attribution:info.attribution}}));
// Test-only receipt; the real pending review and promoted directory are untouched.
const report=JSON.parse(await readFile(resolve(root,'data/staged/act-invoices/reconciliation.json'),'utf8'));
const coverage={exact_duplicate_groups:report.exact_duplicate_groups,extra_duplicate_rows:report.extra_duplicate_rows,observed_months:Object.keys(report.by_month).filter(m=>m>='2015-07'&&m<=info.payment_date_max.slice(0,7)).length,missing_months:report.missing_months,outside_period_rows:2,missing_payment_dates:report.missing_payment_dates};
const metadata={...info,coverage,promotion:{reviewed_commit:'0'.repeat(40),local_candidate_preview:true}};
const manifest=await buildTableSQL({output:resolve(out,'sql'),datasets:{'act-invoices':rows},metadata:{'act-invoices':metadata}});
const mime=p=>p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'text/html';
const mf=localMiniflare({rootPath:out,resourcePersistencePath:resolve(out,'state'),resourceTmpPath:resolve(out,'runtime'),isolatedResourcePersistencePath:resolve(out,'isolated'),outboundService:async()=>{throw Error('External network disabled');},workers:[{name:'act-invoices-preview',modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],script:bundled.outputFiles[0].text,d1Databases:{TABLE_DB:'act-invoices-candidate'},
 serviceBindings:{ASSETS:async req=>{
  const path=new URL(req.url).pathname;
  const file=resolve(root,'portal/public',path==='/'?'index.html':'.'+path);
  if(!file.startsWith(resolve(root,'portal/public')+'/'))return new Response('',{status:404});
  try{return new Response(await readFile(file),{headers:{'content-type':mime(path)}});}catch{return new Response('',{status:404});}
 }},bindings:{INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true',COMMUNITY_ENABLED:'false',REPORTS_ENABLED:'false',AGENTIC_ASK_MODE:'off',RESEARCH_LOOP:'off'}}]});
const db=await mf.getD1Database('TABLE_DB','act-invoices-preview');
for(const file of manifest.files){
 const sql=await readFile(resolve(out,'sql',file),'utf8');
 const statements=[];let start=0,quoted=false;
 for(let i=0;i<sql.length;i++){if(sql[i]==="'"){if(quoted&&sql[i+1]==="'")i++;else quoted=!quoted;}else if(sql[i]===';'&&!quoted){statements.push(sql.slice(start,i+1));start=i+1;}}
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50).map(s=>db.prepare(s)));
}
const server=createServer(async(req,res)=>{
 if((req.url.startsWith('/api/')&&!req.url.startsWith('/api/table/act-invoices'))||req.url.startsWith('/mcp')||req.url.startsWith('/__')){res.writeHead(404);res.end();return;}
 try{const result=await mf.dispatchFetch('https://opax.com.au'+req.url);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('Local preview unavailable');}
});
await new Promise(done=>server.listen(Number(process.env.OPAX_ACT_INVOICES_PORT||8982),'::1',done));
await writeFile(resolve(out,'preview.pid'),String(process.pid)+'\n');
console.log(JSON.stringify({port:server.address().port,rows:rows.length,sqlBytes:manifest.bytes,scope:'Local staged candidate; no production bindings, writes or approval'}));
async function close(){await new Promise(done=>server.close(done));await mf.dispose();}
process.on('SIGINT',async()=>{await close();process.exit(0);});process.on('SIGTERM',async()=>{await close();process.exit(0);});
