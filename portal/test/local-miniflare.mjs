import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// The desktop's IPv4 loopback is unavailable. Keep native Worker/D1 tests
// on IPv6, and use asynchronous HTTP for SQL because Miniflare's synchronous
// binding proxy blocks the parent thread that serves its IPv6 loopback.
// This wrapper is only injected into fixture Workers, never the app bundle.
const SQL_PATH='/__opax_fixture_sql';
function sqlWorker(script){
 const named=/export\s*\{\s*(\w+)\s+as\s+default\s*\};?/;
 let transformed;
 if(named.test(script))transformed=script.replace(named,'const __fixtureOriginal=$1;');
 else if(/export\s+default\s+/.test(script))transformed=script.replace(/export\s+default\s+/,'const __fixtureOriginal=');
 else throw Error('Fixture Worker needs a default handler');
 return transformed+`\nexport default {...__fixtureOriginal,async fetch(req,env,ctx){
  if(new URL(req.url).pathname!==${JSON.stringify(SQL_PATH)})return __fixtureOriginal.fetch(req,env,ctx);
  try{
   const {binding,op,sql,params=[],column,statements}=await req.json(),db=env[binding];
   const prepared=()=>db.prepare(sql).bind(...params);
   const result=op==='batch'?await db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.params))):op==='exec'?await db.exec(sql):op==='first'?await prepared().first(column):op==='all'?await prepared().all():op==='run'?await prepared().run():await prepared().raw();
   return Response.json({result});
  }catch(e){return Response.json({error:e.message},{status:500})}
 }};`;
}
export function localMiniflare(options){
 const host=process.env.OPAX_TEST_HOST||'127.0.0.1',asyncSql=host==='::1';
 const workers=options.workers.map(w=>asyncSql&&w.d1Databases?{...w,script:sqlWorker(w.script)}:w);
 const mf=new Miniflare(convertV4MiniflareOptions({...options,host,port:0,workers}));
 if(asyncSql)mf.getD1Database=async(binding,workerName)=>{
  const worker=workers.find(w=>w.name===workerName)||workers[0];
  if(worker!==workers[0]||!worker.d1Databases?.[binding])throw Error('SQL fixture must target its first Worker binding');
  await mf.ready;
  const call=async body=>{
   const r=await mf.dispatchFetch('https://fixture.test'+SQL_PATH,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({binding,...body})});
   const out=await r.json();if(!r.ok)throw Error(out.error);return out.result;
  };
  const prepare=(sql,params=[])=>({sql,params,bind(...values){return prepare(sql,values)},first:column=>call({op:'first',sql,params,column}),all:()=>call({op:'all',sql,params}),run:()=>call({op:'run',sql,params}),raw:()=>call({op:'raw',sql,params})});
  return{prepare,batch:statements=>call({op:'batch',statements:statements.map(({sql,params})=>({sql,params}))}),exec:sql=>call({op:'exec',sql})};
 };
 return mf;
}
