// One server-only index, combining the approved core's donor phrase policy with
// dt-contracts' shared recipientIdentityIndex. No office-holder exemptions.
import {MONEY_GRAPHS,isOrganisationDonor,withheldPhrases,namesWithheldPhrase} from '../public/donor-entity.js';
import {recipientIdentityIndex} from './recipient-index.mjs';
import {identityVariants,compileIdentityCheck} from './table-identities.mjs';
const indices=new WeakMap();
export async function tableIdentityIndex(read) {
 const graphs=await Promise.all(MONEY_GRAPHS.map(read));
 let pending=indices.get(graphs[0]);
 if(!pending){
  pending=(async()=>{
   const recipients=await recipientIdentityIndex(read),phrases=withheldPhrases(graphs,[]),starts=new Map(),abns=new Set();
   for(const entry of phrases.withheld){const first=entry[0].split(' ')[0];starts.set(first,[...(starts.get(first)||[]),entry]);}
   const donors=graphs.flatMap(graph=>graph.nodes.filter(node=>node.kind==='donor'&&!isOrganisationDonor(node)));
   for(const node of donors)for(const value of [node.abn,node.abr?.abn,node.id,node.canonical_id])for(const variant of identityVariants(value))if(/^\d{11}$/.test(variant))abns.add(variant);
   const abnCheck=compileIdentityCheck(abns);
   const donorSafe=text=>{
    const words=String(text).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ');
    const candidates=[...new Set(words)].flatMap(word=>starts.get(word)||[]);
    return !namesWithheldPhrase({withheld:candidates},`donor receipts ${text}`)&&!abnCheck(text);
   };
   const approved=new Map();let approvedBytes=0;
   const safe=value=>{
    const text=String(value);
    if(approved.has(text))return true;
    if(!donorSafe(text)||recipients.check(text))return false;
    // Cache only approved text; bound both the entry count and retained bytes.
    const bytes=text.length*2;
    if(bytes<=1_048_576){
     while(approved.size>=4096||approvedBytes+bytes>8_388_608){const first=approved.keys().next().value;approvedBytes-=first.length*2;approved.delete(first);}
     approved.set(text,true);approvedBytes+=bytes;
    }
    return true;
   };
   const values=[...new Set([...donors.flatMap(node=>[node.label,...(node.aliases||[])]).filter(value=>!donorSafe(value)),...abns,...recipients.phrases])];
   return {phrases,values,safe,check:text=>!safe(text),recipientValues:[...recipients.phrases]};
  })();
  indices.set(graphs[0],pending);pending.catch(()=>indices.delete(graphs[0]));
 }
 return pending;
}
