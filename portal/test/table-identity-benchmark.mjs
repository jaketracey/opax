// Offline, count-only benchmark. Worker timings use the host clock because
// workerd's request clock does not advance during a synchronous CPU loop.
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {compileHashedIdentityCheck} from '../src/table-identity-hashes.mjs';
import {compileReferenceCheck} from './helpers/table-identity-reference.mjs';
import {performanceRow} from './helpers/table-identity-corpus.mjs';

const registry=JSON.parse(await readFile(new URL('../public/table-private-identities.json',import.meta.url),'utf8'));
const before=compileReferenceCheck(registry.identities,registry.strippedLengths);
const after=compileHashedIdentityCheck(registry.identities,registry.strippedLengths,registry.prefilter);
function measure(check,iterations) {
  const start=performance.now();let rejected=0;
  for(let i=0;i<iterations;i++)rejected+=check(performanceRow);
  if(rejected)throw Error('Benchmark fixture rejection count');
  return (performance.now()-start)/iterations;
}
for(let i=0;i<2000;i++)after(performanceRow);
const nodeBefore=measure(before,200),nodeAfter=measure(after,5000);
console.log(JSON.stringify({runtime:'Node',characters:performanceRow.length,beforeMsPerRow:nodeBefore,afterMsPerRow:nodeAfter,speedup:nodeBefore/nodeAfter}));

const compiled=await build({stdin:{resolveDir:new URL('./',import.meta.url).pathname,contents:`
  import {compileHashedIdentityCheck} from '../src/table-identity-hashes.mjs';
  import {compileReferenceCheck} from './helpers/table-identity-reference.mjs';
  const performanceRow=${JSON.stringify(performanceRow)};
  let before,after;
  export default {fetch(request,env) {
    const r=env.REGISTRY;
    before ||= compileReferenceCheck(r.identities,r.strippedLengths);
    after ||= compileHashedIdentityCheck(r.identities,r.strippedLengths,r.prefilter);
    const params=new URL(request.url).searchParams,iterations=Number(params.get('iterations'));
    const check=params.get('phase')==='before'?before:after;
    let rejected=0;for(let i=0;i<iterations;i++)rejected+=check(performanceRow);
    return Response.json({iterations,rejected});
  }};
`},bundle:true,platform:'browser',format:'esm',write:false,external:['node:*']});
const mf=new Miniflare(convertV4MiniflareOptions({host:process.env.OPAX_BENCHMARK_HOST||'127.0.0.1',workers:[{name:'matcher-benchmark',modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{REGISTRY:registry},outboundService:()=>{throw Error('Benchmark network disabled');}}]}));
try {
  async function workerMeasure(phase,iterations) {
    const start=performance.now();
    const response=await mf.dispatchFetch('http://fixture.invalid/?'+new URLSearchParams({phase,iterations:String(iterations)}));
    const result=await response.json();
    if(result.rejected!==0 || result.iterations!==iterations)throw Error('Worker benchmark rejection count');
    return (performance.now()-start)/iterations;
  }
  await workerMeasure('after',2000);
  const workerdBefore=await workerMeasure('before',50),workerdAfter=await workerMeasure('after',5000);
  console.log(JSON.stringify({runtime:'workerd/Miniflare',characters:performanceRow.length,beforeMsPerRow:workerdBefore,afterMsPerRow:workerdAfter,speedup:workerdBefore/workerdAfter,timing:'host wall time over batched request, includes local transport'}));
} finally {await mf.dispose();}
