import {formatCell, guardTableURL, type Row} from '../public/datatable.js'
import {governmentFunctionTableConfig, registerTableHTML} from '../public/register-tables.js'
import {clearedGFSDocuments, type GFSHub, type GFSRow} from './government-finance.ts'
import {governmentFinanceGroupHeading} from './government-finance-groups.ts'

export type GFSFunctionRow=Omit<GFSRow,'measure_as_published'> & {
  classification:string;function_level:'division'|'group'|'total';division:string|null;group:string|null;
  function_as_published:string;division_code:string|null;group_code:string|null;code_status:string
}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const CC='https://creativecommons.org/licenses/by/4.0/'
const normalize=(s:string|null)=>s?.toLowerCase()||''
const divisions=['general public services','defence','public order and safety','economic affairs','environmental protection','housing and community amenities','health','recreation, culture and religion','education','social protection','transport']
const groups:Record<string,string[]>={
  'general public services':['Public debt transactions','Other general public services'],
  'public order and safety':['Police services','Civil and fire protection services','Law courts, prisons and other public order and safety'],
  health:['Medical products, appliances and equipment','Outpatient services','Hospital services','Community health services','Public health services','Other health'],
  education:['Pre-primary, primary and secondary education','Tertiary education','Other education'],
  transport:['Road transport','Railway transport','Other transport']
}
export function clearedGovernmentFunctions(h:GFSHub):GFSFunctionRow[]{
  const docs=clearedGFSDocuments(h),seen=new Set<string>()
  return (Array.isArray(h?.function_rows)?h.function_rows:[]).filter(r=>{
    const d=docs.get(r?.workbook),dim=d?.function_dimensions?.[r?.sheet]
    if(!d || !dim || r.published!==true || r.release!==d.release || r.release_date!==d.release_date
      || r.source_url!==d.url || r.sha256!==d.receipt.sha256 || r.snapshot!==d.receipt.snapshot
      || r.licence_url!==CC || r.unit!=='AUD million' || r.prices_basis!=='Current prices' || r.series_basis!=='Original'
      || r.value!==null && (typeof r.value!=='number' || !Number.isFinite(r.value))
      || !/^\d{4}-\d{2}$/.test(r.reference_year) || !/^Table_\d+$/.test(r.sheet) || !/^[A-Z]{1,3}[1-9]\d*$/.test(r.cell)
      || typeof r.function_as_published!=='string'
      || Object.entries(dim).some(([key,value])=>r[key as keyof GFSFunctionRow]!==value)
      || r.division_code!==null || r.group_code!==null || r.code_status!=='Not published in workbook')return false
    const education=r.measure==='education_operating_expenses',division=normalize(r.division)
    if(education){
      if(r.classification!=='Education by purpose' || r.division!=='Education' || r.workbook!=='55120DO095_202425.xlsx'
        || !(r.function_level==='division' && r.group===null && r.function_as_published==='Total operating expenses on education, by purpose'
          || r.function_level==='group' && ['School education','Tertiary education','Other education'].includes(r.group||'') && r.function_as_published===r.group))return false
    }else{
      if(r.measure!=='expenses_by_function' || r.classification!=='COFOG-A (published purpose categories)' || r.sheet!=='Table_4'
        || !(r.function_level==='total' && r.division===null && r.group===null && r.function_as_published==='Total Expenses'
          || r.function_level==='division' && divisions.includes(division) && r.group===null && [division,'total '+division].includes(normalize(r.function_as_published))
          || r.function_level==='group' && groups[division]?.includes(r.group||'') && r.function_as_published===r.group))return false
    }
    const key=JSON.stringify([r.release,r.level_of_government,r.jurisdiction,r.sector,r.reference_year,r.measure,r.division,r.group,r.function_level,r.unit,r.prices_basis])
    if(seen.has(key))return false
    seen.add(key);return true
  })
}
export function governmentFunctionRows(h:GFSHub):Row[]{
  return clearedGovernmentFunctions(h).map(r=>({release:r.release,release_date:r.release_date,level:r.level_of_government,jurisdiction:r.jurisdiction,
    sector:r.sector,measure:r.measure==='expenses_by_function'?'Expenses by function':'Education operating expenses',reference_year:r.reference_year,
    division:r.division||'All functions (published total)',group:r.group||'',function_level:r.function_level,function:r.function_as_published,
    division_code:r.division_code,group_code:r.group_code,code_status:r.code_status,classification:r.classification,
    amount:r.value===null?null:r.value*1e6,value_million:r.value,source_marker:r.source_marker??'',unit:r.unit,prices_basis:r.prices_basis,
    series_basis:r.series_basis,consolidation:r.consolidation,publisher:'Australian Bureau of Statistics',source_url:r.source_url,
    source_locator:`${r.workbook} · ${r.sheet}!${r.cell}`,snapshot:r.snapshot,sha256:r.sha256,licence:r.licence,licence_url:r.licence_url}))
}

