// Shared publication/read boundary. The registry contains hashes and neutral
// replacements only; no raw withheld identity is shipped to the Worker.
import {createHash} from 'node:crypto';
// Bound repeated short-string hashing; large response bodies are never retained.
const hashMemo=new Map();
const hash=s=>{if(hashMemo.has(s))return hashMemo.get(s);const value=createHash('sha256').update(s).digest('hex');if(s.length<=256){if(hashMemo.size>=4096)hashMemo.delete(hashMemo.keys().next().value);hashMemo.set(s,value)}return value};
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
export const nameLookupField = key => /^(?:_?by_name|names|aliases|alias_map|by_entity)$/.test(key);
export function rebuildPublicLookup(value,registry,entities,nameKeys=false){
 const out={};
 for(const [key,row]of Object.entries(value)){
  const entry=registry.names[hash(fold(key))];let publicKey=key;
  if(entry&&!entry.exempt&&(entry.sourceKnown!==false||nameKeys)){
   const refs=Array.isArray(row)?row:typeof row==='string'?[row]:[];
   const entity=refs.map(id=>entities?.get(String(id))).find(Boolean);
   const label=entity?.label || entity?.name || entry.label;
   if(!label || registry.names[hash(fold(label))])continue;
   publicKey=key===key.toLowerCase()?label.toLowerCase():label;
  }
  if(Object.hasOwn(out,publicKey)&&Array.isArray(row)&&Array.isArray(out[publicKey]))out[publicKey]=[...new Set([...out[publicKey],...row])];
  else out[publicKey]=row;
 }
 return out;
}
export function publicLookupEntities(value){
 const entities=new Map();
 for(const field of ['nodes','entities','people','donors']){
  const records=value?.[field];if(!records||typeof records!=='object')continue;
  for(const [key,record]of Object.entries(records))if(record&&typeof record==='object'&&!Array.isArray(record))entities.set(String(record.id??record.key??record.pid??key),record);
 }
 return entities;
}
export function withholdStoredDonors(value,registry){
 // Grant recipient labels/IDs follow their own policy. A nested grant summary
 // is as role-sensitive as the grant export; only its donor block is filtered.
 const grantVisit=x=>!x||typeof x!=='object'?x:Array.isArray(x)?x.map(grantVisit):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='d'?visit({d:v}).d:grantVisit(v)]));
 const visit=(x,donor=false,reference=false)=>{
  if(typeof x==='string')return reference&&!donor&&!x.includes('/subject/donor/')?x:withholdDonorText(x,registry,donor);
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
  const entities=publicLookupEntities(out);
  for(const k of Object.keys(out))if(nameLookupField(k)&&out[k]&&typeof out[k]==='object'&&!Array.isArray(out[k]))out[k]=rebuildPublicLookup(out[k],registry,entities,true);
  return rebuildPublicLookup(out,registry,entities);
 };return visit(value);
}
