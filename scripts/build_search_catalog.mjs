import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalize, tokens, bucket } from '../portal/src/catalog-query.mjs';
import { moneyFlowType } from '../portal/public/money-records.js';
import { recordsWithLocations } from '../portal/public/grants-research.js';
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
for(const p of roster.people) add('person:'+p.name,'person',p.full||p.name,personHref(p.name),`${p.party_now||p.party||''}. ${(p.states||[]).join(', ')}. ${p.speeches.toLocaleString()} indexed speeches.${p.representation?.length?' Recorded representation: '+p.representation.map(r=>`${r.electorate}${r.state?', '+r.state:''}, ${r.jurisdiction}, ${r.chamber}`).join('; ')+'. Roster affiliations may include past seats and do not establish current tenure.':''}`,{aliases:p.name,from:p.first,to:p.last,state:p.states,parties:[p.party_now||p.party||''],speakers:[p.name],source:'Parliamentarian directory',dateLabel:period(p.first,p.last)});
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
const agencies=await read('agencies.json');
const mlci=await read('research/mlci.json');
const grantLocations=await read('research/grant-locations.json');
for(const p of recordsWithLocations(mlci,grantLocations,'invitations')) {
 const venueText=p.sites.map(s=>`Verified venue: ${s.site_name}, ${s.address}; ${s.electorate_2025} electorate (2025). Venue point only, not a surveyed work footprint or a seat-level funding allocation.`).join(' ');
 const target={stage:'invitations',project:p.id,q:p.title,...(p.sites.length?{}:{view:'list'})};
 add(p.id,'report',`${p.title} — MLCI invitation record`, '/reports/grants-allocation?'+new URLSearchParams(target),`${cash(p.value)} invitation allocation. ${p.status}. ${p.lga}, ${p.state}. Not an awarded grant or payment. ${venueText}`.trim(),{date:mlci.invitation_snapshot,state:'federal',source:'Departmental project list',url:p.source_url,record_id:p.id});
}
add('research-cpi-mlci-2026','report','Public money, political advantage?','/reports/grants-allocation','Centre for Public Integrity research on pork barrelling, marginal seats and Major and Local Community Infrastructure Program invitations. CPI Table 3 reports $223,128,975 for marginal seats where Labor was competitive, versus $156,587,679 under a seat-count proportional baseline. Attributed CPI analysis, not independently replicated by Opax; no finding about individual project merit. '+mlci.cpi_comparison.map(r=>`${r.name}: ${cash(r.actual)} invitation value; ${cash(r.expected)} proportional baseline.`).join(' '),{date:'2026-09-08',state:'federal',source:'Centre for Public Integrity',url:mlci.sources.cpi_landing});
add('mlci-program-coverage','report','MLCI program: invitations and awards','/reports/grants-allocation',`${mlci.projects.filter(p=>p.status!=='Withdrawn').length} active invitations total $559,241,712 at 14 November 2025; separately, ${mlci.awards.length} published awards total ${cash(mlci.awards.reduce((s,p)=>s+p.value,0))} in Opax at ${mlci.as_of}. Invitations are not awards or payments; do not add totals. `+Object.entries({NSW:'New South Wales',VIC:'Victoria',QLD:'Queensland',WA:'Western Australia',SA:'South Australia',TAS:'Tasmania',NT:'Northern Territory',ACT:'Australian Capital Territory'}).map(([state,name])=>`${name}: ${cash(mlci.projects.filter(p=>p.status!=='Withdrawn'&&p.state===state).reduce((sum,p)=>sum+p.value,0))} in active invitations.`).join(' '),{date:mlci.as_of,state:'federal',source:'Departmental invitation list and GrantConnect snapshot',url:mlci.sources.department});
for(const s of mlci.seats) add('aec-seat:'+s.name,'report',`${s.name} — 2025 seat baseline`,'/reports/grants-allocation?'+new URLSearchParams({seat:s.name}),`${s.state}. ${s.party}. ${s.margin.toFixed(2)} percentage-point margin. ${{M:'Marginal',FS:'Fairly safe',S:'Safe'}[s.status]}. AEC notional baseline before the 2025 election, not the election result or current incumbent.`,{date:'2025-05-03',state:'federal',source:'AEC pre-election seat status',url:mlci.sources.aec+'#page='+s.page});
for(const a of agencies.agencies) add('agency:'+a.id,'agency',a.name,'/subject/agency/'+encodeURIComponent(a.id),`${cash(a.total)} in recorded awards across ${a.count} contracts and ${a.supplier_count} suppliers.`,{from:a.first_year,to:a.last_year,state:'federal',source:'AusTender agency profile',dateLabel:period(a.first_year,a.last_year)});
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
