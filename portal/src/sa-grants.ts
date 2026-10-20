import {applyQuery,guardTableURL,type Row} from '../public/datatable.js'
import {saGrantsConfig,saGrantsTableHTML} from '../public/sa-grants-table.js'
import {shortDate} from '../public/format.js'

const CC='https://creativecommons.org/licenses/by/4.0/'
const DATASET='https://data.sa.gov.au/data/dataset/'
const GRANTS='grants-sa-funded-projects-2016-2017'
const PCIF='premier-s-community-initiatives-fund'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const AWARD_FIELDS=['recipient','project_title','project_description','region','amount_as_published','amount','year','programme','sheet','source_row'] as const
const ROW_FIELDS=[...AWARD_FIELDS,'resource_id','dataset','dataset_url','source_url','snapshot','sha256','licence','licence_url'] as const
type Award={recipient:string;project_title:string;project_description:string;region:string;amount_as_published:string;amount:number;year:string;programme:string;sheet:string;source_row:number}
type SourceRow=Award & {resource_id:string;dataset:string;dataset_url:string;source_url:string;snapshot:string;sha256:string;licence:string;licence_url:string;computed?:unknown;derivation?:unknown}
type Licence={url:string;dataset_explicit:boolean;resource_explicit:boolean;file_notices_reviewed:boolean;exceptions:unknown[]}
type Document={id:string;title:string;programme:string;year:string;dataset:string;dataset_title:string;publisher:string;dataset_url:string;resource_url:string;snapshot:string;sha256:string;licence:Licence;attribution:string;notes:string[];status:string;hold?:string;source_rows:Record<string,Award>}
type Hold=Omit<Document,'source_rows'|'status'|'notes'> & {hold:string}
export type SAGrantsHub={schema:number;generated_at:string;documents:Document[];rows:SourceRow[];holds:Hold[]}
type Read=()=>Promise<SAGrantsHub|null>
type Block=(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string
export const saGrantsReader=(assets:Fetcher):Read=>async()=>{
  const response=await assets.fetch(new Request('https://opax.com.au/sa-grants/data.json'))
  if(response.status===404)return null
  if(!response.ok)throw Error('Historical awards unavailable')
  return response.json() as Promise<SAGrantsHub>
}
const source=(d:Document|Hold)=>Boolean(d)&&/^[a-f0-9-]{36}$/.test(d.id)&&[GRANTS,PCIF].includes(d.dataset)
  &&d.dataset_url===DATASET+d.dataset&&d.resource_url===d.dataset_url+'/resource/'+d.id
  &&hash(d.sha256)&&/^\d{4}-\d{2}$/.test(d.year)&&Number.isFinite(Date.parse(d.snapshot))

/** Original row equality is shared by HTML, hydration and CSV. No name join. */
export function saGrantsRows(h:SAGrantsHub):Row[]{
  if(h?.schema!==1||!Array.isArray(h.documents)||!Array.isArray(h.rows))return []
  const docs=new Map(h.documents.filter(d=>source(d)&&d.status==='cleared'&&!d.hold
    &&d.licence?.url===CC&&d.licence.dataset_explicit===true&&d.licence.resource_explicit===true
    &&d.licence.file_notices_reviewed===true&&Array.isArray(d.licence.exceptions)&&!d.licence.exceptions.length
    &&d.source_rows&&d.dataset===GRANTS&&['2016-17','2017-18'].includes(d.year)).map(d=>[d.id,d]))
  // PCIF cannot enter this version: original files were unavailable for review.
  const seen=new Set<string>()
  return h.rows.flatMap(r=>{
    const d=docs.get(r?.resource_id),original=d?.source_rows[r?.sheet+'!'+r?.source_row]
    if(!d||!original||r.computed||r.derivation||r.source_url!==d.resource_url||r.dataset_url!==d.dataset_url
      ||r.dataset!==d.dataset||r.year!==d.year||r.programme!==d.programme||r.sha256!==d.sha256||r.snapshot!==d.snapshot
      ||r.licence!=='CC BY 4.0'||r.licence_url!==CC||r.sheet!=='CSV'||!Number.isSafeInteger(r.source_row)||r.source_row<2
      ||typeof r.amount!=='number'||!Number.isFinite(r.amount)||r.amount<0||!AWARD_FIELDS.every(k=>r[k]===original[k])
      ||!['recipient','project_title','project_description','region','amount_as_published'].every(k=>typeof r[k as keyof SourceRow]==='string'))return []
    const key=r.resource_id+'!'+r.sheet+'!'+r.source_row
    if(seen.has(key))return []
    seen.add(key)
    return [{...Object.fromEntries(ROW_FIELDS.map(k=>[k,r[k]])),id:key,locator:r.sheet+' row '+r.source_row}]
  })
}
function receipt(d:Document|Hold){
  return `<p class="sa-grants-receipt">Source: ${esc(d.publisher)} · <a href="${esc(d.dataset_url)}">Dataset: ${esc(d.dataset_title)}</a> · <a href="${esc(d.resource_url)}">Resource: ${esc(d.title)}</a> · Year: ${esc(d.year.replace('-','–'))} · Snapshot: <time datetime="${esc(d.snapshot)}">${esc(shortDate(d.snapshot))} UTC</time> · <a href="${CC}">CC BY 4.0</a></p><details class="sa-grants-receipt"><summary>Attribution and source receipt</summary><p>${esc(d.attribution)}</p><p>Resource UUID: ${esc(d.id)}</p><p>SHA-256 ${esc(d.sha256)}</p></details>`
}
export async function saGrantsPage(url:URL,read:Read,block:Block){
  const title='South Australian historical grants'
  const description='Grants SA awards for 2016–17 and 2017–18. This is a small historical collection, not current SA-wide grants coverage. Award amounts are funding announcements, not proof of payment.'
  let h:SAGrantsHub|null=null
  try{h=await read()}catch{/* Source link remains available. */}
  const rows=h?saGrantsRows(h):[]
  if(!h||!rows.length)return {status:404,title:title+' · OPAX',description,noindex:true,
    prerender:block(title,description,`<p>The historical award records are not available here yet. <a href="${DATASET+GRANTS}">Read the Grants SA source</a>.</p>`,[{label:title}])}
  const sections=h.documents.map(d=>{
    const selected=rows.filter(r=>r.resource_id===d.id)
    if(!selected.length)return ''
    const config=saGrantsConfig(selected,d.id),guard=guardTableURL(config,url)
    return `<section aria-labelledby="sa-grants-${esc(d.id)}"><h2 id="sa-grants-${esc(d.id)}">Grants SA · ${esc(d.year.replace('-','–'))}</h2><p>Recipients, project descriptions and regions follow the published award records. The publisher does not supply a total for this file.</p><div data-sa-grants-table="${esc(d.id)}">${saGrantsTableHTML(config,applyQuery(selected,config,guard.query),url)}<script type="application/json" data-sa-grants-rows>${JSON.stringify(selected).replace(/</g,'\\u003c')}</script></div>${receipt(d)}</section>`
  }).join('')
  const holds=(h.holds||[]).filter(d=>d?.hold&&source(d)&&d.licence?.url===CC).map(d=>`<section><h2>${esc(d.title)}</h2><p>The publisher lists this historical successful-award file, but its original download returned 404 on ${esc(shortDate(d.snapshot))}. No awards from this file are available here. Applicant and unsuccessful records are excluded.</p>${receipt(d)}<p class="sa-grants-receipt">The SHA-256 identifies the 404 response receipt, not a workbook. File contents and notices could not be checked.</p></section>`).join('')
  return {status:200,title:title+' · OPAX',description,noindex:Boolean(url.search),
    prerender:block(title,description,'<p><a href="/money/grants">Other grant records</a></p>',[{label:title}])+`<div class="wrap sa-grants-content">${sections}${holds}<p>Amounts are in Australian dollars. This collection does not cover all SA programmes or later years. <a href="mailto:corrections@opax.com.au">Report a correction</a>.</p></div><script type="module" src="/sa-grants.js"></script>`}
}
