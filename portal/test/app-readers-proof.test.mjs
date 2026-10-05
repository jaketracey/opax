import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import ts from 'typescript';

test('W13 static call graph closes over two modules, pure builtins and one SELECT; paid dependencies are unreachable',async()=>{
  const built=await build({entryPoints:[new URL('../src/app-edition.ts',import.meta.url).pathname],bundle:true,write:false,metafile:true,platform:'browser',format:'esm'});
  assert.deepEqual(Object.keys(built.metafile.inputs).map(p=>p.split('/').at(-1)).sort(),['app-edition.ts','app-http.ts'],'type-only daily-post import must never pull in composition');
  const helpers=new Set(['appJson','appRead','readOnly','validDate','melbourneDay','sha256','storedEdition','missing']);
  const pureMethods=new Set(['stringify','parse','format','isFinite','isArray','toISOString','slice','digest','encode','map','toString','padStart','join','split','trim','replace','includes','get','test','every','at','now']);
  const constructors=new Set(['Response','URL','Error','Date','Intl.DateTimeFormat','TextEncoder','Uint8Array']);
  const selects=[];
  for(const name of ['app-edition.ts','app-http.ts']){
    const source=ts.createSourceFile(name,readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
    const visit=node=>{
      assert.ok(!ts.isCallExpression(node)||node.expression.kind!==ts.SyntaxKind.ImportKeyword,'no dynamic imports');
      if(ts.isCallExpression(node)){
        const expression=node.expression;
        if(ts.isIdentifier(expression))assert.ok(helpers.has(expression.text),expression.getText(source));
        else if(ts.isPropertyAccessExpression(expression)){
          const method=expression.name.text;
          if(['prepare','bind','first'].includes(method)){
            assert.equal(name,'app-edition.ts');
            if(method==='prepare'){
              assert.equal(expression.expression.getText(source),'env.COMMUNITY_DB');
              assert.ok(ts.isNoSubstitutionTemplateLiteral(node.arguments[0]));
              assert.match(node.arguments[0].text,/^SELECT /);assert.doesNotMatch(node.arguments[0].text,/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
              const sql=node.arguments[0].text;selects.push(sql);
              assert.match(sql,/e\.date(?:=|<=)\? AND EXISTS/);assert.match(sql,/d\.status='posted'/);
              assert.match(sql,/d\.post_id IS NOT NULL AND d\.post_id!=''/);
            }
          }else assert.ok(pureMethods.has(method),expression.getText(source));
        }else assert.fail('Unreviewed call: '+expression.getText(source));
      }
      if(ts.isNewExpression(node))assert.ok(constructors.has(node.expression.getText(source)),node.getText(source));
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
  assert.equal(selects.length,2,'exact-date and latest are the only query paths');
  assert.equal(selects.filter(sql=>/e\.date<=\?/.test(sql)&&/ORDER BY e\.date DESC LIMIT 1/.test(sql)).length,1);
  assert.doesNotMatch(built.outputFiles[0].text,/\bfetch\s*\(|\b(?:composeDailyPost|previewPublication|publicationCopy|runSocialPublication|renderOg|personTopicsFor)\b/);
  const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
  const dispatch=source.indexOf("if (url.pathname.startsWith('/api/app/v1/edition/')) return communityResponse(await appEdition(request, env))");
  assert.ok(dispatch>0);assert.ok(dispatch<source.indexOf('const entry = await pageEntry',source.indexOf('async fetch(request')));
  assert.ok(dispatch<source.indexOf('// Staging serves'));assert.ok(dispatch<source.indexOf('// The route table only matches GET'));
  for(const name of ['canonical-origin.ts','network-block.ts']){
    const prefix=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');assert.doesNotMatch(prefix,/\bfetch\s*\(|^import\s/m,'prefix guards are pure');
  }
  const security=source.slice(source.indexOf('function withSecurityHeaders'),source.indexOf('// --- request validation'));
  assert.doesNotMatch(security,/\bfetch\s*\(|\benv\b|\bawait\b/,'the response wrapper only edits headers');
});

test('real Worker dispatch serves only local journal/assets and refuses every app error without outbound traffic',async()=>{
  const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'forbid-image-rendering',setup(b){
    b.onResolve({filter:/^\.\/og-render$/},()=>({path:'forbidden-renderer',namespace:'app-proof'}));
    b.onLoad({filter:/.*/,namespace:'app-proof'},()=>({contents:'export function renderOgPng(){throw Error("Forbidden OG call")}; export const renderOgJpeg=renderOgPng; export const renderStoryJpeg=renderOgPng;',loader:'js'}));
  }}]});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0005_social_publication.sql',import.meta.url),'utf8'));
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());
  const post={date,kind:'bill',subject:'bill:fixture',title:'Fixture bill',text:'The frozen edition.',url:'https://opax.com.au/bill/fixture'};
  sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(date,post.subject,JSON.stringify(post),new Date().toISOString());
  sqlite.prepare("INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,'x','posted','fixture',?)").run(date,new Date().toISOString());
  let reads=0,assetReads=0;
  const fail=()=>{throw Error('Forbidden provider/model/social/email/proxy call')};
  const env={COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_ENABLED:'false',VOICE_ENABLED:'false',STAGING_API:{fetch:fail},GENERATION_CACHE:{get:fail,put:fail},COMMUNITY_EMAIL:{send:fail},COMMUNITY_DB:{prepare(sql){
    assert.match(sql,/^SELECT /);reads++;let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)??null}};
  }},ASSETS:{async fetch(req){assetReads++;return new Response(readFileSync(new URL('../public'+new URL(req.url).pathname,import.meta.url)),{headers:{'content-type':'application/json'}})}}};
  const original=globalThis.fetch;globalThis.fetch=fail;
  try{
    const call=(path,method='GET',headers={})=>worker.fetch(new Request('https://opax.test/api/app/'+path,{method,headers}),env,{waitUntil:fail});
    for(const suffix of ['latest','today',date]){
      const response=await call('v1/edition/'+suffix);assert.equal(response.status,200);assert.deepEqual((await response.json()).edition,post);assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
      const head=await call('v1/edition/'+suffix,'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
      const cached=await call('v1/edition/'+suffix,'GET',{'if-none-match':response.headers.get('etag')});assert.equal(cached.status,304);
    }
    assert.equal(assetReads,0,'W13 cannot read assets or OG');
    const missing=await call('v1/edition/2000-01-01');assert.equal(missing.status,404);
    for(const [path,method,status] of [['v1/edition/invalid','GET',400],['v1/edition/today?kind=bill','GET',400],['v1/edition/latest?kind=bill','GET',400],['v1/edition/today','POST',405],['v1/edition/latest','POST',405],['v1/manifest','POST',405],['v1/manifest?preview=1','GET',400],['v1/unknown','GET',404],['v2/manifest','GET',404]]){
      assert.equal((await call(path,method)).status,status,path);
    }
    const before=reads;
    const manifest=await call('v1/manifest');assert.equal(manifest.status,200);assert.equal((await manifest.json()).schema_version,1);assert.equal(reads,before,'manifest never touches D1');assert.equal(assetReads,12);
    const head=await call('v1/manifest','HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await call('v1/manifest','GET',{'if-none-match':manifest.headers.get('etag')})).status,304);
    for(const path of ['v1/edition/latest','v1/edition/today','v1/manifest']){
      const req=new Request('https://opax.test/api/app/'+path);Object.defineProperty(req,'cf',{value:{asn:45102}});
      const blocked=await worker.fetch(req,env,{});assert.equal(blocked.status,403);assert.deepEqual(await blocked.json(),{error:'forbidden',reason:'network'});assert.equal(blocked.headers.get('cache-control'),'no-store');
    }
    sqlite.exec('DELETE FROM social_deliveries');const empty=await call('v1/edition/latest');assert.equal(empty.status,404);assert.deepEqual(await empty.json(),{error:'edition_not_published',date});
    sqlite.exec('DROP TABLE social_deliveries');for(const suffix of ['latest','today']){const unavailable=await call('v1/edition/'+suffix);assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{error:'edition_unavailable'})}
  }finally{globalThis.fetch=original;sqlite.close()}
});

