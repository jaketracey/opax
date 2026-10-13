import {dataTableHTML,guardTableURL,toCSV,type Query,type Row} from '../public/datatable.js'
import {vicGiftsTableConfig,vicGiftsQuery} from '../public/register-tables.js'
import {PERSON_PATHS} from '../public/person-paths.js'

const INDEX='https://www.vic.gov.au/ministerial-gifts-benefits-and-hospitality-register'
const CC='https://creativecommons.org/licenses/by/4.0/'
const esc=(value:unknown)=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const officialKey=(value:string)=>value.trim().replace(/\s+/g,' ').replace(/^(?:The\s+)?Hon\.?\s+/i,'').toLowerCase()
const sourceURL=(url:string)=>/^https:\/\/www\.vic\.gov\.au\/(?:ministerial-register-gifts-benefits-and-hospitality-[a-z0-9-]+|2024-25-ministerial-register-gifts-benefits-and-hospitality)$/.test(url)
type Receipt={sha256:string;snapshot:string}
export interface GiftsRow {
  id:string;register_id:string;office_holder:string;portfolio:string|null;role:string;period:string;
  description:string|null;giver:string|null;date:string|null;estimated_value:string|null;action_taken:string|null;
  source_url:string;source_locator:string;source_table_id:string;source_row_id:string;snapshot:string;sha256:string;
  licence:string;licence_url:string;official:{name:string;href:string;pid?:string|null}|null;
}
export interface GiftsRegister {
  document:{id:string;period:{id:string;label:string;start:string;end:string};url:string;title:string;status:string;
    licence:{status:string;name:string;url:string|null;policy_url:string;policy_receipt:Receipt};receipt:Receipt};rows:GiftsRow[];
}
export interface GiftsHub {schema:number;generated_at:string;source_index:string;attribution:string;changes:string;scope:string;registers:GiftsRegister[];holds:unknown[]}
export type GiftsReader=()=>Promise<GiftsHub>
export const vicGiftsReader=(assets:Fetcher):GiftsReader=>async()=>{
  const response=await assets.fetch(new Request('https://opax.com.au/vic-gifts/data.json'))
  if(!response.ok)throw Error('Register unavailable')
  return response.json() as Promise<GiftsHub>
}

/** Licence, provenance and identity checked again at the serving boundary. */
export function clearedGiftRegisters(hub:GiftsHub):GiftsRegister[] {
  if(hub.schema!==1 || hub.source_index!==INDEX || !Array.isArray(hub.registers))return []
  return hub.registers.filter(register=>{
    const d=register.document
    return d?.status==='cleared' && d.licence?.status==='open' && d.licence.url===CC && d.licence.policy_url==='https://www.vic.gov.au/copyright'
      && /^[a-f0-9]{64}$/.test(d.licence.policy_receipt?.sha256 || '') && Boolean(d.licence.policy_receipt?.snapshot)
      && sourceURL(d.url) && /^[a-f0-9]{64}$/.test(d.receipt?.sha256 || '') && Boolean(d.receipt?.snapshot)
      && /^vic-gifts-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(d.id) && Array.isArray(register.rows)
  }).map(register=>({...register,rows:register.rows.filter(row=>{
    const d=register.document
    return row.register_id===d.id && row.id===`${d.id}/${row.source_locator}` && /^table-[12]\/row-\d+$/.test(row.source_locator)
      && row.source_url===d.url && row.sha256===d.receipt.sha256 && row.snapshot===d.receipt.snapshot
      && row.licence_url===CC && row.licence===d.licence.name && row.period===d.period.label
      && ['Minister','Parliamentary secretary'].includes(row.role)
      && typeof row.office_holder==='string'
      && ['portfolio','description','giver'].every(key=>row[key as keyof GiftsRow]===null || typeof row[key as keyof GiftsRow]==='string')
  }).map(row=>{
    const official=row.official
    const linked=official && officialKey(row.office_holder)===officialKey(official.name) && PERSON_PATHS.exact[official.name]===official.href
    return {...row,official:linked?official:null}
  })}))
}

