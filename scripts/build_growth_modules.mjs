// Bounded client summaries. No API calls: only the existing published exports.
import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sponsorPerson} from '../portal/public/sponsor-person.js';
import {sponsorSummaryPath,growthSummaryPath,normalisedName} from '../portal/public/growth-modules.js';
import {agencyGrants} from '../portal/public/supplier-growth.js';
import {isOrganisationDonor} from '../portal/public/donor-entity.js';
export const SUMMARY_BUDGET = 24_000;
export async function buildGrowth(root=fileURLToPath(new URL('../portal/public',import.meta.url))) {
 const read=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
 const output=join(root,'growth');
 await rm(output,{recursive:true,force:true});
 for(const dir of ['sponsors','agencies'])await mkdir(join(output,dir),{recursive:true});
 const sizes=[];
 const write=async (path,data,budget=SUMMARY_BUDGET)=>{
  const json=JSON.stringify(data)+'\n', bytes=Buffer.byteLength(json);
  if(bytes>budget)throw new Error(`Growth summary exceeds ${budget} bytes: ${path}`);
  await writeFile(join(root,path.replace(/^\//,'')),json);sizes.push({path,bytes});
 };
 const [index,roster,money,agencies]=await Promise.all(['bills/index.json','parliamentarians.json','graph/money.json','agencies.json'].map(read));
 const donors=(money.nodes || []).filter(n=>n.kind==='donor' && isOrganisationDonor(n)).map(n=>{
  const donor=Object.fromEntries(['id','label','kind','abn'].filter(k=>n[k]!=null).map(k=>[k,n[k]]));
  // Preserve the minimum evidence main's classifier needs, without copying every alias.
  if(!isOrganisationDonor(donor)) {
   const alias=(n.aliases || []).find(label=>isOrganisationDonor({label}));
   if(alias) donor.aliases=[alias];
   else donor.industry=n.industry;
  }
  if(!isOrganisationDonor(donor))throw new Error('Donor summary lost organisation evidence');
  return donor;
 });
 // Names and organisation evidence only: no individual rows, amounts or party flows.
 await write('/growth/organisation-donors.json',{donors},64_000);
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
  const bills=[...rows].sort((a,b)=>String(b.introduced||'').localeCompare(String(a.introduced||''))).slice(0,6)
   .map(b=>Object.fromEntries(['key','title','short_title','introduced','status','jurisdiction'].map(k=>[k,b[k]])));
  await write(path,{person:person?Object.fromEntries(['name','full','pid'].filter(k=>person[k]!=null).map(k=>[k,person[k]])):null,bills,generated:index.meta?.generated || ''});
 }
 // Rank once during the build; browsers fetch only the five awards for one agency.
 const shards=[];
 for(const file of (await readdir(join(root,'grants/federal'))).filter(f=>/^shard-\d+\.json$/.test(f)).sort())shards.push(await read('grants/federal/'+file));
 const grantMeta=(await read('graph/grants.federal.json')).meta;
 for(const entry of agencies.agencies){
  const agency=await read(entry.profile_path.replace(/^\//,''));
  const grants=agencyGrants(shards,agency.name);
  const suppliers=[...(agency.suppliers || [])].sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,6)
   .map(s=>({id:s.id,name:s.name,total:s.total}));
  await write(await growthSummaryPath('agencies',normalisedName(agency.name)),{agency:{id:agency.id,name:agency.name,suppliers},grants,meta:{generated:grantMeta.generated,coverage:grantMeta.coverage,source_url:grantMeta.source_url},contracts_updated:agencies.meta?.generated_at || ''});
 }
 console.log(JSON.stringify({files:sizes.length,largest:Math.max(...sizes.map(s=>s.bytes)),donorIndexBytes:sizes[0].bytes}));
 return sizes;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await buildGrowth();
