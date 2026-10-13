// Bounded client summaries. No API calls: only the existing published exports.
import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sponsorPerson} from '../portal/public/sponsor-person.js';
import {sponsorSummaryPath,growthSummaryPath,normalisedName,personQuestions,billQuestions,latestBillVotes} from '../portal/public/growth-modules.js';
import {agencyGrants,publishedSupplierIndex,publishedAgencySuppliers} from '../portal/public/supplier-growth.js';
import {TOPIC_NAMES} from '../portal/src/topic-names.mjs';
export async function buildGrowth(root=fileURLToPath(new URL('../portal/public',import.meta.url)), {read: sourceRead} = {}) {
 const read=async p=>sourceRead ? sourceRead(p) : JSON.parse(await readFile(join(root,p),'utf8'));
 const output=join(root,'growth');
 await rm(output,{recursive:true,force:true});
 for(const dir of ['sponsors','agencies','person-bills'])await mkdir(join(output,dir),{recursive:true});
 const sizes=[];
 const write=async (path,data)=>{
  const json=JSON.stringify(data)+'\n', bytes=Buffer.byteLength(json);
  await writeFile(join(root,path.replace(/^\//,'')),json);sizes.push({path,bytes});
 };
 const [index,roster,money,agencies,supplierDirectory]=await Promise.all(['bills/index.json','parliamentarians.json','graph/money.json','agencies.json','suppliers.json'].map(read));
 const publishedSuppliers=publishedSupplierIndex(supplierDirectory.suppliers);
 // The crawl builder requires these same published directory entries to have profiles.
 const supplierShards=new Map();
 for(const entry of publishedSuppliers.values()) {
  if(!supplierShards.has(entry.profile_path))supplierShards.set(entry.profile_path,await read(entry.profile_path.replace(/^\//,'')));
  if(!supplierShards.get(entry.profile_path).profiles?.[entry.id])throw new Error('Published supplier profile is missing: '+entry.id);
 }
 const donors=(money.nodes || []).filter(n=>n.kind==='donor').map(n=>({...Object.fromEntries(['id','label','kind','abn','source_name','match'].filter(k=>n[k]!=null).map(k=>[k,n[k]])),returnReferences:(n.returnReferences || []).slice(0,1)}));
 await write('/growth/donors.json',{donors},3_000_000);
 const billRecords=await Promise.all(index.bills.map(b=>read('bills/'+b.key+'.json')));
 const speechesBySpeaker=new Map();
 const billsBySpeaker=new Map();
 for(const bill of billRecords)for(const speech of bill.speeches || []){
  const key=normalisedName(speech.speaker);if(!key)continue;
  if(!speechesBySpeaker.has(key))speechesBySpeaker.set(key,[]);
  speechesBySpeaker.get(key).push({date:speech.date,title:bill.title,snippet:speech.brief || ''});
  if(!billsBySpeaker.has(key))billsBySpeaker.set(key,new Map());
  const dates=billsBySpeaker.get(key).get(bill.key) || [];
  if(speech.date)dates.push(speech.date);
  billsBySpeaker.get(key).set(bill.key,dates);
 }
 const billsByKey=new Map(billRecords.map(b=>[b.key,b]));
 const sponsoredByPerson=new Map();
 for(const bill of billRecords){
  const sponsor=sponsorPerson(bill.sponsor,bill.sponsor_person_id,roster.people);
  if(!sponsor)continue;
  if(!sponsoredByPerson.has(sponsor.name))sponsoredByPerson.set(sponsor.name,[]);
  sponsoredByPerson.get(sponsor.name).push(bill.key);
 }
 for(const bill of billRecords){
  const questions=billQuestions(bill,roster.people);
  const parties=(bill.divisions || []).flatMap(d=>Object.keys(d.party_splits || {}));
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
  // An overview needs bills from the exported record, including speeches on
  // bills sponsored by someone else. No summaries or donor fields travel here.
  const linkedBills=new Map();
  for(const name of names)for(const [key,dates] of billsBySpeaker.get(normalisedName(name)) || [])linkedBills.set(key,[...(linkedBills.get(key) || []),...dates]);
  for(const key of sponsoredByPerson.get(person.name) || [])if(!linkedBills.has(key))linkedBills.set(key,[]);
  const personBills=[...linkedBills].flatMap(([key,dates])=>{
   const b=billsByKey.get(key);
   const speech_dates=[...new Set(dates)].sort().reverse().slice(0,3);
   const sponsored=(sponsoredByPerson.get(person.name) || []).includes(key);
   return [{key:b.key,title:b.title,introduced:b.introduced || '',sponsor:sponsored?person.name:undefined,speech_dates}];
  }).sort((a,b)=>String(b.speech_dates[0] || b.introduced).localeCompare(String(a.speech_dates[0] || a.introduced))).slice(0,12);
  await write(await growthSummaryPath('person-bills',normalisedName(person.name)),{bills:personBills});
  const questions=names.flatMap(name=>[
   `What has ${name} said in parliament?`,
   ...Object.values(TOPIC_NAMES).flatMap(topic=>personQuestions({name,topics:[{name:topic,count:1}]})),
   ...personQuestions({name,votes:all,bills:index.bills,interests}),
  ]);
  const related=billRecords.filter(b=>latest.some(v=>v.jur===b.jurisdiction && [b.title,...(b.aliases || [])].includes(v.name)));
  const speeches=names.flatMap(name=>speechesBySpeaker.get(normalisedName(name)) || []).sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,8);
 }
 const grouped=new Map();
 // The browser requests summaries from the detail record, including its pid.
 // Older index exports omit that field; never lose its identity evidence or
 // build a different summary path by resolving the lighter index row.
 for(const bill of billRecords){
  const person=sponsorPerson(bill.sponsor,bill.sponsor_person_id,roster.people);
  if(!person)continue;
  const identity=person.pid || person.name;
  const key=`${bill.jurisdiction}:${identity}`;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(bill);
 }
 const written=new Set();
 for(const bill of billRecords){
  if(!bill.sponsor)continue;
  const path=await sponsorSummaryPath(bill);if(written.has(path))continue;written.add(path);
  const person=sponsorPerson(bill.sponsor,bill.sponsor_person_id,roster.people);
  const rows=person ? grouped.get(`${bill.jurisdiction}:${person.pid || person.name}`) || [] : [];
  const bills=[...rows].sort((a,b)=>String(b.introduced||'').localeCompare(String(a.introduced||''))).slice(0,6)
   .map(b=>Object.fromEntries(['key','title','short_title','introduced','status','jurisdiction'].map(k=>[k,b[k]])));
  await write(path,{person:person ?Object.fromEntries(['name','full','pid'].filter(k=>person[k]!=null).map(k=>[k,person[k]])):null,bills,generated:index.meta?.generated || ''});
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
