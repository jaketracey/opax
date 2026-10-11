import {createHash} from 'node:crypto';
import {identityCandidateStream,matchingIdentityCandidates} from './table-identities.mjs';
export function compileHashedIdentityCheck(entries, strippedLengths = []) {
  if(!Array.isArray(strippedLengths)||strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw Error('Privacy index unavailable');
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!e||!/^[a-f0-9]{64}$/.test(e.hash)||!Number.isSafeInteger(e.words)||e.words<1))throw Error('Privacy index unavailable');
  const hashes=new Set(entries.map(e=>e.hash)),lengths=[...new Set(entries.map(e=>e.words))];
  const hasQuick=e=>Number.isSafeInteger(e.quick)&&e.quick>=0&&e.quick<=4294967295&&Number.isSafeInteger(e.characters)&&e.characters>0;
  const accelerated=entries.filter(hasQuick);
  if(accelerated.length && accelerated.length!==entries.length){
    const fast=compileHashedIdentityCheck(accelerated,strippedLengths),fallback=compileHashedIdentityCheck(entries.filter(e=>!hasQuick(e)),strippedLengths);
    return value=>fast(value)||fallback(value);
  }
  const quick=accelerated.length ? new Map():null;
  if(quick)for(const entry of entries){if(!quick.has(entry.characters))quick.set(entry.characters,new Set());quick.get(entry.characters).add(entry.quick);}
  const approved=new Map();let approvedBytes=0;
  return value=>{
    for(const candidate of quick ? matchingIdentityCandidates(value,lengths,strippedLengths,quick) : identityCandidateStream(value,lengths,strippedLengths)) {
      if(approved.has(candidate))continue;
      if(hashes.has(createHash('sha256').update(candidate).digest('hex')))return true;
      const bytes=candidate.length*2;
      if(bytes<=262144){
        while(approved.size>=65536 || approvedBytes+bytes>8388608){const first=approved.keys().next().value;approvedBytes-=approved.get(first);approved.delete(first);}
        approved.set(candidate,bytes);approvedBytes+=bytes;
      }
    }
    return false;
  };
}
