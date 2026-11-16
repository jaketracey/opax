// Every request the Worker sends to OpenRouter must carry provider.data_collection "deny" and
// provider.zdr true (https://openrouter.ai/docs/features/provider-routing). This reads the request
// bodies the real client builds, for every configuration the Worker can run with, not the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {importBundle} from './fixtures/import-bundle.mjs';

const src=new URL('../src/',import.meta.url).pathname;
const built=await build({stdin:{contents:"export * from './openrouter';export {researchModelOverride} from './research-model';export {generateText,streamText} from 'ai';",resolveDir:src,loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['node:*']});
const m=await importBundle(built.outputFiles[0].text,'openrouter-privacy');

const wrangler=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
/** Every value a var takes in wrangler.jsonc (production and any other environment). */
const vars=name=>[...wrangler.matchAll(new RegExp(`^\\s*"${name}":\\s*("(?:[^"\\\\]|\\\\.)*")`,'gm'))].map(match=>JSON.parse(match[1]));

const sent=[];
const completion={id:'gen-test',model:'test',choices:[{index:0,message:{role:'assistant',content:'ok'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};
const chunk={id:'gen-test',model:'test',choices:[{index:0,delta:{role:'assistant',content:'ok'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};
const realFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.hostname!=='openrouter.ai') throw new Error('unexpected request to '+url.hostname);
  const body=JSON.parse(String(init?.body??(typeof input==='string'?'':await input.clone().text())));
  sent.push({url,body});
  return body.stream
    ? new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}})
    : new Response(JSON.stringify(completion),{headers:{'content-type':'application/json'}});
};
test.after(()=>{globalThis.fetch=realFetch});

/** One blocking and one streamed call through the model the helper builds; returns the two request bodies. */
async function requests(env){
  const start=sent.length,model=m.openRouterModel({OPENROUTER_API_KEY:'test-only-placeholder',...env});
  await m.generateText({model,prompt:'A question',maxRetries:0});
  const stream=m.streamText({model,prompt:'A question',maxRetries:0});
  for await(const _ of stream.textStream){/* drain */}
  const bodies=sent.slice(start).map(r=>r.body);
  assert.equal(bodies.length,2,'one blocking and one streamed request');
  assert.equal(bodies.filter(b=>b.stream).length,1);
  return bodies;
}
const flagged=(body,label)=>{
  assert.equal(body.provider?.data_collection,'deny',`${label}: provider.data_collection`);
  assert.equal(body.provider?.zdr,true,`${label}: provider.zdr`);
};

test('the production configuration: flags added, provider pin and no fallbacks kept',async()=>{
  const models=vars('RESEARCH_LOOP_MODEL_ID'),providers=vars('RESEARCH_LOOP_PROVIDER'),reasoning=vars('RESEARCH_LOOP_REASONING');
  assert.ok(models.length&&models.length===providers.length,'each environment that names a model pins its provider');
  for(const [i,model] of models.entries()){
    for(const body of await requests({RESEARCH_LOOP_MODEL_ID:model,RESEARCH_LOOP_PROVIDER:providers[i],RESEARCH_LOOP_REASONING:reasoning[i]})){
      flagged(body,model);
      assert.equal(body.model,model);
      assert.equal(body.provider.allow_fallbacks,false,'no fallback provider');
      assert.ok(Array.isArray(body.provider.order)&&body.provider.order.length===1,'one pinned provider');
      assert.deepEqual(body.provider.order,JSON.parse(providers[i]).order);
    }
  }
});

test('every operator eval model, with and without a provider sort',async()=>{
  const allows=vars('RESEARCH_LOOP_MODEL_ALLOW');
  assert.ok(allows.length);
  let checked=0;
  for(const allow of allows) for(const [slug,entry] of Object.entries(JSON.parse(allow))) for(const sort of [null,'throughput','latency','price']){
    const override=m.researchModelOverride(slug,sort,allow);
    assert.equal(override.RESEARCH_LOOP_MODEL_ID,slug);
    for(const body of await requests(override)){
      flagged(body,`${slug} sort=${sort}`);
      assert.equal(body.provider.allow_fallbacks,false);
      assert.deepEqual(body.provider.order,entry.provider.order);
      checked++;
    }
  }
  assert.ok(checked>=8);
});

test('no setting can drop or weaken the flags',async()=>{
  const cases={
    'nothing configured (default preset)':{},
    'unparseable provider':{RESEARCH_LOOP_PROVIDER:'not json'},
    'provider with no known keys':{RESEARCH_LOOP_PROVIDER:'{"x":1}'},
    'provider tries to allow collection':{RESEARCH_LOOP_PROVIDER:'{"data_collection":"allow","zdr":false,"order":["deepseek"],"allow_fallbacks":true}'},
    'sort only':{RESEARCH_LOOP_PROVIDER:'{"sort":"throughput"}'},
    'a preset':{RESEARCH_LOOP_MODEL_ID:'@preset/opax-pro'},
  };
  for(const [label,env] of Object.entries(cases)) for(const body of await requests(env)) flagged(body,label);
  assert.equal(m.openRouterModel({}),undefined,'no key, no model');
  assert.deepEqual({...m.OPENROUTER_PRIVACY},{data_collection:'deny',zdr:true});
  assert.ok(Object.isFrozen(m.OPENROUTER_PRIVACY));
});

test('every request seen went to OpenRouter chat completions with both flags',()=>{
  assert.ok(sent.length>=30);
  for(const {url,body} of sent){assert.equal(url.pathname,'/api/v1/chat/completions');flagged(body,body.model)}
});

test('only src/openrouter.ts reaches OpenRouter: no other Worker or enrich module imports the client or names the host',async()=>{
  for(const [dir,entry] of [[src,'index.ts'],[new URL('../../enrich/src/',import.meta.url).pathname,'index.ts']]){
    const graph=await build({entryPoints:[dir+entry],absWorkingDir:new URL('..',import.meta.url).pathname,bundle:true,write:false,metafile:true,format:'esm',platform:'browser',packages:'external',external:['node:*','cloudflare:*'],logLevel:'silent'});
    const inputs=Object.entries(graph.metafile.inputs);
    assert.ok(inputs.length>(dir===src?50:5),'the whole module graph was read');
    const importers=inputs.filter(([,input])=>input.imports.some(i=>/openrouter/i.test(i.path)&&i.external)).map(([path])=>path.split('/').at(-1));
    assert.deepEqual(importers,dir===src?['openrouter.ts']:[]);
    for(const [path] of inputs){
      if(path.endsWith('src/openrouter.ts')) continue;
      const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');
      assert.doesNotMatch(text,/openrouter\.ai\/api|createOpenRouter/,path);
    }
  }
});
