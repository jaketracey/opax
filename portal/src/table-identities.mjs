// Private identities are normalised in memory; only SHA-256 hashes reach D1.
const decodedIdentity = value => {
  let raw=String(value ?? '');
  for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(raw);if(decoded===raw)break;raw=decoded;}catch{break;}}
  return raw;
};
const words = raw => raw.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
export const identityWords = value => words(decodedIdentity(value).normalize('NFKD').replace(/\p{M}+/gu,''));
const legacyWords = value => words(decodedIdentity(value).normalize('NFKC'));
export const identityPhrase = value => identityWords(value).join(' ');
export const STRIPPED_PREFIX = 'stripped:v1:';
export const STRIPPED_MIN_LENGTH = 4;
// Short forms require token boundaries; longer forms also match inside words.
export const STRIPPED_CONTAINS_MIN_LENGTH = 6;
const folded = value => decodedIdentity(value).normalize('NFKC').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ');
const strippedWords = value => folded(value).match(/[\p{L}\p{N}]+/gu) || [];
export const identityStripped = value => strippedWords(value).join('');
export const strippedLengths = phrases => [...new Set([...phrases].filter(p=>p.startsWith(STRIPPED_PREFIX)).map(p=>p.length-STRIPPED_PREFIX.length))].sort((a,b)=>a-b);
export const identityQuickHash = value => {
  let hash=0;for(let i=0;i<value.length;i++)hash=(Math.imul(hash,31)+value.charCodeAt(i))>>>0;
  return hash;
};
/** Optional rolling fingerprints only select candidates; SHA-256 decides membership. */
export function* matchingIdentityCandidates(value,lengths,compactLengths,quickByLength) {
  const maximum=Math.max(...quickByLength.keys()),powers=new Uint32Array(maximum+1);
  powers[0]=1;for(let i=1;i<powers.length;i++)powers[i]=Math.imul(powers[i-1],31)>>>0;
  const prefixFor=text=>{const prefix=new Uint32Array(text.length+1);for(let i=0;i<text.length;i++)prefix[i+1]=(Math.imul(prefix[i],31)+text.charCodeAt(i))>>>0;return prefix};
  const range=(prefix,start,end)=>(prefix[end]-Math.imul(prefix[start],powers[end-start]))>>>0;
  const primary=identityWords(value),legacy=legacyWords(value);
  for(const tokens of primary.join(' ')===legacy.join(' ')?[primary]:[primary,legacy]) {
    const text=tokens.join(' '),prefix=prefixFor(text),starts=[],ends=[];
    let at=0;for(const token of tokens){starts.push(at);at+=token.length;ends.push(at);at++;}
    for(const size of lengths)for(let i=0;i+size<=tokens.length;i++){
      const start=starts[i],end=ends[i+size-1],hashes=quickByLength.get(end-start);
      if(hashes?.has(range(prefix,start,end)))yield text.slice(start,end);
    }
  }
  for(let i=0;i<primary.length;i++){
    let digits='';for(let j=i;j<primary.length&&/^\d+$/.test(primary[j])&&digits.length<11;j++){
      digits+=primary[j];if(digits.length===11&&quickByLength.get(11)?.has(identityQuickHash(digits)))yield digits;
    }
  }
  const tokens=strippedWords(value),compact=tokens.join(''),prefix=prefixFor(compact),starts=new Uint8Array(compact.length+1),ends=new Uint8Array(compact.length+1);
  let at=0;for(const token of tokens){starts[at]=1;at+=token.length;ends[at]=1;}
  const tag=identityQuickHash(STRIPPED_PREFIX);
  for(const size of compactLengths){
    const hashes=quickByLength.get(STRIPPED_PREFIX.length+size);if(!hashes)continue;
    for(let start=0;start+size<=compact.length;start++){
      if(size<STRIPPED_CONTAINS_MIN_LENGTH&&(!starts[start]||!ends[start+size]))continue;
      const hash=(Math.imul(tag,powers[size])+range(prefix,start,start+size))>>>0;
      if(hashes.has(hash))yield STRIPPED_PREFIX+compact.slice(start,start+size);
    }
  }
}
export function identityVariants(value) {
  const raw = String(value ?? '');
  const inverted = /^([^,]+),\s*([^,]+)$/.exec(raw);
  const values = [raw,...(inverted ? [`${inverted[2]} ${inverted[1]}`] : [])];
  // Retain the previous hashes while adding accent-insensitive identities.
  const out = values.flatMap(v=>[identityPhrase(v),legacyWords(v).join(' ')]);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) out.push(digits);
  // Add a separate domain of hashes; every existing word hash stays unchanged.
  for (const v of [...values,...out]) {
    const compact=identityStripped(v);
    if (compact.length >= STRIPPED_MIN_LENGTH) out.push(STRIPPED_PREFIX+compact);
  }
  return [...new Set(out.filter(Boolean))];
}
export function identityCandidates(value, lengths, compactLengths = []) {
  return new Set(identityCandidateStream(value,lengths,compactLengths));
}
/** The same candidates, streamed so a large CSV never materialises a giant set. */
export function* identityCandidateStream(value, lengths, compactLengths = []) {
  const words = identityWords(value);
  for (const tokens of [words,legacyWords(value)]) for (const size of lengths) for (let i = 0; i + size <= tokens.length; i++) yield tokens.slice(i, i + size).join(' ');
  // ABNs remain identifiers with punctuation/spaces or an ABN prefix.
  for (let i = 0; i < words.length; i++) {
    let digits = '';
    for (let j = i; j < words.length && /^\d+$/.test(words[j]) && digits.length < 11; j++) {
      digits += words[j]; if (digits.length === 11) yield digits;
    }
  }
  yield* strippedCandidates(value,compactLengths);
}
function* strippedCandidates(value, lengths) {
  const tokens=strippedWords(value), compact=tokens.join(''), starts=new Uint8Array(compact.length+1), ends=new Uint8Array(compact.length+1);
  let at=0;for(const token of tokens){starts[at]=1;at+=token.length;ends[at]=1;}
  for (const size of lengths) {
    if (!Number.isSafeInteger(size) || size < STRIPPED_MIN_LENGTH) continue;
    for(let start=0;start+size<=compact.length;start++) {
      if(size < STRIPPED_CONTAINS_MIN_LENGTH && (!starts[start]||!ends[start+size]))continue;
      yield STRIPPED_PREFIX+compact.slice(start,start+size);
    }
  }
}
export async function identityHash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
// Loader/sweep matcher: a trie visits only phrases starting at an actual word,
// avoiding all possible n-grams across long source descriptions.
export function compileIdentityCheck(phrases) {
  const root=new Map(),compactRoot=new Map();
  for(const phrase of phrases) {
    const stripped=phrase.startsWith(STRIPPED_PREFIX), key=stripped ? phrase.slice(STRIPPED_PREFIX.length) : phrase;
    let node=stripped ? compactRoot : root;
    for(const word of stripped ? key.split('') : key.split(' ')){if(!node.has(word))node.set(word,new Map());node=node.get(word);}node.set(null,key.length);
  }
  return value => {
    const words=identityWords(value);
    for(let i=0;i<words.length;i++) {
      let node=root;
      for(let j=i;j<words.length;j++){node=node.get(words[j]);if(!node)break;if(node.has(null))return true;}
      if(/^\d+$/.test(words[i])) {
        let digits='';for(let j=i;j<words.length&&/^\d+$/.test(words[j])&&digits.length<11;j++){digits+=words[j];if(digits.length===11&&phrases.has(digits))return true;}
      }
    }
    const tokens=strippedWords(value),compact=tokens.join(''),starts=new Set(),ends=new Set();let at=0;
    for(const token of tokens){starts.add(at);at+=token.length;ends.add(at);}
    for(let start=0;start<compact.length;start++) {
      let node=compactRoot;
      for(let end=start;end<compact.length;end++) {
        node=node.get(compact[end]);if(!node)break;
        if(node.has(null) && (node.get(null)>=STRIPPED_CONTAINS_MIN_LENGTH || starts.has(start)&&ends.has(end+1)))return true;
      }
    }
    return false;
  };
}
