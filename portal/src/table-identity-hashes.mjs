import {createHash} from 'node:crypto';
import {identityCandidates} from './table-identities.mjs';
export function compileHashedIdentityCheck(entries, strippedLengths = []) {
  if(!Array.isArray(strippedLengths)||strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw Error('Privacy index unavailable');
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!e||!/^[a-f0-9]{64}$/.test(e.hash)||!Number.isSafeInteger(e.words)||e.words<1))throw Error('Privacy index unavailable');
  const hashes=new Set(entries.map(e=>e.hash)),lengths=[...new Set(entries.map(e=>e.words))];
  return value=>{
    for(const candidate of identityCandidates(value,lengths,strippedLengths))if(hashes.has(createHash('sha256').update(candidate).digest('hex')))return true;
    return false;
  };
}
