import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {tableIdentityIndex,tableIdentityHashes,tableIdentityPrefilter,tableRegistryFingerprint} from '../../scripts/load_tables.mjs';
import {identityCandidates,identityVariants,STRIPPED_PREFIX} from '../src/table-identities.mjs';
import {compileHashedIdentityCheck,compileBundledIdentityCheck} from '../src/table-identity-hashes.mjs';
import {buildIdentityPrefilter,compileIdentityPrefilter,identityQuickHash,identityPrefilterBinding,verifyIdentityPrefilter,identityPrefilterModule} from '../src/table-identity-prefilter.mjs';
import {prefilter as bundledPrefilter,binding as bundledBinding} from '../src/table-identity-prefilter.generated.mjs';
import {compileReferenceCheck,referenceCandidates} from './helpers/table-identity-reference.mjs';
import {identityCorpus,fuzzIdentityTexts,performanceRow} from './helpers/table-identity-corpus.mjs';

const registry=JSON.parse(await readFile(new URL('../public/table-private-identities.json',import.meta.url),'utf8'));
const reference=compileReferenceCheck(registry.identities,registry.strippedLengths);
const fast=compileHashedIdentityCheck(registry.identities,registry.strippedLengths);
const apiFast=compileBundledIdentityCheck(bundledBinding.registryFingerprint);
const digest=value=>createHash('sha256').update(value).digest('hex');
function fixture(values) {
  const phrases=new Set(values.flatMap(identityVariants)),identities=[...phrases].map(p=>({hash:digest(p),words:p.split(' ').length}));
  const fingerprint=digest(identities.map(e=>e.hash).sort().join('\n'));
  const strippedLengths=[...new Set([...phrases].filter(p=>p.startsWith(STRIPPED_PREFIX)).map(p=>p.length-STRIPPED_PREFIX.length))];
  const prefilter=buildIdentityPrefilter(phrases,identities,fingerprint);
  return {phrases,identities,strippedLengths,prefilter,binding:identityPrefilterBinding(prefilter)};
}

test('rolling prefilter and lazy candidates preserve the frozen matcher on real rows, build forms and fuzz',async t=>{
  const policy=await tableIdentityIndex(),corpus=await identityCorpus(),fuzz=fuzzIdentityTexts();
  const publishedFingerprint=JSON.parse(await readFile(new URL('../src/table-registry-fingerprint.json',import.meta.url),'utf8')).fingerprint;
  assert.equal(tableRegistryFingerprint(policy),publishedFingerprint,'identity fingerprint unchanged');
  assert.equal(JSON.stringify(tableIdentityHashes(policy)),JSON.stringify(registry.identities),'identity hash registry unchanged');
  assert.equal(JSON.stringify(tableIdentityPrefilter(policy))===JSON.stringify(bundledPrefilter),true,'prefilter matches all build forms');
  verifyIdentityPrefilter(bundledPrefilter,policy.phrases,registry.identities,publishedFingerprint);
  assert.equal(bundledBinding.registryFingerprint,publishedFingerprint);
  assert.equal(bundledBinding.checksum,bundledPrefilter.checksum);
  const forms=[...policy.phrases].map(p=>p.startsWith(STRIPPED_PREFIX)?p.slice(STRIPPED_PREFIX.length):p);
  // Raw forms exist only in memory. Never attach a text to an assertion/diagnostic.
  const groups={...corpus,fuzz,positiveForms:forms};let checked=0,disagreements=0,positiveMisses=0;
  for(const [group,texts] of Object.entries(groups)) {
    for(const text of texts){const expected=reference(text),actual=fast(text),apiActual=apiFast(text);checked++;disagreements+=expected!==actual || expected!==apiActual;if(group==='positiveForms')positiveMisses+=!actual || !apiActual;}
    t.diagnostic(JSON.stringify({group,texts:texts.length,checked,disagreements}));
  }
  assert.equal(disagreements,0,'equivalence disagreement count');assert.equal(positiveMisses,0,'positive form miss count');
  // Candidate-set equality is independent of early rejection and SHA-256.
  let candidateDisagreements=0;
  for(const text of fuzz.slice(0,300)) {
    const lengths=[1,2,3,7],compact=[4,5,6,7,11,19,65,153];
    const before=[...referenceCandidates(text,lengths,compact)],after=[...identityCandidates(text,lengths,compact)];
    candidateDisagreements+=JSON.stringify(before)!==JSON.stringify(after);
  }
  assert.equal(candidateDisagreements,0,'candidate set disagreement count');
  t.diagnostic(JSON.stringify({textsChecked:checked,positiveForms:forms.length,disagreements,candidateTexts:300,candidateDisagreements,fingerprintBefore:publishedFingerprint,fingerprintAfter:tableRegistryFingerprint(policy)}));
});

