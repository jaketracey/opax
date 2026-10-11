import {isOrganisationRecipient} from '../public/recipient-entity.js';
import {identityVariants,compileIdentityCheck} from './table-identities.mjs';

/** Private source identities stay in memory. Callers publish only projections. */
export async function recipientIdentityIndex(read) {
  const phrases=new Set(),suppliers=new Set(),profiles=new Map();
  const add=entity=>{
    const values=[entity.label,entity.name,entity.n,entity.abn,entity.abr?.abn,entity.identity?.legal_name,entity.abr?.name,entity.abr?.legal_name,...(entity.aliases || []),...(entity.lookup_names || [])];
    for(const id of [entity.id,entity.canonical_id]) {
      if(String(id || '').startsWith('person:')) values.push(String(id).slice(7));
      if(/^(?:abn:)?\d{11}$/.test(String(id || ''))) values.push(String(id).replace(/^abn:/,''));
    }
    for(const value of values.filter(v=>typeof v==='string'||typeof v==='number')) for(const p of identityVariants(value)) phrases.add(p);
  };
  const directory=await read('/suppliers.json');
  // Sequential asset reads avoid a large transient copy of all contract records.
  for(const path of new Set(directory.suppliers.map(s=>s.profile_path))) {
    const shard=await read(path);
    for(const s of Object.values(shard.profiles)) {
      const {contracts,agencies,years,donor_links,...identity}=s;
      profiles.set(String(s.id),identity);
      if(!isOrganisationRecipient(identity)) {suppliers.add(String(s.id));add(identity);}
    }
  }
  for(const s of directory.suppliers) {
    const identity={...s,...profiles.get(String(s.id))};
    if(!isOrganisationRecipient(identity)) {suppliers.add(String(s.id));add(identity);}
  }
  for(const jur of ['federal','qld']) {
    const graph=await read(`/graph/grants.${jur}.json`);
    for(const r of graph.recipients) if(!isOrganisationRecipient(r)) add(r);
    for(const sh of new Set(graph.recipients.map(r=>r.sh).filter(Number.isInteger))) {
      const shard=await read(`/grants/${jur}/shard-${String(sh).padStart(2,'0')}.json`);
      for(const r of Object.values(shard)) if(!isOrganisationRecipient(r)) add(r);
    }
  }
  return {phrases,suppliers,profiles,check:compileIdentityCheck(phrases)};
}
