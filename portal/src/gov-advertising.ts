import {applyQuery,guardTableURL,formatCell,type Row} from '../public/datatable.js'
import {govAdvertisingTableConfig,registerTableHTML} from '../public/register-tables.js'
import sourceStatus from './gov-advertising-status.json'
import privacyPolicy from './gov-advertising-privacy.json'

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const hash=(v:unknown)=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v)
const finance=(v:unknown)=>typeof v==='string' && /^https:\/\/www\.finance\.gov\.au\/[^\s<>"']+$/.test(v)
const amount=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>=0
const money=(cents:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100)
type Receipt={status:number;sha256:string;snapshot:string;robots_allowed:boolean;challenge:boolean}
type Licence={status:string;name:string;url:string;policy_url:string;reviewed:boolean;scope_sha256:string;terms:string;exceptions_reviewed:boolean;attribution?:string;receipt:{status:number;sha256:string;snapshot:string}}
type Document={id:string;jurisdiction?:string;financial_year:string;url:string;sha256:string;basis:string;measure:string;licence:Licence;receipt:Receipt}
type Campaign={id:string;financial_year:string;entity:string;campaign:string;total_cents:number|null;categories_cents:Record<string,number|null>;basis:string;measure:string;source_url:string;source_locator:string;snapshot:string;sha256:string;table_sha256:string;licence:Licence;document_id?:string;table_id?:string;jurisdiction?:string;record_kind?:string;category?:string|null;media_type?:string|null;unit?:string;source_value?:string;campaign_period?:string;period_note?:string;table_heading?:string;report_year?:string|null;supplier?:string;supplier_kind?:string}
type Reconciliation={status:string;financial_year:string;rows:number;sum_cents:number;report_total_cents:number;difference_cents:number;tolerance_cents:number;source_locator:string;rounding_note?:string}
export type AdvertisingHub={schema:number;generated_at:string;documents:Document[];rows:Campaign[];reconciliation:Reconciliation[];privacy?:{version:number;policy_sha256:string;held_fields:Record<string,number>}}
type VictorianCheck={check:string;status:string;table_id?:string;row_id?:string;comparison?:string;financial_year?:string;source_locator:string;source_value?:string;sum_cents?:number;report_total_cents:number;difference_cents?:number;tolerance_cents?:number;note?:string}
type Agency={id:string;name:string}
export type AdvertisingRead=()=>Promise<AdvertisingHub|null>
export const govAdvertisingReader=(assets:Fetcher):AdvertisingRead=>async()=>{
  const response=await assets.fetch(new Request('https://opax.com.au/gov-advertising/data.json'))
  if(response.status===404)return null
  if(!response.ok)throw Error('Register unavailable')
  return response.json() as Promise<AdvertisingHub>
}

/** Reject a whole document when any row, rights or reconciliation is inconsistent. */
export function clearedAdvertising(hub:AdvertisingHub):Campaign[]{
  if(hub?.schema===2)return clearedVictorianAdvertising(hub)
  if(hub?.schema!==1 || !Array.isArray(hub.documents) || !Array.isArray(hub.rows) || !Array.isArray(hub.reconciliation))return []
  return hub.documents.flatMap(d=>{
    const l=d?.licence,r=d?.receipt
    if(!d || !finance(d.url) || !hash(d.sha256) || !/^\d{4}-\d{2}$/.test(d.financial_year)
      || hub.documents.filter(other=>other.financial_year===d.financial_year).length!==1
      || r?.status!==200 || r.robots_allowed!==true || r.challenge!==false || r.sha256!==d.sha256 || !r.snapshot
      || l?.status!=='open' || l.reviewed!==true || l.exceptions_reviewed!==true || l.scope_sha256!==d.sha256
      || !['https://creativecommons.org/licenses/by/3.0/au/','https://creativecommons.org/licenses/by/4.0/'].includes(l.url)
      || !finance(l.policy_url) || !l.terms || l.receipt?.status!==200 || !hash(l.receipt.sha256) || !l.receipt.snapshot)return []
    if(/non.?commercial|no.?derivatives|\bNC\b|\bND\b|all rights reserved|prior written permission|without permission/i.test(l.terms))return []
    const rows=hub.rows.filter(row=>row.id?.startsWith(d.id+':'))
    const ids=new Set(rows.map(row=>row.id)),coordinates=new Set(rows.map(row=>row.source_locator))
    if(!rows.length || ids.size!==rows.length || coordinates.size!==rows.length || rows.some(row=>row.financial_year!==d.financial_year
      || row.sha256!==d.sha256 || row.source_url!==d.url || row.snapshot!==r.snapshot || !hash(row.table_sha256)
      || typeof row.entity!=='string' || !row.entity.trim() || typeof row.campaign!=='string' || !row.campaign.trim()
      || typeof row.source_locator!=='string' || !/(?:page|table|p\.)\s*\S+/i.test(row.source_locator)
      || row.basis!==d.basis || row.measure!==d.measure || !d.basis || !d.measure || !amount(row.total_cents)
      || !row.categories_cents || Object.entries(row.categories_cents).some(([key,value])=>!['media','campaign_development','gst','other'].includes(key) || value!==null && !amount(value))))return []
    const sum=rows.reduce((n,row)=>n+row.total_cents!,0)
    const results=hub.reconciliation.filter(x=>x.financial_year===d.financial_year),result=results[0]
    if(results.length!==1 || result.status!=='reconciled' || result.rows!==rows.length || !amount(sum) || sum!==result.sum_cents
      || !amount(result.report_total_cents) || !amount(result.tolerance_cents) || !Number.isSafeInteger(result.difference_cents)
      || sum-result.report_total_cents!==result.difference_cents || Math.abs(result.difference_cents)>result.tolerance_cents
      || result.tolerance_cents>0 && !result.rounding_note)return []
    return rows.map(row=>({...row,licence:l}))
  })
}

const victoria=(v:unknown)=>typeof v==='string' && /^https:\/\/www\.vic\.gov\.au\/(?:historical-data-victorian-government-advertising-expenditure|victorian-government-(?:advertising|campaign-activity)[^\s<>"']*)$/.test(v)
const reviewedLabels=new Set([...privacyPolicy.labels,...privacyPolicy.organisations])
const dateWords=new Set('january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec ongoing to and'.split(' '))
const reviewedReportValue=(value:unknown,role='label')=>value==null || value==='' || typeof value==='string' && (reviewedLabels.has(value)
  || role==='amount' && /^(?:\$?[\d, ]+(?:\.\d+)?|N\/A|-)$/.test(value)
  || role==='period' && /\d/.test(value) && /^[\w\s\d.,/*()–—-]+$/.test(value) && (value.toLowerCase().match(/[a-z]+/g)||[]).every(word=>dateWords.has(word)))
const reportValue=(value:unknown,role='label')=>reviewedReportValue(value,role)?value:role==='amount'?'Withheld source annotation':'Reported expenditure table'
/** A table is a separate reporting grain. Never sum overlapping source tables. */
function clearedVictorianAdvertising(hub:AdvertisingHub):Campaign[]{
  if(!Array.isArray(hub.documents)||!Array.isArray(hub.rows)||!Array.isArray(hub.reconciliation))return []
  if(hub.privacy?.version!==privacyPolicy.version || !hash(hub.privacy.policy_sha256))return []
  if(new Set(hub.documents.map(d=>d.id)).size!==hub.documents.length || new Set(hub.rows.map(r=>r.id)).size!==hub.rows.length)return []
  const docs=new Map(hub.documents.filter(d=>{
    const l=d?.licence,r=d?.receipt
    return d.jurisdiction==='VIC' && victoria(d.url) && hash(d.sha256) && r?.status===200 && r.robots_allowed===true && r.challenge===false && r.sha256===d.sha256 && Boolean(r.snapshot)
      && l?.status==='open' && l.reviewed===true && l.exceptions_reviewed===true && l.scope_sha256===d.sha256 && l.url==='https://creativecommons.org/licenses/by/4.0/'
      && l.policy_url==='https://www.vic.gov.au/copyright' && l.receipt?.status===200 && hash(l.receipt.sha256) && Boolean(l.receipt.snapshot)
      && l.attribution==='© Copyright State Government of Victoria' && Boolean(l.terms)
      && !/non.?commercial|no.?derivatives|all rights reserved|prior written permission/i.test(l.terms)
  }).map(d=>[d.id,d]))
  const checks=hub.reconciliation as unknown as VictorianCheck[]
  const rows=hub.rows.filter(r=>{
    const d=docs.get(r?.document_id||'')
    if(!d || r.jurisdiction!=='VIC' || !/^20\d{2}-\d{2}$/.test(r.financial_year) || r.report_year!==d.financial_year || r.report_year!=null && !/^20\d{2}-\d{2}$/.test(r.report_year) || r.source_url!==d.url || r.sha256!==d.sha256 || r.snapshot!==d.receipt.snapshot
      || !hash(r.table_sha256) || !r.table_id?.startsWith(d.id+':t') || !r.id?.startsWith(r.table_id+':') || !/^HTML table \d+ row \d+ column \d+$/.test(r.source_locator)
      || !r.entity?.trim() || !r.campaign?.trim() || !r.basis || !r.measure || !['published total','media','category','advertiser','campaign cost'].includes(r.record_kind||'')
      || !['AUD','AUD million'].includes(r.unit||''))return false
    if(['entity','campaign','category','media_type','table_heading','basis','measure','period_note'].some(key=>!reviewedReportValue(r[key as keyof Campaign]))
      || !reviewedReportValue(r.campaign_period,'period') || !reviewedReportValue(r.source_value,'amount'))return false
    const marker=r.record_kind==='campaign cost' && /^(?:N\/A|-|Withheld source annotation)$/.test(r.source_value||'')
    if(marker){if(r.total_cents!==null)return false}
    else{
      const raw=(r.record_kind==='campaign cost'?r.source_value!.replace(/ \(print costs included\)$/,''):r.source_value!).replace(/, /g,',')
      if(!amount(r.total_cents) || !/^\$?[\d,]+(?:\.\d+)?$/.test(raw||''))return false
      const normalized=Number(raw.replace(/[$,]/g,''))*(r.unit==='AUD million'?1e8:100)
      if(Math.round(normalized)!==r.total_cents)return false
    }
    if(r.record_kind==='published total' && !checks.some(c=>c.check==='Published total source cell' && c.row_id===r.id && c.status==='pass' && c.report_total_cents===r.total_cents && c.source_value===r.source_value && c.source_locator===r.source_locator))return false
    return true
  })
  // Recompute comparisons only to validate the source's totals, never to make
  // a new displayed figure. Printed precision bounds the rounding allowance.
  for(const total of rows.filter(r=>r.record_kind==='published total')){
    const group=rows.filter(r=>r.table_id===total.table_id && r.financial_year===total.financial_year)
    const result=checks.filter(c=>c.check==='Published table total' && c.table_id===total.table_id && c.financial_year===total.financial_year)
    if(group.length===1 && !result.length)continue // Published time series: direct source-cell check only.
    const sum=group.filter(r=>r.record_kind!=='published total').reduce((n,r)=>n+r.total_cents!,0)
    const tolerance=Math.floor(group.reduce((n,r)=>n+(r.unit==='AUD million'?1e8:100)*10**-(r.source_value!.split('.')[1]?.length||0),0)/2)
    if(result.length!==1 || result[0].sum_cents!==sum || result[0].report_total_cents!==total.total_cents || result[0].difference_cents!==sum-total.total_cents! || result[0].tolerance_cents!==tolerance
      || result[0].status!==(Math.abs(sum-total.total_cents!)<=tolerance?'pass':'source discrepancy'))return []
  }
  // Any rejected row invalidates that snapshot, including its totals.
  return rows.length===hub.rows.length?rows.map(r=>({...r,licence:docs.get(r.document_id!)!.licence})):[]
}

export const publicAdvertisingSupplier=(value:unknown,kind?:string)=>typeof value==='string' && value
  ?kind==='organisation' && /\b(?:Pty\.? Ltd\.?|Limited|Incorporated|Inc\.)$/i.test(value) && !/\b(?:trading as|t\/as|sole trader)\b/i.test(value)?value:'individual supplier (withheld)':null

export async function govAdvertisingReady(request:Request,read:AdvertisingRead){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}})
  let count=0
  try{const hub=await read();count=hub?clearedAdvertising(hub).length:0}catch{/* Unpromoted assets leave navigation closed. */}
  return new Response(request.method==='HEAD'?null:JSON.stringify({ready:count>0,count}),{headers:{'content-type':'application/json','cache-control':'public, max-age=300'}})
}

export function advertisingTableRows(rows:Campaign[],agencies:Agency[]):Row[]{
  return rows.map(original=>{
    const r=original.jurisdiction==='VIC'?{...original,...Object.fromEntries(['entity','campaign','category','media_type','table_heading','basis','measure','period_note'].map(key=>[key,reportValue(original[key as keyof Campaign])])),
      source_value:reportValue(original.source_value,'amount'),campaign_period:reportValue(original.campaign_period,'period')} as Campaign:original
    const matches=agencies.filter(a=>a.name===r.entity && /^a-[a-f0-9]{20}$/.test(a.id))
    return {campaign:r.campaign,financial_year:r.financial_year,entity:r.entity,total:r.total_cents==null?null:r.total_cents/100,
      jurisdiction:r.jurisdiction||'Federal',record_kind:r.record_kind||'campaign',media_type:r.media_type||null,
      report_year:r.report_year||null,table_heading:r.table_heading||null,source_display:r.source_value?r.source_value+' · '+r.unit:null,category:r.category||null,campaign_period:r.campaign_period||null,period_note:r.period_note||null,
      unit:r.unit||'AUD',source_value:r.source_value||null,supplier:publicAdvertisingSupplier(r.supplier,r.supplier_kind),
      ...Object.fromEntries(['media','campaign_development','gst','other'].map(k=>[k,r.categories_cents[k]==null?null:r.categories_cents[k]!/100])),
      basis:r.basis,measure:r.measure,source_locator:r.source_locator,source_url:r.source_url,snapshot:r.snapshot,sha256:r.sha256,
      table_sha256:r.table_sha256,licence:r.licence.name,licence_url:r.licence.url,attribution:r.licence.attribution||null,
      agency_href:matches.length===1?'/subject/agency/'+matches[0].id:null}
  })
}

const sourceDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.valueOf())?'Date unavailable':new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date)}
const receipt=(d:Document)=>`<p class="gov-advertising-receipt">Source: <a href="${esc(d.url)}">Department of Finance · ${esc(d.financial_year)}</a> · Snapshot ${esc(sourceDate(d.receipt.snapshot))} · <a href="${esc(d.licence.url)}">${esc(d.licence.name)}</a><br>Document SHA-256 ${esc(d.sha256)}</p>`
const heldReceipt=()=>`<p class="gov-advertising-receipt">Source: <a href="${sourceStatus.source_url}">Department of Finance · campaign advertising reports</a> · Access checked ${esc(sourceDate(sourceStatus.checked_at))} UTC · Licence: ${esc(sourceStatus.licence)}</p>`

