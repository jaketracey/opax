// Independent audit: raw source identities stay in memory. Diagnostics are
// counts only; neither keys nor string values are returned to the caller.
import {normaliseLookupKey} from '../src/lookup-casefold.mjs';
export const lookupNormalise = normaliseLookupKey;
const anonymous = row => /^donor:withheld-/.test(row?.id||'') || /^Donor \d+ \(name withheld\)$/i.test(row?.label||row?.name||'') && !/^(?:n-|aph_)|^[0-9]{1,12}$/.test(String(row?.id||''));
export function lookupAuditEntities(value,entities=new Map()){
 const visit=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(visit);return;}
  if(x.kind==='donor'&&x.slug)entities.set(x.slug,{id:x.slug,label:x.title,kind:x.kind});
  if((x.name||x.label)&&(x.id??x.key??x.pid)!=null)entities.set(String(x.id??x.key??x.pid),{id:String(x.id??x.key??x.pid),name:x.name,label:x.label,kind:x.kind});
  for(const[k,v]of Object.entries(x)){if(['people','ministers','entities','entries','nodes'].includes(k)&&v&&typeof v==='object')for(const[id,row]of Object.entries(v))if(row&&typeof row==='object'&&!Array.isArray(row)&&(row.label||row.name)){const record={id:String(row.id??row.key??id),name:row.name,label:row.label,kind:row.kind};entities.set(String(id),record);for(const ref of [row.id,row.key,row.pid])if(ref!=null)entities.set(String(ref),record);}visit(v);}
 };visit(value);return entities;
}
export function createLookupAudit(labels,publicLabels=[]){
 const needles=[...new Set(labels.map(lookupNormalise))].filter(s=>s.length>=4);
 const pattern=new RegExp(needles.map(RegExp.escape).join('|'));
 const publicNames=new Set(publicLabels.map(lookupNormalise)),memo=new Map();
 const contains=k=>{if(memo.has(k))return memo.get(k);const n=lookupNormalise(k),hit=pattern.test(n)&&!publicNames.has(n);if(k.length<256){if(memo.size>=100000)memo.clear();memo.set(k,hit);}return hit;};
 return (value,externalEntities=new Map(),rootLookup=false,grant=false)=>{
  const entities=lookupAuditEntities(value),entity=ref=>entities.get(ref)||externalEntities.get(ref);
  const counts={keys:0,lookupKeys:0,anonymousJoins:0,containsHits:0};
  const visit=(x,lookup=false)=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){for(const row of x)visit(row);return;}
   const entries=Object.entries(x),idRef=ref=>typeof ref==='string'&&(entity(ref)||/^donor:/.test(ref)||/^[a-f0-9]{24}$/.test(ref));if(!entries.every(([key])=>/^[a-f0-9]{16,64}$/.test(key))&&entries.every(([,row])=>typeof row==='string'?idRef(row):Array.isArray(row)?row.every(idRef):row&&typeof row==='object'&&idRef(row.id))&&!entries.some(([key])=>/^(?:id|key|pid|kind|name|label|source|target|program|place|recipient|href|url|record|resource|subject|path|page)$|(?:_id|Id|_key|Key|_url)$/.test(key)))lookup ||= entries.some(([key,row])=>{const refs=Array.isArray(row)?row:typeof row==='string'?[row]:row?.id?[row.id]:[];return refs.some(ref=>typeof ref==='string'&&key!==ref&&(/^donor:withheld-/.test(ref)||anonymous(entity(ref))));});
   for(const[k,row]of Object.entries(x)){
    counts.keys++;
    // Opaque hashes and primary record IDs are join fields, not name aliases.
    // Their bytes are protected independently by the native parity gate.
    const reference=grant&&row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string'&&typeof row.n==='string'&&typeof row.k==='string'||typeof row==='string'&&row.startsWith('/')&&!/donor:/.test(k)||/^[a-f0-9]{16,64}$/.test(k)||(entities.has(k)||externalEntities.has(k))&&(!row?.id||row.id===k)||Array.isArray(row)&&row.every(r=>r?.id===k||r?.record_id===k);
    if(!reference&&contains(k))counts.containsHits++;
    if(lookup){counts.lookupKeys++;const refs=Array.isArray(row)&&row.every(v=>typeof v==='number')?row.filter((_,i)=>i%2===0).map(id=>'catalog-'+id):Array.isArray(row)?row:typeof row==='string'?[row]:row?.id?[row.id]:[];
     if(refs.some(ref=>typeof ref==='string'&&(/^donor:withheld-/.test(ref)||anonymous(entity(ref)))))counts.anonymousJoins++;
    }
    visit(row,/^(?:_?by_name|names|aliases|alias_map|by_entity|name_index|alias_index|search_map|by_alias|byName)$/.test(k));
   }
  };visit(value,rootLookup);return counts;
 };
}
