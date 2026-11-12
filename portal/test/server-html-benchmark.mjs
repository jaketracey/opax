// Local disk-backed Worker, existing topic API caches seeded with fixtures.
// Measures added detail reads and rendering, plus complete response assembly.
import {performance} from 'node:perf_hooks';
import {offline,loadWorker,outbound} from './worker-harness.mjs';
import {seedTopicCache} from './server-html-cache.mjs';
offline();
const cached = new Map();
globalThis.caches.default = {async match(req){return cached.get(req.url)?.clone()},async put(req,res){cached.set(req.url,res.clone())}};
const {env,fetch:worker} = await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname);
await seedTopicCache(env,caches.default);
const cases = [
  ['recipient','/money/grants/federal/recipient/abn%3A11602416697'],
  ['recipient','/money/grants/qld/recipient/abn%3A71132181090'],
  ['agency','/subject/agency/a-aaa167b0097858604254'],
  ['agency','/subject/agency/a-7d43ef20eda15f18fe8c'],
  ['program','/money/grants?jur=federal&program=go7215'],
  ['program','/money/grants?jur=qld&program=disaster-recovery-funding-arrangements-drfa'],
  ['topic','/subject/topic/housing'], ['topic','/subject/topic/climate-environment'],
];
const rows = [];
for(const [kind,path] of cases) {
  const samples = [];
  for(let i=0;i<11;i++) {
    const start = performance.now();
    const response = await worker(path);
    const html = await response.text();
    if(response.status!==200 || !html.includes('<tbody><tr>'))throw Error(`${path}: ${response.status}`);
    const phases = response.headers.get('server-timing');
    const extra = [...phases.matchAll(new RegExp(`${kind}-(?:content|html);dur=([\\d.]+)`,'g'))].reduce((s,m)=>s+Number(m[1]),0);
    const phase = suffix=>Number(new RegExp(`${kind}-${suffix};dur=([\\d.]+)`).exec(phases)?.[1] || 0);
    samples.push({...(i===0 ? {phases} : {}),wall:performance.now()-start,detailAndRender:extra,read:phase('content'),html:phase('html')});
  }
  const median = key=>{const values=samples.slice(1).map(s=>s[key]).sort((a,b)=>a-b);return (values[4]+values[5])/2};
  rows.push({kind,path,cold:samples[0],warmMedian:{wall:median('wall'),detailAndRender:median('detailAndRender'),read:median('read'),html:median('html')}});
}
if(outbound.length)throw Error('Unexpected network request');
console.log(JSON.stringify({samplesPerURL:11,networkRequests:outbound.length,rows},null,2));