test('the shipped public voice panel ignores additive budget fields and preserves both 429 flows',async()=>{
  class Element extends EventTarget {
    constructor(tag){super();this.tag=tag;this.classList={add(){},remove(){},toggle(){}};this.children=[]}
    append(...children){this.children.push(...children)}
    replaceChildren(...children){this.children=children}
    setAttribute(){} focus(){} remove(){}
  }
  const old={document:globalThis.document,window:globalThis.window,location:globalThis.location,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
  const {createVoiceAssistant}=await import('../public/voice.js');
  try{
    for(const reason of ['budget','capacity']){
      const elements=[];
      const create=tag=>{const node=new Element(tag);elements.push(node);return node};
      globalThis.document=Object.assign(new EventTarget(),{body:create('body'),createElement:create,createElementNS:(_,tag)=>create(tag),createTextNode:text=>({textContent:text}),getElementById:()=>null});
      globalThis.window=Object.assign(new EventTarget(),{isSecureContext:true});globalThis.location={origin:'https://opax.test',pathname:'/',search:''};
      Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){throw Error('Microphone must not start')}}}});
      let starts=0;
      const panel=createVoiceAssistant({fetcher:async path=>{
        if(path==='/api/voice/status')return Response.json({enabled:true,signed_in:true,budget_open:false,total_seconds:600,remaining_seconds:300,active_session:null});
        assert.equal(path,'/api/voice/start');starts++;return Response.json({error:'fixture refusal',reason},{status:429});
      },loadSdk:async()=>({Conversation:{startSession(){throw Error('Provider must not start')}}})});
      panel.open();await new Promise(resolve=>setImmediate(resolve));
      const start=elements.find(node=>node.className==='opax-voice-start primary');assert.equal(start.disabled,false,'new boolean is ignored compatibly');
      start.dispatchEvent(new Event('click'));await new Promise(resolve=>setImmediate(resolve));
      assert.equal(starts,1);assert.match(elements.find(node=>node.className==='opax-voice-notice').textContent,/Voice is busy right now/);
      await panel.destroy();
    }
  }finally{
    for(const key of ['document','window','location'])if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];
    if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;
  }
});
