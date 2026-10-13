import {createHash} from 'node:crypto';
import {identityWords,legacyIdentityWords,identityStrippedWords,iterateIdentityCandidates,STRIPPED_PREFIX,STRIPPED_MIN_LENGTH,STRIPPED_CONTAINS_MIN_LENGTH} from './table-identities.mjs';

// Polynomial hashes over UTF-16 code units, modulo 2^32. Both the rolling
// calculation and build-time calculation include the stripped domain prefix.
const BASE=31;
export function identityQuickHash(text) {
  let hash=0;
  for(let i=0;i<text.length;i++)hash=(Math.imul(hash,BASE)+text.charCodeAt(i))>>>0;
  return hash;
}

/** Only irreversible hashes of the existing registry's complete forms leave
 * build memory. This index is deliberately outside the privacy fingerprint. */
export function buildIdentityPrefilter(phrases,registryFingerprint) {
  const words={},stripped={};
  for(const phrase of phrases) {
    const compact=phrase.startsWith(STRIPPED_PREFIX),groups=compact ? stripped : words;
    const size=compact ? phrase.length-STRIPPED_PREFIX.length : phrase.split(' ').length;
    (groups[size] ||= new Set()).add(identityQuickHash(phrase));
  }
  const serialise=groups=>Object.fromEntries(Object.entries(groups).map(([size,hashes])=>[size,[...hashes].sort((a,b)=>a-b)]));
  const data={version:1,registryFingerprint,words:serialise(words),stripped:serialise(stripped)};
  return {...data,checksum:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}

// Sparse typed arrays are faster than a Set lookup at every substring. Zero is
// an empty slot; a zero quick hash always reaches SHA-256 confirmation instead.
function hashTable(hashes) {
  let size=4;while(size<hashes.length*4)size*=2;
  const slots=new Uint32Array(size),mask=size-1;
  for(const hash of hashes) {
    if(!hash)continue;
    let at=(hash^(hash>>>16))&mask;while(slots[at] && slots[at]!==hash)at=(at+1)&mask;
    slots[at]=hash;
  }
  return {slots,mask};
}
function contains(table,hash) {
  if(!table || !hash)return true;
  let at=(hash^(hash>>>16))&table.mask,current;
  while((current=table.slots[at])) {if(current===hash)return true;at=(at+1)&table.mask;}
  return false;
}
function compileGroups(groups,min) {
  if(!groups || typeof groups!=='object' || Array.isArray(groups))throw Error('Invalid prefilter');
  return new Map(Object.entries(groups).map(([size,hashes])=>{
    if(!/^[1-9]\d*$/.test(size) || !Number.isSafeInteger(Number(size)) || Number(size)<min || !Array.isArray(hashes) || !hashes.length || hashes.some(h=>!Number.isInteger(h)||h<0||h>0xffffffff))throw Error('Invalid prefilter');
    return [Number(size),hashTable(hashes)];
  }));
}
function rolling(text) {
  const hashes=new Uint32Array(text.length+1),powers=new Uint32Array(text.length+1);powers[0]=1;
  for(let i=0;i<text.length;i++) {
    hashes[i+1]=(Math.imul(hashes[i],BASE)+text.charCodeAt(i))>>>0;
    powers[i+1]=Math.imul(powers[i],BASE)>>>0;
  }
  return {hashes,powers};
}
// Keep the hot window scan in a regular function: generators suspend only for
// the handful of prefilter hits, never for the thousands of rejected windows.
function compactHits(tokens,lengths,groups) {
  const compact=tokens.join(''),{hashes,powers}=rolling(compact),hits=[];
  const starts=new Uint8Array(compact.length+1),ends=new Uint8Array(compact.length+1);
  let at=0;for(const token of tokens){starts[at]=1;at+=token.length;ends[at]=1;}
  const prefixHash=identityQuickHash(STRIPPED_PREFIX);
  for(const size of lengths) {
    if(!Number.isSafeInteger(size) || size<STRIPPED_MIN_LENGTH || size>compact.length)continue;
    const table=groups.get(size),power=powers[size],domain=Math.imul(prefixHash,power);
    const slots=table?.slots,mask=table?.mask,short=size<STRIPPED_CONTAINS_MIN_LENGTH;
    for(let start=0,end=size;end<=compact.length;start++,end++) {
      if(short && (!starts[start] || !ends[end]))continue;
      const hash=(domain+hashes[end]-Math.imul(hashes[start],power))>>>0;
      if(slots && hash) {
        let at=(hash^(hash>>>16))&mask,current;
        while((current=slots[at]) && current!==hash)at=(at+1)&mask;
        if(!current)continue;
      }
      hits.push(STRIPPED_PREFIX+compact.slice(start,end));
    }
  }
  return hits;
}

/** The optional accelerator never makes the final privacy decision. Missing,
 * malformed or differently fingerprinted indices use the full candidate path. */
export function compileIdentityPrefilter(prefilter,registryFingerprint) {
  let wordGroups,compactGroups;
  try {
    if(prefilter?.version!==1 || !/^[a-f0-9]{64}$/.test(registryFingerprint) || prefilter.registryFingerprint!==registryFingerprint)throw Error('Invalid prefilter');
    const {version,words,stripped}=prefilter;
    if(prefilter.checksum!==createHash('sha256').update(JSON.stringify({version,registryFingerprint,words,stripped})).digest('hex'))throw Error('Invalid prefilter');
    wordGroups=compileGroups(prefilter.words,1);compactGroups=compileGroups(prefilter.stripped,STRIPPED_MIN_LENGTH);
  } catch {return iterateIdentityCandidates;}
  return function* (value,lengths,compactLengths=[]) {
    // Preserve all three coercions even when a lazy matcher stops at a word hit.
    const words=identityWords(value),legacy=legacyIdentityWords(value),compactTokens=identityStrippedWords(value),seen=new Set();
    for(const tokens of [words,legacy]) {
      // These normalisations often coincide: visit that word domain only once.
      if(tokens===legacy && words.length===legacy.length && words.every((word,i)=>word===legacy[i]))continue;
      const text=tokens.join(' '),{hashes,powers}=rolling(text),starts=[],ends=[];
      let at=0;for(const token of tokens){starts.push(at);at+=token.length;ends.push(at);at++;}
      for(const size of lengths) {
        const table=wordGroups.get(size);
        for(let i=0;i+size<=tokens.length;i++) {
          const start=starts[i],end=ends[i+size-1];
          const hash=(hashes[end]-Math.imul(hashes[start],powers[end-start]))>>>0;
          if(!contains(table,hash))continue;
          const candidate=text.slice(start,end);
          if(!seen.has(candidate)){seen.add(candidate);yield candidate;}
        }
      }
    }
    // ABNs use the accent-insensitive tokens, exactly as the original matcher.
    const digitTable=wordGroups.get(1);
    for(let i=0;i<words.length;i++) {
      let digits='';
      for(let j=i;j<words.length && /^\d+$/.test(words[j]) && digits.length<11;j++) {
        digits+=words[j];
        if(digits.length===11 && contains(digitTable,identityQuickHash(digits)) && !seen.has(digits)){seen.add(digits);yield digits;}
      }
    }
    for(const candidate of compactHits(compactTokens,compactLengths,compactGroups))if(!seen.has(candidate)){seen.add(candidate);yield candidate;}
  };
}
