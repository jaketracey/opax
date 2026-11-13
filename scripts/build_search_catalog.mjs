import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalize, tokens, bucket, PERSON_SEARCH_ALIASES } from '../portal/src/catalog-query.mjs';
import { personNameKey, personUrl, partyUrl } from '../portal/public/canonical-urls.js';
import { PARTY_RENAMES } from '../portal/public/labels.js';
import { recordPathIndex } from '../portal/public/record-paths.js';
import { personSlug, personIndex, fullNameMatches } from '../portal/src/person-slug.ts';
import {donorDisclosure,donorLookup} from '../portal/public/donor-disclosure.js';
import {foldDonorName} from '../portal/public/donor-entity.js';
import { moneyFlowType } from '../portal/public/money-records.js';
import { auditComplete } from '../portal/public/audit.js';
import { payPersonRecord, payPersonOrder, payGeneralRecords, payOfficeRecord, payOfficeGeneralRecords } from '../portal/src/pay-records.mjs';
import { reportsPublished } from './reports_flag.mjs';
import { pageSearchRecords } from './search_catalog_pages.mjs';
import { buildReportCatalog } from './build_report_catalog.mjs';
import {programKey, resolveProgram} from '../portal/public/facts/grant-programs.js';
export {programKey};
import { interestHolder } from '../portal/public/interest-holder.js';
const root = fileURLToPath(new URL('../portal/public/', import.meta.url));
const read = async p => JSON.parse(await readFile(join(root,p),'utf8'));
const files = async p => (await readdir(join(root,p))).filter(n=>n.endsWith('.json')).sort();
const docs = [], ids = new Set(), counts = {};
const cash = n => Number(n).toLocaleString('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:2});
// A grant worth $0.00 at source is published as 0 (search-hubs-008): say so, and never print $NaN for a missing value.
export const grantValue = v => v === 0 ? '$0 (as published)' : v == null || v === '' || !Number.isFinite(Number(v)) ? 'Value not recorded' : cash(v);
let canonicalPeople=new Map(), canonicalAliases=new Map(), peopleIndex={fullNames:new Map()};
const personHref = n => { const slug=canonicalPeople.get(n) || canonicalAliases.get(personNameKey(n)); return slug ? '/subject/person/'+slug : personUrl(n); };
// A minister's diary reaches a full-name alias only in the minister's own parliament.
const ministerHref = m => { const n=m.page||m.name; return fullNameMatches(peopleIndex,n,m.jurisdiction) ? personHref(n) : personUrl(n); };
const supplierHref = n => '/subject/supplier/'+encodeURIComponent(n);
const year = d => Number(String(d || '').slice(0,4)) || 0;
const period = (a,b) => a && b ? (a===b?String(a):`${a}–${b}`) : '';
const party = p => normalize(p).replace(/australian labor party|australian labour party/g,'labor').replace(/liberal party of australia/g,'liberal').replace(/the nationals/g,'nationals').replace(/\bliberal democratic party\b|\bliberal democrats\b/g,'libertarian party');
function add(key, kind, title, href, text, extra={}) {
  if(ids.has(key)) return; ids.add(key);
  const { aliases='', from=year(extra.date), to=year(extra.date), state='', parties=[], speakers=[], topics=[], slug='', ...rest }=extra;
  const record={kind,title,href,snippet:String(text || ''),...rest};
  record.slug=slug||'catalog-'+docs.length; record.resource='';
  docs.push({key, record, meta:[kind,from||0,to||from||0,(Array.isArray(state)?state:[state]).join('|'),parties.map(party).filter(Boolean).join('|'),speakers.map(normalize).filter(Boolean).join('|'),topics.join('|'),rest.chamber||'',rest.date||''],titleTokens:tokens(title+' '+aliases),bodyTokens:tokens(text+' '+kind+' '+({receipt:'donations political funding',donor:'donations political funding',contract:'procurement contracts',grant:'grants funding',pay:'salary salaries paid earn earns earnings remuneration wage income'}[kind]||'')+' '+(rest.source||''))});
  counts[kind]=(counts[kind]||0)+1;
}
// Grant program rows (contract 2026-09-13, section 3): one record per listed program, kind grant.
// The key mirrors the program file name rule in section 1; the slug is stable so the MCP can
// recognise a program row without relying on catalog position.
export function programRecord(jur, row, agencies=[], programs=[row]) {
 if (typeof row?.id !== 'string' || !row.id.trim() || /^(null|undefined)$/i.test(row.id)) return null;
 row=resolveProgram(programs,row.id);
 if (!row) return null;
 const id=row.id, key=row.key || programKey(id), name=String(row.n||id);
 const agency=Number.isInteger(row.ag)?agencies[row.ag]:typeof row.ag==='string'?row.ag:'';
 const cnc=Number(row.cnc)||0, selk=Number(row.selk)||0;
 const clause=selk>0?`; ${Math.round(100*cnc/selk)}% closed non-competitive where recorded`:'';
 const snippet=`${cash(row.t||0)} across ${(row.c||0).toLocaleString('en-AU')} grants to ${(row.r||0).toLocaleString('en-AU')} recipients${agency?', '+agency:''}${clause}`;
 return {
  key:`${jur}:grant-program:${id}`, kind:'grant', title:`${name} (grant program)`,
  href:'/money/grants?'+new URLSearchParams({jur,program:id}), snippet,
  extra:{slug:`grant-program-${jur}-${key}`,record_id:id,aliases:[id,key,agency].filter(Boolean).join(' '),from:year(row.y0),to:year(row.y1),state:jur,source:'Grant program profile',dateLabel:period(row.y0,row.y1)}
 };
}

// Register names include formal given names and APH index typos. Resolve with
// the export's identity/alias index before writing a person-page address.
// Keep jurisdictions separate: Robert Katter is in both federal and QLD registers.
export function interestPerson(register, id, people, names) {
 const key = name => String(name || '').trim().toLowerCase().replaceAll('’', "'");
 const federalId = register.jurisdiction === 'federal' && /^\d+$/.test(id);
 const eligible = people.filter(p => p.states?.includes(register.jurisdiction));
 const consistent = p => !federalId || !p.pid || p.pid === id;
 const exact = eligible.find(p => key(p.name) === key(register.name) && consistent(p));
 if(exact) return exact;
 const aliases = eligible.filter(p => names[key(p.name)] === id && consistent(p));
 const candidates = aliases.length ? aliases : federalId ? eligible.filter(p => p.pid === id) : [];
 // Prefer the full-name profile to a surname-only Hansard print of the same ID.
 return candidates.find(p => p.current && p.name.includes(' '))
   || candidates.find(p => p.name.includes(' ')) || candidates[0] || null;
}

export function interestHref(register, person, speakerNames) {
 const href = person ? personHref(person.name)
   : speakerNames.has(register.name) ? personHref(register.name) : null;
 return href && href !== '/subject/person' ? href : register.source_url;
}

export function personSpeechCount(p) {
 return p.roster_only ? 'Parliamentary service profile; no speech total yet.' : p.speech_count_basis ? 'No exact speech count yet; own-house, in-service speeches only.' : `${p.speeches.toLocaleString()} speeches in the record.`;
}

// Return references stay in the record's source url and the data export; the
// snippet a result shows carries no raw reference text.
const industrySentence=industry=>{const text=String(industry||'').replaceAll('_',' ').trim();return text ? text[0].toUpperCase()+text.slice(1)+'. ' : ''};
export function donorSearchRecord(jur, node) {
 const disclosure=donorDisclosure(node);
 return {key:jur+':'+node.id,kind:'donor',title:disclosure.name,href:disclosure.href,
  snippet:node.kind==='reference' ? node.source_note || '' : `${industrySentence(node.industry)}${cash(node.total||0)} in disclosed political receipts across ${(node.count||0).toLocaleString()} records.`,
  extra:{aliases:[...(node.aliases||[]),...(node.lookup_names||[]),node.abn||''].join(' '),from:node.firstYear,to:node.lastYear,state:jur,source:jur==='federal'?'AEC disclosure records':`${jur.toUpperCase()} disclosure records`,dateLabel:period(node.firstYear,node.lastYear),url:disclosure.returns[0]?.url || null,...(node.source_note?{source_note:node.source_note}:{})}};
}

/** The donor page for an access-register organisation. donorLookup keys by foldDonorName, which keeps
 *  punctuation ("mckinsey & company"), so that key is tried first; the punctuation-stripped key stays as
 *  the fallback so a name that resolved before still does. A name neither key holds has no donor page,
 *  and its row links to where the register entry is shown instead (search-hubs-005: 96 meetings for
 *  names with "&", "(", "-" or "." had no link and opened /doc/catalog-N, a 404). */
export function accessDonorHref(donorNames, name, fallback) {
 const record=donorNames.get(foldDonorName(name)) || donorNames.get(normalize(name));
 return (record && donorDisclosure(record).href) || fallback || null;
}

/** One search record per renamed party: its current name, its former names as aliases, its name history. */
export function renamedPartyRecords(renames=PARTY_RENAMES) {
 return renames.map(r=>({key:'party-rename:'+r.code,title:r.name,href:partyUrl(r.name),snippet:r.history,
  extra:{aliases:r.former.flatMap(f=>[f.name,...(f.aliases||[])]).join(' '),parties:[r.name],source:'Party registers (AEC)',dateLabel:r.since?'Current name since '+r.since.slice(0,4):''}}));
}

async function main() {
 const roster = await read('parliamentarians.json');
 const identity=personIndex(roster.people); peopleIndex=identity; canonicalPeople=identity.slugOf; canonicalAliases=new Map([...identity.addresses].map(([name,p])=>[name,identity.slugOf.get(p.name)]));
 for(const p of roster.people) add('person:'+p.name,'person',p.full||p.name,personHref(p.name),`${p.party_now||p.party||''}. ${(p.states||[]).join(', ')}. ${personSpeechCount(p)}${p.representation?.length?' Recorded representation: '+p.representation.map(r=>`${r.electorate}${r.state?', '+r.state:''}, ${r.jurisdiction}, ${r.chamber}`).join('; ')+'. Roster affiliations may include past seats and do not establish current tenure.':''}`,{aliases:[...new Set([p.name,...(p.aliases||[]),...(Object.hasOwn(PERSON_SEARCH_ALIASES,p.name)?PERSON_SEARCH_ALIASES[p.name]:[])])].join(' '),from:p.first,to:p.last,state:p.states,parties:[p.party_now||p.party||''],speakers:[p.name],source:'Parliamentarian directory',dateLabel:p.speech_scope?'':(p.roster_only?'Recorded service: ':p.speech_count_basis?'Transcript years: ':'')+period(p.first,p.last)});
 const donorRecords=[];
 // One search entry per party page: a party in several money files (federal, QLD, VIC) is one result, its
 // snippet giving each register's figure separately, never summed (money.qld.json meta.not_summed).
 const moneyFiles=[['federal','money.json'],['qld','money.qld.json'],['vic','money.vic.json'],['tas','money.tas.json']];
 const graphs=new Map();
 for(const [jur,file] of moneyFiles) graphs.set(jur,await read('graph/'+file));
 const partyPages=new Map();
 for(const [jur] of moneyFiles) for(const n of graphs.get(jur).nodes.filter(n=>n.kind==='party')) {
  const href='/subject/party/'+personSlug(n.label), source=jur==='federal'?'AEC disclosure records':`${jur.toUpperCase()} disclosure records`;
  const page=partyPages.get(href) || partyPages.set(href,{key:jur+':'+n.id,label:n.label,aliases:new Set(),parts:[],states:[],from:n.firstYear,to:n.lastYear}).get(href);
  for(const a of n.aliases||[]) page.aliases.add(a);
  page.parts.push({jur,source,line:`${cash(n.total||0)} in disclosed political receipts across ${(n.count||0).toLocaleString()} records`});
  page.states.push(jur);
  page.from=Math.min(page.from||n.firstYear,n.firstYear||page.from); page.to=Math.max(page.to||0,n.lastYear||0);
 }
 // Added where its first node stood (the federal one when there is one), so its place among equal scores is unchanged.
 const addPartyPage=page=>{
  const [first]=page.parts, snippet=page.parts.length===1 ? `Parties. ${first.line}.`
   : `Parties. ${page.parts.map(p=>`${p.jur==='federal'?'AEC':p.jur.toUpperCase()}: ${p.line}`).join('; ')}. Each register's figure is its own; they are not added together.`;
  add(page.key,'party',page.label,'/subject/party/'+personSlug(page.label),snippet,{aliases:[...page.aliases].join(' '),from:page.from,to:page.to,state:page.states,parties:[page.label],
   source:page.parts.length===1?first.source:page.parts.map(p=>p.source.replace(' disclosure records','')).join(', ')+' disclosure records',dateLabel:period(page.from,page.to)});
 };
 for(const [jur] of moneyFiles) {
  const graph=graphs.get(jur), byId=new Map(graph.nodes.map(n=>[n.id,n]));
  donorRecords.push(...graph.nodes.filter(n=>n.kind==='donor').map(n=>({...n,jurisdiction:jur})));
  for(const n of graph.nodes.filter(n=>n.kind==='donor'||n.kind==='party')) {
   if(n.kind==='donor'){const r=donorSearchRecord(jur,n);add(r.key,r.kind,r.title,r.href,r.snippet,r.extra);continue;}
   addPartyPage(partyPages.get('/subject/party/'+personSlug(n.label)));  // once: add() keeps the first key
  }
  for(const [i,e] of graph.edges.entries()) {
   const a=byId.get(e.source),b=byId.get(e.target), flow=moneyFlowType(e,byId); if(!a||!b||!flow)continue;
   if(flow!=='receipts') {
    const kind=flow==='contracts'?'contract':'grant';
    add(`${jur}:${flow}-connection:${i}`,kind,`${b.label} — ${kind} connection`,'/money?'+new URLSearchParams({jur,q:b.label,type:flow}),`${cash(e.total)} across ${e.count||0} ${kind} records from ${a.label}. Aggregated map connection; individual notices may also appear separately in search.`,{aliases:[...(b.aliases||[]),b.abn||''].join(' '),from:e.firstYear,to:e.lastYear,state:jur,source:flow==='contracts'?'Public contract map aggregate':'Public grant map aggregate',dateLabel:period(e.firstYear,e.lastYear)});
    continue;
   }
   add(`${jur}:receipt:${i}`,'receipt',`${a.label} → ${b.label}`,'/money?'+new URLSearchParams({jur,q:a.label,party:b.id,type:'receipts'}),`${cash(e.total)} in disclosed political receipts; ${e.count||0} records. Aggregated connection, not an individual gift. ${industrySentence(a.industry)}`.trim(),{aliases:(a.aliases||[]).join(' '),from:e.firstYear,to:e.lastYear,state:jur,parties:[b.label],source:jur==='federal'?'AEC disclosure records':`${jur.toUpperCase()} disclosure records`,dateLabel:period(e.firstYear,e.lastYear)});
  }
 }
 // A renamed party (labels.js PARTY_RENAMES) is one search entry under its current name, found by every
 // former name, at its one page. A party the money map holds already has its entry above.
 for(const r of renamedPartyRecords(PARTY_RENAMES)) if(!ids.has(r.key) && !partyPages.has(r.href)) add(r.key,'party',r.title,r.href,r.snippet,r.extra);
 for(const node of (await read('graph/donor-index.json')).donors || []){const r=donorSearchRecord(node.jurisdiction || 'federal',node);add(r.key,r.kind,r.title,r.href,r.snippet,r.extra);}
 const suppliers=await read('suppliers.json');
 // a supplier with no counted contract (every notice cancelled at source or held for review) keeps its page, not a search entry
 for(const s of suppliers.suppliers) if (s.count > 0) add('supplier:'+s.id,'supplier',s.name,supplierHref(s.id),`${cash(s.total)} in recorded contract awards across ${s.count} contracts and ${s.agency_count} agencies. ABN ${s.abn||'not recorded'}.`,{aliases:(s.aliases||[]).join(' ')+' '+(s.abn||''),from:s.first_year,to:s.last_year,state:'federal',source:'AusTender supplier profile',dateLabel:period(s.first_year,s.last_year)});
 for(const file of await files('suppliers')) for(const s of Object.values((await read('suppliers/'+file)).profiles)) {
  for(const c of s.contracts||[]) add('contract:'+c.id,'contract',`${c.title||c.id} — ${s.name}`,supplierHref(s.id)+'?'+new URLSearchParams({contract:c.id}),`${cash(c.amount)}. ${c.agency}. ${c.id}. ${c.description||''}`,{aliases:`${s.name} ${s.abn||''} ${(s.aliases||[]).join(' ')} ${c.reported_supplier||''} ${c.id}`,date:c.start_date||null,state:'federal',source:'AusTender contract award',url:c.url,record_id:c.id});
 }
 for(const jur of ['federal','qld']) {
  const index=await read(`graph/grants.${jur}.json`);
  for(const p of index.programs||[]){const r=programRecord(jur,p,index.agencies||[],index.programs);if(!r)continue;add(r.key,r.kind,r.title,r.href,r.snippet,r.extra)}
  for(const file of await files('grants/'+jur)) for(const r of Object.values(await read(`grants/${jur}/${file}`))) {
   if (typeof r.id !== 'string' || !r.id.trim() || /^(null|undefined)$/i.test(r.id)) continue;
   const href='/money/grants/'+jur+'/recipient/'+encodeURIComponent(r.id);
   add(`${jur}:grant-recipient:${r.id}`,'grant',r.n,href,`${cash(r.t)} across ${r.c} grant records. ${(r.programs||[]).map(p=>p[0]).join('; ')}. ${(r.agencies||[]).map(a=>a[0]).join('; ')}.`,{aliases:[r.abn||'',...(r.aliases||[])].join(' '),from:year(r.y0),to:year(r.y1),state:jur,source:'Grant recipient profile',dateLabel:period(r.y0,r.y1)});
   for(const g of r.grants||[]) add(`${jur}:grant:${r.id}:${g.id}:${g.fy}`,'grant',`${g.n||g.pr||g.id} — ${r.n}`,href,`${grantValue(g.v)}. ${g.ag||''}. ${g.pr||''}. ${g.cat||''}. ${g.desc||''} ${g.el||''}.`,{aliases:`${r.n} ${r.abn||''} ${g.id}`,date:g.s||null,from:year(g.fy)||year(g.s),to:year(g.fy)||year(g.s),state:jur,source:index.meta.sourceShort,record_id:g.id,dateLabel:g.s?undefined:g.fy,url:g.guid?`https://www.grants.gov.au/Ga/Show/${g.guid}`:index.meta.source_url});
  }
 }
 for(const file of await files('bills')) {
  if(file==='index.json')continue;
  const b=await read('bills/'+file), summary=b.summary;
  add('bill:'+b.key,'bill',b.short_title||b.title,'/bill/'+encodeURIComponent(b.key),[b.status?.replaceAll('_',' '),b.portfolio,summary?.sentences?.join(' '),summary?.affected].filter(Boolean).join('. '),{aliases:[b.title,...(b.aliases||[])].join(' '),date:b.introduced,chamber:b.originating_house,state:b.jurisdiction,parties:[b.sponsor_party||''],speakers:[b.sponsor||''],source:'Bill register',...(summary?{machine:true}:{})});
 }
 const interestIndex = await read('interests/index.json');
 const speakerNames = new Set((await read('speakers.json')).map(([name]) => name));
 for(const file of await files('interests')) {
  if(['index.json','ties-by-donor.json','recent.json'].includes(file))continue;
  const p=await read('interests/'+file);
  const person=interestPerson(p,file.slice(0,-5),roster.people,interestIndex._by_name);
  // Speakers below the directory's floor still have profiles under their exact
  // corpus name. Only names absent from both indexes need the official register.
  const href=interestHref(p,person,speakerNames);
  for(const [category,b] of Object.entries(p.buckets||{})) for(const [i,item] of (b.items||[]).entries()) {
   const date=item.date||p.as_at||p.statement_date||null;
   add(`interest:${file}:${category}:${i}`,'interest',`${p.name} — ${category.replaceAll('_',' ')}`,href,`${item.description}. ${interestHolder(item.holder)||''}. ${item.kind||''}.`,{aliases:person?.name||'',date,chamber:p.chamber,from:year(date),to:year(date),dateLabel:item.date?undefined:(date?'Register as at '+date:undefined),state:p.jurisdiction,speakers:[...new Set([p.name,person?.name].filter(Boolean))],parties:[person?.party_now||person?.party||''],source:'Register of interests',url:p.source_url});
  }
 }
 const recent=await read('interests/recent.json');
 for(const x of recent.items) add('alteration:'+x.id,'interest',`${x.name} — ${x.kind}`, '/declared?'+new URLSearchParams({person:x.name}),x.description,{date:x.date,state:x.jurisdiction,speakers:[x.name],source:'Register alteration',url:x.url});
 // What each parliamentarian is paid for the posts held (docs/DATA-PAY.md). The
 // rows are written by src/pay-records.mjs, which also hands the closest ones to
 // the model when a pay question is too loose for the calculated answer.
 const pay=await read('pay.json');
 for(const row of [...payPersonOrder(pay).map(id=>payPersonRecord(pay,id)).filter(Boolean),...payGeneralRecords(pay)]) add(row.key,row.kind,row.title,row.href,row.snippet,row.extra);
 // What departmental secretaries and statutory office holders are paid, from the
 // Remuneration Tribunal's determinations (scripts/build_pay_offices.py).
 const payOffices=await read('pay-offices.json');
 for(const row of [...payOfficeGeneralRecords(payOffices),...payOffices.offices.map(o=>payOfficeRecord(payOffices,o))]) add(row.key,row.kind,row.title,row.href,row.snippet,row.extra);
 const expenses=await read('expenses.json');
 for(const [id,p] of Object.entries(expenses.people)) add('expenses:'+id,'expense',`${p.name} — parliamentary expenses`,personHref(p.name),`${cash(p.total)} reported expenditure. ${(p.by_category||[]).map(([n,v])=>`${n}: ${cash(v)}`).join('; ')}.`,{speakers:[p.name],state:'federal',from:p.from,to:p.to,source:'Independent Parliamentary Expenses Authority',url:expenses.meta.source_url,dateLabel:period(p.from,p.to)});
 const campaigners=await read('graph/campaigners.json');
 for(const e of campaigners.entities) add('campaigner:'+e.name,'campaigner',e.name,'/subject/campaigner/'+encodeURIComponent(e.name),`${e.kind.replaceAll('_',' ')}. ${(e.return_types||[]).join('; ')}. ${(e.associated_parties||[]).join(', ')}.`,{aliases:e.abn||'',from:year(e.years?.[0]?.[0]),to:year(e.latest_year),state:'federal',parties:e.associated_parties||[],source:'AEC annual returns',dateLabel:e.latest_year});
 const access=await read('access.json'),donorNames=donorLookup(donorRecords);
 for(const [name,d] of Object.entries(access.donors)) {
  // A meeting is shown in the minister's diary on their profile; a lobbying registration only on the donor page.
  for(const [i,m] of (d.meetings||[]).entries()) add(`meeting:${name}:${i}`,'access',`${name} — meeting with ${m.minister}`,accessDonorHref(donorNames,name,personHref(m.minister)),m.purpose||'Recorded ministerial meeting',{date:m.date,state:m.jurisdiction,speakers:[m.minister],source:'Ministerial diary'});
  for(const [i,l] of (d.lobbyists||[]).entries()) add(`lobbyist:${name}:${i}`,'access',`${name} — ${l.firm}`,accessDonorHref(donorNames,name),`Registered lobbying client. ${l.ceased?'Ceased':'Listed'} registration.`,{state:normalize(l.jurisdiction)==='federal'?'federal':normalize(l.jurisdiction),date:l.registered,source:'Lobbyist register'});
 }
 // Every access.json donor is a money-map donor (scripts/export_access.py), so an unlinked row is a lookup fault.
 const unlinked=docs.filter(d=>d.record.kind==='access' && !d.record.href && /^(meeting|lobbyist):/.test(d.key)).length;
 if(unlinked) throw new Error(`${unlinked} access-register search rows have no link (search-hubs-005)`);
 for(const [id,m] of Object.entries(access.ministers)) for(const [i,r] of (m.recent||[]).entries()) add(`minister-meeting:${id}:${i}`,'access',`${m.name} — ${r.org}`,ministerHref(m),r.purpose||'Recorded ministerial meeting',{date:r.date,state:m.jurisdiction,speakers:[m.name],source:'Ministerial diary'});
 const fits=await read('fits.json');
 for(const list of [...Object.values(fits.by_entity),...Object.values(fits.people)]) for(const r of list) add(`fits:${r.registrant}:${r.principal}:${r.from}`,'access',`${r.registrant} — ${r.principal}`,r.url,`${r.country}. ${(r.activities||[]).join('; ')}. ${r.status}.`,{date:r.from,state:'federal',source:'Foreign Influence Transparency Scheme',url:r.url});
 const agencies=await read('agencies.json');
 const mlci=await read('research/mlci.json');
 // The Major and Local Community Infrastructure Program's invited projects and the
 // published seat-type comparison live in its program view on Money -> Grants, whatever
 // REPORTS_ENABLED says. An invitation to apply is not an award or a payment.
 const mlciHref='/money/grants?'+new URLSearchParams({jur:'federal',program:'GO7867'});
 for(const p of mlci.projects.filter(p=>p.status!=='Withdrawn'))
  add(p.id,'grant',`${p.title} (invited project, not awarded)`,mlciHref,`Invited to apply, not awarded: ${cash(p.value)} invitation allocation. ${p.status}. ${p.lga}, ${p.state}. Major and Local Community Infrastructure Program (GO7867). Not a grant award or payment.`,{date:mlci.invitation_snapshot,state:'federal',source:'Departmental list of invited projects',url:p.source_url,record_id:p.id});
 add('research-cpi-mlci-2026','grant','Public money, political advantage? (Centre for Public Integrity)',mlciHref,'The Centre for Public Integrity\'s published comparison of Major and Local Community Infrastructure Program invitation value by seat type, against a share proportional to seat numbers (Table 3), as published and not reproduced by OPAX. '+mlci.cpi_comparison.map(r=>`${r.name}: ${cash(r.actual)} invited; ${cash(r.expected)} proportional`).join('; ')+'.',{date:'2026-09-08',state:'federal',source:'Centre for Public Integrity',url:mlci.sources.cpi,record_id:'research-cpi-mlci-2026'});
 add('mlci-program-coverage','grant','Major and Local Community Infrastructure Program: invited projects and awards',mlciHref,`${mlci.projects.filter(p=>p.status!=='Withdrawn').length} active invitations total $559,241,712 at 14 November 2025; separately, ${mlci.awards.length} published awards total ${cash(mlci.awards.reduce((s,p)=>s+p.value,0))} on record at ${mlci.as_of}. Invitations are not awards or payments; do not add totals. `+Object.entries({NSW:'New South Wales',VIC:'Victoria',QLD:'Queensland',WA:'Western Australia',SA:'South Australia',TAS:'Tasmania',NT:'Northern Territory',ACT:'Australian Capital Territory'}).map(([state,name])=>`${name}: ${cash(mlci.projects.filter(p=>p.status!=='Withdrawn'&&p.state===state).reduce((sum,p)=>sum+p.value,0))} in active invitations.`).join(' '),{date:mlci.as_of,state:'federal',source:'Departmental invitation list and GrantConnect snapshot',url:mlci.sources.department});
 // The reports and the seat baselines that only the grants-allocation page showed
 // are searchable only while the reports are published (REPORTS_ENABLED in
 // portal/wrangler.jsonc).
 if(reportsPublished()) {
  for(const file of await files('reports')) {
   if(file==='index.json')continue;const r=await read('reports/'+file);
   add('report:'+r.slug,'report',r.title,'/reports/'+r.slug,r.blurb,{date:r.generated_at?.slice(0,10),source:'OPAX research report'});
  }
  for(const s of mlci.seats) add('aec-seat:'+s.name,'report',`${s.name} — 2025 seat baseline`,'/reports/grants-allocation?'+new URLSearchParams({seat:s.name}),`${s.state}. ${s.party}. ${s.margin.toFixed(2)} percentage-point margin. ${{M:'Marginal',FS:'Fairly safe',S:'Safe'}[s.status]}. AEC notional baseline before the 2025 election, not the election result or current incumbent.`,{date:'2025-05-03',state:'federal',source:'AEC pre-election seat status',url:mlci.sources.aec+'#page='+s.page});
 }
 for(const a of agencies.agencies) if (a.count > 0) add('agency:'+a.id,'agency',a.name,'/subject/agency/'+encodeURIComponent(a.id),`${cash(a.total)} in recorded awards across ${a.count} contracts and ${a.supplier_count} suppliers.`,{from:a.first_year,to:a.last_year,state:'federal',source:'AusTender agency profile',dateLabel:period(a.first_year,a.last_year)});
 // A few hundred title/metadata rows add under 1% to the existing catalogue.
 // Recommendation bodies are not name-indexed; no person entities are created.
 const audit = await read('audit/manifest.json').catch(e => { if(e.code==='ENOENT') return null; throw e; });
 if(auditComplete(audit)) {
  const index = await read('audit/index.json');
  if(index.records.length !== audit.count) throw new Error('Unreconciled audit search index');
  for(const r of index.records) add('audit:'+r.id,'audit report',r.title,'/audit/'+r.id,
   `${r.report_label}. Tabled date: ${r.tabled_date}. ${[...r.sectors,...r.entities].join('; ')}.`,
   {date:r.tabled_date,state:'qld',source:'Queensland Audit Office',url:r.canonical_url,record_id:r.id});
 }
 const readConfig = async name => JSON.parse(await readFile(new URL('./hubs/'+name,import.meta.url),'utf8'));
 for await (const r of pageSearchRecords(read,readConfig)) add(r.key,r.kind,r.title,r.href,r.snippet,r.extra);
 // Append official reports after existing records: their IDs and tie order stay stable.
 // Detail JSON is projected offline, not parsed from every dataset by a request.
 const reportNames=Object.create(null);
 for(const {row,aliases,state,year} of await buildReportCatalog(root)) {
  const id=docs.length;
  add('official-report:'+row.slug,'report',row.title,row.href,row.snippet,
   {...row,aliases:aliases.join(' '),state,from:year,to:year});
  for(const name of [row.title,...aliases.filter(a=>typeof a==='string' && !/^\d/.test(a))]) {
   const key=tokens(name).sort().join(' ');
   if(key && !(reportNames[key]||[]).includes(id))(reportNames[key]??=[]).push(id);
  }
 }
 // Rebuild postings from sanitised document tokens; block contained aliases before
 // both release hashing and writing; unrelated record IDs stay intact.
 const meta=docs.map(d=>d.meta), postings=Array.from({length:64},()=>Object.create(null));
 for(const [id,d] of docs.entries()) {
  const weights=new Map(d.bodyTokens.map(t=>[t,1])); for(const t of d.titleTokens)weights.set(t,8);
  for(const [term,weight] of weights){const p=postings[bucket(term)];(p[term]??=[]).push(id,weight);}
 }
 const publicPaths=recordPathIndex(docs.map(d=>d.key.includes(':grant-recipient:')?{...d.record,owner:true}:d.record));
 // Never derive correction names from donors, witnesses, suppliers or declarations.
 const recoveryNames=docs.filter(d=>d.key.startsWith('person:') || ['bill','electorate'].includes(d.record.kind)).map(d=>({
  kind:d.record.kind,label:d.key.startsWith('person:')?d.key.slice(7):d.record.title,href:d.record.href,
  ...(d.key.startsWith('person:')?{aliases:[d.record.title,...(Object.hasOwn(PERSON_SEARCH_ALIASES,d.key.slice(7))?PERSON_SEARCH_ALIASES[d.key.slice(7)]:[])]}:{}),
 }));
 const version=createHash('sha256').update(JSON.stringify([docs.map(d=>[d.record,d.meta,d.titleTokens,d.bodyTokens]),publicPaths,reportNames,recoveryNames])).digest('hex').slice(0,16);
 const output=join(root,'search-catalog'); await mkdir(output,{recursive:true});
 // This directory contains generated search assets only.
 for(const name of await readdir(output))await rm(join(output,name),{recursive:true,force:true});
 await mkdir(join(output,version));
 const put=async(name,data)=>writeFile(join(output,version,name),JSON.stringify(data));
 await put('meta.json',meta);
 await put('report-names.json',reportNames);
 await put('recovery-names.json',recoveryNames);
 // An unfiltered search needs only each record's kind and closing year (portal/src/catalog-search.ts).
 const kinds=[...new Set(meta.map(m=>m[0]))], kindIndex=new Map(kinds.map((k,i)=>[k,i]));
 await put('meta-core.json',{kinds,kind:meta.map(m=>kindIndex.get(m[0])),to:meta.map(m=>m[2])});
 // Each record's date as YYYYMMDD (0: none; -1: a value the number cannot hold), so a page of
 // results can be ordered and counted by year before its records are read (searchCatalogPaged).
 const dateNumber=date=>{if(!date)return 0;const n=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?Number(date.replaceAll('-','')):-1;return n>=10000101?n:-1};
 await put('dates.json',docs.map(d=>dateNumber(d.record.date)));
 for(let i=0;i<64;i++)await put('terms-'+i+'.json',postings[i]);
 for(let i=0;i<docs.length;i+=256)await put('records-'+Math.floor(i/256)+'.json',docs.slice(i,i+256).map(d=>d.record));
 // /support names a reported record only when its path is exactly one of these (portal/public/record-paths.js).
 // A grant recipient's own record owns its page; the award records only link to it.
 // Support reports use the same canonical addresses as search links.
 for(const [i,shard]of publicPaths.entries())await put('paths-'+i+'.json',shard);
 const manifest={version,count:docs.length,counts,recordShardSize:256,reportNames:true,coverage:'Searches the records and profiles published on OPAX. Map connections, expense totals and recipient profiles are aggregates and may overlap individual records. Published grant and interest detail exports are samples of their source registers; document search returns a ranked retrieval window.'};
 await writeFile(join(output,'manifest.json'),JSON.stringify(manifest));
 console.log(JSON.stringify(manifest,null,2));
}
// Importing this module (tests) must not rebuild the catalog; only a direct run does.
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
