import {formatCell, guardTableURL, type Row} from '../public/datatable.js'
import {governmentFinanceTableConfig, registerTableHTML} from '../public/register-tables.js'
import {clearedGovernmentFunctions, spendingByFunction, type GFSFunctionRow} from './government-finance-functions.ts'
import {governmentFinanceGroupHeading} from './government-finance-groups.ts'

const CC='https://creativecommons.org/licenses/by/4.0/'
const SOURCE='https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const sha=(v:unknown)=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v)
const original=(v:unknown)=>typeof v==='string' && /^https:\/\/www\.abs\.gov\.au\/statistics\/economy\/government\/government-finance-statistics-annual\/\d{4}-\d{2}\/55120DO\d{3}_\d{6}\.xlsx$/.test(v)
const names:Record<string,string>={revenue:'Revenue',expenses:'Expenses',net_operating_balance:'Net operating balance',net_lending_borrowing:'Net lending / borrowing',net_debt_l2:'Net debt (L2)',net_worth:'Net worth'}
type Dimensions={level_of_government:string;jurisdiction:string;sector:string;consolidation:string}
type Receipt={snapshot:string;sha256:string;status:number;challenge:boolean}
export type GFSRow=Dimensions & Receipt & {release:string;release_date:string;reference_year:string;measure:string;measure_as_published:string;value:number|null;source_marker?:unknown;unit:string;prices_basis:string;series_basis:string;published:boolean;workbook:string;sheet:string;cell:string;source_url:string;licence:string;licence_url:string}
type Document={id:string;url:string;title:string;release:string;release_date:string;status:string;held?:boolean;dimensions:Dimensions|null;receipt:Receipt;licence:{status:string;url:string;workbook_reviewed:boolean};exceptions:unknown[];series_dimensions?:Dimensions[];function_dimensions?:Record<string,Dimensions>}
export type GFSHub={schema:number;generated_at:string;release:string;release_date:string;release_url:string;licence:{name:string;url:string;terms_url:string;attribution:string;changes:string};documents:Document[];rows:GFSRow[];function_rows?:GFSFunctionRow[]}
type Read=()=>Promise<GFSHub>
type Block=(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string
export const governmentFinanceReader=(assets:Fetcher):Read=>async()=>{
  const response=await assets.fetch(new Request('https://opax.com.au/government-finance/data.json'))
  if(!response.ok)throw Error('Reviewed GFS snapshot unavailable')
  return response.json() as Promise<GFSHub>
}

/** The page, hydration and CSV share this serving boundary. No aggregate builder. */
export function clearedGFSDocuments(h:GFSHub){
  if(h?.schema!==1 || !Array.isArray(h.documents) || h.licence?.url!==CC)return new Map<string,Document>()
  return new Map(h.documents.filter(d=>d?.status==='cleared' && !d.held && d.licence?.status==='open'
    && d.licence.url===CC && d.licence.workbook_reviewed===true && Array.isArray(d.exceptions) && !d.exceptions.length
    && original(d.url) && d.receipt?.status===200 && !d.receipt.challenge && sha(d.receipt.sha256)).map(d=>[d.id+'.xlsx',d]))
}
export function clearedGovernmentFinance(h:GFSHub):GFSRow[]{
  if(!Array.isArray(h?.rows))return []
  const docs=clearedGFSDocuments(h)
  const seen=new Set<string>()
  return h.rows.filter(r=>{
    const d=docs.get(r?.workbook),dimensions=d?.dimensions?[d.dimensions]:d?.series_dimensions||[]
    if(!d || r.published!==true || !Object.hasOwn(names,r.measure) || r.release!==d.release || r.release_date!==d.release_date
      || r.source_url!==d.url || r.sha256!==d.receipt.sha256 || r.snapshot!==d.receipt.snapshot
      || r.licence_url!==CC || r.unit!=='AUD million' || r.prices_basis!=='Current prices' || r.series_basis!=='Original'
      || r.value!==null && (typeof r.value!=='number' || !Number.isFinite(r.value))
      || !/^\d{4}-\d{2}$/.test(r.reference_year) || !/^Table_\d+$/.test(r.sheet) || !/^[A-Z]{1,3}[1-9]\d*$/.test(r.cell)
      || !dimensions.some(x=>x.level_of_government===r.level_of_government && x.jurisdiction===r.jurisdiction && x.sector===r.sector && x.consolidation===r.consolidation))return false
    const key=JSON.stringify([r.release,r.level_of_government,r.jurisdiction,r.sector,r.measure,r.reference_year,r.unit,r.prices_basis])
    if(seen.has(key))return false
    seen.add(key);return true
  })
}

export function governmentFinanceRows(h:GFSHub):Row[]{
  return clearedGovernmentFinance(h).map(r=>({release:r.release,release_date:r.release_date,level:r.level_of_government,jurisdiction:r.jurisdiction,
    sector:r.sector,measure:names[r.measure],reference_year:r.reference_year,amount:r.value===null?null:r.value*1e6,
    value_million:r.value,source_marker:r.source_marker??'',unit:r.unit,prices_basis:r.prices_basis,series_basis:r.series_basis,
    consolidation:r.consolidation,publisher:'Australian Bureau of Statistics',source_url:r.source_url,
    source_locator:`${r.workbook} · ${r.sheet}!${r.cell}`,snapshot:r.snapshot,sha256:r.sha256,licence:r.licence,licence_url:r.licence_url}))
}
const amount=(r:GFSRow|undefined)=>!r || r.value===null?'Not published':formatCell(r.value*1e6,{key:'amount',label:'Amount',type:'money'})
const cellLink=(r:GFSRow)=>`<a href="${esc(r.source_url)}" title="${esc(r.workbook+' · '+r.sheet+'!'+r.cell)}">${esc(amount(r))}</a>`
const receipt=(h:GFSHub,releaseDate:string)=>`<p class="gfs-receipt">Source: <a href="${esc(h.release_url)}">Australian Bureau of Statistics</a> · Released ${esc(releaseDate)} · Snapshot ${esc(h.generated_at.slice(0,10))} UTC · <a href="${CC}">CC BY 4.0</a></p>`

export async function governmentFinancePage(url:URL,read:Read,block:Block){
  const error=(status:number,text:string)=>({status,title:'Government finance · OPAX',description:text,noindex:true,
    prerender:block('Government finance',text,`<a href="${SOURCE}">Read the original ABS release</a>`)+`<div class="wrap gfs-content"><p>Source: Australian Bureau of Statistics. Release: 2024–25. Snapshot: unavailable. Workbook reuse has not been cleared for this view. <a href="https://www.abs.gov.au/website-privacy-copyright-and-disclaimer">Publisher terms</a>.</p></div>`})
  let h:GFSHub
  try{h=await read()}catch{return error(503,'Government finance figures are temporarily unavailable.')}
  const headlines=clearedGovernmentFinance(h),all=[...headlines,...clearedGovernmentFunctions(h)]
  if(!all.length)return error(503,'Government finance figures are temporarily unavailable.')
  const choices=(rows:(GFSRow|GFSFunctionRow)[],key:'release'|'level_of_government'|'sector'|'jurisdiction')=>[...new Set(rows.map(r=>String(r[key])))].sort()
  const releases=choices(all,'release')
  const release=url.searchParams.get('release')||releases.at(-1)!
  const requestedLevel=url.searchParams.get('level')||'State',requestedSector=url.searchParams.get('sector')||'General government'
  const requestedJurisdiction=url.searchParams.get('jurisdiction')||''
  const tableKeys=[...['q','sort','page','pageSize','f.reference_year','f.measure'].map(k=>'gfs.'+k),...['q','sort','page','pageSize','f.reference_year','f.division','f.measure','f.function_level'].map(k=>'gfsFunction.'+k)]
  const allowed=new Set(['release','level','sector','jurisdiction',...tableKeys])
  if([...url.searchParams.keys()].some(k=>!allowed.has(k)||url.searchParams.getAll(k).length!==1) || !releases.includes(release)
    || url.searchParams.has('level') && !choices(all,'level_of_government').includes(requestedLevel)
    || url.searchParams.has('sector') && !choices(all,'sector').includes(requestedSector)
    || requestedJurisdiction && !choices(all,'jurisdiction').includes(requestedJurisdiction))return error(400,'Choose a published release, government level, jurisdiction and sector.')
  // Higher-level choices take priority. A previously published lower-level
  // selection can become stale after a release/level change; reset it in order.
  const released=all.filter(r=>r.release===release),levels=choices(released,'level_of_government')
  const level=levels.includes(requestedLevel)?requestedLevel:levels[0]
  const levelRows=released.filter(r=>r.level_of_government===level),sectors=choices(levelRows,'sector')
  const sector=sectors.includes(requestedSector)?requestedSector:sectors[0]
  const sectorRows=levelRows.filter(r=>r.sector===sector),jurisdictions=choices(sectorRows,'jurisdiction')
  const jurisdiction=!requestedJurisdiction?'':jurisdictions.includes(requestedJurisdiction)?requestedJurisdiction:jurisdictions[0]
  if(level!==requestedLevel)url.searchParams.set('level',level)
  if(sector!==requestedSector)url.searchParams.set('sector',sector)
  if(jurisdiction!==requestedJurisdiction)url.searchParams.set('jurisdiction',jurisdiction)
  const selected=headlines.filter(r=>r.release===release && r.level_of_government===level && r.sector===sector && (!jurisdiction || r.jurisdiction===jurisdiction))
  const latest=[...new Set(selected.map(r=>r.reference_year))].sort().at(-1)
  const latestRows=selected.filter(r=>r.reference_year===latest)
  const releaseDate=selected[0]?.release_date||h.release_date
  const options=(values:string[],selectedValue:string)=>values.map(v=>`<option${v===selectedValue?' selected':''}>${esc(v)}</option>`).join('')
  const filters=`<form class="gfs-filters" action="/register/government-finance" method="get"><label>Release<select name="release">${options(releases,release)}</select></label><label>Level of government<select name="level">${options(levels,level)}</select></label><label>Sector<select name="sector">${options(sectors,sector)}</select></label><label>Jurisdiction<select name="jurisdiction"><option value="">All published jurisdictions</option>${options(jurisdictions,jurisdiction)}</select></label><button type="submit">Show figures</button></form>`
  const cards=[...new Set(latestRows.map(r=>r.jurisdiction))].sort().map(j=>{
    const rows=latestRows.filter(r=>r.jurisdiction===j)
    const sources=[...new Map(rows.map(r=>[r.workbook,r])).values()]
    return `<article class="gfs-jurisdiction"><h3>${esc(governmentFinanceGroupHeading(rows[0].level_of_government,j))}</h3><p class="gfs-receipt">${esc((rows.find(r=>r.measure==='revenue')||rows[0]).consolidation)}</p><dl>${Object.entries(names).flatMap(([key,label])=>{const r=rows.find(r=>r.measure===key);return r?[`<div><dt>${label}</dt><dd>${r.value!==null?cellLink(r):'Not published'}</dd></div>`]:[]}).join('')}</dl>${receipt(h,releaseDate)}<details><summary>Original cells and source hashes</summary>${rows.map(r=>`<p><a href="${esc(r.source_url)}">${esc(names[r.measure])} · ${esc(r.sheet+'!'+r.cell)}</a></p>`).join('')}${sources.map(r=>`<p>${esc(r.workbook)} · Snapshot ${esc(r.snapshot)}<br>SHA-256 ${esc(r.sha256)}</p>`).join('')}</details></article>`
  }).join('')
  const rows=governmentFinanceRows({...h,rows:selected}),config=governmentFinanceTableConfig(rows),guarded=guardTableURL(config,url)
  if(guarded.rejected)return error(400,'Choose one value for each table filter.')
  const description='Revenue, expenses, balances and debt from ABS annual public-sector accounts, with published consolidation levels and original source cells.'
  const table=registerTableHTML(config,guarded.query,url)
  const functions=spendingByFunction(h,url,{release,level,sector,jurisdiction})
  if(functions.rejected)return error(400,'Choose one value for each function table filter.')
  const html=block('Government finance',description,'',[{label:'Government finance'}])+`<div class="wrap gfs-content"><p class="gfs-lede">ABS records revenue and expenses when economic activity occurs (accrual accounting), using a common standard across governments. Budget papers can differ in scope and forecasts. ABS consolidates transfers within each published group: figures cannot be added across levels or jurisdictions. Only published totals appear here.</p>${receipt(h,releaseDate)}${filters}<section aria-labelledby="gfs-headlines"><h2 id="gfs-headlines">${esc(latest||release)} · ${esc(level)} · ${esc(sector)}</h2><p>Australian dollars, current prices, original series. Negative net lending / borrowing means net borrowing. Net debt (L2) is shown only where ABS publishes it; an unavailable value is distinct from zero.</p><p>The debt matrix publishes six L2 figures for 30 June 2025. It uses a separate “National” group rather than Commonwealth, and does not give individual-state or earlier-year net debt in these downloads.</p><div class="gfs-jurisdictions">${cards||'<p>This release does not publish figures for this combination. Choose another level or sector.</p>'}</div>${receipt(h,releaseDate)}</section>${functions.html}<section aria-labelledby="gfs-series"><h2 id="gfs-series">Year-by-year series</h2><p>Each row retains the release it came from, including revised earlier years. Display amounts use lowercase m/bn; the CSV also retains the original AUD million value, source cell, snapshot and SHA-256.</p>${table}${receipt(h,releaseDate)}</section><section aria-labelledby="gfs-source"><h2 id="gfs-source">Source and reuse</h2><p><a href="${esc(h.release_url)}">${esc(h.licence.attribution)}</a> Released ${esc(releaseDate)}.</p><p>${esc(h.licence.changes)}</p><p><a href="${esc(h.licence.terms_url)}">ABS copyright terms</a> apply to the numerical tables under <a href="${CC}">CC BY 4.0</a>. Workbook notices were reviewed individually. The Commonwealth Coat of Arms, ABS logo, trade marks and third-party material are excluded. <a href="https://www.abs.gov.au/how-cite-abs-sources">ABS citation guidance</a>.</p>${receipt(h,releaseDate)}</section></div>`
  return {status:200,title:'Government finance · OPAX',description,noindex:Boolean(url.search),prerender:html}
}
