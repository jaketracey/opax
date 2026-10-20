import {applyQuery,guardTableURL,type Row} from '../public/datatable.js'
import {saBudgetConfig,saBudgetValue,saBudgetTableHTML} from '../public/sa-budget-table.js'
import {shortDate} from '../public/format.js'

const CC='https://creativecommons.org/licenses/by/4.0/'
const TABLES=['1.3','A.1','A.4','A.7']
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const source=(v:unknown)=>typeof v==='string'&&/^https:\/\/data\.sa\.gov\.au\/data\/dataset\/[a-z0-9-]+\/resource\/[a-f0-9-]{36}$/.test(v)
const CELL_FIELDS=['sheet','cell','measure','measure_as_published','section_as_published','fiscal_year','estimate_or_actual','status_as_published','value','units','source_marker','basis','unit_status','raw_value','number_format','display_divisor','decimals','consolidation'] as const
const PUBLIC_FIELDS=[...CELL_FIELDS,'resource_id','source_url','dataset_url','workbook','table_number','vintage','snapshot','sha256','licence','licence_url','published'] as const
type Cell={sheet:string;cell:string;measure:string;measure_as_published:string;section_as_published:string;fiscal_year:string;estimate_or_actual:string;status_as_published:string;value:number|null;units:string;source_marker:string|null;basis:string;unit_status:string;raw_value:unknown;number_format:unknown;display_divisor:unknown;decimals:unknown;consolidation:unknown}
export type SARow=Cell & {resource_id:string;source_url:string;dataset_url:string;workbook:string;table_number:string;vintage:string;snapshot:string;sha256:string;licence:string;licence_url:string;published:boolean;computed?:boolean;derivation?:unknown;[key:string]:unknown}
type Document={id:string;title:string;table_number:string;resource_url:string;dataset_url:string;vintage:string;snapshot:string;sha256:string;status:string;hold?:unknown;workbook:string;notes:string[];warnings:string[];attribution:string;licence:{url:string;dataset_explicit:boolean;resource_explicit:boolean;file_notices_reviewed:boolean;exceptions:unknown[]};source_cells:Record<string,Cell>}
type Hold={id:string;title:string;resource_url:string;dataset_url:string;vintage:string;snapshot:string;sha256:string;hold:string;warnings:string[];attribution:string;fiscal_years:string[]}
export type SAHub={schema:number;generated_at:string;documents:Document[];rows:SARow[];holds:Hold[]}

/** All numerical views share this join to the reviewed original cell ledger. */
export function clearedSABudget(h:SAHub):SARow[]{
  if(h?.schema!==1||!Array.isArray(h.documents)||!Array.isArray(h.rows))return []
  const docs=new Map(h.documents.filter(d=>d?.status==='cleared'&&!d.hold&&TABLES.includes(d.table_number)
    &&source(d.resource_url)&&d.licence?.url===CC&&d.licence.dataset_explicit===true&&d.licence.resource_explicit===true
    &&d.licence.file_notices_reviewed===true&&Array.isArray(d.licence.exceptions)&&!d.licence.exceptions.length
    &&sha(d.sha256)&&d.source_cells&&d.vintage==='2015-16 Budget').map(d=>[d.id,d]))
  const seen=new Set<string>()
  return h.rows.filter(r=>{
    const d=docs.get(r?.resource_id),cell=d?.source_cells[r?.sheet+'!'+r?.cell]
    if(!d||!cell||r.published!==true||r.computed||r.derivation||r.unit_status!=='verified'
      ||r.source_url!==d.resource_url||r.dataset_url!==d.dataset_url||r.sha256!==d.sha256||r.snapshot!==d.snapshot
      ||r.vintage!==d.vintage||r.table_number!==d.table_number||r.workbook!==d.workbook||r.licence_url!==CC||r.licence!=='CC BY 4.0'
      ||!/^20\d{2}-\d{2}$/.test(r.fiscal_year)||!/^[A-Z]{1,3}[1-9]\d*$/.test(r.cell)
      ||!['actual','estimate'].includes(r.estimate_or_actual)||!['AUD million','percent'].includes(r.units)
      ||r.value!==null&&(typeof r.value!=='number'||!Number.isFinite(r.value))
      ||!CELL_FIELDS.every(k=>cell[k]===r[k]))return false
    const key=r.resource_id+'!'+r.sheet+'!'+r.cell
    if(seen.has(key))return false
    seen.add(key);return true
  })
}

