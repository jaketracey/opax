import {dataTableHTML, applyQuery, parseQuery, type Row} from '../public/datatable.js'
import {aggregateConfig} from '../public/budget-table.js'
import {sourceLineHTML} from '../public/labels.js'
import {catalogueReader} from './catalogue-reader.mjs'
import type {Crumb} from './seo-content'

interface Rights {status:string;name:string;url:string;exceptions:string[]}
interface Document {id:string;release:string;year:string;kind:string;title:string;url:string;format:string;consolidated:boolean;status:string;licence:Rights;receipt:{sha256:string;snapshot:string}}
interface Aggregate {publication_order:number;document_id:string;release:string;release_year:string;fiscal_year:string;metric:string;value:number;unit:string;status:string;vintage:string;paper:string;table_id:string;pdf_page:number;source_url:string;snapshot:string;sha256:string;licence:string;licence_url:string}
interface Hub {schema:number;generated_at:string;scope:string;releases:{id:string;year:string;label:string;url:string}[];documents:Document[];aggregates:Aggregate[];measure_count:number;held_count:number;portfolio_indexes:{release:string;title:string;url:string|null}[];unreleased:{year:string;kind:string;reason:string}[];attribution:string}
type Read = <T>(path:string)=>Promise<T>
type Block = (heading:string, sentence:string, links?:string, crumbs?:Crumb[])=>string
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const names:Record<string,string>={receipts:'Receipts',payments:'Payments',underlying_cash_balance:'Underlying cash balance',net_debt:'Net debt'}
const yearLabel=(y:string)=>y.replace('-','–')
const releaseLabel=(r:{vintage?:string;paper?:string;kind?:string;release_year?:string;year?:string;release:string})=>`${r.vintage==='FBO'||r.kind==='fbo'?'Final Budget Outcome':r.paper?.startsWith('MYEFO')||r.kind==='myefo'?'MYEFO':'Budget'} ${yearLabel(r.release_year||r.year||r.release.slice(0,7))}${r.release.includes('october')?' (October)':r.release.includes('march')?' (March)':''}`
const CC=['https://creativecommons.org/licenses/by/4.0/','https://creativecommons.org/licenses/by/3.0/au/']
const sourceURL=(url:string)=>/^https:\/\/(?:archive\.budget\.gov\.au|budget\.gov\.au|treasury\.gov\.au)\//.test(url)
const billions=(r:Aggregate)=>r.value/(r.unit==='AUD million'?1000:1)
const citation=(r:Aggregate)=>`${r.paper.split(':')[0]} · ${r.table_id.split(':')[0]} · PDF p.${r.pdf_page}`
const link=(r:Aggregate,label:string)=>`<a href="${esc(r.source_url)}#page=${r.pdf_page}">${esc(label)}</a>`
function receipt(r:Aggregate) {
  return `<details class="budget-receipt"><summary>${link(r,citation(r))}</summary><p>Snapshot ${esc(r.snapshot)} · <a href="${esc(r.licence_url)}">${esc(r.licence)}</a></p><p class="budget-hash">SHA-256 ${esc(r.sha256)}</p></details>`
}
export const budgetReader=catalogueReader
/** Recheck the document/row join at the serving boundary, too. */
export function clearedAggregates(h:Hub):Aggregate[] {
  const documents=new Map(h.documents.filter(d=>d && d.status==='cleared' && d.licence?.status==='open' && CC.includes(d.licence.url) && sourceURL(d.url)).map(d=>[d.id,d]))
  return h.aggregates.filter(r=>{
    if(!r || !['release','release_year','fiscal_year','vintage','paper','table_id','snapshot'].every(k=>typeof r[k as keyof Aggregate]==='string') || !Number.isFinite(r.publication_order))return false
    const d=documents.get(r.document_id)
    return d && d.url===r.source_url && CC.includes(r.licence_url) && d.licence.url===r.licence_url && /^[a-f0-9]{64}$/.test(r.sha256) && r.sha256===d.receipt?.sha256 && Number.isFinite(r.value) && ['AUD million','AUD billion'].includes(r.unit) && Object.hasOwn(names,r.metric) && /^20\d{2}-\d{2}$/.test(r.fiscal_year) && ['actual','estimate','projection'].includes(r.status) && Number.isInteger(r.pdf_page) && r.pdf_page>0
  })
}
function choose(rows:Aggregate[],year:string,metric:string,actual=false) {
  const matches=rows.filter(r=>r.fiscal_year===year && r.metric===metric && (actual ? r.status==='actual' : r.release_year===year && r.vintage==='BP1'))
  matches.sort((a,b)=>actual ? b.publication_order-a.publication_order : a.publication_order-b.publication_order)
  return matches[0]
}
function aggregateChart(rows:Aggregate[],years:string[],metric:string) {
  const comparisons=years.map(year=>({year,estimate:choose(rows,year,metric),actual:choose(rows,year,metric,true)}))
  const max=Math.max(1,...comparisons.flatMap(c=>[c.estimate,c.actual].filter((r):r is Aggregate=>Boolean(r)).map(r=>Math.abs(billions(r)))))
  const amount=(r:Aggregate|undefined)=>r ? `${billions(r).toFixed(1)}` : 'Not reported'
  const bar=(r:Aggregate|undefined,actual:boolean)=>r ? `<span class="budget-chart-track" aria-hidden="true"><span class="budget-chart-bar${actual?' budget-actual':''}" style="width:${Math.abs(billions(r))/max*50}%;${billions(r)<0?'right:50%':'left:50%'}"></span></span>` : ''
  return `<p>Original Budget estimate and latest reported actual, in AUD billions. ${metric==='underlying_cash_balance'?'A negative balance is a deficit; a positive balance is a surplus.':metric==='net_debt'?'Net debt is measured at the end of the financial year.':'Receipts and payments are annual cash flows.'} Later papers may revise actuals. Follow each cited table’s definitions: underlying cash balance excluded net Future Fund earnings from 2005–06 to 2019–20. March is the original 2022–23 Budget; October remains a separate release below.</p><p class="budget-legend"><span>Budget estimate</span><span>Reported actual</span></p><div class="budget-chart-scroll"><table class="budget-chart"><caption>${names[metric]}: estimates and actuals (AUD billion)</caption><thead><tr><th scope="col">Year</th><th scope="col">Budget estimate</th><th scope="col">Reported actual</th></tr></thead><tbody>${comparisons.map(c=>`<tr><th scope="row"><a href="/budget?year=${c.year}">${yearLabel(c.year)}</a></th>${[c.estimate,c.actual].map((r,i)=>`<td>${bar(r,i===1)}<strong>${esc(amount(r))}</strong>${r?receipt(r):''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
export async function budgetPage(url:URL,read:Read,block:Block) {
  const missing=()=>({title:'Federal budget papers · OPAX',description:'Budget figures are not available yet.',status:503,prerender:block('Federal budget papers','Budget figures are not available yet.','<a href="https://budget.gov.au/">Read the original Budget papers</a>')})
  let h:Hub
  try {h=await read<Hub>('/budget/data.json')} catch {return missing()}
  if(h.schema!==1 || !Array.isArray(h.documents) || !Array.isArray(h.aggregates) || !Array.isArray(h.releases) || !Array.isArray(h.portfolio_indexes) || !Array.isArray(h.unreleased)) return missing()
  const rows=clearedAggregates(h)
  if(!rows.length)return missing()
  const years=[...new Set(h.releases.filter(r=>r && /^20\d{2}-\d{2}$/.test(r.year)).map(r=>r.year))].sort()
  if(!years.length)return missing()
  const year=years.includes(url.searchParams.get('year')||'') ? url.searchParams.get('year')! : years.at(-1)!
  const metric=Object.hasOwn(names,url.searchParams.get('metric')||'') ? url.searchParams.get('metric')! : 'underlying_cash_balance'
  const selected=rows.filter(r=>r.fiscal_year===year)
  const amount=(r:Aggregate)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:1,maximumFractionDigits:1}).format(billions(r))
  const cards=Object.entries(names).map(([key,name])=>{
    const candidates=selected.filter(r=>r.metric===key && !r.vintage.endsWith('comparison')).sort((a,b)=>b.publication_order-a.publication_order)
    const r=candidates[0]
    return `<article><h3>${name}</h3>${r?`<p class="budget-amount">${amount(r)}<span> billion</span></p><p>${esc(r.status[0].toUpperCase()+r.status.slice(1))} · ${esc(releaseLabel(r))}</p>${receipt(r)}`:'<p>No cleared figure available</p>'}</article>`
  }).join('')
  const tableRows:Row[]=selected.map((r,i)=>({id:String(i),metric:names[r.metric],release:`${releaseLabel(r)}${r.vintage.endsWith('comparison')?' · '+r.vintage:''}`,status:r.status,amount:billions(r)*1e9,citation:citation(r),source_url:`${r.source_url}#page=${r.pdf_page}`,licence:r.licence,licence_url:r.licence_url,fiscal_year:r.fiscal_year,snapshot:r.snapshot,sha256:r.sha256,table_id:r.table_id}))
  const config={...aggregateConfig,rows:tableRows}
  const table=dataTableHTML(config,applyQuery(tableRows,config,parseQuery(url.searchParams,'fiscal')),url)
  const sources=sourceLineHTML({updated:h.generated_at,source:'Commonwealth of Australia · Treasury and Budget papers',originals:[{href:'https://budget.gov.au/',label:'Current Budget'},{href:'https://archive.budget.gov.au/',label:'Budget archive'}],notes:[esc(h.attribution),'Coat of Arms, third-party content and material otherwise stated are excluded. Original units, release vintages and suppressed measure markers are retained.'],licence:'<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> and <a href="https://creativecommons.org/licenses/by/3.0/au/">CC BY 3.0 AU</a>; each figure shows its document grant.'})
  const papers=h.documents.filter(d=>d.year===year && d.consolidated && d.status==='cleared' && d.licence.status==='open' && sourceURL(d.url) && CC.includes(d.licence.url))
  const originalList=papers.map(d=>`<li><a href="${esc(d.url)}">${esc(releaseLabel(d))} · ${esc(d.title.split(':')[0])} (${esc(d.format)})</a><p>${esc(d.licence.name)} · Snapshot ${esc(d.receipt.snapshot)} · <span class="budget-hash">SHA-256 ${esc(d.receipt.sha256)}</span></p></li>`).join('')
  const portfolios=h.portfolio_indexes.filter(p=>p && p.title && typeof p.release==='string' && p.release.startsWith(year))
  const description='Federal Budget and mid-year fiscal updates, 2015–16 to 2026–27. Dated estimates, reported actuals and original papers.'
  const html=block('Federal budget papers',description,'',[{label:'Budget'}])+`<div class="wrap budget-content"><nav class="budget-years" aria-label="Budget years">${years.map(y=>`<a href="/budget?year=${y}"${year===y?' aria-current="page"':''}>${yearLabel(y)}</a>`).join('')}</nav><section aria-labelledby="budget-headlines"><h2 id="budget-headlines">${yearLabel(year)} · headline aggregates</h2><p>Australian Government general government sector. The latest release in this snapshot is shown for each figure; estimates and projections are labelled.</p><div class="budget-cards">${cards}</div>${sources}</section><section aria-labelledby="budget-comparison"><h2 id="budget-comparison">Estimates and actuals</h2><nav class="budget-years" aria-label="Choose fiscal aggregate">${Object.entries(names).map(([key,label])=>`<a href="/budget?year=${year}&amp;metric=${key}"${key===metric?' aria-current="page"':''}>${label}</a>`).join('')}</nav>${aggregateChart(rows,years,metric)}${sources}</section><section aria-labelledby="budget-vintages"><h2 id="budget-vintages">${yearLabel(year)} across releases</h2><p>Amounts in Australian dollars, converted from each paper’s stated millions or billions. Open an aggregate to read its cited paper and table. Snapshot and hash are included in the CSV.</p><div id="budget-table">${table}<script type="application/json" data-budget-rows>${JSON.stringify(tableRows).replace(/</g,"\\u003c")}</script></div>${sources}</section><section aria-labelledby="budget-papers"><h2 id="budget-papers">Original papers · ${yearLabel(year)}</h2><ul class="budget-papers">${originalList}</ul>${sources}</section><section aria-labelledby="budget-portfolios"><h2 id="budget-portfolios">Portfolio Budget Statements</h2><p>Publisher indexes below lead to portfolio statements. Their document terms require separate review; these links do not grant reuse.</p><ul>${portfolios.map(p=>`<li>${p.url && /^https?:\/\//.test(p.url)?`<a href="${esc(p.url)}">${esc(p.title)}</a>`:esc(p.title)+" · Publisher document link unavailable"} · ${esc(yearLabel(p.release.slice(0,7)))}</li>`).join('')}</ul>${sources}</section><p class="budget-note">The original papers contain the full measures tables. Documents with unverified or restricted reuse terms are not reproduced here. ${h.unreleased.map(r=>`${esc(r.year)} ${esc(r.kind.toUpperCase())}: ${esc(r.reason)}.`).join(' ')}</p></div>`
  return {title:'Federal budget papers · OPAX',description,status:200,prerender:html}
}
