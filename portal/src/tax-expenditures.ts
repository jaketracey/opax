import {formatCell, guardTableURL, type Row} from '../public/datatable.js'
import {taxExpendituresTableConfig, registerTableHTML} from '../public/register-tables.js'
import {sourceLineHTML} from '../public/party-page.js'
import {shortDate} from '../public/format.js'

const CC='https://creativecommons.org/licenses/by/4.0/'
const SOURCE='https://treasury.gov.au/publication/p2025-721342'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const sha=(v:unknown)=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v)
const original=(url:string)=>/^https:\/\/treasury\.gov\.au\/sites\/default\/files\/\d{4}-\d{2}\/p\d{4}-\d+(?:-chart-data)?\.(xlsx|docx)$/.test(url)
type Receipt={status:number;challenge:boolean;held:boolean;snapshot:string;sha256:string}
type Item={item_id:string;title:string;category:string;benchmark:string;record_kind:string;document_table:number;reliability:string;tax_expenditure_type:string;cells:Record<string,string>;included_in?:string;table?:string}
type Document={id:string;url:string;format:string;statement:string;status:string;exceptions:unknown[];receipt:Receipt;licence:{status:string;url:string;document_reviewed:boolean}}
export type TaxRow=Omit<Item,'cells'> & {statement:string;measure_year:string;value:number|null;source_value:string|number;estimate_status:string;estimate_basis:string;unit:string;published:boolean;source_file:string;sheet:string;cell:string;source_url:string;snapshot:string;sha256:string;licence:string;licence_url:string}
export type TaxHub={schema:number;generated_at:string;statement:string;statement_url:string;published_date:string;licence:{name:string;url:string;terms_url:string;attribution:string;changes:string};items:Item[];documents:Document[];rows:TaxRow[]}
type Read=()=>Promise<TaxHub>
type Block=(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string

export const taxExpendituresReader=(assets:Fetcher):Read=>async()=>{
  const response=await assets.fetch(new Request('https://opax.com.au/tax-expenditures/data.json'))
  if(!response.ok)throw Error('Reviewed Treasury snapshot unavailable')
  return response.json() as Promise<TaxHub>
}

const markers:Record<string,string>={'-':'nil','..':'non-zero rounded to zero','*':'unquantifiable','N/A':'not available',na:'not available'}
/** Source identities and cells are allowlisted. No aggregate builder serves this page or CSV. */
export function clearedTaxExpenditures(h:TaxHub):TaxRow[]{
  if(h?.schema!==1 || h.statement_url!==SOURCE || h.licence?.url!==CC || !Array.isArray(h.rows) || !Array.isArray(h.documents) || !Array.isArray(h.items))return []
  const docs=new Map(h.documents.filter(d=>d?.status==='cleared' && d.licence?.status==='open' && d.licence.url===CC
    && d.licence.document_reviewed===true && Array.isArray(d.exceptions) && !d.exceptions.length && original(d.url)
    && d.receipt?.status===200 && !d.receipt.held && !d.receipt.challenge && sha(d.receipt.sha256)).map(d=>[d.id,d]))
  const items=new Map(h.items.filter(i=>/^[A-H]\d+$/.test(i.item_id) && i.record_kind==='item'
    || ['C2+C3','C1+C4'].includes(i.item_id) && i.record_kind==='published combined estimate' && ['Table 2.2','Table 2.4'].includes(i.table||'')).map(i=>[i.item_id,i]))
  const seen=new Set<string>()
  return h.rows.filter(r=>{
    const d=docs.get(r?.source_file),i=items.get(r?.item_id)
    if(!d || !i || r.published!==true || r.source_value==='nfp' || r.estimate_status==='not for publication' || r.statement!==d.statement || r.source_url!==d.url
      || r.sha256!==d.receipt.sha256 || r.snapshot!==d.receipt.snapshot || r.licence_url!==CC || r.unit!=='AUD million'
      || r.estimate_basis!=='revenue forgone' || !/^20\d{2}-\d{2}$/.test(r.measure_year)
      || r.cell!==i.cells?.[r.measure_year] || ['title','category','benchmark','record_kind','document_table','reliability','tax_expenditure_type','included_in'].some(k=>r[k as keyof TaxRow]!==i[k as keyof Item])
      || i.record_kind==='item' && (d.format!=='XLSX' || r.sheet!=='Revenue forgone estimates')
      || i.record_kind!=='item' && (d.format!=='DOCX' || r.sheet!==i.table))return false
    const raw=i.record_kind==='item'?r.source_value:typeof r.source_value==='string' && /^[\d,\s]+$/.test(r.source_value)?Number(r.source_value.replace(/[,\s]/g,'')):null
    const expected=typeof raw==='number' && Number.isFinite(raw)?raw:null
    const status=i.included_in?'included in '+i.included_in+'; workbook nil':expected!==null?'quantified':markers[String(raw)]
    if(r.value!==expected || !status || r.estimate_status!==status || i.included_in && raw!=='-')return false
    const identity=JSON.stringify([r.statement,r.item_id,r.estimate_basis,r.measure_year])
    if(seen.has(identity))return false
    seen.add(identity);return true
  })
}
const MONEY={key:'amount',label:'Estimate',type:'money'} as const
const amount=(r:TaxRow)=>r.value===null?String(r.source_value):formatCell(r.value*1e6,MONEY)
const fy=(y:string)=>y.replace('-','–')
/** Workbook titles can carry Excel XML escapes (_x001F_) and invisible
 *  characters. Display text decodes and drops them; the source cell is unchanged. */
export const cleanTitle=(title:string)=>title.replace(/_x([0-9A-Fa-f]{4})_/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
  .replace(/[\u0000-\u001f\u007f­​-‏⁠﻿]/g,c=>/[\t\n\r]/.test(c)?' ':'').replace(/\s+/g,' ').trim()
export function taxExpendituresRows(h:TaxHub):Row[]{
  return clearedTaxExpenditures(h).map(r=>({...r,title:cleanTitle(r.title),estimate_display:amount(r),amount:r.value===null?null:r.value*1e6,
    publisher:'Treasury. Based on Commonwealth of Australia data. © Commonwealth of Australia 2025.',
    source_locator:`${r.source_file} · ${r.sheet}!${r.cell}`,
    benchmark_locator:r.record_kind==='item'?`Statement Appendix A.1 · native table ${r.document_table}; Appendix A.2`:`Statement Chapter 2 · ${r.sheet}; Appendix A.2`}))
}

/** The statement year in counts: items, how many Treasury quantified, how many
 *  it could not, how many are negative. Counts of records only; no dollars are added. */
export function taxHeadline(rows:TaxRow[],year:string){
  const items=rows.filter(r=>r.record_kind==='item'),current=items.filter(r=>r.measure_year===year)
  const status=(s:string)=>current.filter(r=>r.estimate_status===s).length
  const largest=current.filter(r=>r.value!==null && r.value>0).sort((a,b)=>b.value!-a.value!)[0]
  return {items:new Set(items.map(r=>r.item_id)).size,categories:new Set(items.map(r=>r.category)).size,quantified:status('quantified'),unquantifiable:status('unquantifiable'),
    negative:current.filter(r=>r.value!==null && r.value<0).length,nil:status('nil')+current.filter(r=>/^included in /.test(r.estimate_status)).length,
    rounded:status('non-zero rounded to zero'),largest}
}
/** The largest positive item estimates for one year, largest first; ties keep item order. */
export const taxLargest=(rows:TaxRow[],year:string,n:number)=>rows.filter(r=>r.record_kind==='item' && r.measure_year===year && r.value!==null && r.value>0)
  .sort((a,b)=>b.value!-a.value! || a.item_id.localeCompare(b.item_id,'en',{numeric:true})).slice(0,n)
/** One item's estimates by year, oldest first, with null for a code such as * or -. */
export function taxSeries(rows:TaxRow[],itemId:string){
  return rows.filter(r=>r.item_id===itemId).sort((a,b)=>a.measure_year.localeCompare(b.measure_year)).map(r=>({year:r.measure_year,value:r.value,row:r}))
}
/** Each tax category: its item count, how many have a figure for the year, and its largest items. */
export function taxCategories(rows:TaxRow[],year:string){
  const items=rows.filter(r=>r.record_kind==='item'),names=[...new Set(items.map(r=>r.category))]
  return names.map(name=>{
    const own=items.filter(r=>r.category===name),current=own.filter(r=>r.measure_year===year)
    return {name,items:new Set(own.map(r=>r.item_id)).size,quantified:current.filter(r=>r.value!==null && r.value!==0).length,
      unquantifiable:current.filter(r=>r.estimate_status==='unquantifiable').length,top:taxLargest(current,year,3)}
  }).sort((a,b)=>b.items-a.items || a.name.localeCompare(b.name))
}

const about:Record<string,string>={
  'Personal income tax':'Exemptions, deductions and offsets in the income tax paid by individuals.',
  'Business income tax':'Deductions, write-offs and lower rates in the income tax paid by businesses.',
  'Superannuation tax':'Lower tax on super contributions, fund earnings and payouts.',
  'Fringe benefits tax':'Exemptions and reductions in the tax on non-cash benefits employers give staff.',
  'Capital gains tax':'Exemptions and discounts on tax on gains from selling assets, including the family home.',
  'Indirect taxes excluding GST':'Concessions in excise, customs duty, luxury car tax and other indirect taxes.',
  'Natural resource taxes':'Concessions in petroleum resource rent tax, crude oil excise and mining exploration.',
  'Goods and services tax':'Things that are GST-free or input taxed, such as food, health and education.'}
const terms:[string,string][]=[
  ['Tax expenditure','A tax concession: an exemption, deduction, offset, lower rate or deferral that lets some people or activities pay less tax than the standard treatment.'],
  ['Benchmark','The standard tax treatment Treasury compares each concession with. The benchmark is a reporting choice, not a judgement that the concession is good or bad.'],
  ['Revenue forgone','Treasury’s estimate of the tax not collected because of the concession, assuming people behave the same way. It is not the revenue that removing the concession would raise.'],
  ['Not additive','Concessions interact: removing one can change what another is worth. So estimates cannot be added across items, categories or years, and OPAX shows no totals of its own.'],
  ['Statement year and forward estimates','This statement covers 2021–22 to 2028–29. Earlier years are Treasury’s estimates for those years, not actual outcomes; 2026–27 onwards are projections.'],
  ['Source codes','Treasury’s own codes are kept as published: - nil; .. not zero but rounds to zero; * unquantifiable. None is turned into a zero.'],
  ['Negative estimates','A negative figure means the treatment collects more tax than the benchmark would.'],
  ['Included in','For six items the statement says the estimate is included in another item, while the workbook shows -. The status keeps that reference.'],
  ['Reliability','Treasury’s own rating of each estimate, from very low to high, or not applicable. It is in the CSV and each item’s details.'],
  ['Combined estimates','Two figures Treasury publishes for pairs of super items. They are copied as published, not built by adding the pair.']]
const related:[string,string,string][]=[
  ['/register/government-finance','Government finance','ABS revenue, expenses, balances and debt for every Australian government.'],
  ['/budget','Budget papers','Commonwealth Budget estimates and reported actuals, by Budget year.'],
  ['/money/grants','Grants','Grant awards, resolved to their recipients.'],
  ['/money/contracts','Government contracts','Which agencies buy from whom.']]
const num=(v:number)=>v.toFixed(1)
function spark(series:{year:string;value:number|null}[],statement:string,label:string){
  const known=series.filter(p=>p.value!==null) as {year:string;value:number}[]
  if(known.length<2)return ''
  const W=120,H=28,n=series.length,hi=Math.max(0,...known.map(p=>p.value)),lo=Math.min(0,...known.map(p=>p.value)),span=hi-lo||1
  const x=(i:number)=>num(i/(n-1)*W),y=(v:number)=>num(H-(v-lo)/span*H),at=series.findIndex(p=>p.year===statement)
  const path=(from:number,to:number)=>{let d='',pen=false;for(let i=from;i<=to;i++){const v=series[i]?.value;if(v===null || v===undefined){pen=false;continue}d+=`${pen?'L':'M'}${x(i)} ${y(v)} `;pen=true}return d.trim()}
  const split=at<0?n-1:at
  return `<svg class="tax-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><line class="tax-spark-now" x1="${x(split)}" x2="${x(split)}" y1="0" y2="${H}"/><path class="tax-spark-past" d="${path(0,split)}"/><path class="tax-spark-ahead" d="${path(split,n-1)}"/></svg>`
}
const sparkLabel=(series:{year:string;row:TaxRow}[])=>'By year: '+series.map(p=>`${fy(p.year)} ${amount(p.row)}`).join(', ')
const cellLink=(r:TaxRow,text=amount(r))=>`<a href="${esc(r.source_url)}" title="${esc(r.source_file+' · '+r.sheet+'!'+r.cell)}">${esc(text)}</a>`
const details=(r:TaxRow)=>`<details class="tax-details"><summary>Benchmark and source cell</summary><dl><div><dt>Benchmark</dt><dd>${esc(r.benchmark)}</dd></div><div><dt>Type</dt><dd>${esc(r.tax_expenditure_type)}</dd></div><div><dt>Reliability</dt><dd>${esc(r.reliability||'Not given')}</dd></div><div><dt>Original cell</dt><dd><a href="${esc(r.source_url)}">${esc(r.source_file)} · ${esc(r.sheet)}!${esc(r.cell)}</a><br>Snapshot ${esc(r.snapshot)} · SHA-256 ${esc(r.sha256)}</dd></div></dl></details>`
const filterHref=(filters:Record<string,string>,sort?:string)=>{
  const q=new URLSearchParams();for(const [k,v] of Object.entries(filters))q.set('tax.f.'+k,JSON.stringify([v]));if(sort)q.set('tax.sort',sort)
  return '/register/tax-expenditures?'+q.toString()+'#tax-table-heading'
}

export async function taxExpendituresReady(request:Request,read:Read):Promise<Response>{
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}})
  let count=0
  try{count=clearedTaxExpenditures(await read()).length}catch{/* A missing promotion keeps navigation closed. */}
  return new Response(request.method==='HEAD'?null:JSON.stringify({ready:count>0,count}),{status:200,headers:{'content-type':'application/json','cache-control':'public, max-age=300'}})
}