export function saBudgetRows(h:SAHub):Row[]{
  return clearedSABudget(h).map(r=>({...Object.fromEntries(PUBLIC_FIELDS.map(k=>[k,r[k]])),id:r.resource_id+'!'+r.sheet+'!'+r.cell,
    amount:r.units==='AUD million'&&r.value!==null?r.value*1e6:null,
    percentage:r.units==='percent'&&r.value!==null?r.value.toFixed(1)+'%':'',
    display_value:saBudgetValue(r),locator:r.sheet+'!'+r.cell}))
}

function receipt(d:Document|Hold){
  return `<p class="budget-receipt">Source: SA Department of Treasury and Finance · <a href="${esc(d.dataset_url)}">Dataset</a> · <a href="${esc(d.resource_url)}">${esc(d.title)}</a> · Vintage: ${esc(d.vintage)} · Snapshot <time datetime="${esc(d.snapshot)}">${esc(shortDate(d.snapshot))} UTC</time> · <a href="${CC}">CC BY 4.0</a></p><details class="budget-receipt"><summary>Attribution and source hash</summary><p>${esc(d.attribution)}</p><p class="budget-hash">SHA-256 ${esc(d.sha256)}</p></details>`
}

export function saBudgetSection(h:SAHub,url:URL){
  const rows=saBudgetRows(h)
  if(!rows.length)return ''
  const tables=TABLES.flatMap(table=>{
    const d=h.documents.find(d=>d.table_number===table),selected=rows.filter(r=>r.table_number===table)
    if(!d||!selected.length)return []
    const config=saBudgetConfig(selected,table),guard=guardTableURL(config,url)
    const html=saBudgetTableHTML(config,applyQuery(selected,config,guard.query),url)
    return [`<section aria-labelledby="sa-table-${table.replace('.','-')}"><h3 id="sa-table-${table.replace('.','-')}">${esc(d.title)}</h3><p>${table==='A.7'?'Cash receipts and payments.':'Accrual figures and budget indicators.'} Dollar figures are in millions unless shown as percentages. A dash means the Treasury published no figure. Estimates are the Treasury’s forecasts at this historical date.</p>${d.notes.map(note=>`<p>${esc(note)}</p>`).join('')}<div data-sa-budget-table="${table}">${html}<script type="application/json" data-sa-budget-rows>${JSON.stringify(selected).replace(/</g,'\\u003c')}</script></div>${receipt(d)}</section>`]
  }).join('')
  const holds=(Array.isArray(h.holds)?h.holds:[]).filter(d=>d?.id==='3f756590-9e67-4a05-97a0-f594247d2c72'&&source(d.resource_url)&&sha(d.sha256)).map(d=>`<section aria-labelledby="sa-function-file"><h3 id="sa-function-file">Historical expenses by function and economic type</h3><p>The workbook covers 2012–13 to 2015–16. Its sheets do not state a unit scale, and the catalogue’s “$million” label conflicts with the workbook’s scale. Some published components also differ from their published totals. Amounts are unavailable here until those points are resolved.</p><blockquote>${(d.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join('')}</blockquote>${receipt(d)}</section>`).join('')
  return `<section id="sa-budget" aria-labelledby="sa-budget-title"><h2 id="sa-budget-title">South Australia · historical 2015–16 Budget</h2><p>This is the SA Treasury’s 2015–16 historical budget vintage, not the current budget. These tables show the figures and forecasts published at that time. Later outcomes may differ or be revised. They are separate from the <a href="/register/government-finance?jurisdiction=South%20Australia">ABS government finance figures</a>.</p><p>General government sector as published. The workbooks do not separately describe consolidation adjustments; do not add these figures to ABS series or other sectors. Each row links to its original source cell. Only the publisher’s totals appear. Table 1.3 shows money rounded to whole millions and percentages to one decimal place.</p>${tables}${holds}</section>`
}
