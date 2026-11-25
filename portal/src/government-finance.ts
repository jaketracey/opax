import {formatCell, guardTableURL, type Row} from '../public/datatable.js'
import {governmentFinanceTableConfig, registerTableHTML} from '../public/register-tables.js'
import {clearedGovernmentFunctions, spendingByFunction, type GFSFunctionRow} from './government-finance-functions.ts'
import {governmentFinanceGroupHeading} from './government-finance-groups.ts'
import {sourceLineHTML} from '../public/party-page.js'
import {shortDate} from '../public/format.js'

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
const MONEY={key:'amount',label:'Amount',type:'money'} as const
const amount=(r:GFSRow|undefined)=>!r || r.value===null?'Not published':formatCell(r.value*1e6,MONEY)
const dollars=(million:number)=>formatCell(Math.abs(million)*1e6,MONEY)
const cellLink=(r:GFSRow)=>`<a href="${esc(r.source_url)}" title="${esc(r.workbook+' · '+r.sheet+'!'+r.cell)}">${esc(amount(r))}</a>`
const fy=(y:string)=>y.replace('-','–')
const yearEnd=(y:string)=>`30 June ${Number(y.slice(0,4))+1}`
const stock=new Set(['net_worth','net_debt_l2'])
const notes:Record<string,string>={revenue:'Taxes, grants and other income',expenses:'Cost of services; new assets are not expenses',net_operating_balance:'Revenue less expenses',
  net_lending_borrowing:'Also counts net spending on new assets',net_worth:'What it owns less what it owes',net_debt_l2:'Debt less cash and financial assets'}

/** The group in a sentence: "total state governments", "the New South Wales government". */
function groupName(level:string,jurisdiction:string){
  if(jurisdiction!=='Australia')return ({State:`the ${jurisdiction} government`,Local:`local government in ${jurisdiction}`,'State and local':`state and local government in ${jurisdiction}`} as Record<string,string>)[level]??jurisdiction
  return ({Commonwealth:'the Commonwealth government','All levels of government':'all levels of government in Australia','Control n.f.d.':'bodies whose level of government is not further defined (Control n.f.d.)'} as Record<string,string>)[level]
    ??governmentFinanceGroupHeading(level,jurisdiction).toLowerCase()
}
const sectorName=(sector:string)=>/government$/i.test(sector)?sector.toLowerCase()+' sector':sector.charAt(0).toLowerCase()+sector.slice(1)

/** The year in plain words, from published cells only: each figure is named,
 *  and a balance's sign becomes surplus or deficit. Nothing is added up. */
export function governmentFinanceSummary(rows:GFSRow[],level:string,jurisdiction:string,sector:string){
  const year=rows[0]?.reference_year,get=(m:string)=>rows.find(r=>r.measure===m && r.value!==null)
  if(!year)return ''
  const [R,E,B,L,W,D]=['revenue','expenses','net_operating_balance','net_lending_borrowing','net_worth','net_debt_l2'].map(get)
  const group=`${groupName(level,jurisdiction)} (${sectorName(sector)})`,out:string[]=[]
  if(R && E)out.push(`In ${fy(year)}, ${group} recorded revenue of ${amount(R)} and expenses of ${amount(E)}.`)
  else if(R || E)out.push(`In ${fy(year)}, ${group} recorded ${R?'revenue':'expenses'} of ${amount(R||E)}.`)
  if(B){
    const v=B.value!,kind=v<0?'deficit':'surplus'
    out.push(v===0?'Revenue and expenses were equal.':out.length?`That is an operating ${kind} of ${dollars(v)}.`:`In ${fy(year)}, ${group} recorded an operating ${kind} of ${dollars(v)}.`)
  }
  if(L){
    const v=L.value!
    out.push(v===0?'Counting net spending on new assets, it neither lent nor borrowed.':`Counting net spending on new assets such as roads and buildings, net ${v<0?'borrowing':'lending'} was ${dollars(v)}.`)
  }
  if(W || D){
    const parts=[...W?[`net worth was ${amount(W)}`]:[],...D?[`net debt (L2) was ${amount(D)}`]:[]]
    out.push(out.length?`At ${yearEnd(year)}, ${parts.join(' and ')}.`:`For ${group}, at ${yearEnd(year)}, ${parts.join(' and ')}.`)
  }
  return out.join(' ')
}

