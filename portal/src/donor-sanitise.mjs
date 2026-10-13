// Shared publication/read boundary. The registry contains hashes and neutral
// replacements only; no raw withheld identity is shipped to the Worker.
import {createHash} from 'node:crypto';
import {normaliseLookupKey} from './lookup-casefold.mjs';
// Bound repeated short-string hashing; large response bodies are never retained.
const hashMemo=new Map();
// Bulk eviction avoids repeatedly walking a Map iterator past deleted slots.
// Only deterministic hashes are memoised; no privacy decision is cached here.
const hash=s=>{if(hashMemo.has(s))return hashMemo.get(s);const value=createHash('sha256').update(s).digest('hex');if(s.length<=256){if(hashMemo.size>=4096)hashMemo.clear();hashMemo.set(s,value)}return value};
const fold=s=>String(s).normalize('NFKC').replace(/[‘’ʼ`]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const compiled=new WeakMap(),organisationSets=new WeakMap();
function registeredOrganisation(value,registry){
 let organisations=organisationSets.get(registry);if(!organisations){organisations=new Set(registry.organisations||[]);organisationSets.set(registry,organisations);}
 return organisations.has(hash(String(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));
}
function phrases(registry){
 let byFirst=compiled.get(registry);if(byFirst)return byFirst;
 const groups=new Map();
 const add=p=>{if(!groups.has(p.first))groups.set(p.first,new Map());const widths=groups.get(p.first);if(!widths.has(p.words))widths.set(p.words,new Map());widths.get(p.words).set(p.hash,p)};
 for(const p of registry.phrases || [])if(p.first&&p.replacement)add(p);
 for(const p of registry.organisationPhrases || [])add({...p,organisation:true});
 byFirst=new Map([...groups].map(([first,widths])=>[first,[...widths].sort((a,b)=>b[0]-a[0])]));
 compiled.set(registry,byFirst);return byFirst;
}
export function withholdDonorText(value,registry,donor=false){
 // Exact registered organisation identities are evidence from the index, not
 // guesses from words following a withheld phrase in a narrative. Registered
 // full organisation spans are recognised the same way in compound labels.
 if(registeredOrganisation(value,registry))return value;
 const id=registry.ids[hash(value)];if(id)return id.id;
 const exact=registry.names[hash(fold(value))];if(exact&&(donor||!exact.exempt&&exact.sourceKnown!==false))return exact.label;
 let text=value.replace(/(\/subject\/donor\/)([^\s"<>?#]+)/g,(_,prefix,segment)=>{
  let label;try{label=decodeURIComponent(segment)}catch{return prefix+segment}
  const entry=registry.names[hash(fold(label))];return entry?prefix+encodeURIComponent(entry.label):prefix+segment;
 });
 const tokens=[...text.matchAll(/[a-z0-9]+/gi)],byFirst=phrases(registry),edits=[];
 for(let from=0;from<tokens.length;from++)for(const[words,matches]of byFirst.get(hash(tokens[from][0].toLowerCase())) || []){
  const end=from+words;if(end>tokens.length)continue;
  const p=matches.get(hash(tokens.slice(from,end).map(t=>t[0].toLowerCase()).join(' ')));if(!p)continue;
  if(!p.organisation)edits.push([tokens[from].index,tokens[end-1].index+tokens[end-1][0].length,p.replacement]);from=end-1;break;
 }
 // Nothing after a matched withheld label or alias can turn it into an
 // organisation. The shared index made that decision before registration.
 for(const[start,end,replacement]of edits.reverse())text=text.slice(0,start)+replacement+text.slice(end);
 return text;
}
// Record IDs are joins, not prose. A donor node owns its identity fields;
// other records keep their IDs even when an ID contains a withheld phrase.
export const recordReferenceField = key => /^(?:id|key|pid|record|resource|subject|href|url|path|page)$/.test(key) || /(?:_id|Id|_key|Key|_url)$/.test(key);
export const nameLookupField = key => /^(?:_?by_name|names|aliases|alias_map|by_entity|name_index|alias_index|search_map|by_alias|byName)$/.test(key);
export const anonymousLookupEntity = entity => /^donor:withheld-/.test(entity?.id || '') || /^Donor \d+ \(name withheld\)$/i.test(entity?.label || entity?.name || '') && !/^(?:n-|aph_)|^[0-9]{1,12}$/.test(String(entity?.id || ''));
// Resolve the whole response first: nested indexes may refer to sibling records.
export function publicLookupEntities(value){
 const entities=new Map();
 const visit=(x,field='')=>{
  if(!x||typeof x!=='object')return;
  if(Array.isArray(x)){for(const row of x)visit(row,field);return;}
  if((x.label||x.name)&&(x.id??x.key??x.pid)!=null)entities.set(String(x.id??x.key??x.pid),x);
  for(const[k,v]of Object.entries(x)){
   if(['nodes','entities','entries','people','donors','ministers'].includes(k)&&v&&typeof v==='object')for(const[id,row]of Object.entries(v))if(row&&typeof row==='object'&&!Array.isArray(row)&&(row.label||row.name)){const record={...row,id:row.id??row.key??id};entities.set(String(id),record);for(const ref of [row.id,row.key,row.pid])if(ref!=null)entities.set(String(ref),record);}
   visit(v,k);
  }
 };visit(value);return entities;
}
const lookupMatchers=new WeakMap();
export function containsWithheldLookupPhrase(value,registry){
 let matcher=lookupMatchers.get(registry);if(!matcher){const lengths=new Map();for(const p of registry.lookupPhrases||[]){if(!lengths.has(p.length))lengths.set(p.length,new Set());lengths.get(p.length).add(p.hash);}matcher={lengths,memo:new Map()};lookupMatchers.set(registry,matcher);}
 const key=normaliseLookupKey(value);
 if(matcher.memo.has(key))return matcher.memo.get(key);
 let hit=false;for(const[length,hashes]of matcher.lengths){for(let at=0;at+length<=key.length;at++)if(hashes.has(hash(key.slice(at,at+length)))){hit=true;break;}if(hit)break;}
 if(matcher.memo.size>=20000)matcher.memo.clear();matcher.memo.set(key,hit);return hit;
}
export function rebuildPublicLookup(value,registry,entities=new Map(),nameKeys=false){
 if(!nameKeys)return value;
 const out={},records=new Map();
 // Old keys never decide whether an anonymous association is public. Resolve
 // targets, then construct a public entity's label/alias set before indexing.
 for(const [alias,row]of Object.entries(value)){
  const refs=Array.isArray(row)&&row.every(v=>typeof v==='string')?row:typeof row==='string'?[row]:[row?.id??alias];
  for(const ref of refs){
   // Payload dictionaries own their sanitised label; ID dictionaries must
   // resolve against the complete public entity map, never the old alias.
   const payload=typeof row==='object'&&(!Array.isArray(row)||!row.every(v=>typeof v==='string'));
   const entity=entities.get(String(ref)) || (payload?{id:ref,label:withholdDonorText(alias,registry)}:null);
   if(!entity||/^donor:withheld-/.test(String(ref))||anonymousLookupEntity(entity))continue; // An unresolved association has no public identity proof.
   if(!records.has(ref))records.set(ref,{entity,row,aliases:new Set(entity.aliases||[])});
   const clean=withholdDonorText(alias,registry);if(!['donor','organisation'].includes(entity.kind))records.get(ref).aliases.add(alias===alias.toLowerCase()?clean.toLowerCase():clean);
  }
 }
 for(const[ref,{entity,row,aliases}]of records){
  const label=entity.label||entity.name;
  // Preserve each producer's public normalisation and ambiguity/value shape.
  // These aliases belong only to resolved, non-anonymous records.
  const labels=['donor','organisation'].includes(entity.kind)?new Set([label.toLowerCase(),...[...aliases].map(s=>s.toLowerCase())]):aliases.size?aliases:new Set([label.toLowerCase()]);
  for(const key of labels){
   if(typeof key!=='string'||!key)continue;
   if(containsWithheldLookupPhrase(key,registry)&&!(!entity.kind&&entities.has(String(ref))&&fold(key)===fold(label)))continue;
   const publicRow=Array.isArray(row)&&row.every(v=>typeof v==='string')?[ref]:typeof row==='string'?ref:row;
   if(Array.isArray(publicRow)&&Array.isArray(out[key]))out[key]=[...new Set([...out[key],...publicRow])];else out[key]=publicRow;
  }
 }
 return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
function anonymousNameDictionary(value,entities){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const rows=Object.entries(value);if(!rows.length||rows.every(([key])=>/^[a-f0-9]{16,64}$/.test(key))||rows.some(([key])=>recordReferenceField(key)||['kind','label','name','source','target','program','place','recipient'].includes(key)))return false;
 const idRef=ref=>typeof ref==='string'&&(entities.has(ref)||/^donor:/.test(ref)||/^[a-f0-9]{24}$/.test(ref));
 return rows.every(([,row])=>typeof row==='string'?idRef(row):Array.isArray(row)?row.every(idRef):row&&typeof row==='object'&&idRef(row.id))&&rows.some(([key,row])=>{
  const refs=Array.isArray(row)?row:typeof row==='string'?[row]:[row.id];
  return refs.some(ref=>key!==ref&&(/^donor:withheld-/.test(ref)||anonymousLookupEntity(entities.get(ref))));
 });
}
export function rebuildResponseLookups(value,registry,externalEntities=new Map()){
 const hasLookup=x=>x&&typeof x==='object'&&(Array.isArray(x)?x.some(hasLookup):Object.entries(x).some(([k,v])=>nameLookupField(k)&&v&&typeof v==='object'&&!Array.isArray(v)||hasLookup(v)));
 const entities=new Map([...externalEntities,...publicLookupEntities(value)]);
 // Unknown dictionary names are covered by their joins as well.
 const hasAnonymousDictionary=x=>x&&typeof x==='object'&&(anonymousNameDictionary(x,entities)||(Array.isArray(x)?x.some(hasAnonymousDictionary):Object.values(x).some(hasAnonymousDictionary)));
 if(!hasLookup(value)&&!hasAnonymousDictionary(value))return value;
 const visit=x=>{
  if(!x||typeof x!=='object')return x;
  if(Array.isArray(x))return x.map(visit);
  if(anonymousNameDictionary(x,entities))return rebuildPublicLookup(x,registry,entities,true);
  return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,nameLookupField(k)&&v&&typeof v==='object'&&!Array.isArray(v)?rebuildPublicLookup(v,registry,entities,true):visit(v)]));
 };return visit(value);
}
export function withholdStoredDonors(value,registry){
 // Grant recipient labels/IDs follow their own policy. A nested grant summary
 // is as role-sensitive as the grant export; only its donor block is filtered.
 const grantVisit=x=>!x||typeof x!=='object'?x:Array.isArray(x)?x.map(grantVisit):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='d'?visit({d:v}).d:grantVisit(v)]));
 const visit=(x,donor=false,reference=false)=>{
  if(typeof x==='string')return reference&&!donor&&!/^donor:/.test(x)&&!x.includes('/subject/donor/')?x:withholdDonorText(x,registry,donor);
  if(Array.isArray(x)){if(typeof x[0]==='string'&&/(?:^|:)(?:grant(?:-|:)|grant-program|grant-recipient)/.test(x[0]))return grantVisit(x);return x.map(v=>visit(v,donor,reference));}
  if(!x || typeof x!=='object')return x;
  if(x.kind==='grant'&&typeof x.href==='string'&&typeof x.resource==='string'&&!x.subject)return grantVisit(x);
  const out={};
  const hidden=x.kind==='donor' && !registeredOrganisation(x.label||x.name||'',registry) && (registry.ids[hash(x.id || '')] || /^donor:withheld-/.test(x.id || ''));
  for(const[k,v]of Object.entries(x)){
   if(hidden&&k==='id'){out[k]=registry.ids[hash(v)]?.id||v;continue;}
   if(hidden&&k==='label'&&registry.ids[hash(x.id||'')]){out[k]=registry.ids[hash(x.id)].label;continue;}
   if(hidden&&k==='profileUrl')continue;
   if(hidden&&k==='aliases'){out[k]=[];continue;}
   if(['recipient','rn','rid','recipientId','recipient_id','recipient_label'].includes(k)){out[k]=v;continue;}
   if(/^\/money\/grants\//.test(k)||/(?:^|:)(?:grant(?:-|:)|grant-program|grant-recipient)/.test(k)){out[k]=grantVisit(v);continue;}
   if(k==='grants'){out[k]=grantVisit(v);continue;}
   if(k==='d'&&v?.e&&typeof v.n==='string'&&typeof v.aec==='number'){
    const label=withholdDonorText(v.n,registry,true);
    if(/^Donor \d+ \(name withheld\)$/.test(label)){
     out[k]={...visit(v,true),n:label,e:`donor:withheld-${/^Donor (\d+)/.exec(label)[1]}`};
     for(const field of ['on','abn','acn','arbn','tfn','profileUrl','url','aliases','alias','identifier'])if(Object.hasOwn(out[k],field))out[k][field]=Array.isArray(v[field])?[]:v[field]===null?null:typeof v[field]==='string'?'':null;
     continue;
    }
    out[k]=v;continue;
   }
   if(k==='donors'&&v&&typeof v==='object'&&!Array.isArray(v)){out[k]=Object.fromEntries(Object.entries(v).map(([label,row])=>[withholdDonorText(label,registry,true),visit(row)]));continue;}
   if(nameLookupField(k)&&v&&typeof v==='object'&&!Array.isArray(v)){out[k]=Object.fromEntries(Object.entries(v).map(([label,row])=>[label,typeof row==='string'?row:visit(row)]));continue;}
   out[k]=visit(v,donor||x.kind==='donor'||['donor','donor_label','donor_links','top_donors','aliases'].includes(k),recordReferenceField(k));
  }
  return out;
 };return rebuildResponseLookups(visit(value),registry);
}
