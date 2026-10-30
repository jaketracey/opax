// Search uses the same metadata and publication checks as the pages themselves.
// No held document body, inferred person, or external-only profile is indexed.
import '../portal/public/navigation.js';
import { readFileSync } from 'node:fs';
import ts from '../portal/node_modules/typescript/lib/typescript.js';
import { TOPIC_NAMES } from '../portal/src/topic-names.mjs';
import { catalogueComplete } from '../portal/public/instruments.js';
import { clearedStateBills } from '../portal/src/state-bills.ts';
import { vicElectionEnabled } from '../portal/public/vic-election.js';
import { reportsPublished } from './reports_flag.mjs';
import { clearedTaxExpenditures } from '../portal/src/tax-expenditures.ts';
import { clearedGovernmentFinance } from '../portal/src/government-finance.ts';
import { clearedGovernmentFunctions } from '../portal/src/government-finance-functions.ts';
import { clearedAdvertising } from '../portal/src/gov-advertising.ts';
import { clearedAggregates } from '../portal/src/budget.ts';
import { clearedSABudget } from '../portal/src/sa-budget.ts';
import { clearedGiftRegisters } from '../portal/src/vic-gifts.ts';
import { saGrantsRows } from '../portal/src/sa-grants.ts';

const jurisdictions = { federal:'Federal', nsw:'New South Wales', vic:'Victoria', qld:'Queensland', sa:'South Australia', wa:'Western Australia', tas:'Tasmania', nt:'Northern Territory', act:'Australian Capital Territory' };
const houseName = house => ({representatives:'House of Representatives',senate:'Senate'}[house] || String(house || '').replaceAll('_',' '));
const optional = async (read, path) => read(path).catch(error => { if(error.code === 'ENOENT') return null; throw error; });
const productionConfig = () => ts.parseConfigFileTextToJson('wrangler.jsonc',readFileSync(new URL('../portal/wrangler.jsonc',import.meta.url),'utf8')).config;
export async function* pageSearchRecords(read, readConfig, {reports = reportsPublished(), vicElection = vicElectionEnabled(productionConfig().vars?.VIC_ELECTION_HUB_ENABLED)} = {}) {
 const record = (key,kind,title,href,snippet='',extra={}) => ({key,kind,title,href,snippet,extra:{source:'OPAX published pages',...extra}});
 for(const [slug,title] of Object.entries(TOPIC_NAMES)) yield record('topic:'+slug,'topic',title,'/subject/topic/'+slug,'Parliamentary debate by topic.',{topics:[slug]});
 const electorateManifest = await optional(read,'electorates/manifest.json');
 if(electorateManifest?.index_url) {
  const index = await read(electorateManifest.index_url.replace(/^\//,''));
  for(const e of index.electorates) yield record('electorate:'+e.electorate_id,'electorate',e.name,e.url,
   `${jurisdictions[e.jurisdiction] || e.jurisdiction} electorate. ${e.status}. Representatives, election timelines and Census context where published.`,
   {aliases:[e.slug,e.state_code,jurisdictions[e.jurisdiction],...(e.representatives||[]).map(p=>p.name)].filter(Boolean).join(' '),state:e.jurisdiction,source:'Electorate reference directory'});
 }
 const instruments = await optional(read,'instruments/manifest.json');
 const instrumentsReady = catalogueComplete(instruments);
 if(instrumentsReady) {
  const index = await read('instruments/index.json');
  if(index.records.length !== (instruments.exported ?? instruments.count)) throw Error('Unreconciled instrument search index');
  for(const [id,title,portfolios,type,commenced,status] of index.records) yield record('instrument:'+id,'instrument',title,'/instrument/'+id,
   `${type}. ${status}. ${portfolios.join('; ')}. Metadata only; read legal text and versions at the Federal Register of Legislation.`,
   {aliases:id,date:commenced || null,state:'federal',source:'Federal Register of Legislation',record_id:id,url:'https://www.legislation.gov.au/'+id});
 }
 for(const jurisdiction of ['tas','act']) {
  const hub = await optional(read,`bills-${jurisdiction}/data.json`);
  for(const b of hub ? clearedStateBills(hub) : []) yield record('state-bill:'+b.key,'bill',b.title,'/register/state-bills?'+new URLSearchParams({bill:b.key}),
   `${jurisdictions[jurisdiction]}. ${b.status.replaceAll('_',' ')}. Sponsor as published: ${b.sponsor_name || 'Not supplied'}. Registry metadata only.`,
   {aliases:[b.key,b.source_id,b.sponsor_name].filter(Boolean).join(' '),state:jurisdiction,date:b.introduced_date,source:jurisdiction==='tas'?'Parliament of Tasmania':'ACT Legislative Assembly',record_id:b.key,url:b.source_url});
 }
 const divisions = await optional(read,'divisions/index.json');
 for(const row of divisions?.divisions || []) {
  const d = await read('divisions/'+row.slug+'.json');
  yield record('division:'+d.key,'division',d.title || d.name || d.question || 'Parliamentary division','/doc/'+d.slug,
   `${houseName(d.house)}. ${d.question || ''} Result: ${d.result || 'Not recorded'}. Recorded ayes: ${d.ayes ?? 'Not recorded'}; noes: ${d.noes ?? 'Not recorded'}.`,
   {aliases:[d.key,...(d.bills || []).map(b=>b.title)].filter(Boolean).join(' '),date:d.date,state:d.jurisdiction,source:'Parliamentary division record',record_id:d.key,url:d.source_url});
 }
 const calendar = await readConfig('sitting-2026.json');
 for(const w of calendar.periods) yield record('sitting:'+w.start,'sitting',`Sitting week ${w.start} to ${w.end}`,'/sitting/'+w.start,
  `${w.houses.map(houseName).join('; ')}. Bills introduced and recorded divisions during this sitting period.`,{date:w.start,state:'federal',aliases:w.houses.map(houseName).join(' '),source:'Parliamentary sitting calendar'});
 const estimates = await readConfig('estimates-2026-10.json');
 yield record('estimates:'+estimates.id,'estimates',estimates.name,'/estimates/'+estimates.id,
  `${estimates.start} to ${estimates.end}. ${estimates.published_status}. Portfolio agencies and recorded awards; portfolio lists do not establish confirmed appearances.`,{date:estimates.start,state:'federal',source:'Senate estimates',url:estimates.source_url});
 for(const c of estimates.committees) yield record('estimates:'+estimates.id+':'+c.id,'estimates',c.name+' — Senate estimates','/estimates/'+estimates.id+'#group-'+c.group,
  `${estimates.name}. ${(c.portfolios || []).map(p=>p.name).join('; ')}. ${estimates.published_status}.`,{date:estimates.start,state:'federal',source:'Senate estimates',aliases:'committee hearing '+c.name,url:estimates.source_url});
 const video = await optional(read,'video/senate.json');
 for(const v of video?.videos || []) yield record('video:'+v.id,'video',v.title,'/video/senate?'+new URLSearchParams({kind:v.kind === 'first_speech' ? 'first-speech' : v.kind === 'question_time' ? 'question-time' : 'other'})+'#'+(v.kind==='other'?'other-video':'m'+String(v.date || v.published).slice(0,7)),
  'Official Senate video. Find the dated video in the archive or open the original recording.',{aliases:v.person?.name || '',date:v.date,state:'federal',source:'AuSenate YouTube channel',url:v.url,record_id:v.id});
 // Financial registers expose only rows that pass their existing publication
 // boundary. Search indexes the same checked facts; it does not infer entities.
 const tax = await optional(read,'tax-expenditures/data.json');
 for(const r of tax ? clearedTaxExpenditures(tax) : []) yield record(`tax:${r.item_id}:${r.measure_year}`,'register',`${r.item_id}: ${r.title} — ${r.measure_year}`,'/register/tax-expenditures?'+new URLSearchParams({'tax.q':r.item_id,'tax.f.measure_year':r.measure_year}),`${r.category}. Revenue forgone estimate. ${r.estimate_status}.`,{state:'federal',from:Number(r.measure_year.slice(0,4)),aliases:r.benchmark,source:'Treasury tax expenditures',url:r.source_url,record_id:r.item_id});
 const finance = await optional(read,'government-finance/data.json');
 for(const [i,r] of (finance ? [...clearedGovernmentFinance(finance),...clearedGovernmentFunctions(finance)] : []).entries()) yield record('gfs:'+i,'register',`${r.jurisdiction}: ${r.function_as_published || r.measure_as_published || r.measure.replaceAll('_',' ')} — ${r.reference_year}`,'/register/government-finance?'+new URLSearchParams({[(r.function_as_published?'gfsFunction':'gfs')+'.q']:r.function_as_published || r.measure_as_published || r.measure,jurisdiction:r.jurisdiction}),`${r.level_of_government}. ${r.sector}. ${r.function_as_published || ''}. ${r.unit}. ${r.prices_basis}.`,{aliases:r.measure_as_published || r.function_as_published || '',from:Number(r.reference_year.slice(0,4)),source:'Australian Bureau of Statistics',url:r.source_url});
 const advertising = await optional(read,'gov-advertising/data.json');
 for(const r of advertising ? clearedAdvertising(advertising) : []) yield record('advertising:'+r.id,'register',`${r.campaign} — ${r.entity}`,'/register/gov-advertising?'+new URLSearchParams({'advertising.q':r.campaign}),`${r.financial_year}. ${r.basis}. ${r.measure}.`,{from:Number(r.financial_year?.slice(0,4)),source:'Government advertising expenditure',url:r.source_url});
 const budget = await optional(read,'budget/data.json');
 for(const [i,r] of (budget ? clearedAggregates(budget) : []).entries()) yield record('budget:'+i,'register',`${r.metric.replaceAll('_',' ')} — ${r.fiscal_year} (${r.release})`,'/budget?'+new URLSearchParams({year:r.fiscal_year,metric:r.metric}),`${r.status}. ${r.paper}. ${r.vintage}. ${r.unit}.`,{from:Number(r.fiscal_year.slice(0,4)),state:'federal',source:'Federal Budget papers',url:r.source_url});
 const saBudget = await optional(read,'sa-budget/data.json');
 for(const [i,r] of (saBudget ? clearedSABudget(saBudget) : []).entries()) yield record('sa-budget:'+i,'register',`${r.measure_as_published} — ${r.fiscal_year}`,'/budget#sa-budget',`South Australian budget. ${r.section_as_published}. ${r.estimate_or_actual}. ${r.units}.`,{from:Number(r.fiscal_year.slice(0,4)),state:'sa',source:'South Australian budget',url:r.source_url});
 const gifts = await optional(read,'vic-gifts/data.json');
 for(const reg of gifts ? clearedGiftRegisters(gifts) : []) for(const r of reg.rows) yield record('gift:'+r.id,'register',`${r.office_holder} — ministerial gift register`,'/register/vic-gifts?'+new URLSearchParams({'vicGifts.q':r.office_holder}),`${r.period}. ${r.description || ''}. ${r.giver || ''}. ${r.portfolio || ''}.`,{state:'vic',source:'Victorian ministerial gift register',url:r.source_url});
 const saGrants = await optional(read,'sa-grants/data.json');
 for(const r of saGrants ? saGrantsRows(saGrants) : []) yield record('sa-grant:'+r.id,'grant',`${r.project_title} — ${r.recipient}`,'/register/sa-grants?'+new URLSearchParams({['sa'+r.resource_id.slice(0,8)+'.q']:r.project_title})+'#sa-grants-'+r.resource_id,`${r.programme}. ${r.project_description}. ${r.region}. ${r.year}.`,{state:'sa',from:Number(r.year.slice(0,4)),source:'South Australian grant disclosures',url:r.source_url});
 const gates = {instruments:instrumentsReady,estimates:true,reports,'vic-election':vicElectionEnabled(vicElection ? 'true' : 'false')};
 const nav = globalThis.OpaxNavigation;
 const seen = new Set();
 const pages = [...nav.groups.flatMap(g=>g.columns.flatMap(c=>[...(c.section?[c.section]:[]),...c.links])),...nav.footerOnly,
  {href:'/ask?view=search&kind=speech',label:'Speeches and committee hearings',blurb:'Search Hansard speeches, hearings and written answers across the published parliamentary record.'},
  {href:'/ask?view=search&kind=press_release',label:'Government transcripts and releases',blurb:'Search published government press releases, transcripts and statements.'},
  {href:'/budget',label:'Federal budget papers',blurb:'Budget Papers, MYEFO, estimates, projections and reported actuals.'},
  {href:'/register/vic-gifts',label:'Victorian ministerial gifts',blurb:'Ministerial gifts, benefits and hospitality registers.'},
  {href:'/register/sa-grants',label:'South Australian grants',blurb:'Published grant disclosures from South Australian agencies.'},
  ...Object.entries(nav.tools).map(([game,label])=>({href:'/explore?game='+game,label,blurb:'Interactive tool using the published OPAX record.'}))];
 for(const p of pages) {
  if(seen.has(p.href) || p.record || p.gate && !gates[p.gate]) continue;
  seen.add(p.href);
  yield record('page:'+p.href,'page',p.label,p.href,p.blurb || 'Browse this OPAX collection.',{aliases:p.href==='/subject/person'?'salaries salary remuneration pay expenses MPs senators':p.href==='/estimates'?'committees committee hearings written questions answers':''});
 }
}
