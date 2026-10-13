// Private identities are normalised in memory; only SHA-256 hashes reach D1.
const decodedIdentity = value => {
  let raw=String(value ?? '');
  for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(raw);if(decoded===raw)break;raw=decoded;}catch{break;}}
  return raw;
};
const words = raw => raw.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
export const identityWords = value => words(decodedIdentity(value).normalize('NFKD').replace(/\p{M}+/gu,''));
export const legacyIdentityWords = value => words(decodedIdentity(value).normalize('NFKC'));
const legacyWords = legacyIdentityWords;
export const identityPhrase = value => identityWords(value).join(' ');
export const STRIPPED_PREFIX = 'stripped:v1:';
export const STRIPPED_MIN_LENGTH = 4;
// Short forms require token boundaries; longer forms also match inside words.
export const STRIPPED_CONTAINS_MIN_LENGTH = 6;
const folded = value => decodedIdentity(value).normalize('NFKC').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ');
export const identityStrippedWords = value => folded(value).match(/[\p{L}\p{N}]+/gu) || [];
const strippedWords = identityStrippedWords;
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
export function identityCandidates(value, lengths, compactLengths = []) {
  return new Set(iterateIdentityCandidates(value,lengths,compactLengths));
}
// Keep the Set API for existing consumers; matchers can stop at the first hit.
export function* iterateIdentityCandidates(value, lengths, compactLengths = []) {
  const words=identityWords(value),legacy=legacyWords(value),compactTokens=strippedWords(value),out=new Set();
  for (const tokens of [words,legacy]) {
    if(tokens===legacy && words.length===legacy.length && words.every((word,i)=>word===legacy[i]))continue;
    for (const size of lengths) for (let i = 0; i + size <= tokens.length; i++) {
      const candidate=tokens.slice(i,i+size).join(' ');
      if(!out.has(candidate)){out.add(candidate);yield candidate;}
    }
  }
  // ABNs remain identifiers with punctuation/spaces or an ABN prefix.
  for (let i = 0; i < words.length; i++) {
    let digits = '';
    for (let j = i; j < words.length && /^\d+$/.test(words[j]) && digits.length < 11; j++) {
      digits += words[j]; if (digits.length === 11 && !out.has(digits)) {out.add(digits);yield digits;}
    }
  }
  for (const candidate of strippedCandidates(compactTokens,compactLengths)) if(!out.has(candidate)){out.add(candidate);yield candidate;}
}
function* strippedCandidates(tokens, lengths) {
  const compact=tokens.join(''), starts=new Set(), ends=new Set();
  let at=0;for(const token of tokens){starts.add(at);at+=token.length;ends.add(at);}
  for (const size of lengths) {
    if (!Number.isSafeInteger(size) || size < STRIPPED_MIN_LENGTH) continue;
    for(let start=0;start+size<=compact.length;start++) {
      if(size < STRIPPED_CONTAINS_MIN_LENGTH && (!starts.has(start)||!ends.has(start+size)))continue;
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