test('short boundaries, UTF-16 windows, normalisations and ABNs retain exact results',()=>{
  const r=fixture(['Quil','Quillstone','Fictional Éxample','Fictional Straße','Fictional ΟΣ','Fictional 𐐀','12345678901']);
  const before=compileReferenceCheck(r.identities,r.strippedLengths),after=compileHashedIdentityCheck(r.identities,r.strippedLengths,r.prefilter,r.binding);
  const positives=['quil','QUIl','q-u-i-l','quillstone','zzquillstonezz','fictional example','fictional e\u0301xample','fictional straße','fictional strasse','fictional ος','fictional οσ','Fictional 𐐀','12 345 678 901',encodeURIComponent(encodeURIComponent('Fictional Éxample'))];
  assert.equal(positives.filter(v=>!before(v)||!after(v)).length,0,'fictional positive miss count');
  assert.equal(after('zzquilzz'),false,'short forms require boundaries');
  assert.equal([...positives,...fuzzIdentityTexts(500),null,undefined,12345678901,{},['fictional','example']].filter(v=>before(v)!==after(v)).length,0,'edge equivalence disagreement count');
  for(const match of [before,after,compileHashedIdentityCheck(r.identities,r.strippedLengths,r.prefilter,r.binding)]) {
    let coercions=0;
    assert.equal(match({toString(){coercions++;return 'Quillstone';}}),true);
    assert.equal(coercions,3,'lazy matching preserves value coercions');
    coercions=0;
    assert.throws(()=>match({toString(){if(++coercions===3)throw Error('Fictional coercion error');return 'Quillstone';}}),/Fictional coercion error/);
  }
});

test('quick-hash collisions always reach SHA-256 and cannot reject an unrelated input',()=>{
  // These fictional strings collide under the polynomial hash in both domains.
  assert.equal(identityQuickHash('fictional c0doodle'),identityQuickHash('fictional andoodle'));
  const r=fixture(['Fictional C0doodle']),lengths=[...new Set(r.identities.map(e=>e.words))];
  const candidates=compileIdentityPrefilter(r.prefilter,r.prefilter.registryFingerprint,r.binding);
  assert.ok([...candidates('fictional andoodle',lengths,r.strippedLengths)].length>0,'collision reaches confirmation');
  const match=compileHashedIdentityCheck(r.identities,r.strippedLengths,r.prefilter,r.binding);
  assert.equal(match('fictional andoodle'),false);assert.equal(match('fictional c0doodle'),true);
});

test('absent, malformed, stale and version-mismatched prefilters fail closed',()=>{
  const r=fixture(['Fictional Quillstone']);
  const corrupt=structuredClone(r.prefilter);corrupt.stripped={};
  for(const prefilter of [undefined,{}, {...r.prefilter,version:3},{...r.prefilter,registryFingerprint:'0'.repeat(64)},corrupt]) {
    assert.throws(()=>compileIdentityPrefilter(prefilter,r.prefilter.registryFingerprint,r.binding),/Privacy index unavailable/);
    assert.throws(()=>compileHashedIdentityCheck(r.identities,r.strippedLengths,prefilter,r.binding),/Privacy index unavailable/);
  }
});

test('build verification requires every SHA and exact domain/length counts, including quick-hash collisions',()=>{
  const r=fixture(['Fictional C0doodle','Fictional Andoodle']);
  const fingerprint=r.prefilter.registryFingerprint;
  assert.equal(r.prefilter.counts.words[2],2);
  assert.equal(r.prefilter.words[2].length,1);
  verifyIdentityPrefilter(r.prefilter,r.phrases,r.identities,fingerprint);
  for(const phrases of [new Set([...r.phrases].slice(1)),new Set([...r.phrases,'fictional extra'])])
    assert.throws(()=>buildIdentityPrefilter(phrases,r.identities,fingerprint),/Privacy index unavailable/);
  const wrongWords=r.identities.map((e,i)=>i ? e : {...e,words:999});
  assert.throws(()=>buildIdentityPrefilter(r.phrases,wrongWords,fingerprint),/Privacy index unavailable/);
  const altered=structuredClone(r.prefilter);altered.counts.words[2]++;
  const {checksum,...data}=altered;altered.checksum=digest(JSON.stringify(data));
  assert.throws(()=>identityPrefilterModule(altered,r.phrases,r.identities,fingerprint),/Privacy index unavailable/);
});

test('a checksummed altered prefilter cannot replace the trusted complete binding (49/49 repro)',()=>{
  const names=Array.from({length:49},(_,i)=>'Fictional Quillstone '+i),r=fixture(names);
  const valid=compileHashedIdentityCheck(r.identities,r.strippedLengths,r.prefilter,r.binding);
  assert.equal(names.filter(value=>!valid(value)).length,0,'positive fixture miss count');
  const altered=structuredClone(r.prefilter);
  for(const groups of [altered.words,altered.stripped])for(const size of Object.keys(groups))groups[size]=[1];
  const {checksum,...data}=altered;altered.checksum=digest(JSON.stringify(data));
  let denied=0;
  for(let i=0;i<49;i++) {
    try {compileHashedIdentityCheck(r.identities,r.strippedLengths,altered,r.binding);}catch {denied++;}
  }
  assert.equal(denied,49,'altered prefilter denial count');
  assert.throws(()=>verifyIdentityPrefilter(altered,r.phrases,r.identities,r.prefilter.registryFingerprint),/Privacy index unavailable/);
});

test('300-character row matching stays well below a generous CI performance bound',t=>{
  for(let i=0;i<500;i++)fast(performanceRow);
  const iterations=3000,start=performance.now();let rejected=0;
  for(let i=0;i<iterations;i++)rejected+=fast(performanceRow);
  const msPerRow=(performance.now()-start)/iterations;
  assert.equal(rejected,0);assert.ok(msPerRow<1.5,'matcher exceeds 1.5 ms/row CI bound');
  t.diagnostic(JSON.stringify({runtime:'Node',characters:performanceRow.length,iterations,msPerRow,ciBound:1.5}));
});