function selected(hub:GiftsHub,period:string|null,person:string|null) {
  let registers=clearedGiftRegisters(hub)
  if(period)registers=registers.filter(r=>r.document.period.id===period)
  if(person)registers=registers.map(r=>({...r,rows:r.rows.filter(row=>row.official?.href===person)})).filter(r=>r.rows.length)
  return registers
}
const tableRows=(registers:GiftsRegister[]):Row[]=>registers.flatMap(r=>r.rows.map(row=>({...row,href:row.official?.href || null})))
const populatedFields=(rows:Row[])=>['date','estimated_value','action_taken'].filter(key=>rows.some(row=>row[key]!=null && row[key]!==''))

const receiptHTML=(register:GiftsRegister)=>{
  const d=register.document
  return `<p class="vic-gifts-receipt"><a href="${esc(d.url)}">Original register · ${esc(d.period.label)}</a> · Snapshot ${esc(d.receipt.snapshot)} · <a href="${CC}">${esc(d.licence.name)}</a> · © Copyright State Government of Victoria<br><span>SHA-256 ${esc(d.receipt.sha256)}</span></p>`
}
function tableHTML(registers:GiftsRegister[],params:Record<string,string>,url:URL,id='vic-gifts-table') {
  const rows=tableRows(registers),config={...vicGiftsTableConfig(params,populatedFields(rows)),id}
  const guarded=guardTableURL(config,url)
  const page=guarded.rejected?{rows:[],total:0,page:1,pageSize:25}:vicGiftsQuery(rows,config,guarded.query)
  const payload=JSON.stringify({config}).replace(/</g,'\\u003c')
  return `<div data-register-table="${id}">${dataTableHTML(config,page,url)}<script type="application/json" data-register-config>${payload}</script></div>`
}

export async function vicGiftsPage(url:URL,read:GiftsReader,block:(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string) {
  const unavailable=()=>({title:'Victorian gifts register unavailable · OPAX',description:'This register is awaiting a reviewed data load.',status:503,noindex:true,
    prerender:block('Victorian gifts and hospitality','The register is awaiting a reviewed data load.','',[{label:'Victorian gifts and hospitality'}])+`<section class="wrap vic-gifts-content"><p><a href="${INDEX}">Read the original DPC register</a>.</p><p>Licence: <a href="https://www.vic.gov.au/copyright">publisher copyright notice</a>; no source rows reproduced. Snapshot: unavailable.</p></section>`})
  try{
    const hub=await read(),all=clearedGiftRegisters(hub)
    if(!all.length)return unavailable()
    const period=url.searchParams.get('period')
    const registers=selected(hub,period,null)
    if(period && !registers.length)return {title:'Register period not found · OPAX',description:'This period is not in the reviewed snapshot.',status:404,noindex:true,prerender:block('Register period not found','Choose a period from the Victorian gifts register.')}
    const rows=tableRows(registers),totals=new Map<string,{name:string;href:string|null;count:number}>()
    for(const row of rows){const source=row as unknown as GiftsRow,key=source.official?.name || source.office_holder
      const total=totals.get(key)||{name:key,href:source.official?.href || null,count:0};total.count++;totals.set(key,total)}
    const description=`${rows.length} published entries across ${registers.length} reporting period${registers.length===1?'':'s'}, for Victorian ministers and parliamentary secretaries.`
    const receipts=registers.map(receiptHTML).join('')
    const totalsHTML=[...totals.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name)).map(t=>`<li>${t.href?`<a href="${esc(t.href)}">${esc(t.name)}</a>`:esc(t.name)} <span>${t.count} entries</span></li>`).join('')
    return {title:'Victorian gifts and hospitality · OPAX',description,status:200,noindex:Boolean(url.search),
      prerender:block('Victorian gifts and hospitality',description,`<p class="vic-gifts-receipt">Source: <a href="${INDEX}">Victorian DPC</a> · Snapshot ${esc(hub.generated_at.slice(0,10))} UTC · <a href="${CC}">CC BY 4.0</a></p>`,[{label:'Victorian gifts and hospitality'}])+`<div class="wrap vic-gifts-content"><nav class="vic-gifts-periods" aria-label="Reporting periods"><a href="/register/vic-gifts"${!period?' aria-current="page"':''}>All periods</a>${all.map(r=>`<a href="/register/vic-gifts?period=${r.document.period.id}"${period===r.document.period.id?' aria-current="page"':''}>${esc(r.document.period.label)} · ${r.rows.length}</a>`).join('')}</nav><p>DPC publishes accepted gifts, benefits and hospitality disclosed in ordinary returns. Portfolios are those in the original period register. Entry counts do not establish the value or number of individual gifts.</p><section aria-labelledby="vic-gifts-totals"><h2 id="vic-gifts-totals">Entries by office holder</h2><ul class="vic-gifts-totals">${totalsHTML}</ul>${receipts}</section><section aria-labelledby="vic-gifts-entries"><h2 id="vic-gifts-entries">Published entries</h2><p>Search by office holder, portfolio or reporting period. Dates, estimated values and actions are shown only when supplied in separate source fields.</p>${tableHTML(registers,period?{period}:{},url)}${receipts}</section><section aria-labelledby="vic-gifts-source"><h2 id="vic-gifts-source">Source and reuse</h2><p><a href="${INDEX}">Department of Premier and Cabinet · ministerial register</a>. Published twice yearly, following Parliament’s ordinary return cycle. ${esc(hub.attribution)}. ${esc(hub.changes)}</p><p>The linked <a href="https://www.vic.gov.au/copyright">website licence</a> grants CC BY 4.0 with images, branding and third-party exceptions. This projection contains register text; donor addresses are omitted.</p>${receipts}</section></div>`}
  }catch{return unavailable()}
}

