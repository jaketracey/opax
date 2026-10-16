/** Local Worker preview: staged data in memory; no production bindings. */
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(root,'portal/package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const bundled=await build({entryPoints:[resolve(root,'portal/src/index.ts')],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'preview-no-og',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'preview'}));b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
const mime=p=>p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.woff2')?'font/woff2':'text/html';
await mkdir(resolve(root,'portal/private/abs-gfs/preview'),{recursive:true});
process.chdir(resolve(root,'portal/private/abs-gfs/preview'));
const mf=new Miniflare(convertV4MiniflareOptions({host:'::1',modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],script:bundled.outputFiles[0].text,serviceBindings:{ASSETS:async req=>{
 const path=new URL(req.url).pathname;
 if(path==='/government-finance/data.json')return new Response(await readFile(resolve(root,'data/staged/abs-gfs/hub.json')),{headers:{'content-type':'application/json'}});
 const file=resolve(root,'portal/public',path==='/'?'index.html':'.'+path);
 if(!file.startsWith(resolve(root,'portal/public')+'/'))return new Response('',{status:404});
 try{return new Response(await readFile(file),{headers:{'content-type':mime(path)}});}catch{return new Response('',{status:404});}
}},bindings:{INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true'}}));
const server=createServer(async(req,res)=>{
 try{const result=await mf.dispatchFetch('https://opax.com.au'+req.url);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview unavailable');}
});
await new Promise(done=>server.listen(Number(process.env.OPAX_GFS_PORT||9786),'::1',done));
const port=server.address().port;
async function close(){await new Promise(done=>server.close(done));await mf.dispose();}
process.on('SIGINT',async()=>{await close();process.exit(0);});process.on('SIGTERM',async()=>{await close();process.exit(0);});
export {root,port,close};