export async function taxExpendituresPage(url:URL,read:Read,block:Block){
  const error=(status:number,message:string)=>({status,title:'Tax expenditures · OPAX',description:message,noindex:true,
    prerender:block('Tax expenditures',message,`<a href="${SOURCE}">Read Treasury’s original 2025–26 statement</a>`)+`<div class="wrap tax-content"><p>Source: Treasury · Statement 2025–26 · Snapshot unavailable · <a href="https://treasury.gov.au/copyright-disclaimer">Publisher licence terms</a>. No cleared data is displayed.</p></div>`})
  let h:TaxHub
  try{h=await read()}catch{return error(503,'Tax expenditure figures are temporarily unavailable.')}
  const all=clearedTaxExpenditures(h)
  if(!all.length)return error(503,'Tax expenditure figures are temporarily unavailable.')
  const config=taxExpendituresTableConfig(taxExpendituresRows({...h,rows:all}))
  const allowed=new Set(['q','sort','page','pageSize','f.measure_year','f.category','f.estimate_status','f.record_kind'].map(k=>'tax.'+k))
  if([...url.searchParams.keys()].some(k=>!allowed.has(k) || url.searchParams.getAll(k).length!==1))return error(400,'Choose one value for each table filter.')
  const guarded=guardTableURL(config,url)
  if(guarded.rejected)return error(400,'Choose one value for each table filter.')
  const rows=all.map(r=>({...r,title:cleanTitle(r.title)}))
  // The statement year is the headline year, distinct from its forward estimates.
  const year=h.statement,Y=fy(year),current=rows.filter(r=>r.statement===h.statement && r.measure_year===year)
  const head=taxHeadline(rows,year),largest=taxLargest(rows,year,15),top=largest[0]
  const combined=current.filter(r=>r.record_kind==='published combined estimate')
  const source=(notes:string[]=[])=>sourceLineHTML({updated:h.generated_at.slice(0,10),dateLabel:'Snapshot',source:`Treasury, ${Y} Tax Expenditures and Insights Statement`,
    originals:[{href:h.statement_url,label:`Treasury ${Y} statement`}],
    facts:[['Publisher','Treasury'],['Statement',`${esc(year)} statement`],['Published',esc(shortDate(h.published_date))+` <span class="dt-sr">(${esc(h.published_date)})</span>`],['Snapshot',`${esc(h.generated_at.slice(0,10))} UTC`],['Basis','Revenue forgone, AUD, accrual']],
    notes:notes.map(esc),licence:`<a href="${CC}">CC BY 4.0</a>`})
  const description='Treasury’s estimates of revenue forgone, with benchmarks, item IDs and original source cells.'
  const max=top?.value||1
  const rowHTML=(r:TaxRow)=>{const series=taxSeries(rows,r.item_id)
    return `<li class="tax-bar-row" data-item="${esc(r.item_id)}"><div class="tax-bar-name"><span class="tax-bar-title">${esc(r.title)}</span><span class="tax-bar-meta">${esc(r.item_id)} · ${esc(r.category)}</span>${details(r)}</div><span class="ui-bar tax-bar-track" aria-hidden="true"><i style="width:${num(Math.max(0.5,r.value!/max*100))}%"></i></span><span class="tax-bar-figure">${cellLink(r)}</span>${spark(series,year,sparkLabel(series))}</li>`}
  const stat=(value:string,label:string,note='')=>`<div class="tax-stat"><dt>${label}</dt><dd class="tax-stat-value">${value}</dd>${note?`<dd class="tax-stat-note">${note}</dd>`:''}</div>`
  const lead=`<section class="ui-section tax-section" data-accent="money" aria-labelledby="tax-overview"><p class="tax-kicker">${esc(Y)} statement · published ${esc(shortDate(h.published_date))}</p><h2 id="tax-overview" class="ui-section-title">The ${esc(Y)} statement at a glance</h2>`
    +`<p class="tax-summary">Treasury lists ${head.items} tax concessions. For ${esc(Y)} it puts a dollar figure on ${head.quantified} of them and marks ${head.unquantifiable} as unquantifiable. ${top?`The largest single estimate is ${esc(top.item_id)}, “${esc(top.title)}”, at ${esc(amount(top))} of revenue forgone. `:''}${head.negative} estimates are negative: those treatments collect more tax than the benchmark.</p>`
    +`<dl class="tax-stats">${stat(String(head.items),'Tax concessions listed',`Across ${head.categories} tax categories`)}${stat(String(head.quantified),`With a figure for ${esc(Y)}`,'Positive or negative dollar estimates')}${stat(String(head.unquantifiable),'Unquantifiable',`Marked * by Treasury for ${esc(Y)}`)}${top?stat(cellLink(top),'Largest single estimate',`${esc(top.item_id)} · ${esc(top.title)}`):''}</dl>`
    +source(['Counts are of published records. No dollar figures are added together.'])+'</section>'
  const largestSection=`<section class="ui-section tax-section" data-accent="money" aria-labelledby="tax-largest"><h2 id="tax-largest" class="ui-section-title">Largest concessions, ${esc(Y)}</h2><p class="ui-section-note">The ${largest.length} largest positive item estimates for the statement year. Each bar is measured against the largest; the small line shows the item’s estimates from ${esc(fy(series0(rows)))} to ${esc(fy(seriesN(rows)))}, solid to ${esc(Y)} and dashed for projections. Items interact, so the bars cannot be stacked or added.</p>`
    +`<ol class="tax-bars">${largest.map(rowHTML).join('')}</ol><p class="tax-more"><a href="${esc(filterHref({measure_year:year},'amount:desc'))}">Every ${esc(Y)} estimate, largest first</a></p>${source()}</section>`
  const constituents=(id:string)=>id.split('+').map(part=>current.find(r=>r.item_id===part)).filter((r):r is TaxRow=>Boolean(r))
  const combinedSection=combined.length?`<section class="ui-section tax-section" data-accent="money" aria-labelledby="tax-combined"><h2 id="tax-combined" class="ui-section-title">Treasury’s combined super estimates</h2><p class="ui-section-note">Treasury publishes these two figures for pairs of superannuation items in Tables 2.2 and 2.4. They are copied as published. Do not add them to each other or to the separate items.</p><div class="tax-combined">${combined.map(r=>`<article class="tax-combined-card"><h3 class="tax-combined-title">${esc(r.title)}</h3><p class="tax-combined-figure">${cellLink(r)}<span> in ${esc(Y)}</span></p><p class="tax-combined-parts">Treasury’s figure for ${constituents(r.item_id).map(c=>`${esc(c.item_id)}, ${esc(c.title)} (${cellLink(c)} on its own)`).join(', and ')}, taken together.</p>${details(r)}</article>`).join('')}</div>${source()}</section>`:''
  const categories=taxCategories(rows,year)
  const categorySection=`<section class="ui-section tax-section" data-accent="money" aria-labelledby="tax-categories"><h2 id="tax-categories" class="ui-section-title">By tax category</h2><p class="ui-section-note">Treasury groups the concessions by the tax they reduce. Each card counts items and names the largest; category totals are not shown because the items cannot be added.</p><ul class="tax-cats">${categories.map(c=>`<li class="tax-cat"><h3 class="tax-cat-name"><a href="${esc(filterHref({category:c.name}))}">${esc(c.name)}</a></h3><p class="tax-cat-about">${esc(about[c.name]||'')}</p><p class="tax-cat-count"><strong>${c.items}</strong> items · ${c.quantified} with a figure for ${esc(Y)}${c.unquantifiable?` · ${c.unquantifiable} unquantifiable`:''}</p>${c.top.length?`<ol class="tax-cat-top">${c.top.map(r=>`<li><span>${esc(r.title)}</span>${cellLink(r)}</li>`).join('')}</ol>`:''}</li>`).join('')}</ul>${source()}</section>`
  const quick=[[filterHref({measure_year:year},'amount:desc'),`${Y}, largest first`],[filterHref({estimate_status:'unquantifiable',measure_year:year}),`Unquantifiable in ${Y}`],[filterHref({record_kind:'published combined estimate'}),'Combined estimates, every year']]
  const tableSection=`<section class="ui-section tax-section" data-accent="money" aria-labelledby="tax-table-heading"><h2 id="tax-table-heading" class="ui-section-title">Every estimate</h2><p class="ui-section-note">${all.length.toLocaleString('en-AU')} published figures and codes for ${head.items} item IDs and two combined estimates, ${esc(fy(series0(rows)))} to ${esc(fy(seriesN(rows)))}. Filter by year, category or status, or sort by estimate on a phone. Four figures Treasury withheld are left out of the table and CSV.</p><nav class="tax-quick" aria-label="Table shortcuts"><span>Shortcuts:</span>${quick.map(([href,label])=>`<a href="${esc(href)}">${esc(label)}</a>`).join('')}<a href="/register/tax-expenditures#tax-table-heading">Reset</a></nav>${registerTableHTML(config,guarded.query,url)}${source(['Reliability, benchmark and the original value or code are in the CSV.'])}</section>`
  const termsSection=`<section class="ui-section tax-section" aria-labelledby="tax-terms"><h2 id="tax-terms" class="ui-section-title">How to read these estimates</h2><dl class="tax-terms">${terms.map(([t,d])=>`<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>${source()}</section>`
  const relatedSection=`<section class="ui-section tax-section" aria-labelledby="tax-related"><h2 id="tax-related" class="ui-section-title">Related on OPAX</h2><ul class="ui-card-grid tax-related">${related.map(([href,title,text])=>`<li class="ui-card"><h3 class="ui-card-title"><a href="${href}">${esc(title)}</a></h3><p class="ui-card-text">${esc(text)}</p></li>`).join('')}</ul></section>`
  const sourceSection=`<section class="ui-section tax-section" aria-labelledby="tax-source"><h2 id="tax-source" class="ui-section-title">Source and reuse</h2><p><a href="${esc(h.statement_url)}">${esc(h.licence.attribution)}</a></p><p>${esc(h.licence.changes)}</p><p><a href="${esc(h.licence.terms_url)}">Treasury’s copyright terms</a> and the statement’s own notice apply <a href="${CC}">CC BY 4.0</a> to these Treasury-produced numerical tables. The Commonwealth Coat of Arms, Treasury logo, third-party and otherwise marked content are excluded. This presentation does not imply Commonwealth endorsement.</p><p>The workbook’s revenue-forgone sheet supplies the item cells. The Word statement supplies benchmark references and the two published combined tables, checked against its PDF. Distributional charts and earlier statement vintages are outside this snapshot. Outlay-equivalent estimates are discussed as an alternative method but no numerical outlay-equivalent series is published here.</p>${source()}</section>`
  const jump=[['tax-overview','At a glance'],['tax-largest','Largest'],...combined.length?[['tax-combined','Combined super']]:[],['tax-categories','By category'],['tax-table-heading','Every estimate'],['tax-terms','How to read'],['tax-source','Source']]
  return {status:200,title:'Tax expenditures · OPAX',description,noindex:Boolean(url.search),
    prerender:block('Tax expenditures',description,'',[{label:'Tax expenditures'}])+`<section class="wrap tax-content" aria-label="Tax expenditure estimates"><p class="tax-lede">Tax expenditures are concessions in the tax system: exemptions, deductions, offsets and lower rates that mean some people, businesses or activities pay less tax than a standard benchmark. Each year Treasury estimates the revenue forgone through each one. The benchmark is a reporting choice, not a judgement about how an activity should be taxed, and these estimates are not cash spending. Items interact and are not additive, so no totals are built here.</p>`
      +`<nav class="tax-jump" aria-label="On this page">${jump.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')}</nav>`
      +lead+largestSection+combinedSection+categorySection+tableSection+termsSection+relatedSection+sourceSection+'</section>'}
}
const years=(rows:TaxRow[])=>[...new Set(rows.map(r=>r.measure_year))].sort()
const series0=(rows:TaxRow[])=>years(rows)[0]
const seriesN=(rows:TaxRow[])=>years(rows).at(-1)!
