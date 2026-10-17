import {formatCell, guardTableURL, type Row} from '../public/datatable.js'
import {taxExpendituresTableConfig, registerTableHTML} from '../public/register-tables.js'

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

const markers:Record<string,string>={'-':'nil','..':'non-zero rounded to zero','*':'unquantifiable',nfp:'not for publication','N/A':'not available',na:'not available'}
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
    if(!d || !i || r.published!==true || r.statement!==d.statement || r.source_url!==d.url
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
const amount=(r:TaxRow)=>r.value===null?String(r.source_value):formatCell(r.value*1e6,{key:'amount',label:'Estimate',type:'money'})
export function taxExpendituresRows(h:TaxHub):Row[]{
  return clearedTaxExpenditures(h).map(r=>({...r,estimate_display:amount(r),amount:r.value===null?null:r.value*1e6,
    publisher:'Treasury. Based on Commonwealth of Australia data. © Commonwealth of Australia 2025.',
    source_locator:`${r.source_file} · ${r.sheet}!${r.cell}`,
    benchmark_locator:r.record_kind==='item'?`Statement Appendix A.1 · native table ${r.document_table}; Appendix A.2`:`Statement Chapter 2 · ${r.sheet}; Appendix A.2`}))
}
const receipt=(h:TaxHub)=>`<p class="tax-receipt">Source: <a href="${esc(h.statement_url)}">Treasury · ${esc(h.statement)} statement</a> · Published ${esc(h.published_date)} · Snapshot ${esc(h.generated_at.slice(0,10))} UTC · <a href="${CC}">CC BY 4.0</a></p>`
const card=(r:TaxRow,h:TaxHub)=>`<article class="tax-item"><h3>${esc(r.item_id)} · ${esc(r.title)}</h3><p class="tax-amount"><a href="${esc(r.source_url)}">${esc(amount(r))}</a></p><p>${esc(r.measure_year)} · Revenue forgone estimate · ${esc(r.estimate_status)}</p>${receipt(h)}<details><summary>Benchmark and original cell</summary><p>${esc(r.benchmark)}</p><p><a href="${esc(r.source_url)}">${esc(r.source_file)} · ${esc(r.sheet)}!${esc(r.cell)}</a><br>Snapshot ${esc(r.snapshot)}<br>SHA-256 ${esc(r.sha256)}</p></details></article>`

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
  try{h=await read()}catch{return error(503,'The reviewed tax expenditure snapshot is unavailable.')}
  const all=clearedTaxExpenditures(h)
  if(!all.length)return error(503,'The reviewed tax expenditure snapshot is unavailable.')
  const config=taxExpendituresTableConfig(taxExpendituresRows({...h,rows:all}))
  const allowed=new Set(['q','sort','page','pageSize','f.measure_year','f.category','f.estimate_status','f.record_kind'].map(k=>'tax.'+k))
  if([...url.searchParams.keys()].some(k=>!allowed.has(k) || url.searchParams.getAll(k).length!==1))return error(400,'Choose one value for each table filter.')
  const guarded=guardTableURL(config,url)
  if(guarded.rejected)return error(400,'Choose one value for each table filter.')
  // The statement year is the headline year, distinct from its forward estimates.
  const current=all.filter(r=>r.statement===h.statement && r.measure_year===h.statement)
  const largest=current.filter(r=>r.record_kind==='item' && r.value!==null && r.value>0).sort((a,b)=>b.value!-a.value!).slice(0,6)
  const combined=current.filter(r=>r.record_kind==='published combined estimate')
  const description='Treasury’s estimates of revenue forgone, with benchmarks, item IDs and original source cells.'
  return {status:200,title:'Tax expenditures · OPAX',description,noindex:Boolean(url.search),
    prerender:block('Tax expenditures',description,'',[{label:'Tax expenditures'}])+`<div class="wrap tax-content"><p class="tax-lede">A tax expenditure estimates revenue forgone when a tax treatment differs from a benchmark: the standard treatment used for comparison. Treasury’s benchmark is a reporting choice, not a judgement about how an activity should be taxed. These estimates are not cash spending or revenue a policy change would raise.</p><p>Items interact and are not additive. Estimates cannot be summed across items, categories or years. Only Treasury’s own published combined estimates are shown.</p>${receipt(h)}<section aria-labelledby="tax-largest"><h2 id="tax-largest">Largest published items · ${esc(h.statement)}</h2><p>The six largest positive item estimates for the statement year. Forward estimates through 2028–29 and negative estimates are in the full table.</p><div class="tax-items">${largest.map(r=>card(r,h)).join('')}</div>${receipt(h)}</section><section aria-labelledby="tax-combined"><h2 id="tax-combined">Treasury’s published combined estimates</h2><p>These two combined estimates are copied from Tables 2.2 and 2.4. Their constituent items also appear in the register. Do not add these figures to each other or to individual items.</p><div class="tax-items">${combined.map(r=>card(r,h)).join('')}</div>${receipt(h)}</section><section aria-labelledby="tax-table-heading"><h2 id="tax-table-heading">Full estimate table</h2><p>All 304 item IDs and two published combined groups, across 2021–22 to 2028–29 in this statement vintage. Every figure is a revenue forgone estimate in nominal dollars on an accrual basis; historical estimates are not labelled actuals. Reliability is Treasury’s published rating, retained in the CSV.</p><p>Source codes are preserved: <strong>-</strong> nil; <strong>..</strong> non-zero rounded to zero; <strong>*</strong> unquantifiable; <strong>nfp</strong> not for publication. None is converted to numeric zero. For six item IDs the Word statement says “Included in” another item while Excel uses <strong>-</strong>; the status retains that reference. Negative estimates mean more tax payable than under the benchmark.</p>${registerTableHTML(config,guarded.query,url)}${receipt(h)}</section><section aria-labelledby="tax-source"><h2 id="tax-source">Source and reuse</h2><p><a href="${esc(h.statement_url)}">${esc(h.licence.attribution)}</a></p><p>${esc(h.licence.changes)}</p><p><a href="${esc(h.licence.terms_url)}">Treasury’s copyright terms</a> and the statement’s own notice apply <a href="${CC}">CC BY 4.0</a> to these Treasury-produced numerical tables. The Commonwealth Coat of Arms, Treasury logo, third-party and otherwise marked content are excluded. This presentation does not imply Commonwealth endorsement.</p><p>The workbook’s revenue-forgone sheet supplies the item cells. The Word statement supplies benchmark references and the two published combined tables, checked against its PDF. Distributional charts and earlier statement vintages are outside this snapshot. Outlay-equivalent estimates are discussed as an alternative method but no numerical outlay-equivalent series is published here.</p>${receipt(h)}</section></div>`}
}
