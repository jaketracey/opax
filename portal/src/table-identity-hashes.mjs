import {createHash} from 'node:crypto';
import {identityCandidates,identityWordForms,identityTokens,STRIPPED_PREFIX,STRIPPED_CONTAINS_MIN_LENGTH} from './table-identities.mjs';
export function compileHashedIdentityCheck(entries, strippedLengths = []) {
  if(!Array.isArray(strippedLengths)||strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw Error('Privacy index unavailable');
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!e||!/^[a-f0-9]{64}$/.test(e.hash)||!Number.isSafeInteger(e.words)||e.words<1))throw Error('Privacy index unavailable');
  const hashes=new Set(entries.map(e=>e.hash)),lengths=[...new Set(entries.map(e=>e.words))];
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  // Optional hashed selectors avoid materialising every substring of a large CSV.
  // Older registries keep the exact candidate matcher below.
  if(entries.every(e=>e.characters ? validHash(e.compactPrefix)&&Number.isSafeInteger(e.characters)&&strippedLengths.includes(e.characters) : validHash(e.first))) {
    const first=new Map(),compactFirst=new Map(),widths=new Set();
    for(const entry of entries) {
      const map=entry.characters ? compactFirst : first,key=entry.characters ? entry.compactPrefix : entry.first;
      if(!map.has(key))map.set(key,new Set());map.get(key).add(entry.characters || entry.words);
      if(entry.characters)widths.add(Math.min(STRIPPED_CONTAINS_MIN_LENGTH,entry.characters));
    }
    const wordCache=new Map(),compactCache=new Map();
    const lookup=(map,cache,value)=>{
      if(cache.has(value))return cache.get(value);
      const sizes=map.get(digest(value));
      if(cache.size>=32768)cache.clear();cache.set(value,sizes);return sizes;
    };
    return value=>{
      for(const words of identityWordForms(value)) for(let from=0;from<words.length;from++) {
        for(const size of lookup(first,wordCache,words[from]) || []) if(from+size<=words.length && hashes.has(digest(words.slice(from,from+size).join(' '))))return true;
        if(/^\d+$/.test(words[from])) {
          let digits='';for(let to=from;to<words.length&&/^\d+$/.test(words[to])&&digits.length<11;to++) {
            digits+=words[to];if(digits.length===11&&hashes.has(digest(digits)))return true;
          }
        }
      }
      const tokens=identityTokens(value),compact=tokens.join(''),starts=new Set(),ends=new Set();
      let at=0;for(const token of tokens){starts.add(at);at+=token.length;ends.add(at);}
      for(let from=0;from<compact.length;from++) for(const width of widths) {
        if(from+width>compact.length || width<STRIPPED_CONTAINS_MIN_LENGTH&&(!starts.has(from)||!ends.has(from+width)))continue;
        for(const size of lookup(compactFirst,compactCache,compact.slice(from,from+width)) || []) {
          if(from+size>compact.length || size<STRIPPED_CONTAINS_MIN_LENGTH&&(!starts.has(from)||!ends.has(from+size)))continue;
          if(hashes.has(digest(STRIPPED_PREFIX+compact.slice(from,from+size))))return true;
        }
      }
      return false;
    };
  }
  return value=>{
    for(const candidate of identityCandidates(value,lengths,strippedLengths))if(hashes.has(createHash('sha256').update(candidate).digest('hex')))return true;
    return false;
  };
}
