// Bounded client summaries. No API calls: only the existing published exports.
import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sponsorPerson} from '../portal/public/sponsor-person.js';
import {sponsorSummaryPath,growthSummaryPath,normalisedName,personQuestions,billQuestions,latestBillVotes} from '../portal/public/growth-modules.js';
import {agencyGrants,publishedSupplierIndex,publishedAgencySuppliers} from '../portal/public/supplier-growth.js';
import {AGENCY_TOP_SUPPLIERS_PATH,agencyTopRows} from '../portal/public/agency-top-suppliers.js';
import {RECENT_VOTES_BUCKETS,recentVotesBucket,recentVotesBucketPath,votesBucketPath,VOTES_NAMES_PATH,bucketLayout} from '../portal/public/recent-votes-buckets.js';
import {PARTY_MONEY_BUCKETS,partyFold,partyMoneyBucket,partyMoneyBucketPath} from '../portal/public/party-money-buckets.js';
import {SUPPLIER_ID_RE,supplierRowsPath,SUPPLIERS_META_PATH} from '../portal/public/supplier-row-buckets.js';
import {MONEY_GRAPH_PATHS,MONEY_PARTIES_PATH,moneyPartiesFile} from '../portal/public/money-parties.js';
import {BILL_TITLES_PATH,billTitlesFile,BILLS_DATE_PATH,billsDateFile,DIVISION_BILLS_PATH,divisionBillsFile} from '../portal/public/bill-titles.js';
import {partyMoneyData} from '../portal/public/register-tables.js';
import {NEWEST_BILLS_PATH,newestBillsFile} from '../portal/public/home-data.js';
import {TOPIC_NAMES} from '../portal/src/topic-names.mjs';
/** A money graph's party-receipt buckets as [path, contents] pairs (portal/public/party-money-buckets.js). */
export function partyMoneyBucketFiles(path,graph){
 const buckets=Array.from({length:PARTY_MONEY_BUCKETS},()=>Object.create(null));
 // The first party node with a folded name is the one a profile matches.
 for(const node of graph.nodes){
  if(node.kind!=='party')continue;
  const key=partyFold(node.label), bucket=buckets[partyMoneyBucket(key)];
  if(!(key in bucket))bucket[key]={label:node.label,...partyMoneyData(graph,node.id)}; // rows, and scope when the graph is typed
 }
 return buckets.map((parties,i)=>[partyMoneyBucketPath(path,i),{meta:graph.meta,parties}]);
}
export async function buildGrowth(root=fileURLToPath(new URL('../portal/public',import.meta.url)), {read: sourceRead} = {}) {
 const read=async p=>sourceRead ? sourceRead(p) : JSON.parse(await readFile(join(root,p),'utf8'));
 const output=join(root,'growth');
 await rm(output,{recursive:true,force:true});
 for(const dir of ['sponsors','agencies','person-bills','recent-votes','votes','supplier-rows'])await mkdir(join(output,dir),{recursive:true});
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
 const agencyTop={};
 for(const entry of agencies.agencies){
  const agency=await read(entry.profile_path.replace(/^\//,''));
  agencyTop[entry.profile_path]=agencyTopRows(agency.suppliers);
  const grants=agencyGrants(shards,agency.name);
  const suppliers=publishedAgencySuppliers(agency,publishedSuppliers).sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,6);
  await write(await growthSummaryPath('agencies',normalisedName(agency.name)),{agency:{id:agency.id,name:agency.name,suppliers},grants,meta:{generated:grantMeta.generated,coverage:grantMeta.coverage,source_url:grantMeta.source_url},contracts_updated:agencies.meta?.generated_at || ''});
 }
 // Supplier pages read this instead of each agency's full file (portal/public/agency-top-suppliers.js).
 await write(AGENCY_TOP_SUPPLIERS_PATH,{agencies:agencyTop});
 // Profiles read their own bucket of recorded votes (portal/public/recent-votes-buckets.js), not the 3 MB file.
 const recent=await read('seo/recent-votes.json').catch(error=>{if(error.code==='ENOENT')return null;throw error});
 if(recent?.people){
  const buckets=Array.from({length:RECENT_VOTES_BUCKETS},()=>[]);
  for(const entry of Object.entries(recent.people))buckets[recentVotesBucket(entry[0])].push(entry);
  for(const [i,entries] of buckets.entries())await write(recentVotesBucketPath(i),{_meta:recent._meta,...bucketLayout(i),people:Object.fromEntries(entries)});
 }
 // Profiles read the name index, then their own buckets of votes.json, not the whole file.
 const voteFile=votes;
 if(voteFile?._names){
  // The name index carries votes.json's _meta too: a profile's source line reads it (public/app.js).
  await write(VOTES_NAMES_PATH,{_names:voteFile._names,...(voteFile._meta?{_meta:voteFile._meta}:{})});
  const buckets=Array.from({length:RECENT_VOTES_BUCKETS},()=>[]);
  for(const entry of Object.entries(voteFile))if(!entry[0].startsWith('_'))buckets[recentVotesBucket(entry[0])].push(entry);
  for(const [i,entries] of buckets.entries())await write(votesBucketPath(i),{...bucketLayout(i),people:Object.fromEntries(entries)});
 }
 // Supplier pages and their heads read their id's bucket of the index (portal/public/supplier-row-buckets.js), not the 7.6 MB file.
 const supplierRows=new Map(Array.from({length:256},(_,i)=>[supplierRowsPath(i.toString(16).padStart(2,'0')),[]]));
 const supplierIds=new Set();
 for(const row of supplierDirectory.suppliers){
  if(!SUPPLIER_ID_RE.test(row?.id))throw new Error('Invalid supplier id: '+row?.id);
  if(supplierIds.has(row.id))throw new Error('Duplicate supplier id: '+row.id);
  supplierIds.add(row.id);supplierRows.get(supplierRowsPath(row.id)).push(row);
 }
 const supplierMeta={generated_at:supplierDirectory.meta?.generated_at,generated:supplierDirectory.meta?.generated,source:supplierDirectory.meta?.source};
 for(const [path,rows] of supplierRows)await write(path,{meta:supplierMeta,suppliers:rows});
 // The home, map and money pages print the index's totals and dates, not its 22,000 rows.
 await write(SUPPLIERS_META_PATH,{meta:supplierDirectory.meta});
 // Profiles read their party's receipt rows from these buckets (portal/public/party-money-buckets.js), not the graphs.
 for(const path of ['/graph/money-receipts.json','/graph/money.qld.json','/graph/money.vic.json']){
  const graph=await read(path.slice(1)).catch(error=>{if(error.code==='ENOENT' && path!=='/graph/money-receipts.json')return null;throw error});
  if(!graph?.nodes)continue;
  await mkdir(join(output,'party-money',path.split('/').pop().replace(/\.json$/,'')),{recursive:true});
  for(const [file,data] of partyMoneyBucketFiles(path,graph))await write(file,data);
 }
 // Share cards take a party's colour from the graphs' party nodes, not the four graphs (portal/public/money-parties.js).
 // A missing graph writes no file: the Worker then reads the graphs, as before.
 const moneyGraphs=await Promise.all(MONEY_GRAPH_PATHS.map(path=>path==='/graph/money.json'?money:read(path.slice(1)).catch(error=>{if(error.code==='ENOENT')return null;throw error})));
 if(moneyGraphs.every(graph=>Array.isArray(graph?.nodes)))await write(MONEY_PARTIES_PATH,moneyPartiesFile(moneyGraphs));
 // Profiles link votes to bills and title sponsored bills from these fields, not the whole index (portal/public/bill-titles.js).
 await write(BILL_TITLES_PATH,billTitlesFile(index));
 // A bill page reads only the index's date (portal/public/bill-titles.js).
 if (typeof index.generated_at==='string') await write(BILLS_DATE_PATH,billsDateFile(index));
 // A party page picks the bills it reads from those with divisions (portal/public/bill-titles.js).
 await write(DIVISION_BILLS_PATH,divisionBillsFile(index));
 // The home page's newest bills (portal/public/home-data.js).
 await write(NEWEST_BILLS_PATH,newestBillsFile(index));
 console.log(JSON.stringify({files:sizes.length,largest:Math.max(...sizes.map(s=>s.bytes)),donorIndexBytes:sizes[0].bytes}));
 return sizes;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await buildGrowth();