export type TrendPoint={year:string;revenue?:GFSRow;expenses?:GFSRow;balance?:GFSRow}
/** One group's published series, oldest year first. */
export function governmentFinanceTrend(rows:GFSRow[]):TrendPoint[]{
  const years=[...new Set(rows.map(r=>r.reference_year))].sort()
  const at=(m:string,y:string)=>rows.find(r=>r.measure===m && r.reference_year===y)
  return years.map(year=>({year,revenue:at('revenue',year),expenses:at('expenses',year),balance:at('net_operating_balance',year)}))
}
/** A round chart ceiling at or above v: 409,492 → 450,000; 26,337 → 30,000. */
export const niceCeiling=(v:number)=>{if(!(v>0))return 0;const half=10**Math.floor(Math.log10(v))/2;return Math.ceil(v/half-1e-9)*half}
/** Surplus and deficit years in a series, and the largest of each. */
export function balanceStory(points:TrendPoint[]){
  const known=points.filter(p=>typeof p.balance?.value==='number') as (TrendPoint & {balance:GFSRow & {value:number}})[]
  const deficits=known.filter(p=>p.balance.value<0),surpluses=known.filter(p=>p.balance.value>0)
  const pick=(list:typeof known,sign:number)=>list.reduce<typeof known[number]|undefined>((best,p)=>!best || sign*p.balance.value>sign*best.balance.value?p:best,undefined)
  return {years:known.length,deficits:deficits.length,surpluses:surpluses.length,largestDeficit:pick(deficits,-1),largestSurplus:pick(surpluses,1)}
}
const num=(v:number)=>v.toFixed(1)
function ticks(labels:[number,string][]){return labels.map(([at,text])=>`<span class="gfs-tick" style="top:${num(at*100)}%">${esc(text)}</span>`).join('')}
/** Year labels under a chart: every other year, counted back from the latest, so the latest is always labelled. */
function axis(points:TrendPoint[]){const n=points.length;return `<div class="gfs-axis" aria-hidden="true" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${points.map((p,i)=>`<span${(n-1-i)%2?' class="is-minor"':''}>${esc(fy(p.year))}</span>`).join('')}</div>`}
function trendHTML(points:TrendPoint[],name:string){
  const n=points.length,W=600,H=200,x=(i:number)=>num((i+0.5)/n*W)
  const lineValues=points.flatMap(p=>[p.revenue?.value,p.expenses?.value]).filter((v):v is number=>typeof v==='number')
  const lines=points.filter(p=>typeof p.revenue?.value==='number' && typeof p.expenses?.value==='number').length>=3
  const balances=points.filter(p=>typeof p.balance?.value==='number').length>=3
  if(!lines && !balances)return ''
  const first=points[0],last=points.at(-1)!
  let left='',right=''
  if(lines){
    const hi=niceCeiling(Math.max(...lineValues)),lo=Math.min(0,-niceCeiling(-Math.min(...lineValues)))
    const y=(v:number)=>num(H-(v-lo)/(hi-lo)*H)
    const path=(key:'revenue'|'expenses')=>{let d='',pen=false;points.forEach((p,i)=>{const v=p[key]?.value;if(typeof v!=='number'){pen=false;return}d+=`${pen?'L':'M'}${x(i)} ${y(v)} `;pen=true});return d.trim()}
    const from=(key:'revenue'|'expenses')=>points.find(p=>typeof p[key]?.value==='number'),to=(key:'revenue'|'expenses')=>[...points].reverse().find(p=>typeof p[key]?.value==='number')
    const said=(key:'revenue'|'expenses',label:string)=>`${label} went from ${amount(from(key)![key])} in ${fy(from(key)!.year)} to ${amount(to(key)![key])} in ${fy(to(key)!.year)}`
    const caption=`${said('revenue','Revenue')}; ${said('expenses','expenses')}.`
    left=`<div class="gfs-chart"><h3 class="gfs-chart-title" id="gfs-trend-lines">Revenue and expenses</h3><p class="ui-legend gfs-legend"><span class="gfs-key gfs-key-revenue">Revenue ${esc(amount(to('revenue')!.revenue))}</span><span class="gfs-key gfs-key-expenses">Expenses ${esc(amount(to('expenses')!.expenses))}</span></p>`
      +`<div class="gfs-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-labelledby="gfs-trend-lines gfs-trend-lines-text"><line class="gfs-grid" x1="0" x2="${W}" y1="0" y2="0"/><line class="gfs-grid" x1="0" x2="${W}" y1="${num(H/2)}" y2="${num(H/2)}"/><line class="gfs-zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>`
      +`<path class="gfs-line gfs-line-expenses" d="${path('expenses')}"/><path class="gfs-line gfs-line-revenue" d="${path('revenue')}"/>`
      +points.map((p,i)=>`<rect class="gfs-hit" x="${num(i/n*W)}" y="0" width="${num(W/n)}" height="${H}"><title>${esc(fy(p.year))}: revenue ${esc(amount(p.revenue))}, expenses ${esc(amount(p.expenses))}</title></rect>`).join('')
      +`</svg>${ticks([[0,formatCell(hi*1e6,MONEY)],[0.5,formatCell((hi+lo)/2*1e6,MONEY)],[(hi)/(hi-lo),'$0']])}</div>${axis(points)}<p class="gfs-chart-text" id="gfs-trend-lines-text">${esc(caption)}</p></div>`
  }
  if(balances){
    const values=points.map(p=>p.balance?.value).filter((v):v is number=>typeof v==='number')
    const hi=Math.max(0,niceCeiling(Math.max(...values))),lo=Math.min(0,-niceCeiling(-Math.min(...values)))
    const span=hi-lo||1,zero=H*hi/span,bar=W/n*0.56
    const story=balanceStory(points)
    const text=[`${story.deficits} deficit${story.deficits===1?'':'s'} and ${story.surpluses} surplus${story.surpluses===1?'':'es'} in ${story.years} years.`,
      story.largestDeficit?`Largest deficit: ${dollars(story.largestDeficit.balance.value)} in ${fy(story.largestDeficit.year)}.`:'',
      story.largestSurplus?`Largest surplus: ${dollars(story.largestSurplus.balance.value)} in ${fy(story.largestSurplus.year)}.`:''].filter(Boolean).join(' ')
    right=`<div class="gfs-chart"><h3 class="gfs-chart-title" id="gfs-trend-balance">Net operating balance</h3><p class="ui-legend gfs-legend"><span class="gfs-key gfs-key-surplus">Surplus</span><span class="gfs-key gfs-key-deficit">Deficit</span></p>`
      +`<div class="gfs-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-labelledby="gfs-trend-balance gfs-trend-balance-text">`
      +points.map((p,i)=>{const v=p.balance?.value;if(typeof v!=='number')return '';const h=Math.abs(v)/span*H,top=v>=0?zero-h:zero
        return `<rect class="gfs-bar ${v<0?'is-deficit':'is-surplus'}" x="${num((i+0.5)/n*W-bar/2)}" y="${num(top)}" width="${num(bar)}" height="${num(Math.max(h,0.5))}"><title>${esc(fy(p.year))}: ${esc(amount(p.balance))}</title></rect>`}).join('')
      +`<line class="gfs-zero" x1="0" x2="${W}" y1="${num(zero)}" y2="${num(zero)}"/></svg>${ticks([...hi>0?[[0,formatCell(hi*1e6,MONEY)] as [number,string]]:[],[zero/H,'$0'],...lo<0?[[1,formatCell(lo*1e6,MONEY)] as [number,string]]:[]])}</div>${axis(points)}<p class="gfs-chart-text" id="gfs-trend-balance-text">${esc(text)}</p></div>`
  }
  const table=`<details class="ui-disclosure gfs-trend-data"><summary>Figures behind the charts</summary><div class="ui-disclosure-body gfs-table-scroll"><table class="ui-table"><caption class="dt-sr">${esc(name)}: revenue, expenses and net operating balance by year</caption><thead><tr><th scope="col">Year</th><th scope="col" class="ui-num">Revenue</th><th scope="col" class="ui-num">Expenses</th><th scope="col" class="ui-num">Net operating balance</th></tr></thead><tbody>${
    [...points].reverse().map(p=>`<tr><th scope="row">${esc(fy(p.year))}</th>${(['revenue','expenses','balance'] as const).map(k=>`<td class="ui-num">${p[k]?cellLink(p[k]!):''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`
  return `<figure class="gfs-trend" aria-label="${esc(name)}, ${esc(fy(first.year))} to ${esc(fy(last.year))}"><div class="gfs-trend-grid">${left}${right}</div>${table}</figure>`
}

function compareHTML(latestRows:GFSRow[],level:string){
  const groups=[...new Set(latestRows.map(r=>r.jurisdiction))].sort()
  if(groups.length<2)return ''
  const keys=Object.keys(names).filter(k=>latestRows.some(r=>r.measure===k && r.jurisdiction!=='Australia'))
  const scaled=latestRows.filter(r=>r.jurisdiction!=='Australia' && ['revenue','expenses'].includes(r.measure) && typeof r.value==='number' && r.value>0)
  const max=Math.max(0,...scaled.map(r=>r.value!))
  const row=(j:string)=>{
    const rows=latestRows.filter(r=>r.jurisdiction===j),total=j==='Australia'
    return `<tr data-gfs-group="${esc(j)}"${total?' class="is-total"':''}><th scope="row"><span class="gfs-group-name">${esc(governmentFinanceGroupHeading(level,j))}</span>${total?'<small>ABS published total, not a sum of the rows below</small>':''}</th>${keys.map(k=>{
      const r=rows.find(r=>r.measure===k),bar=!total && r && typeof r.value==='number' && r.value>0 && max>0 && (k==='revenue' || k==='expenses')
      return `<td class="ui-num" data-label="${esc(names[k])}">${r?cellLink(r):'<span class="dt-sr">No figure published for this group</span>'}${bar?`<span class="gfs-bar-track gfs-bar-${k}" aria-hidden="true"><i style="width:${num(r!.value!/max*100)}%"></i></span>`:''}</td>`}).join('')}</tr>`
  }
  return `<div class="gfs-table-scroll"><table class="ui-table gfs-compare"><caption class="dt-sr">Latest published figures for each group</caption><thead><tr><th scope="col">Group</th>${keys.map(k=>`<th scope="col" class="ui-num">${esc(names[k])}</th>`).join('')}</tr></thead><tbody>${groups.map(row).join('')}</tbody></table></div>`
}
function cellsHTML(latestRows:GFSRow[],level:string){
  return `<details class="ui-disclosure gfs-cells"><summary>Original cells and source hashes</summary><div class="ui-disclosure-body">${[...new Set(latestRows.map(r=>r.jurisdiction))].sort().map(j=>{
    const rows=latestRows.filter(r=>r.jurisdiction===j),files=[...new Map(rows.map(r=>[r.workbook,r])).values()]
    return `<p><strong>${esc(governmentFinanceGroupHeading(level,j))}</strong> · ${esc(rows[0].consolidation)}<br>${rows.map(r=>`<a href="${esc(r.source_url)}">${esc(names[r.measure])} · ${esc(r.sheet+'!'+r.cell)}</a>`).join(' · ')}<br>${files.map(r=>`${esc(r.workbook)} · Snapshot ${esc(r.snapshot)} · SHA-256 ${esc(r.sha256)}`).join('<br>')}</p>`
  }).join('')}</div></details>`
}

const terms:[string,string][]=[
  ['Revenue','Income a government earns in the year: mostly taxes, plus grants from other governments, sales of goods and services, and interest and dividends.'],
  ['Expenses','The cost of providing services in the year: wages, goods and services, grants and benefits paid, interest, and assets wearing out (depreciation). Buying a new asset is not an expense.'],
  ['Net operating balance','Revenue minus expenses. Positive is an operating surplus; negative is an operating deficit.'],
  ['Net lending / borrowing','The net operating balance after also counting net spending on new physical assets such as roads, schools and hospitals. Negative means net borrowing: the group spent more than it earned and had to borrow or draw down savings.'],
  ['Net worth','Everything the group owns (assets) minus everything it owes (liabilities), at 30 June.'],
  ['Net debt (L2)','Debt owed less cash and financial assets held, on the ABS’s L2 line in its debt matrix. The matrix publishes six L2 figures for 30 June 2025. It uses a separate “National” group rather than Commonwealth, and does not give individual-state or earlier-year net debt in these downloads.'],
  ['Level of government','Commonwealth, state, local or a combination. ACT figures sit with the states. Control n.f.d. is the ABS group for bodies whose controlling level of government is not further defined.'],
  ['Sector','General government is departments and agencies mostly funded by taxes. Public corporations are government-owned businesses: non-financial ones sell goods and services such as water, power or transport; financial ones are government-owned banks, insurers and treasury corporations. The non-financial public sector combines general government with public non-financial corporations; the total public sector covers all of them.'],
  ['Consolidation','ABS consolidates transfers within each published group: a grant from one part of a group to another is counted once. Groups are consolidated separately, so figures cannot be added across levels or jurisdictions. Only ABS published totals appear here.'],
  ['Accrual accounting','ABS records revenue and expenses when economic activity occurs (accrual accounting), not when cash moves, using a common standard across governments. Budget papers can differ in scope and forecasts.'],
  ['Prices and series','Australian dollars in current prices (not adjusted for inflation), original series. An unavailable value is shown as Not published, which is distinct from zero.'],
  ['COFOG-A','The Australian version of the UN Classification of the Functions of Government, which sorts expenses by purpose: health, education, transport and so on.']]
const related:[string,string,string][]=[
  ['/budget','Budget papers','Commonwealth Budget estimates and reported actuals, by Budget year.'],
  ['/register/tax-expenditures','Tax expenditures','Treasury’s estimates of revenue forgone through tax concessions.'],
  ['/money/contracts','Government contracts','Which agencies buy from whom.'],
  ['/money/grants','Grants','Grant awards, resolved to their recipients.'],
  ['/register/gov-advertising','Government advertising','Published campaign and non-campaign media expenditure.']]
export const relatedHTML=(id:string,links:[string,string,string][])=>`<ul class="ui-card-grid gfs-related" aria-labelledby="${id}">${links.map(([href,title,text])=>`<li class="ui-card"><h3 class="ui-card-title"><a href="${href}">${esc(title)}</a></h3><p class="ui-card-text">${esc(text)}</p></li>`).join('')}</ul>`

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
  const source=(extra:string[]=[])=>sourceLineHTML({updated:h.generated_at.slice(0,10),dateLabel:'Snapshot',source:`ABS Government Finance Statistics, Annual ${fy(release)}`,
    originals:[{href:h.release_url,label:'ABS release'},{href:'https://www.abs.gov.au/how-cite-abs-sources',label:'ABS citation guidance'}],
    facts:[['Publisher','Australian Bureau of Statistics'],['Released',esc(shortDate(releaseDate))+` <span class="dt-sr">(${esc(releaseDate)})</span>`],['Snapshot',`${esc(h.generated_at.slice(0,10))} UTC`],['Units','AUD, current prices, original series']],
    notes:extra.map(esc),licence:`<a href="${CC}">CC BY 4.0</a>`})
  const options=(values:string[],selectedValue:string)=>values.map(v=>`<option${v===selectedValue?' selected':''}>${esc(v)}</option>`).join('')
  const field=(label:string,name:string,body:string)=>`<label class="ui-filter-field"><span class="ui-filter-key">${label}</span><select class="ui-input" name="${name}">${body}</select></label>`
  const filters=`<form class="gfs-filters ui-filter-bar" action="/register/government-finance" method="get">${field('Release','release',options(releases,release))}${field('Level of government','level',options(levels,level))}${field('Sector','sector',options(sectors,sector))}${field('Jurisdiction','jurisdiction',`<option value="">All published jurisdictions</option>${options(jurisdictions,jurisdiction)}`)}<button class="ui-button" data-variant="primary" type="submit">Show figures</button></form>`
  const groups=[...new Set(latestRows.map(r=>r.jurisdiction))].sort()
  const lead=jurisdiction||(groups.includes('Australia')?'Australia':groups[0])
  const leadRows=latestRows.filter(r=>r.jurisdiction===lead),leadName=lead?governmentFinanceGroupHeading(level,lead):''
  const figures=leadRows.length?`<dl class="gfs-figures">${Object.entries(names).flatMap(([key,label])=>{const r=leadRows.find(r=>r.measure===key)
    return r?[`<div class="gfs-figure${key==='net_operating_balance' || key==='net_lending_borrowing'?' is-balance':''}"><dt>${label}</dt><dd class="gfs-figure-value">${r.value!==null?cellLink(r):'Not published'}</dd><dd class="gfs-figure-note">${esc(notes[key])}${stock.has(key)?`, ${yearEnd(r.reference_year)}`:''}</dd></div>`]:[]}).join('')}</dl>`:''
  const trend=lead?trendHTML(governmentFinanceTrend(selected.filter(r=>r.jurisdiction===lead)),leadName):''
  const compare=jurisdiction?'':compareHTML(latestRows,level)
  const rows=governmentFinanceRows({...h,rows:selected}),config=governmentFinanceTableConfig(rows),guarded=guardTableURL(config,url)
  if(guarded.rejected)return error(400,'Choose one value for each table filter.')
  const description='Revenue, expenses, balances and debt from ABS annual public-sector accounts, with published consolidation levels and original source cells.'
  const table=registerTableHTML(config,guarded.query,url)
  const functions=spendingByFunction(h,url,{release,level,sector,jurisdiction},source,lead)
  if(functions.rejected)return error(400,'Choose one value for each function table filter.')
  const scope=`${fy(latest||release)} · ${level} · ${sector}${jurisdiction?' · '+jurisdiction:''}`
  const jump=[['gfs-headlines','Overview'],...compare?[['gfs-compare','Compare']]:[],['gfs-functions','Spending by function'],['gfs-series','Year by year'],['gfs-terms','Terms'],['gfs-source','Source']]
  const overview=`<section class="ui-section gfs-section gfs-overview" data-accent="money" aria-labelledby="gfs-headlines"${leadRows.length?` data-gfs-group="${esc(lead)}"`:''}><p class="gfs-kicker">${esc(scope)}</p><h2 id="gfs-headlines" class="ui-section-title gfs-group-name">${esc(leadName||scope)}</h2>`
    +(leadRows.length?`<p class="gfs-summary">${esc(governmentFinanceSummary(leadRows,level,lead,sector))}</p>${figures}${trend}`:'<p class="ui-empty">This release does not publish figures for this combination. Choose another level or sector.</p>')
    +(compare?'':leadRows.length?cellsHTML(leadRows,level):'')
    +source(['Australian dollars, current prices, original series. Each figure links to its original workbook cell.'])+'</section>'
  const compareSection=compare?`<section class="ui-section gfs-section" data-accent="money" aria-labelledby="gfs-compare"><h2 id="gfs-compare" class="ui-section-title">Compare jurisdictions</h2><p class="ui-section-note">${esc(fy(latest!))}, ${esc(level.toLowerCase())} ${esc(sectorName(sector))}, the ABS total first, then each jurisdiction alphabetically. ABS consolidates each group separately, so the rows cannot be added up; the total row is the ABS’s own figure. The bars put every jurisdiction’s revenue and expenses on one scale.</p>${compare}${cellsHTML(latestRows,level)}${source(['Negative net lending / borrowing means net borrowing.'])}</section>`:''
  const html=block('Government finance',description,'',[{label:'Government finance'}])+`<section class="wrap gfs-content" aria-label="Government finance figures"><p class="gfs-lede">Each year the Australian Bureau of Statistics publishes the accounts of every Australian government on one standard, so the Commonwealth, the states and territories, and local government can be read the same way. Choose a level and sector below; every figure links to its cell in the ABS workbook.</p>`
    +filters+`<nav class="gfs-jump" aria-label="On this page">${jump.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')}</nav>`
    +overview+compareSection+functions.html
    +`<section class="ui-section gfs-section" data-accent="money" aria-labelledby="gfs-series"><h2 id="gfs-series" class="ui-section-title">Year-by-year series</h2><p class="ui-section-note">Every published headline figure for ${esc(level.toLowerCase())} ${esc(sectorName(sector))}${jurisdiction?' in '+esc(jurisdiction):''}. Each row keeps the release it came from, including revised earlier years. Display amounts use lowercase m/bn; the CSV also keeps the original AUD million value, source cell, snapshot and SHA-256.</p>${table}${source()}</section>`
    +`<section class="ui-section gfs-section" aria-labelledby="gfs-terms"><h2 id="gfs-terms" class="ui-section-title">What the terms mean</h2><dl class="gfs-terms">${terms.map(([t,d])=>`<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl></section>`
    +`<section class="ui-section gfs-section" aria-labelledby="gfs-related"><h2 id="gfs-related" class="ui-section-title">Related on OPAX</h2>${relatedHTML('gfs-related',related)}</section>`
    +`<section class="ui-section gfs-section" aria-labelledby="gfs-source"><h2 id="gfs-source" class="ui-section-title">Source and reuse</h2><p><a href="${esc(h.release_url)}">${esc(h.licence.attribution)}</a> Released ${esc(shortDate(releaseDate))}.</p><p>${esc(h.licence.changes)}</p><p><a href="${esc(h.licence.terms_url)}">ABS copyright terms</a> apply to the numerical tables under <a href="${CC}">CC BY 4.0</a>. Workbook notices were reviewed individually. The Commonwealth Coat of Arms, ABS logo, trade marks and third-party material are excluded. <a href="https://www.abs.gov.au/how-cite-abs-sources">ABS citation guidance</a>.</p>${source()}</section></section>`
  return {status:200,title:'Government finance · OPAX',description,noindex:Boolean(url.search),prerender:html}
}