export async function vicGiftsPersonBlock(href:string,read:GiftsReader,url:URL):Promise<string> {
  try{
    const registers=selected(await read(),null,href)
    if(!registers.length)return ''
    return `<section id="subject-vic-gifts" class="vic-gifts-content"><h2>Victorian gifts and hospitality</h2><p>${registers.reduce((n,r)=>n+r.rows.length,0)} published entries. <a href="/register/vic-gifts">Browse all reporting periods</a>.</p>${tableHTML(registers,{person:href},url,'person-vic-gifts-table')}${registers.map(receiptHTML).join('')}</section>`
  }catch{return ''}
}

/** A bounded table projection; no entities, global search or giver lookups. */
export async function vicGiftsResponse(request:Request,read:GiftsReader):Promise<Response> {
  const headers={'cache-control':'no-store','x-robots-tag':'noindex'}
  if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers})
  try{
    const url=new URL(request.url),hub=await read(),all=clearedGiftRegisters(hub)
    if(!all.length)throw Error('Unavailable')
    const period=url.searchParams.get('period'),person=url.searchParams.get('person')
    if(person && !/^\/subject\/person\/[a-z0-9-]+$/.test(person))return Response.json({error:'Person not found'},{status:404,headers})
    const registers=selected(hub,period,person)
    if(!registers.length)return Response.json({error:'Register not found'},{status:404,headers})
    if(person && url.searchParams.get('view')==='person')return Response.json({html:await vicGiftsPersonBlock(person,async()=>hub,url)},{headers})
    // The shared client sends unprefixed API state; browser URLs use vicGifts.*.
    const rows=tableRows(registers),config={...vicGiftsTableConfig({},populatedFields(rows)),urlKey:undefined},guarded=guardTableURL(config,url)
    if(guarded.rejected)return Response.json({error:'Invalid query'},{status:400,headers})
    const query:Query=guarded.query
    if(url.searchParams.get('format')==='csv'){
      const page=vicGiftsQuery(rows,config,{...query,page:1,pageSize:50000})
      return new Response(request.method==='HEAD'?null:toCSV(page.rows,config),{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="vic-gifts.csv"'}})
    }
    const page=vicGiftsQuery(rows,config,query)
    return request.method==='HEAD'?new Response(null,{headers}):Response.json(page,{headers})
  }catch{return Response.json({error:'Register unavailable'},{status:503,headers})}
}
