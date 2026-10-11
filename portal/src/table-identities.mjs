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
export const ROW_IDENTITY_POLICY = 'row-token-v1';
export const STRIPPED_PREFIX = 'stripped:v1:';
export const STRIPPED_MIN_LENGTH = 4;
// Visitor queries keep strict substring rejection; row fields require tokens.
export const STRIPPED_CONTAINS_MIN_LENGTH = 6;
const folded = value => decodedIdentity(value).normalize('NFKC').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ');
const strippedWords = value => folded(value).match(/[\p{L}\p{N}]+/gu) || [];
export const identityStripped = value => strippedWords(value).join('');
export const strippedLengths = phrases => [...new Set([...phrases].filter(p=>p.startsWith(STRIPPED_PREFIX)).map(p=>p.length-STRIPPED_PREFIX.length))].sort((a,b)=>a-b);
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
export function identityCandidates(value, lengths, compactLengths = [], {mode='query'} = {}) {
  const words = identityWords(value), out = new Set();
  for (const tokens of [words,legacyWords(value)]) for (const size of lengths) for (let i = 0; i + size <= tokens.length; i++) out.add(tokens.slice(i, i + size).join(' '));
  // ABNs remain identifiers with punctuation/spaces or an ABN prefix.
  for (let i = 0; i < words.length; i++) {
    let digits = '';
    for (let j = i; j < words.length && /^\d+$/.test(words[j]) && digits.length < 11; j++) {
      digits += words[j]; if (digits.length === 11) out.add(digits);
    }
  }
  for (const candidate of strippedCandidates(value,compactLengths,mode)) out.add(candidate);
  return out;
}
function* strippedCandidates(value, lengths, mode) {
  const tokens=strippedWords(value), compact=tokens.join(''), starts=new Set(), ends=new Set();
  let at=0;for(const token of tokens){starts.add(at);at+=token.length;ends.add(at);}
  for (const size of lengths) {
    if (!Number.isSafeInteger(size) || size < STRIPPED_MIN_LENGTH) continue;
    for(let start=0;start+size<=compact.length;start++) {
      if((mode === 'row' || size < STRIPPED_CONTAINS_MIN_LENGTH) && (!starts.has(start)||!ends.has(start+size)))continue;
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
export function compileIdentityMatch(phrases, {mode='query'} = {}) {
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
      for(let j=i;j<words.length;j++){node=node.get(words[j]);if(!node)break;if(node.has(null))return {rule:'word-boundary',length:node.get(null)};}
      if(/^\d+$/.test(words[i])) {
        let digits='';for(let j=i;j<words.length&&/^\d+$/.test(words[j])&&digits.length<11;j++){digits+=words[j];if(digits.length===11&&phrases.has(digits))return {rule:'word-boundary',length:11};}
      }
    }
    const tokens=strippedWords(value),compact=tokens.join(''),starts=new Set(),ends=new Set();let at=0;
    for(const token of tokens){starts.add(at);at+=token.length;ends.add(at);}
    for(let start=0;start<compact.length;start++) {
      if(mode==='row'&&!starts.has(start))continue;
      let node=compactRoot;
      for(let end=start;end<compact.length;end++) {
        node=node.get(compact[end]);if(!node)break;
        if(node.has(null) && (mode !== 'row' && node.get(null)>=STRIPPED_CONTAINS_MIN_LENGTH || starts.has(start)&&ends.has(end+1)))return {rule:start===0&&end+1===compact.length?'compact-exact':starts.has(start)&&ends.has(end+1)?'compact-token-aligned':'compact-contains',length:node.get(null)};
      }
    }
    return null;
  };
}

// Iterators retain no n-gram or substring candidate collection. Normalisation
// uses the same forms as the source registry, including legacy word hashes.
export function* identityTokenStreams(value) {
  const raw=decodedIdentity(value);
  for(const normal of new Set([raw.normalize('NFKD').replace(/\p{M}+/gu,''),raw.normalize('NFKC')]))
    yield [(function*(){for(const match of normal.toLowerCase().matchAll(/[a-z0-9]+/g))yield match[0];})(),false];
  yield [(function*(){for(const match of folded(value).matchAll(/[\p{L}\p{N}]+/gu))yield match[0];})(),true];
}

export function compileIdentityCheck(phrases, options) {
  const match=compileIdentityMatch(phrases,options);return value=>match(value)!==null;
}
