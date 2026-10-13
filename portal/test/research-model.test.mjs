import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../src/research-model.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral'});
const m=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

test('model id: preset or slug, else the default preset',()=>{
  assert.equal(m.researchModelId(undefined),'@preset/opax-pro');
  assert.equal(m.researchModelId(' deepseek/deepseek-v4-pro '),'deepseek/deepseek-v4-pro');
  assert.equal(m.researchModelId('@preset/opax-fast'),'@preset/opax-fast');
  assert.equal(m.researchModelId('not a slug; drop'),'@preset/opax-pro');
});
test('provider preferences keep only known keys with valid values',()=>{
  assert.deepEqual(m.researchProvider('{"sort":"throughput"}'),{sort:'throughput'});
  assert.deepEqual(m.researchProvider('{"order":["fireworks","together"],"allow_fallbacks":true,"x":1}'),{order:['fireworks','together'],allow_fallbacks:true});
  assert.equal(m.researchProvider('{"sort":"fastest"}'),undefined);
  assert.equal(m.researchProvider('not json'),undefined);
  assert.equal(m.researchProvider(''),undefined);
});
test('operator override: allowlisted model and a known sort only',()=>{
  const allow='deepseek/deepseek-v4-pro, qwen/qwen3-235b';
  assert.deepEqual(m.researchModelOverride('qwen/qwen3-235b','throughput',allow),{RESEARCH_LOOP_MODEL_ID:'qwen/qwen3-235b',RESEARCH_LOOP_PROVIDER:'{"sort":"throughput"}'});
  assert.deepEqual(m.researchModelOverride('openai/gpt-9','bogus',allow),{});
  assert.deepEqual(m.researchModelOverride(null,null,allow),{});
});
test('cache key differs by model and provider',()=>{
  assert.notEqual(m.researchModelKey('@preset/opax-pro',undefined),m.researchModelKey('deepseek/deepseek-v4-pro','{"sort":"throughput"}'));
  assert.equal(m.researchModelKey(undefined,undefined),'@preset/opax-pro');
});
test('JSON allowlist entries carry provider routing and reasoning into the override',()=>{
  const allow=JSON.stringify({'deepseek/deepseek-v4.1-flash':{provider:{order:['together','baseten'],allow_fallbacks:false,require_parameters:true},reasoning:{enabled:false}},'anthropic/claude-haiku-5.5':{reasoning:{enabled:false}}});
  assert.deepEqual(m.researchModelOverride('deepseek/deepseek-v4.1-flash',null,allow),{RESEARCH_LOOP_MODEL_ID:'deepseek/deepseek-v4.1-flash',RESEARCH_LOOP_PROVIDER:'{"order":["together","baseten"],"allow_fallbacks":false,"require_parameters":true}',RESEARCH_LOOP_REASONING:'{"enabled":false}'});
  assert.deepEqual(m.researchModelOverride('anthropic/claude-haiku-5.5','throughput',allow),{RESEARCH_LOOP_MODEL_ID:'anthropic/claude-haiku-5.5',RESEARCH_LOOP_PROVIDER:'{"sort":"throughput"}',RESEARCH_LOOP_REASONING:'{"enabled":false}'});
  assert.deepEqual(m.researchModelOverride('openai/not-listed',null,allow),{});
  assert.equal(m.researchModelAllow('{broken').size,0);
});
test('reasoning preferences keep only known keys',()=>{
  assert.deepEqual(m.researchReasoning('{"enabled":false,"x":1}'),{enabled:false});
  assert.deepEqual(m.researchReasoning({effort:'low',max_tokens:500}),{effort:'low',max_tokens:500});
  assert.equal(m.researchReasoning('{"effort":"ludicrous"}'),undefined);
  assert.notEqual(m.researchModelKey('a/b',undefined,'{"enabled":false}'),m.researchModelKey('a/b',undefined,undefined));
});