/** A published label in reading form: "Total public order and safety" reads as
 *  "Public order and safety". The published wording stays on the cell link. */
export const functionName=(label:string)=>{const s=label.replace(/^total\s+/i,'').trim();return s.charAt(0).toUpperCase()+s.slice(1)}
export type FunctionBar={row:GFSFunctionRow;name:string;share:number|null;width:number;groups:GFSFunctionRow[]}
/** One group's published split for one year. Bars are each published division
 *  against the group's own published total (no total is built here); groups are
 *  the published rows inside a division, listed under it, never added to it.
 *  Where a workbook publishes only education by purpose, its groups are the bars
 *  and the education total is the total. */
export function functionBreakdown(rows:GFSFunctionRow[]){
  const fns=rows.filter(r=>r.measure==='expenses_by_function'),educationOnly=!fns.length
  const pool=educationOnly?rows.filter(r=>r.measure==='education_operating_expenses'):fns
  const total=pool.find(r=>r.function_level===(educationOnly?'division':'total'))
  const parts=pool.filter(r=>r.function_level===(educationOnly?'group':'division'))
  const base=total?.value!=null && total.value>0?total.value:null
  const scale=base??Math.max(0,...parts.map(r=>r.value??0))
  const bars:FunctionBar[]=parts.map(row=>({row,name:functionName(educationOnly?row.group||row.function_as_published:row.function_as_published),
    share:base!==null && row.value!==null?row.value/base:null,width:scale>0 && row.value!==null?Math.max(0,Math.min(1,row.value/scale)):0,
    groups:educationOnly?[]:pool.filter(g=>g.function_level==='group' && normalize(g.division)===normalize(row.division))}))
    .sort((a,b)=>(b.row.value??-Infinity)-(a.row.value??-Infinity) || a.name.localeCompare(b.name))
  return {educationOnly,total,bars}
}
const money=(r:GFSFunctionRow)=>r.value===null?'Not published':formatCell(r.value*1e6,{key:'amount',label:'Amount',type:'money'})
const cell=(r:GFSFunctionRow)=>`<a href="${esc(r.source_url)}" title="${esc(r.workbook+' · '+r.sheet+'!'+r.cell)}">${esc(money(r))}</a>`
const pct=(share:number|null)=>share===null?'':share>0 && share<0.005?'<1%':Math.round(share*100)+'%'
const width=(w:number)=>`${Math.round(w*1000)/10}%`
const fy=(y:string)=>y.replace('-','–')

