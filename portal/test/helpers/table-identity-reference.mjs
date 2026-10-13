// Frozen pre-acceleration matcher. Keep this independent of production candidate
// generation so equivalence tests detect changes to normalisation/boundaries.
import {createHash} from 'node:crypto';
const decodedIdentity=value=>{
  let raw=String(value ?? '');
  for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(raw);if(decoded===raw)break;raw=decoded;}catch{break;}}
  return raw;
};
const words=raw=>raw.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
const identityWords=value=>words(decodedIdentity(value).normalize('NFKD').replace(/\p{M}+/gu,''));
const legacyWords=value=>words(decodedIdentity(value).normalize('NFKC'));
const strippedWords=value=>decodedIdentity(value).normalize('NFKC').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ').match(/[\p{L}\p{N}]+/gu)||[];
export function referenceCandidates(value,lengths,compactLengths=[]) {
  const tokens=identityWords(value),out=new Set();
  for(const words of [tokens,legacyWords(value)])for(const size of lengths)for(let i=0;i+size<=words.length;i++)out.add(words.slice(i,i+size).join(' '));
  for(let i=0;i<tokens.length;i++) {
    let digits='';
    for(let j=i;j<tokens.length&&/^\d+$/.test(tokens[j])&&digits.length<11;j++){digits+=tokens[j];if(digits.length===11)out.add(digits);}
  }
  const compactTokens=strippedWords(value),compact=compactTokens.join(''),starts=new Set(),ends=new Set();
  let at=0;for(const token of compactTokens){starts.add(at);at+=token.length;ends.add(at);}
  for(const size of compactLengths) {
    if(!Number.isSafeInteger(size)||size<4)continue;
    for(let start=0;start+size<=compact.length;start++) {
      if(size<6&&(!starts.has(start)||!ends.has(start+size)))continue;
      out.add('stripped:v1:'+compact.slice(start,start+size));
    }
  }
  return out;
}
export function compileReferenceCheck(entries,compactLengths=[]) {
  const hashes=new Set(entries.map(e=>e.hash)),lengths=[...new Set(entries.map(e=>e.words))];
  return value=>{
    for(const candidate of referenceCandidates(value,lengths,compactLengths))if(hashes.has(createHash('sha256').update(candidate).digest('hex')))return true;
    return false;
  };
}
