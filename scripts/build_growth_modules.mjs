// Bounded client summaries. No API calls: only the existing published exports.
import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sponsorPerson} from '../portal/public/sponsor-person.js';
import {sponsorSummaryPath,growthSummaryPath,normalisedName,personQuestions,billQuestions,latestBillVotes} from '../portal/public/growth-modules.js';
import {agencyGrants,publishedSupplierIndex,publishedAgencySuppliers} from '../portal/public/supplier-growth.js';
import {isOrganisationDonor,MONEY_GRAPHS,withheldPhrases,namesWithheldPhrase} from '../portal/public/donor-entity.js';
import {TOPIC_NAMES} from '../portal/src/topic-names.mjs';
export const SUMMARY_BUDGET = 24_000;
export async function buildGrowth(root=fileURLToPath(new URL('../portal/public',import.meta.url))) {
 const read=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
 const output=join(root,'growth');
 await rm(output,{recursive:true,force:true});
 for(const dir of ['sponsors','agencies','privacy/person','privacy/bill'])await mkdir(join(output,dir),{recursive:true});
 const sizes=[];
 const write=async (path,data,budget=SUMMARY_BUDGET)=>{
  const json=JSON.stringify(data)+'\n', bytes=Buffer.byteLength(json);
  if(bytes>budget)throw new Error(`Growth summary exceeds ${budget} bytes: ${path}`);
  await writeFile(join(root,path.replace(/^\//,'')),json);sizes.push({path,bytes});
 };
 const [index,roster,money,agencies,supplierDirectory]=await Promise.all(['bills/index.json','parliamentarians.json','graph/money.json','agencies.json','suppliers.json'].map(read));
 const graphs=await Promise.all(MONEY_GRAPHS.map(path=>read(path.slice(1))));
 const access=await read('access.json').catch(()=>({ministers:{}}));
 const phrases=withheldPhrases(graphs,[...roster.people.flatMap(p=>[p.name,p.full]),...Object.values(access.ministers || {}).map(m=>m.name)].filter(Boolean));
 const privacy=(...texts)=>namesWithheldPhrase(phrases,...texts);
 const approvedTexts=(...records)=>{
  const approved=new Set();
  const visit=value=>{
   if(typeof value==='string') {if(value.trim() && !privacy(value))approved.add(value);}
   else if(Array.isArray(value))value.forEach(visit);
   else if(value && typeof value==='object')Object.values(value).forEach(visit);
  };
  records.forEach(visit);return {approved:[...approved]};
 };
 const publishedSuppliers=publishedSupplierIndex(supplierDirectory.suppliers);
 // The crawl builder requires these same published directory entries to have profiles.
 const supplierShards=new Map();
 for(const entry of publishedSuppliers.values()) {
  if(!supplierShards.has(entry.profile_path))supplierShards.set(entry.profile_path,await read(entry.profile_path.replace(/^\//,'')));
  if(!supplierShards.get(entry.profile_path).profiles?.[entry.id])throw new Error('Published supplier profile is missing: '+entry.id);
 }
 const donors=(money.nodes || []).filter(n=>n.kind==='donor' && isOrganisationDonor(n) && !privacy(n.label)).map(n=>{
  const donor=Object.fromEntries(['id','label','kind','abn'].filter(k=>n[k]!=null).map(k=>[k,n[k]]));
  // Preserve the minimum evidence main's classifier needs, without copying every alias.
  if(!isOrganisationDonor(donor)) {
   const alias=(n.aliases || []).find(label=>isOrganisationDonor({...donor,aliases:[label]}));
   if(alias) donor.aliases=[alias];
  }
  if(!isOrganisationDonor(donor))throw new Error('Donor summary lost organisation evidence');
  return donor;
 });
 // Names and organisation evidence only: no individual rows, amounts or party flows.
 await write('/growth/organisation-donors.json',{donors,approved:donors.map(n=>n.label)},64_000);
 const billRecords=await Promise.all(index.bills.map(b=>read('bills/'+b.key+'.json')));
 const speechesBySpeaker=new Map();
 for(const bill of billRecords)for(const speech of bill.speeches || []){
  const key=normalisedName(speech.speaker);if(!key)continue;
  if(!speechesBySpeaker.has(key))speechesBySpeaker.set(key,[]);
  speechesBySpeaker.get(key).push({date:speech.date,title:bill.title,snippet:speech.brief || ''});
 }
 for(const bill of billRecords){
  const questions=billQuestions(bill,roster.people,privacy);
  const parties=(bill.divisions || []).flatMap(d=>Object.keys(d.party_splits || {}));
  await write(await growthSummaryPath('privacy/bill',bill.key),approvedTexts(bill,questions,parties),120_000);
 }
 const votes=await read('votes.json');
 const interestsIndex=await read('interests/index.json');
 for(const person of roster.people){
  const keys=[...new Set([person.pid,...(votes._names?.[person.name.toLowerCase()] || [])].filter(Boolean))];
  const all=keys.flatMap(k=>{
   const r=votes[k];return r?['for','against'].flatMap(side=>(r[side] || []).map(v=>({...v,jur:v.jur || r.jurisdiction}))):[];
  });
  const latest=latestBillVotes(all).slice(0,6);
  const interestId=person.pid && interestsIndex.people?.[person.pid] ? person.pid : interestsIndex._by_name?.[person.name.toLowerCase()];
  const interests=interestId ? await read('interests/'+interestId+'.json').catch(()=>null) : null;
  const names=[...new Set([person.name,person.full].filter(Boolean))];
  const questions=names.flatMap(name=>[
   `What has ${name} said in parliament?`,
   ...Object.values(TOPIC_NAMES).flatMap(topic=>personQuestions({name,topics:[{name:topic,count:1}],privacy})),
   ...personQuestions({name,votes:all,bills:index.bills,interests,privacy}),
  ]);
  const related=billRecords.filter(b=>latest.some(v=>v.jur===b.jurisdiction && [b.title,...(b.aliases || [])].includes(v.name)));
  const speeches=names.flatMap(name=>speechesBySpeaker.get(normalisedName(name)) || []).sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,8);
  await write(await growthSummaryPath('privacy/person',normalisedName(person.name)),approvedTexts(names,questions,interests,latest,related,speeches),128_000);
 }
 const grouped=new Map();
 for(const bill of index.bills){
  const person=sponsorPerson(bill.sponsor,bill.sponsor_person_id,roster.people);
  if(!person)continue;
  const identity=person.pid || person.name;
  const key=`${bill.jurisdiction}:${identity}`;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(bill);
 }
 const written=new Set();
 for(const bill of index.bills){
  if(!bill.sponsor)continue;
  const path=await sponsorSummaryPath(bill);if(written.has(path))continue;written.add(path);
  const person=sponsorPerson(bill.sponsor,bill.sponsor_person_id,roster.people);
  const rows=person ? grouped.get(`${bill.jurisdiction}:${person.pid || person.name}`) || [] : [];
  const bills=[...rows].filter(b=>!privacy(b.title,b.short_title)).sort((a,b)=>String(b.introduced||'').localeCompare(String(a.introduced||''))).slice(0,6)
   .map(b=>Object.fromEntries(['key','title','short_title','introduced','status','jurisdiction'].map(k=>[k,b[k]])));
  await write(path,{person:person && !privacy(person.name,person.full)?Object.fromEntries(['name','full','pid'].filter(k=>person[k]!=null).map(k=>[k,person[k]])):null,bills,generated:index.meta?.generated || ''});
 }
 // Rank once during the build; browsers fetch only the five awards for one agency.
 const shards=[];
 for(const file of (await readdir(join(root,'grants/federal'))).filter(f=>/^shard-\d+\.json$/.test(f)).sort())shards.push(await read('grants/federal/'+file));
 const grantMeta=(await read('graph/grants.federal.json')).meta;
 for(const entry of agencies.agencies){
  const agency=await read(entry.profile_path.replace(/^\//,''));
  const grants=agencyGrants(shards,agency.name);
  const suppliers=publishedAgencySuppliers(agency,publishedSuppliers).sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,6);
  await write(await growthSummaryPath('agencies',normalisedName(agency.name)),{agency:{id:agency.id,name:agency.name,suppliers},grants,meta:{generated:grantMeta.generated,coverage:grantMeta.coverage,source_url:grantMeta.source_url},contracts_updated:agencies.meta?.generated_at || ''});
 }
 console.log(JSON.stringify({files:sizes.length,largest:Math.max(...sizes.map(s=>s.bytes)),donorIndexBytes:sizes[0].bytes}));
 return sizes;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await buildGrowth();
