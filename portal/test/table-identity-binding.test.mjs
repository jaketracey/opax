import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {prefilter,binding,identityHashes} from '../src/table-identity-prefilter.generated.mjs';
import {identityBundlePlugin} from './helpers/table-identity-bundle.mjs';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {identityVariants} from '../src/table-identities.mjs';
import {buildIdentityPrefilter,identityPrefilterBinding} from '../src/table-identity-prefilter.mjs';
import {compileReferenceCheck} from './helpers/table-identity-reference.mjs';

const registry=JSON.parse(await readFile(new URL('../public/table-private-identities.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');
async function callers(bundle) {
  const compiled=await build({stdin:{resolveDir:new URL('../src/',import.meta.url).pathname,contents:
    "export {tablePrivacy,tablePrivacyCheckFromRead} from './table-privacy.ts';export {tableApi} from './table-api.ts';"},
    bundle:true,platform:'node',format:'esm',write:false,external:['node:*'],plugins:[identityBundlePlugin(bundle)]});
  return import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
}
const changed=structuredClone(prefilter);
for(const groups of [changed.words,changed.stripped])for(const size of Object.keys(groups))groups[size]=[1];
const {checksum,...changedData}=changed;changed.checksum=digest(JSON.stringify(changedData));
const invalid=[['missing',undefined],['malformed',{}],['stale',{...prefilter,registryFingerprint:'0'.repeat(64)}],
  ['version',{...prefilter,version:3}],['altered and rechecksummed',changed]];
for(const [reason,invalidPrefilter] of invalid)test(reason+' private prefilter denies SSR, privacy endpoint and D1 guards',async()=>{
  const api=await callers({prefilter:invalidPrefilter,binding,fingerprint:binding.registryFingerprint});
  const safe=await api.tablePrivacyCheckFromRead(async()=>registry);
  assert.equal(safe('ordinary public search'),false,'SSR denial');
  const response=await api.tablePrivacy(new Request('https://fixture.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:'ordinary public search'})}),{fetch:async()=>Response.json(registry)});
  assert.equal((await response.json()).safe,false,'privacy endpoint denial');
  let dataReads=0;
  const metadata={version:'fixture',privacy_lengths:JSON.stringify(prefilter.lengths),privacy_stripped_lengths:JSON.stringify(prefilter.strippedLengths),privacy_fingerprint:binding.registryFingerprint};
  const db={prepare(sql) {
    if(!/FROM table_meta\b/.test(sql)){dataReads++;throw Error('Unexpected data read');}
    return {all:async()=>({results:Object.entries(metadata).map(([key,value])=>({key,value}))})};
  }};
  for(const [name,config] of Object.entries(TABLE_DATASETS).filter(([,c])=>c.privacy)) {
    const result=await api.tableApi(new Request('https://fixture.invalid/api/table/'+name),{TABLE_DB:db});
    assert.equal(result.status,503,'D1 guard denial');assert.deepEqual(await result.json(),{error:'unavailable'});
  }
  assert.equal(dataReads,0,'invalid prefilter reached data SQL');
});

test('49 positive fixture forms remain denied through all callers after a checksum-recomputed alteration',async t=>{
  const names=Array.from({length:49},(_,i)=>'Fictional Quillstone '+i),phrases=new Set(names.flatMap(identityVariants));
  const identities=[...phrases].map(p=>({hash:digest(p),words:p.split(' ').length})),fingerprint=digest(identities.map(e=>e.hash).sort().join('\n'));
  const complete=buildIdentityPrefilter(phrases,identities,fingerprint),trusted=identityPrefilterBinding(complete),altered=structuredClone(complete);
  assert.equal(names.filter(value=>!compileReferenceCheck(identities,complete.strippedLengths)(value)).length,0,'positive fixture miss count');
  for(const groups of [altered.words,altered.stripped])for(const size of Object.keys(groups))groups[size]=[1];
  const {checksum,...data}=altered;altered.checksum=digest(JSON.stringify(data));
  const api=await callers({prefilter:altered,binding:trusted,fingerprint,identityHashes:identities.map(e=>e.hash)});
  const fixtureRegistry={version:1,identities,strippedLengths:complete.strippedLengths},assets={fetch:async()=>Response.json(fixtureRegistry)};
  const safe=await api.tablePrivacyCheckFromRead(async()=>fixtureRegistry);
  const metadata={version:'fixture',privacy_lengths:JSON.stringify(complete.lengths),privacy_stripped_lengths:JSON.stringify(complete.strippedLengths),privacy_fingerprint:fingerprint};
  const db={prepare(){return {all:async()=>({results:Object.entries(metadata).map(([key,value])=>({key,value}))})};}};
  let ssrDenied=0,endpointDenied=0,d1Denied=0;
  for(const text of names) {
    ssrDenied+=!safe(text);
    const r=await api.tablePrivacy(new Request('https://fixture.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text})}),assets);
    endpointDenied+=!(await r.json()).safe;
    d1Denied+=(await api.tableApi(new Request('https://fixture.invalid/api/table/contracts?'+new URLSearchParams({q:text})),{TABLE_DB:db})).status===503;
  }
  assert.equal(ssrDenied,49);assert.equal(endpointDenied,49);assert.equal(d1Denied,49);
  t.diagnostic(JSON.stringify({probes:49,ssrDenied,endpointDenied,d1Denied}));
});

test('public files contain neither the prefilter data nor its private binding',async t=>{
  const signatures=Object.values(prefilter.words).concat(Object.values(prefilter.stripped)).filter(v=>v.length>=3)
    .map(v=>new RegExp(v.slice(0,8).join('\\s*,\\s*')));
  let checked=0,leaks=0;
  async function scan(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const path=new URL(entry.name+(entry.isDirectory()?'/':''),dir);
      if(entry.isDirectory()){await scan(path);continue;}
      const contents=await readFile(path,'utf8');checked++;
      leaks+=/identity-prefilter|["']prefilter["']\s*:|["']registryFingerprint["']\s*:/.test(contents)
        || contents.includes(binding.checksum) || signatures.some(re=>re.test(contents));
    }
  }
  await scan(new URL('../public/',import.meta.url));
  assert.equal(leaks,0,'public prefilter leak count');
  assert.equal(Object.hasOwn(registry,'prefilter'),false);
  t.diagnostic(JSON.stringify({publicFilesChecked:checked,prefilterLeaks:leaks}));
});
test('API query guard requires the complete bundled SHA registry even with a valid prefilter',async()=>{
  for(const hashes of [null,identityHashes.slice(1),[...identityHashes.slice(1),identityHashes[1]]]) {
    const api=await callers({prefilter,binding,fingerprint:binding.registryFingerprint,identityHashes:hashes});
    const metadata={version:'fixture',privacy_lengths:'[]',privacy_stripped_lengths:'[]',privacy_fingerprint:binding.registryFingerprint};
    const db={prepare(){return {all:async()=>({results:Object.entries(metadata).map(([key,value])=>({key,value}))})};}};
    for(const name of ['contracts','votes','divisions']) {
      const response=await api.tableApi(new Request('https://fixture.invalid/api/table/'+name),{TABLE_DB:db});
      assert.equal(response.status,503,'incomplete bundled SHA registry denies');
    }
  }
});
