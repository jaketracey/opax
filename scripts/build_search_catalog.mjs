import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalize, tokens, bucket } from '../portal/src/catalog-query.mjs';
import { moneyFlowType } from '../portal/public/money-records.js';
const root = fileURLToPath(new URL('../portal/public/', import.meta.url));
const read = async p => JSON.parse(await readFile(join(root,p),'utf8'));
const files = async p => (await readdir(join(root,p))).filter(n=>n.endsWith('.json')).sort();
const docs = [], ids = new Set(), counts = {};
const cash = n => Number(n).toLocaleString('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:2});
const personHref = n => '/subject/person/'+encodeURIComponent(n);
const donorHref = n => '/subject/donor/'+encodeURIComponent(n);
const supplierHref = n => '/subject/supplier/'+encodeURIComponent(n);
const year = d => Number(String(d || '').slice(0,4)) || 0;
const period = (a,b) => a && b ? (a===b?String(a):`${a}–${b}`) : '';
const party = p => normalize(p).replace(/australian labor party|australian labour party/g,'labor').replace(/liberal party of australia/g,'liberal').replace(/the nationals/g,'nationals');
function add(key, kind, title, href, text, extra={}) {
  if(ids.has(key)) return; ids.add(key);
  const { aliases='', from=year(extra.date), to=year(extra.date), state='', parties=[], speakers=[], topics=[], ...rest }=extra;
  const record={kind,title,href,snippet:String(text || ''),...rest};
  record.slug='catalog-'+docs.length; record.resource='';
  docs.push({record, meta:[kind,from||0,to||from||0,(Array.isArray(state)?state:[state]).join('|'),parties.map(party).filter(Boolean).join('|'),speakers.map(normalize).filter(Boolean).join('|'),topics.join('|')],titleTokens:tokens(title+' '+aliases),bodyTokens:tokens(text+' '+kind+' '+({receipt:'donations political funding',donor:'donations political funding',contract:'procurement contracts',grant:'grants funding'}[kind]||'')+' '+(rest.source||''))});
  counts[kind]=(counts[kind]||0)+1;
}
const roster = await read('parliamentarians.json');
for(const p of roster.people) add('person:'+p.name,'person',p.full||p.name,personHref(p.name),`${p.party_now||p.party||''}. ${(p.states||[]).join(', ')}. ${p.speeches.toLocaleString()} indexed speeches.`,{aliases:p.name,from:p.first,to:p.last,state:p.states,parties:[p.party_now||p.party||''],speakers:[p.name],source:'Parliamentarian directory',dateLabel:period(p.first,p.last)});
for(const [jur,file] of [['federal','money.json'],['qld','money.qld.json'],['vic','money.vic.json'],['tas','money.tas.json']]) {
 const graph=await read('graph/'+file), byId=new Map(graph.nodes.map(n=>[n.id,n]));
 for(const n of graph.nodes.filter(n=>n.kind==='donor'||n.kind==='party')) {
  add(jur+':'+n.id,n.kind==='donor'?'donor':'party',n.label,n.kind==='party'?'/subject/party/'+encodeURIComponent(n.label):jur==='federal'?donorHref(n.label):'/money?'+new URLSearchParams({jur,q:n.label}),`${(n.industry||'').replaceAll('_',' ')}. ${cash(n.total||0)} in disclosed political receipts across ${(n.count||0).toLocaleString()} records.`,{aliases:[...(n.aliases||[]),n.abn||''].join(' '),from:n.firstYear,to:n.lastYear,state:jur,parties:n.kind==='party'?[n.label]:[],source:jur==='federal'?'AEC disclosure records':`${jur.toUpperCase()} disclosure records`,dateLabel:period(n.firstYear,n.lastYear)});
 }
 for(const [i,e] of graph.edges.entries()) {
  const a=byId.get(e.source),b=byId.get(e.target), flow=moneyFlowType(e,byId); if(!a||!b||!flow)continue;
  if(flow!=='receipts') {
   const kind=flow==='contracts'?'contract':'grant';
   add(`${jur}:${flow}-connection:${i}`,kind,`${b.label} — ${kind} connection`,'/money?'+new URLSearchParams({jur,q:b.label,type:flow}),`${cash(e.total)} across ${e.count||0} ${kind} records from ${a.label}. Aggregated map connection; individual notices may also appear separately in search.`,{aliases:[...(b.aliases||[]),b.abn||''].join(' '),from:e.firstYear,to:e.lastYear,state:jur,source:flow==='contracts'?'Public contract map aggregate':'Public grant map aggregate',dateLabel:period(e.firstYear,e.lastYear)});
   continue;
  }
  add(`${jur}:receipt:${i}`,'receipt',`${a.label} → ${b.label}`,'/money?'+new URLSearchParams({jur,q:a.label,party:b.id,type:'receipts'}),`${cash(e.total)} in disclosed political receipts; ${e.count||0} records. Aggregated connection, not an individual gift. ${(a.industry||'').replaceAll('_',' ')}.`,{aliases:(a.aliases||[]).join(' '),from:e.firstYear,to:e.lastYear,state:jur,parties:[b.label],source:jur==='federal'?'AEC disclosure records':`${jur.toUpperCase()} disclosure records`,dateLabel:period(e.firstYear,e.lastYear)});
 }
}
const suppliers=await read('suppliers.json');
for(const s of suppliers.suppliers) add('supplier:'+s.id,'supplier',s.name,supplierHref(s.id),`${cash(s.total)} in recorded contract awards across ${s.count} contracts and ${s.agency_count} agencies. ABN ${s.abn||'not recorded'}.`,{aliases:(s.aliases||[]).join(' ')+' '+(s.abn||''),from:s.first_year,to:s.last_year,state:'federal',source:'AusTender supplier profile',dateLabel:period(s.first_year,s.last_year)});
for(const file of await files('suppliers')) for(const s of Object.values((await read('suppliers/'+file)).profiles)) {
 for(const c of s.contracts||[]) add('contract:'+c.id,'contract',`${c.title||c.id} — ${s.name}`,supplierHref(s.id)+'?'+new URLSearchParams({contract:c.id}),`${cash(c.amount)}. ${c.agency}. ${c.id}. ${c.description||''}`,{aliases:`${s.name} ${s.abn||''} ${(s.aliases||[]).join(' ')} ${c.reported_supplier||''} ${c.id}`,date:c.start_date||null,state:'federal',source:'AusTender contract award',url:c.url,record_id:c.id});
}
for(const jur of ['federal','qld']) {
 const index=await read(`graph/grants.${jur}.json`);
 for(const file of await files('grants/'+jur)) for(const r of Object.values(await read(`grants/${jur}/${file}`))) {
  const href='/money/grants?'+new URLSearchParams({jur,open:r.id});
  add(`${jur}:grant-recipient:${r.id}`,'grant',r.n,href,`${cash(r.t)} across ${r.c} grant records. ${(r.programs||[]).map(p=>p[0]).join('; ')}. ${(r.agencies||[]).map(a=>a[0]).join('; ')}.`,{aliases:[r.abn||'',...(r.aliases||[])].join(' '),from:year(r.y0),to:year(r.y1),state:jur,source:'Grant recipient profile',dateLabel:period(r.y0,r.y1)});
  for(const g of r.grants||[]) add(`${jur}:grant:${r.id}:${g.id}:${g.fy}`,'grant',`${g.n||g.pr||g.id} — ${r.n}`,href,`${cash(g.v)}. ${g.ag||''}. ${g.pr||''}. ${g.cat||''}. ${g.desc||''} ${g.el||''}.`,{aliases:`${r.n} ${r.abn||''} ${g.id}`,date:g.s||null,from:year(g.fy)||year(g.s),to:year(g.fy)||year(g.s),state:jur,source:index.meta.sourceShort,record_id:g.id,dateLabel:g.s?undefined:g.fy,url:g.guid?`https://www.grants.gov.au/Ga/Show/${g.guid}`:index.meta.source_url});
 }
}
for(const file of await files('bills')) {
 if(file==='index.json')continue;
 const b=await read('bills/'+file), summary=b.summary;
 add('bill:'+b.key,'bill',b.short_title||b.title,'/bill/'+encodeURIComponent(b.key),[b.status?.replaceAll('_',' '),b.portfolio,summary?.sentences?.join(' '),summary?.affected].filter(Boolean).join('. '),{aliases:[b.title,...(b.aliases||[])].join(' '),date:b.introduced,state:b.jurisdiction,parties:[b.sponsor_party||''],speakers:[b.sponsor||''],source:summary?'Bill register · automated summary':'Bill register'});
}
for(const file of await files('interests')) {
 if(['index.json','ties-by-donor.json','recent.json'].includes(file))continue;
 const p=await read('interests/'+file);
 for(const [category,b] of Object.entries(p.buckets||{})) for(const [i,item] of (b.items||[]).entries()) {
  add(`interest:${file}:${category}:${i}`,'interest',`${p.name} — ${category.replaceAll('_',' ')}`,personHref(p.name),`${item.description}. ${item.holder||''}. ${item.kind||''}.`,{date:item.date||null,from:year(item.date||p.as_at),to:year(item.date||p.as_at),dateLabel:item.date?undefined:(p.as_at?'Register as at '+p.as_at:undefined),state:p.jurisdiction,speakers:[p.name],parties:[roster.people.find(x=>x.name===p.name)?.party_now||roster.people.find(x=>x.name===p.name)?.party||''],source:'Register of interests',url:p.source_url});
 }
}
const recent=await read('interests/recent.json');
for(const x of recent.items) add('alteration:'+x.id,'interest',`${x.name} — ${x.kind}`, '/declared?'+new URLSearchParams({person:x.name}),x.description,{date:x.date,state:x.jurisdiction,speakers:[x.name],source:'Register alteration',url:x.url});
const expenses=await read('expenses.json');
for(const [id,p] of Object.entries(expenses.people)) add('expenses:'+id,'expense',`${p.name} — parliamentary expenses`,personHref(p.name),`${cash(p.total)} reported expenditure. ${(p.by_category||[]).map(([n,v])=>`${n}: ${cash(v)}`).join('; ')}.`,{speakers:[p.name],state:'federal',from:p.from,to:p.to,source:'Independent Parliamentary Expenses Authority',url:expenses.meta.source_url,dateLabel:period(p.from,p.to)});
const campaigners=await read('graph/campaigners.json');
for(const e of campaigners.entities) add('campaigner:'+e.name,'campaigner',e.name,'/subject/campaigner/'+encodeURIComponent(e.name),`${e.kind.replaceAll('_',' ')}. ${(e.return_types||[]).join('; ')}. ${(e.associated_parties||[]).join(', ')}.`,{aliases:e.abn||'',from:year(e.years?.[0]?.[0]),to:year(e.latest_year),state:'federal',parties:e.associated_parties||[],source:'AEC annual returns',dateLabel:e.latest_year});
const access=await read('access.json');
for(const [name,d] of Object.entries(access.donors)) {
 for(const [i,m] of (d.meetings||[]).entries()) add(`meeting:${name}:${i}`,'access',`${name} — meeting with ${m.minister}`,donorHref(name),m.purpose||'Recorded ministerial meeting',{date:m.date,state:m.jurisdiction,speakers:[m.minister],source:'Ministerial diary'});
 for(const [i,l] of (d.lobbyists||[]).entries()) add(`lobbyist:${name}:${i}`,'access',`${name} — ${l.firm}`,donorHref(name),`Registered lobbying client. ${l.ceased?'Ceased':'Listed'} registration.`,{state:normalize(l.jurisdiction)==='federal'?'federal':normalize(l.jurisdiction),date:l.registered,source:'Lobbyist register'});
}
for(const [id,m] of Object.entries(access.ministers)) for(const [i,r] of (m.recent||[]).entries()) add(`minister-meeting:${id}:${i}`,'access',`${m.name} — ${r.org}`,personHref(m.page||m.name),r.purpose||'Recorded ministerial meeting',{date:r.date,state:m.jurisdiction,speakers:[m.name],source:'Ministerial diary'});
const fits=await read('fits.json');
for(const list of [...Object.values(fits.by_entity),...Object.values(fits.people)]) for(const r of list) add(`fits:${r.registrant}:${r.principal}:${r.from}`,'access',`${r.registrant} — ${r.principal}`,r.url,`${r.country}. ${(r.activities||[]).join('; ')}. ${r.status}.`,{date:r.from,state:'federal',source:'Foreign Influence Transparency Scheme',url:r.url});
for(const file of await files('reports')) {
 if(file==='index.json')continue;const r=await read('reports/'+file);
 add('report:'+r.slug,'report',r.title,'/reports/'+r.slug,r.blurb,{date:r.generated_at?.slice(0,10),source:'OPAX research report'});
}
const meta=docs.map(d=>d.meta), postings=Array.from({length:64},()=>Object.create(null));
for(const [id,d] of docs.entries()) {
 const weights=new Map(d.bodyTokens.map(t=>[t,1])); for(const t of d.titleTokens)weights.set(t,8);
 for(const [term,weight] of weights){const p=postings[bucket(term)];(p[term]??=[]).push(id,weight);}
}
const version=createHash('sha256').update(JSON.stringify(docs.map(d=>[d.record,d.meta,d.titleTokens,d.bodyTokens]))).digest('hex').slice(0,16);
const output=join(root,'search-catalog'); await mkdir(output,{recursive:true});
// This directory contains generated search assets only.
for(const name of await readdir(output))await rm(join(output,name),{recursive:true,force:true});
await mkdir(join(output,version));
const put=async(name,data)=>writeFile(join(output,version,name),JSON.stringify(data));
await put('meta.json',meta);
for(let i=0;i<64;i++)await put('terms-'+i+'.json',postings[i]);
for(let i=0;i<docs.length;i+=256)await put('records-'+Math.floor(i/256)+'.json',docs.slice(i,i+256).map(d=>d.record));
const manifest={version,count:docs.length,counts,recordShardSize:256,coverage:'Searches the records and profiles published on OPAX. Map connections, expense totals and recipient profiles are aggregates and may overlap individual records. Published grant and interest detail exports are samples of their source registers; document search returns a ranked retrieval window.'};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest));
console.log(JSON.stringify(manifest,null,2));