export function spendingByFunction(h:GFSHub,url:URL,selection:{release:string;level:string;sector:string;jurisdiction:string},source:(notes:string[])=>string,lead?:string){
  const selected=clearedGovernmentFunctions(h).filter(r=>r.release===selection.release && r.level_of_government===selection.level
    && r.sector===selection.sector && (!selection.jurisdiction || r.jurisdiction===selection.jurisdiction))
  const notes=['ABS reports expenses by purpose using COFOG-A. Division totals and the published groups inside them are separate rows: adding both would count the same expenses twice.',
    'These workbooks publish labels without numeric classification codes. Combined categories retain their published wording; each figure links to its original cell.',
    'Education by purpose is a separate series. ABS consolidates transfers within each published group. OPAX adds nothing up: each share is one published division divided by the same group’s published total expenses.']
  if(!selected.length)return {rejected:false,html:`<section class="ui-section gfs-section" data-accent="money" aria-labelledby="gfs-functions"><h2 id="gfs-functions" class="ui-section-title">Spending by function</h2><p class="ui-empty">A function breakdown is not available in this snapshot for this level and sector. Choose a general government group.</p>${source(notes)}</section>`}
  const latest=selected.map(r=>r.reference_year).sort().at(-1)!
  const latestRows=selected.filter(r=>r.reference_year===latest)
  const jurisdictions=[...new Set(latestRows.map(r=>r.jurisdiction))].sort()
  const first=lead && jurisdictions.includes(lead)?lead:jurisdictions.includes('Australia')?'Australia':jurisdictions[0]
  const heading=(j:string)=>governmentFinanceGroupHeading(selection.level,j)
  const split=(j:string)=>functionBreakdown(latestRows.filter(r=>r.jurisdiction===j))
  const main=split(first),order=main.bars.map(b=>normalize(b.row.division)+'|'+b.name)
  const groupLine=(b:FunctionBar)=>b.groups.length?`<p class="gfs-fn-groups">Published groups within it: ${b.groups.map(g=>`${esc(g.function_as_published)} ${cell(g)}`).join(' · ')}</p>`:''
  const educationNote='<p class="gfs-fn-only">Education only; this workbook does not publish an all-function split for this group.</p>'
  const total=(t:GFSFunctionRow|undefined,label:string)=>t?`<p class="gfs-fn-total"><span>${label}</span>${cell(t)}</p>`:''
  const leadHTML=`<div class="gfs-fn-lead" data-gfs-group="${esc(first)}"><h3 class="gfs-group-name">${esc(heading(first))}</h3><p class="gfs-consolidation">${esc((main.total||main.bars[0]?.row)?.consolidation)}</p>${main.educationOnly?educationNote:''}`
    +`<ol class="gfs-fn-bars">${main.bars.map(b=>`<li class="gfs-fn"><div class="gfs-fn-head"><span class="gfs-fn-name">${esc(b.name)}</span><span class="gfs-fn-figure">${cell(b.row)}${b.share!==null?`<span class="gfs-fn-share">${pct(b.share)}</span>`:''}</span></div><span class="ui-bar gfs-fn-track" aria-hidden="true"><i style="width:${width(b.width)}"></i></span>${groupLine(b)}</li>`).join('')}</ol>`
    +total(main.total,main.educationOnly?'Total operating expenses on education':'Total expenses')+'</div>'
  const others=jurisdictions.filter(j=>j!==first).map(j=>{
    const s=split(j),rank=(b:FunctionBar)=>{const i=order.indexOf(normalize(b.row.division)+'|'+b.name);return i<0?order.length:i}
    const bars=[...s.bars].sort((a,b)=>rank(a)-rank(b))
    return `<article class="gfs-fn-card" data-gfs-group="${esc(j)}"><h4 class="gfs-group-name">${esc(heading(j))}</h4>${s.educationOnly && !main.educationOnly?educationNote:''}${total(s.total,s.educationOnly?'Education total':'Total expenses')}<ol class="gfs-fn-mini">${bars.map(b=>`<li><span class="gfs-fn-name">${esc(b.name)}</span>${cell(b.row)}<span class="ui-bar" aria-hidden="true"><i style="width:${width(b.width)}"></i></span></li>`).join('')}</ol></article>`
  }).join('')
  const provenance=`<details class="ui-disclosure gfs-cells"><summary>Original cells and source hashes</summary><div class="ui-disclosure-body">${jurisdictions.map(j=>{
    const rows=latestRows.filter(r=>r.jurisdiction===j),files=[...new Map(rows.map(r=>[r.workbook,r])).values()]
    return `<p><strong>${esc(heading(j))}</strong> · ${esc(rows[0].consolidation)}<br>${rows.map(r=>`<a href="${esc(r.source_url)}">${esc(r.function_as_published)} · ${esc(r.sheet+'!'+r.cell)}</a>`).join(' · ')}<br>${files.map(r=>`${esc(r.workbook)} · Snapshot ${esc(r.snapshot)} · SHA-256 ${esc(r.sha256)}`).join('<br>')}</p>`
  }).join('')}</div></details>`
  const config=governmentFunctionTableConfig(governmentFunctionRows({...h,function_rows:selected})),guarded=guardTableURL(config,url)
  const what=main.educationOnly?'education expenses by purpose':'expenses by purpose'
  return {rejected:guarded.rejected,html:`<section class="ui-section gfs-section" data-accent="money" aria-labelledby="gfs-functions"><h2 id="gfs-functions" class="ui-section-title">Spending by function</h2>`
    +`<p class="ui-section-note">${esc(fy(latest))} ${esc(what)} for ${esc(selection.level.toLowerCase())} ${esc(selection.sector.toLowerCase())}, largest first. Each bar is that function’s share of the group’s published total; the published groups inside a function are listed under it and are already part of it.</p>`
    +leadHTML+(others?`<h3 class="ui-subsection-title gfs-fn-each">Each jurisdiction</h3><p class="gfs-note">Same order as above. Each bar is measured against that jurisdiction’s own total expenses, so the shapes compare even where the totals differ.</p><div class="gfs-fn-grid">${others}</div>`:'')
    +provenance
    +`<h3 id="gfs-function-series" class="ui-subsection-title">Year-by-year spending by function</h3><p class="gfs-note">Every published division and group from ${esc(fy(selected.map(r=>r.reference_year).sort()[0]))} to ${esc(fy(latest))}. Filter by division, published row level, series or year; the CSV keeps original labels, empty code fields, workbook cells, source values and snapshot hashes.</p>${registerTableHTML(config,guarded.query,url)}`
    +source(notes)+'</section>'}
}