const vicReceipt=(r:Campaign)=>`<p class="gov-advertising-receipt">Source: <a href="${esc(r.source_url)}">Victorian Government</a> · Report year ${esc(r.report_year||'historical series (not one annual report)')} · Financial year ${esc(r.financial_year)} · ${esc(r.source_locator)} · Snapshot ${esc(sourceDate(r.snapshot))} · <a href="${esc(r.licence.url)}">${esc(r.licence.name)}</a> · ${esc(r.licence.attribution)}</p>`
const vicMoney=(cents:number)=>formatCell(cents/100,{key:'amount',label:'Amount',type:'money'})
function victorianAdvertisingPage(url:URL,hub:AdvertisingHub,campaigns:Campaign[],block:(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string,agencies:Agency[]){
  const title='Government advertising',description='Published Victorian campaign and non-campaign media advertising expenditure.'
  const error=(status:number,text:string)=>({status,title:title+' · OPAX',description:text,noindex:true,prerender:block(title,text)})
  const config=govAdvertisingTableConfig(advertisingTableRows(campaigns,agencies))
  const allowed=new Set(['q','sort','page','pageSize','f.financial_year','f.entity','f.record_kind','f.media_type','f.jurisdiction','f.report_year'].map(k=>'advertising.'+k))
  if([...url.searchParams.keys()].some(k=>!allowed.has(k) || url.searchParams.getAll(k).length!==1))return error(400,'Choose one valid value for each register filter.')
  const guarded=guardTableURL(config,url)
  if(guarded.rejected)return error(400,'Choose one valid value for each register filter.')
  const selected=applyQuery(config.rows!,config,guarded.query)
  if((guarded.query.page||1)>Math.max(1,Math.ceil(selected.total/selected.pageSize)))return error(404,'Choose an available register page.')
  const latest=[...new Set(campaigns.map(r=>r.financial_year))].sort().at(-1)!
  const current=campaigns.filter(r=>r.financial_year===latest)
  const totals=current.filter(r=>r.record_kind==='published total')
  const advertisers=current.filter(r=>r.record_kind==='advertiser')
  const sources=(rows:Campaign[])=>[...new Map(rows.map(r=>[r.source_url,r])).values()].map(vicReceipt).join('')
  const cards=(rows:Campaign[])=>rows.map(r=>`<article class="gov-advertising-card"><h3>${esc(r.record_kind==='advertiser'?r.entity:[r.table_heading,r.campaign].filter(Boolean).join(' · '))}</h3><p class="gov-advertising-amount">${esc(vicMoney(r.total_cents!))}</p><p>Published ${esc(r.source_value)} · ${esc(r.unit)}</p><p>${esc(r.record_kind==='advertiser'?'Advertiser campaign media expenditure':r.measure)} · ${esc(r.basis)}</p>${r.record_kind==='advertiser'?`<p>Campaign description withheld pending private-name review.</p>`:''}${vicReceipt(r)}<details><summary>Published amount and source hashes</summary><p>${esc(r.source_value)} · ${esc(r.unit)}<br>Document SHA-256 ${esc(r.sha256)}<br>Table SHA-256 ${esc(r.table_sha256)}</p></details></article>`).join('')
  const checks=hub.reconciliation as unknown as VictorianCheck[]
  const totalsChecks=checks.filter(c=>c.check==='Published table total')
  const discrepancies=totalsChecks.filter(c=>c.status!=='pass')
  return {status:200,title:title+' · OPAX',description,noindex:Boolean(url.search),prerender:block(title,description,undefined,[{label:title}])+`<div class="wrap gov-advertising-content">
    <p class="gov-advertising-lede">These reports describe Victorian Government media advertising, including campaign, functional and recruitment advertising. They report expenditure through the Master Agency Media Services (MAMS) arrangement. Advertiser totals can cover several example campaigns; a separate cost is not published for each example. Procurement commitments, production costs and individual departments’ annual-report disclosures have different scopes.</p>
    <section aria-labelledby="advertising-totals"><h2 id="advertising-totals">Published totals · ${esc(latest)}</h2><p>Each figure is a published total, shown in abbreviated form alongside its original amount and unit. Tables overlap and must not be added together.</p><div class="gov-advertising-cards">${cards(totals)}</div></section>
    <section aria-labelledby="advertising-departments"><h2 id="advertising-departments">Departments and agencies · ${esc(latest)}</h2><p>The report’s ten campaign advertisers. Each amount belongs to the advertiser. Report descriptions are withheld pending private-name review. This is a reported amount, with the source’s coverage and GST basis.</p><div class="gov-advertising-cards">${cards(advertisers)}</div></section>
    <section aria-labelledby="advertising-records"><h2 id="advertising-records">Full expenditure table</h2><p>${campaigns.length} published cells across ${new Set(campaigns.map(r=>r.financial_year)).size} financial years. Category totals, media channels and advertiser summaries are separate views of expenditure. Filter by record type before interpreting results; no total is calculated from the selection. Source units and GST wording are retained. Missing and included-cost markers are shown as published, with no amount inferred. Campaign periods can differ from the report year. Only structured dates and reviewed labels are shown; unreviewed descriptions, campaign titles and notes are withheld in every output.</p>${registerTableHTML(config,guarded.query,url)}</section>
    <section><h2>Published-total reconciliation</h2><p>${totalsChecks.length} comparisons of table components with the publisher’s own total: ${totalsChecks.filter(c=>c.difference_cents===0).length} exact and ${totalsChecks.filter(c=>c.difference_cents!==0 && c.status==='pass').length} within printed precision; ${discrepancies.length} outside that bound. ${checks.filter(c=>c.check==='Published total source cell').length} published totals also match their source cells. OPAX calculates a half-unit bound from each printed cell’s precision; this is not a publisher rounding statement. No published amount is adjusted. Tables without a published total are not summed.</p><details><summary>Reconciliation by table and year</summary><ul>${totalsChecks.map(c=>`<li>${esc(c.financial_year)} · ${esc(c.table_id)} · ${esc(c.source_locator)} · ${esc(c.comparison||c.status)} · difference ${esc(money(c.difference_cents!))} · printed-precision allowance ${esc(money(c.tolerance_cents!))}</li>`).join('')}</ul></details><p><a href="#advertising-sources">Original sources and licence</a></p></section>
    <section id="advertising-sources"><h2>Source, coverage and reuse</h2><p>© Copyright State Government of Victoria. Numerical HTML tables and reviewed organisation/category labels are used under <a href="https://www.vic.gov.au/copyright">the website’s CC BY 4.0 grant</a>. Tables are transcribed and formatted; published labels and figures are retained. Images, logos, the Coat of Arms, third-party material and campaign creative are excluded.</p><p>The inventory follows the publisher’s <a href="https://www.vic.gov.au/advertising-plans-and-spend">advertising reports and plans index</a>. Document downloads are held under the current robots policy. Plans describe intended activity and are not reported expenditure. Percentage tables and chart images are not converted into money. No suppliers or private-person records are added to global search.</p>${sources(campaigns)}</section></div>`}
}

export async function govAdvertisingPage(url:URL,read:AdvertisingRead,block:(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string,agencies:Agency[]=[]){
  const title='Government advertising',description='Campaign expenditure reported by Australian Government departments and entities.'
  const error=(status:number,message:string)=>({status,title:title+' · OPAX',description:message,noindex:true,prerender:block(title,message)+heldReceipt()})
  let hub:AdvertisingHub|null
  try{hub=await read()}catch{return error(503,'The reviewed register is temporarily unavailable.')}
  const campaigns=hub?clearedAdvertising(hub):[]
  if(hub && !campaigns.length)return error(503,'No cleared and reconciled campaign snapshot is available.')
  if(hub?.schema===2)return victorianAdvertisingPage(url,hub,campaigns,block,agencies)
  const rows=advertisingTableRows(campaigns,agencies),config=govAdvertisingTableConfig(rows)
  const allowed=new Set(['q','sort','page','pageSize','f.financial_year','f.entity'].map(k=>'advertising.'+k))
  if([...url.searchParams.keys()].some(k=>!allowed.has(k)))return error(400,'Choose a valid register filter.')
  const guarded=guardTableURL(config,url)
  if(guarded.rejected)return error(400,'Choose one value for each register filter.')
  const page=applyQuery(rows,config,guarded.query)
  if((guarded.query.page||1)>Math.max(1,Math.ceil(page.total/page.pageSize)))return error(404,'Choose an available register page.')
  const documents=hub?.documents.filter(d=>campaigns.some(r=>r.sha256===d.sha256))||[]
  const receipts=documents.length?documents.map(receipt).join(''):heldReceipt()
  const totals=(key:'financial_year'|'entity')=>{
    const groups=new Map<string,number>()
    // Never mix different financial years, GST bases or expenditure scopes.
    for(const row of campaigns){const label=[row[key],...(key==='entity'?[row.financial_year]:[]),row.measure,row.basis].join(' · ');groups.set(label,(groups.get(label)||0)+row.total_cents!)}
    return groups.size?`<dl class="gov-advertising-totals">${[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${money(value)}</dd></div>`).join('')}</dl>`:'<p>Not available — no campaign report is cleared in this snapshot. This does not mean expenditure was zero.</p>'
  }
  const hold=hub?'':`<aside class="gov-advertising-hold" aria-labelledby="advertising-hold"><h2 id="advertising-hold">Source verification pending</h2><p>${esc(sourceStatus.reason)} No campaign rows have been published.</p><details><summary>Access receipt</summary><p><a href="${sourceStatus.receipt.url}">Finance robots policy</a> · ${esc(sourceStatus.receipt.error)} · ${esc(sourceStatus.receipt.snapshot)}<br>No HTTP status or response bytes received. SHA-256 ${sourceStatus.receipt.sha256} (empty response).</p></details>${heldReceipt()}</aside>`
  const reconciled=hub?`<section><h2>Report reconciliation</h2><ul>${hub.reconciliation.filter(r=>documents.some(d=>d.financial_year===r.financial_year)).map(r=>`<li>${esc(r.financial_year)} · ${r.rows} campaigns · row sum ${money(r.sum_cents)} · report total ${money(r.report_total_cents)} · difference ${money(r.difference_cents)} · ${esc(r.source_locator)}${r.rounding_note?' · '+esc(r.rounding_note):''}</li>`).join('')}</ul>${receipts}</section>`:''
  return {status:200,title:title+' · OPAX',description,noindex:!hub || Boolean(url.search),
    prerender:block(title,description,receipts,[{label:title}])+`<div class="wrap gov-advertising-content">${hold}<p>Campaign spending is a reported fact. Names and expenditure categories follow the original reports; annual campaign spending and procurement commitments are separate records.</p><section><h2>Totals by financial year</h2>${totals('financial_year')}${receipts}</section><section><h2>Totals by entity and year</h2>${totals('entity')}${receipts}</section><section><h2>Reported campaigns</h2><p>${campaigns.length} cleared campaign rows. Search campaigns and entities, or filter by financial year. Amounts are AUD; an empty category means it was not separately published.</p>${registerTableHTML(config,guarded.query,url)}${receipts}</section>${reconciled}<section><h2>Source and reuse</h2><p>Finance publishes annual campaign expenditure reports. Original documents, page or table references, snapshot hashes and report-specific reuse terms accompany cleared rows. Entity links require a unique exact name in the existing agency directory.</p><p>${hub?'Amounts have been transcribed into a searchable table; consult the original report for scope and rounding.':'The applicable report licence has not been verified. No reuse grant from another Finance product has been applied to these reports.'}</p>${documents.map(d=>`<p><a href="${esc(d.licence.policy_url)}">Report licence terms</a>: ${esc(d.licence.terms)}</p>`).join('')}${receipts}</section></div>`}
}
