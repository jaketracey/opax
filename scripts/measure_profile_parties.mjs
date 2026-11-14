#!/usr/bin/env node
/** Crawl person HTML only on a local Wrangler port in 8900-8999.
 * Output contains unresolved names: keep it under ignored dev/, never publish it.
 * node scripts/measure_profile_parties.mjs http://127.0.0.1:8918 dev/party-gaps/html-after.json
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {rosterSeatParty,rosterListParty,rosterServiceParty,referenceOnlyPeople} from '../portal/public/roster-party.js';
const [base,output]=process.argv.slice(2);
const url=new URL(base);
if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||+url.port<8900||+url.port>8999)
  throw new Error('Use a local Wrangler port from 8900 to 8999');
const read=p=>JSON.parse(readFileSync(new URL('../portal/public/'+p.replace(/^\//,''),import.meta.url),'utf8'));
const roster=read('parliamentarians.json'),manifest=read('electorates/manifest.json');
const index=read(manifest.index_url),reference=read(manifest.people_url),lists=read('data/roster-list-parties.json').observations;
const people=[...roster.people,...referenceOnlyPeople(roster.people,reference.people).map(({person:p,seats})=>({
  name:p.name,party:seats[0].party,referenceOnly:true,states:[...new Set(seats.map(s=>s.jurisdiction))]}))];
async function get(path){
  let target=new URL(path,url);
  for(let redirects=0;redirects<5;redirects++){
    if(target.origin!==url.origin)throw new Error('Refusing a nonlocal redirect');
    const response=await fetch(target,{redirect:'manual',headers:{'User-Agent':'opax-improve-audit'}});
    if([301,302,303,307,308].includes(response.status)){
      target=new URL(response.headers.get('Location'),target);continue;
    }
    return response;
  }
  throw new Error('Too many local redirects');
}
let next=0;const out=[];
await Promise.all(Array.from({length:4},async()=>{
  while(next<people.length){
    const p=people[next++],res=await get('/subject/person/'+encodeURIComponent(p.name)),html=await res.text();
    const li=html.match(/<h2>Party and representation<\/h2><ul><li>([\s\S]*?)<\/li>/)?.[1];
    out.push({name:p.name,states:p.states,referenceOnly:!!p.referenceOnly,status:res.status,partyItem:li??null,
      noParty:li==='Party not recorded',raw:!p.party&&!p.party_now,seat:rosterSeatParty(p,index.electorates),
      list:rosterListParty(p,lists),service:rosterServiceParty(p)});
  }
}));
writeFileSync(output,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({profiles:out.length,referenceOnly:out.filter(x=>x.referenceOnly).length,
  noParty:out.filter(x=>x.noParty).length,errors:out.filter(x=>x.status!==200||!x.partyItem).length}));
