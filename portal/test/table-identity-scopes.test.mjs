import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {identityVariants,strippedLengths,STRIPPED_PREFIX} from '../src/table-identities.mjs';
import {buildIdentityPrefilter,identityPrefilterBinding} from '../src/table-identity-prefilter.mjs';
import {compileHashedIdentityCheck,compileHashedIdentitySubsetCheck} from '../src/table-identity-hashes.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const labels=Array.from({length:2},(_,i)=>['fixture','scope',String(i)].join(' '));
const scopes=labels.map(label=>new Set(identityVariants(label)));
const phrases=new Set(scopes.flatMap(scope=>[...scope]));
const entries=scope=>[...scope].map(value=>({hash:digest(value),words:value.split(' ').length,
  ...(value.startsWith(STRIPPED_PREFIX)?{characters:value.length-STRIPPED_PREFIX.length}:{})})).sort((a,b)=>a.hash.localeCompare(b.hash));
const full=entries(phrases),compact=strippedLengths(phrases),fingerprint=digest(full.map(entry=>entry.hash).join('\n'));
const prefilter=buildIdentityPrefilter(phrases,full,fingerprint),binding=identityPrefilterBinding(prefilter);
const scoped=(items,lengths=strippedLengths(scopes[0]),filter=prefilter)=>compileHashedIdentitySubsetCheck(items,lengths,full,compact,filter,binding);

test('publication scopes retain full matching while separating recipient and political identities',()=>{
  const all=compileHashedIdentityCheck(full,compact,prefilter,binding),recipient=scoped(entries(scopes[0]));
  const political=scoped(entries(scopes[1]),strippedLengths(scopes[1]));
  for(const [i,label] of labels.entries())for(const value of [label,label.toUpperCase(),label.replaceAll(' ',''),encodeURIComponent(label)]){
    assert.equal(all(value),true);
    assert.equal(recipient(value),i===0);
    assert.equal(political(value),i===1);
  }
  assert.equal(recipient('ordinary supplier record'),false);
});

test('publication scopes fail closed for unbound hashes, changed metadata and corrupted private binding',()=>{
  const selected=entries(scopes[0]);
  assert.throws(()=>scoped([{hash:digest('unregistered scope'),words:2}]));
  assert.throws(()=>scoped([{...selected[0],words:selected[0].words+1},...selected.slice(1)]));
  assert.throws(()=>scoped(selected,[]));
  assert.throws(()=>scoped(selected,strippedLengths(scopes[0]),{...prefilter,checksum:'0'.repeat(64)}));
  assert.throws(()=>compileHashedIdentitySubsetCheck(selected,strippedLengths(scopes[0]),full.slice(1),compact,prefilter,binding));
});
