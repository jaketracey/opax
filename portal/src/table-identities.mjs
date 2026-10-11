// Private identities are normalised in memory; only SHA-256 hashes reach D1.
const decodedIdentity = value => {
  let raw=String(value ?? '');
  for(let i=0;i<2;i++){try{const decoded=raw.replace(/(?:%[a-f0-9]{2})+/gi,part=>{try{return decodeURIComponent(part)}catch{return part}});if(decoded===raw)break;raw=decoded;}catch{break;}}
  return raw;
};
const words = raw => raw.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
export const identityWords = value => words(decodedIdentity(value).normalize('NFKD').replace(/\p{M}+/gu,''));
const legacyWords = value => words(decodedIdentity(value).normalize('NFKC'));
export const identityPhrase = value => identityWords(value).join(' ');
export function identityVariants(value) {
  const raw = String(value ?? '');
  const inverted = /^([^,]+),\s*([^,]+)$/.exec(raw);
  const values = [raw,...(inverted ? [`${inverted[2]} ${inverted[1]}`] : [])];
  // Retain the previous hashes while adding accent-insensitive identities.
  const out = values.flatMap(v=>[identityPhrase(v),legacyWords(v).join(' ')]);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) out.push(digits);
  return [...new Set(out.filter(Boolean))];
}
export function identityCandidates(value, lengths) {
  const words = identityWords(value), out = new Set();
  for (const tokens of [words,legacyWords(value)]) for (const size of lengths) for (let i = 0; i + size <= tokens.length; i++) out.add(tokens.slice(i, i + size).join(' '));
  // ABNs remain identifiers with punctuation/spaces or an ABN prefix.
  for (let i = 0; i < words.length; i++) {
    let digits = '';
    for (let j = i; j < words.length && /^\d+$/.test(words[j]) && digits.length < 11; j++) {
      digits += words[j]; if (digits.length === 11) out.add(digits);
    }
  }
  return out;
}
export async function identityHash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
// Loader/sweep matcher: a trie visits only phrases starting at an actual word,
// avoiding all possible n-grams across long source descriptions.
export function compileIdentityCheck(phrases) {
  const root=new Map();
  for(const phrase of phrases) {let node=root;for(const word of phrase.split(' ')){if(!node.has(word))node.set(word,new Map());node=node.get(word);}node.set(null,true);}
  return value => {
    const words=identityWords(value);
    for(let i=0;i<words.length;i++) {
      let node=root;
      for(let j=i;j<words.length;j++){node=node.get(words[j]);if(!node)break;if(node.has(null))return true;}
      if(/^\d+$/.test(words[i])) {
        let digits='';for(let j=i;j<words.length&&/^\d+$/.test(words[j])&&digits.length<11;j++){digits+=words[j];if(digits.length===11&&phrases.has(digits))return true;}
      }
    }
    return false;
  };
}
