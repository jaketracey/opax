import {createHash} from 'node:crypto';
import {compileIdentityPrefilter,assertPrefilterLengths} from './table-identity-prefilter.mjs';
import {prefilter as bundledPrefilter,binding as bundledBinding,identityHashes} from './table-identity-prefilter.generated.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
function checkCandidates(hashes,candidates,lengths,strippedLengths) {
  lengths=[...lengths];strippedLengths=[...strippedLengths];
  return value=>{
    for(const candidate of candidates(value,lengths,strippedLengths))if(hashes.has(digest(candidate)))return true;
    return false;
  };
}
/** API query checks use the complete immutable Worker registry. Echo-only tables
 * can therefore serve older D1 snapshots without trusting their privacy index. */
export function compileBundledIdentityCheck(registryFingerprint) {
  if(!Array.isArray(identityHashes) || !identityHashes.length || identityHashes.some(hash=>!/^[a-f0-9]{64}$/.test(hash)))throw Error('Privacy index unavailable');
  const hashes=new Set(identityHashes),fingerprint=digest([...identityHashes].sort().join('\n'));
  if(fingerprint!==registryFingerprint || hashes.size!==identityHashes.length || hashes.size!==bundledPrefilter?.registryCount)throw Error('Privacy index unavailable');
  const candidates=compileIdentityPrefilter(bundledPrefilter,fingerprint,bundledBinding);
  return checkCandidates(hashes,candidates,bundledPrefilter.lengths,bundledPrefilter.strippedLengths);
}
export function compileHashedIdentityCheck(entries, strippedLengths = [], prefilter=bundledPrefilter,binding=bundledBinding) {
  if(!Array.isArray(strippedLengths)||strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw Error('Privacy index unavailable');
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!e||!/^[a-f0-9]{64}$/.test(e.hash)||!Number.isSafeInteger(e.words)||e.words<1))throw Error('Privacy index unavailable');
  const hashes=new Set(entries.map(e=>e.hash)),lengths=[...new Set(entries.map(e=>e.words))];
  const fingerprint=createHash('sha256').update(entries.map(e=>e.hash).sort().join('\n')).digest('hex');
  const candidates=compileIdentityPrefilter(prefilter,fingerprint,binding);
  if(entries.length!==prefilter.registryCount || hashes.size!==entries.length)throw Error('Privacy index unavailable');
  assertPrefilterLengths(prefilter,lengths,strippedLengths);
  return checkCandidates(hashes,candidates,lengths,strippedLengths);
}
