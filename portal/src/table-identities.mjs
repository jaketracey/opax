import {MONEY_GRAPHS, isOrganisationDonor} from '../public/donor-entity.js';
import {isOrganisationRecipient} from './table-recipient.mjs';
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

/** One source-derived policy for the loader, SSR, validator and rollout gates.
 * Individual kind and ABR type take precedence over organisational name evidence.
 * Source values stay in memory and must never be logged or published. */
export async function loadTableIdentityIndex(read, suppliedGraphs) {
  const graphs = suppliedGraphs || await Promise.all(MONEY_GRAPHS.map(read));
  const phrases = new Set(), values = new Set(), recipients = new Set(), recipientABNs = new Set(), donors = new Set(), abns = new Set(), suppliers = new Set();
  const add = (entity, recipient = false) => {
    const names = [entity.label,entity.name,entity.n,entity.identity?.legal_name,entity.abr?.name,entity.abr?.legal_name,...(entity.aliases || []),...(entity.lookup_names || [])];
    const identifiers = [entity.abn,entity.abr?.abn];
    for (const id of [entity.id,entity.canonical_id]) {
      if (String(id || '').startsWith('person:')) names.push(String(id).slice(7));
      if (/^(?:abn:)?\d{11}$/.test(String(id || ''))) identifiers.push(String(id).replace(/^abn:/,''));
    }
    for (const value of names.filter(v=>typeof v==='string' && v.trim())) {
      values.add(value); if (recipient) recipients.add(value);
      for (const variant of identityVariants(value)) phrases.add(variant);
    }
    for (const value of identifiers.filter(v=>v != null && /^\d{11}$/.test(String(v).replace(/\D/g,'')))) {
      const digits = String(value).replace(/\D/g,''); values.add(digits); abns.add(digits);
      if (recipient) recipientABNs.add(digits);
      for (const variant of identityVariants(digits)) phrases.add(variant);
    }
  };
  for (const graph of graphs) for (const node of graph.nodes) if (node.kind==='donor' && !isOrganisationDonor(node)) {
    add(node); for (const value of [node.label,...(node.aliases || [])]) if (value) donors.add(value);
  }
  for (const jurisdiction of ['federal','qld']) {
    const graph = await read(`/graph/grants.${jurisdiction}.json`);
    for (const recipient of graph.recipients) if (!isOrganisationRecipient(recipient)) add(recipient,true);
    const paths = [...new Set(graph.recipients.map(r=>`/grants/${jurisdiction}/shard-${String(r.sh).padStart(2,'0')}.json`))];
    for (const path of paths) for (const recipient of Object.values(await read(path))) if (!isOrganisationRecipient(recipient)) add(recipient,true);
  }
  const directory = await read('/suppliers.json'), profiles = new Map();
  for (const path of new Set(directory.suppliers.map(s=>s.profile_path).filter(Boolean))) {
    for (const profile of Object.values((await read(path)).profiles)) {
      const {contracts,...identity}=profile;
      profiles.set(String(profile.id),identity);
    }
  }
  for (const supplier of directory.suppliers) {
    const profile = profiles.get(String(supplier.id));
    const entity = profile ? {...supplier,...profile,...profile.identity} : supplier;
    if (!isOrganisationRecipient(entity)) {suppliers.add(String(entity.id));add(entity);}
  }
  const lengths = [...new Set([...phrases].map(p=>p.split(' ').length))].sort((a,b)=>a-b);
  return {phrases,values:[...values],donors:[...donors],recipients:[...recipients],recipientABNs:[...recipientABNs],abns:[...abns],suppliers,lengths,check:compileIdentityCheck(phrases)};
}
