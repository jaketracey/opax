import {PERSON_PATHS} from '../public/person-paths.js'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
type Receipt={source_url:string;snapshot:string;sha256:string}
type Licence={status:string;name:string;policy_url:string;policy_receipt:Receipt;text_allowed:boolean;hold_reason:string}
type Event=Receipt & {stage:string;date:string;house:string|null}
export type StateBill=Receipt & {key:string;jurisdiction:'tas'|'act';source_id:string;title:string;parliament:number|null;sponsor_name:string|null;
  introduced_date:string|null;introduction_basis:string;status:string;status_as_of:string;source_updated_date:string|null;stage:string|null;last_action:Event|null;
  events:Event[];sources:{kind:string;label:string;url:string;document_date:string|null;body_status:string}[];licence:Licence;
  official:{name:string;href:string}|null;source_notes?:string[];metadata_receipts?:Receipt[];version_index_missing?:boolean}
export type StateBillsHub={schema:number;jurisdiction:'tas'|'act';generated_at:string;scope:string;licence:Licence;bills:StateBill[]}
export type StateBillsRead=(jurisdiction:'tas'|'act')=>Promise<StateBillsHub>
const origins={tas:'https://www.parliament.tas.gov.au',act:'https://www.parliament.act.gov.au'}
const names={tas:'Tasmania',act:'ACT'}
const statuses:Record<string,string>={before_parliament:'Before Parliament',passed:'Passed',assented:'Royal assent',lapsed:'Lapsed',withdrawn:'Discharged / withdrawn',negatived:'Negatived',unknown:'Status not established'}
const sha=(v:string)=>/^[a-f0-9]{64}$/.test(v)
const source=(r:Receipt,j:'tas'|'act')=>typeof r?.source_url==='string' && r.source_url.startsWith(origins[j]+'/') && sha(r.sha256) && Boolean(r.snapshot)
const normal=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase()
const safeLink=(s:string)=>/^https?:\/\/(?:www\.)?(?:parliament\.(?:tas|act)\.gov\.au|legislation\.act\.gov\.au|hansard\.act\.gov\.au)\//.test(s)
export const stateBillsReader=(assets:Fetcher):StateBillsRead=>async j=>{
  const response=await assets.fetch(new Request(`https://opax.com.au/bills-${j}/data.json`))
  if(!response.ok)throw Error('Registry unavailable')
  return response.json() as Promise<StateBillsHub>
}
/** Metadata-only serving boundary: document bodies and extra fields never render. */
export function clearedStateBills(h:StateBillsHub):StateBill[]{
  if(h.schema!==1 || !['tas','act'].includes(h.jurisdiction) || !Array.isArray(h.bills))return []
  const j=h.jurisdiction,policy=j==='tas'?origins[j]+'/':origins[j]+'/functions/footer/reuse-policy'
  return h.bills.filter(b=>b?.jurisdiction===j && new RegExp(`^au-${j}-[a-z0-9-]+$`).test(b.key) && typeof b.title==='string'
    && source(b,j) && b.licence?.status==='metadata-only' && b.licence.text_allowed===false && b.licence.policy_url===policy && source(b.licence.policy_receipt,j)
    && Array.isArray(b.events) && Array.isArray(b.sources) && b.events.every(e=>source(e,j) && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    && b.sources.every(d=>d.body_status==='held' && safeLink(d.url))
    && Object.hasOwn(statuses,b.status)).map(b=>({...b,official:b.official && normal(b.sponsor_name||'')===normal(b.official.name) && PERSON_PATHS.exact[b.official.name]===b.official.href?b.official:null}))
}
const receipt=(r:Receipt,licence:Licence,label='Original registry')=>`<p class="state-bills-receipt"><a href="${esc(r.source_url)}">${esc(label)}</a> · Snapshot ${esc(r.snapshot)} · <a href="${esc(licence.policy_url)}">${esc(licence.name)}</a><br><span>SHA-256 ${esc(r.sha256)}</span></p>`
const sponsor=(b:StateBill)=>b.official?`<a href="${esc(b.official.href)}">${esc(b.sponsor_name)}</a>`:esc(b.sponsor_name||'Not published in matched source')
const dateLabel=(d:string|null)=>d||'Not published'
function billHTML(b:StateBill,detail=false){
  const events=detail?`<h3>Published stages</h3>${b.events.length?`<ol class="state-bills-events">${b.events.map(e=>`<li><time>${esc(e.date)}</time> · ${esc(e.stage)}${e.house?' · '+esc(e.house):''}</li>`).join('')}</ol>`:'<p>No dated stages published in the matched register.</p>'}`:''
  const documents=detail?`<h3>Versions and explanatory material</h3><p>Read these materials at the publisher. ${esc(b.licence.hold_reason)}.</p>${b.sources.length?`<ul>${b.sources.map(d=>`<li><a href="${esc(d.url)}">${esc(d.label)}</a> <span>· ${esc(d.kind)} · ${d.document_date?esc(d.document_date):'Version date not published'}</span></li>`).join('')}</ul>`:'<p>No document links in the matched version index.</p>'}`:''
  return `<article class="state-bill"><p class="state-bills-kicker">${names[b.jurisdiction]} · ${b.parliament?`${b.jurisdiction==='act'?'Assembly':'Parliament'} ${b.parliament}`:'Parliament not published'} · ${esc(b.source_id)}</p><h2>${detail?esc(b.title):`<a href="/register/state-bills?bill=${esc(b.key)}">${esc(b.title)}</a>`}</h2><p class="state-bills-status">${esc(statuses[b.status])} <span>· ${b.jurisdiction==='act'?'Status list dated':'Observed'} ${esc(b.status_as_of)}</span></p><dl><div><dt>Introduced</dt><dd>${esc(dateLabel(b.introduced_date))}</dd></div><div><dt>Sponsor as published</dt><dd>${sponsor(b)}</dd></div><div><dt>Last dated action</dt><dd>${b.last_action?`${esc(b.last_action.date)} · ${esc(b.last_action.stage)}${b.last_action.house?' · '+esc(b.last_action.house):''}`:'Not published'}</dd></div></dl>${detail?`<p>${esc(b.introduction_basis)}. Source-page update: ${esc(dateLabel(b.source_updated_date))}.</p>`:''}${(b.source_notes||[]).map(note=>`<p class="state-bills-note">${esc(note)}</p>`).join('')}${b.version_index_missing?'<p class="state-bills-note">This bill is in the status list but absent from the matched version index.</p>':''}${events}${documents}${receipt(b,b.licence)}${b.metadata_receipts?.length?`<details><summary>Metadata sources</summary>${b.metadata_receipts.map(r=>receipt(r,b.licence,'Metadata component')).join('')}</details>`:''}</article>`
}
export async function stateBillsPage(url:URL,read:StateBillsRead,block:(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string){
  const error=(status:number,title:string,description:string)=>({status,title:title+' · OPAX',description,noindex:true,prerender:block(title,description,`<p><a href="${origins.tas}/bills">Tasmania originals</a> · <a href="${origins.act}/parliamentary-business/in-the-chamber/bills">ACT originals</a></p>` )})
  const allowed=new Set(['jurisdiction','parliament','q','page','bill'])
  if([...url.searchParams.keys()].some(k=>!allowed.has(k)||url.searchParams.getAll(k).length!==1))return error(400,'Invalid register filter','Choose one value for each register filter.')
  const jur=url.searchParams.get('jurisdiction'),parliament=url.searchParams.get('parliament'),q=url.searchParams.get('q')||'',pageRaw=url.searchParams.get('page')||'1',id=url.searchParams.get('bill')
  if(jur && !['tas','act'].includes(jur) || parliament && !/^\d{1,2}$/.test(parliament) || q.length>200 || !/^[1-9]\d{0,4}$/.test(pageRaw) || id && !/^au-(?:tas|act)-[a-z0-9-]+$/.test(id))return error(400,'Invalid register filter','Choose a valid jurisdiction, Parliament or page.')
  const results=await Promise.allSettled([read('tas'),read('act')])
  const hubs=results.flatMap(r=>r.status==='fulfilled' && clearedStateBills(r.value).length?[r.value]:[])
  if(!hubs.length || jur && !hubs.some(h=>h.jurisdiction===jur) || id && !hubs.some(h=>id.startsWith('au-'+h.jurisdiction+'-')))return error(503,'State bills register unavailable','The reviewed registry snapshot is unavailable.')
  const all=hubs.flatMap(clearedStateBills).sort((a,b)=>(b.introduced_date||'').localeCompare(a.introduced_date||'')||a.key.localeCompare(b.key))
  if(id){
    const b=all.find(b=>b.key===id)
    if(!b)return error(404,'Bill not found','This bill is not in the reviewed state registry snapshot.')
    return {status:200,title:b.title+' · OPAX',description:`${names[b.jurisdiction]} bill metadata, published stages and original document links.`,noindex:true,
      prerender:block(b.title,'Published bill metadata and original document links.',`<p><a href="/register/state-bills">All state bills</a></p>`,[{label:'State bills',href:'/register/state-bills'},{label:b.title}])+`<div class="wrap state-bills-content">${billHTML(b,true)}</div>`}
  }
  const selected=all.filter(b=>(!jur||b.jurisdiction===jur)&&(!parliament||String(b.parliament)===parliament)&&(!q||[b.title,b.source_id,b.sponsor_name||''].join(' ').toLowerCase().includes(q.toLowerCase())))
  const page=Number(pageRaw),pages=Math.max(1,Math.ceil(selected.length/20))
  if(page>pages)return error(404,'Register page not found','Choose an available page in the state bills register.')
  const options=[...new Set(all.filter(b=>!jur||b.jurisdiction===jur).map(b=>b.parliament).filter(Boolean))].sort((a,b)=>Number(b)-Number(a))
  const description=`${all.length} registry entries from Tasmania and ACT, with published dates, stages and original document links.`
  const href=(p:number)=>{const u=new URL(url);u.searchParams.set('page',String(p));return esc(u.pathname+u.search)}
  const licences=hubs.map(h=>`<p class="state-bills-receipt">${names[h.jurisdiction]} · Snapshot ${esc(h.generated_at)} · <a href="${esc(h.licence.policy_url)}">${esc(h.licence.name)}</a><br>${esc(h.scope)}</p>`).join('')
  return {status:200,title:'State bills · OPAX',description,noindex:Boolean(url.search),
    prerender:block('State bills',description,`<p><a href="/bills">Federal bills</a></p>`,[{label:'State bills'}])+`<div class="wrap state-bills-content">${hubs.length<2?'<p>One jurisdiction is unavailable in this snapshot.</p>':''}<form class="state-bills-filters" method="get" action="/register/state-bills"><label>Jurisdiction<select name="jurisdiction"><option value="">Both</option>${(['tas','act'] as const).map(j=>`<option value="${j}"${jur===j?' selected':''}>${names[j]}</option>`).join('')}</select></label><label>Parliament / Assembly<select name="parliament"><option value="">All</option>${options.map(p=>`<option${String(p)===parliament?' selected':''}>${p}</option>`).join('')}</select></label><label>Search bill title or sponsor<input name="q" value="${esc(q)}" maxlength="200" type="search"></label><button type="submit">Filter bills</button></form><p>${selected.length} matching entries · Page ${page} of ${pages}. Dates reflect the source snapshot; bills passed by Parliament are distinct from royal assent or commencement.</p>${licences}<section aria-label="Bill entries">${selected.slice((page-1)*20,page*20).map(b=>billHTML(b)).join('')||'<p>No bills match these filters.</p>'}</section><nav class="state-bills-pages" aria-label="Register pages">${page>1?`<a href="${href(page-1)}">Previous</a>`:''}${page<pages?`<a href="${href(page+1)}">Next</a>`:''}</nav><section><h2>Source and reuse</h2><p>This register reproduces public registry facts and links to original versions. Bill text, explanatory material and source summaries are held pending applicable document rights. Sponsor links require an exact roster-name match within the jurisdiction.</p>${licences}</section></div>`}
}
