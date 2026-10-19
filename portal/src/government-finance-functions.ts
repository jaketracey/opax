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
export function spendingByFunction(h:GFSHub,url:URL,selection:{release:string;level:string;sector:string;jurisdiction:string}){
  const selected=clearedGovernmentFunctions(h).filter(r=>r.release===selection.release && r.level_of_government===selection.level
    && r.sector===selection.sector && (!selection.jurisdiction || r.jurisdiction===selection.jurisdiction))
  if(!selected.length)return {rejected:false,html:`<section aria-labelledby="gfs-functions"><h2 id="gfs-functions">Spending by function</h2><p>A function breakdown is not available in this snapshot for this level and sector. Choose a general government group.</p>${receipt(h)}</section>`}
  const latest=selected.map(r=>r.reference_year).sort().at(-1)
  const latestRows=selected.filter(r=>r.reference_year===latest)
  const cards=[...new Set(latestRows.map(r=>r.jurisdiction))].sort().map(j=>{
    const rows=latestRows.filter(r=>r.jurisdiction===j),functions=rows.filter(r=>r.measure==='expenses_by_function' && r.function_level!=='group')
    const display=functions.length?functions:rows.filter(r=>r.measure==='education_operating_expenses')
    return `<article class="gfs-function-jurisdiction"><h3>${esc(governmentFinanceGroupHeading(display[0].level_of_government,j))}</h3><p class="gfs-receipt">${esc(display[0].consolidation)}</p>${functions.length?'':'<p>Education only; this workbook does not publish an all-function split for this group.</p>'}<dl>${display.map(r=>`<div${r.function_level==='total'?' class="gfs-function-total"':''}><dt>${esc(r.function_as_published)}</dt><dd><a href="${esc(r.source_url)}" title="${esc(r.workbook+' · '+r.sheet+'!'+r.cell)}">${r.value===null?'Not published':formatCell(r.value*1e6,{key:'amount',label:'Amount',type:'money'})}</a></dd></div>`).join('')}</dl>${receipt(h)}<details><summary>Original cells and source hashes</summary>${display.map(r=>`<p><a href="${esc(r.source_url)}">${esc(r.function_as_published)} · ${esc(r.sheet+'!'+r.cell)}</a><br>Snapshot ${esc(r.snapshot)} · SHA-256 ${esc(r.sha256)}</p>`).join('')}</details></article>`
  }).join('')
  const config=governmentFunctionTableConfig(governmentFunctionRows({...h,function_rows:selected})),guarded=guardTableURL(config,url)
  return {rejected:guarded.rejected,html:`<section aria-labelledby="gfs-functions"><h2 id="gfs-functions">Spending by function</h2><p>${esc(latest)} · ${esc(selection.level)} · ${esc(selection.sector)}. ABS reports expenses by purpose using COFOG-A. Division totals and published groups are separate rows; adding both would count the same expenses twice. Australian dollars, current prices, original series.</p><p>These workbooks publish labels without numeric classification codes. Combined categories retain their published wording. Education by purpose is a separate series; ABS consolidates transfers within each published group. No totals are calculated across levels, jurisdictions or functions for display.</p><div class="gfs-jurisdictions gfs-function-split">${cards}</div><h3 id="gfs-function-series">Year-by-year spending by function</h3><p>Filter by division, published row level, series or year. CSV retains original labels, empty code fields, workbook cells, source values and snapshot hashes.</p>${registerTableHTML(config,guarded.query,url)}${receipt(h)}</section>`}
}
function receipt(h:GFSHub){return `<p class="gfs-receipt">Source: <a href="${esc(h.release_url)}">Australian Bureau of Statistics</a> · Release ${esc(h.release)} · Released ${esc(h.release_date)} · Snapshot ${esc(h.generated_at.slice(0,10))} UTC · <a href="${CC}">CC BY 4.0</a></p>`}
