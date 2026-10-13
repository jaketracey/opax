import type {Column, Page, Query, Row} from '../public/datatable.js'
import {TABLE_DATASETS, tableText, tableTerms} from './table-datasets.mjs'
import {identityCandidates, identityHash} from './table-identities.mjs'
import registryBuild from './table-registry-fingerprint.json' with {type:'json'}
import {rawQueryValues,repeatedTableKeys} from '../public/datatable-query.js'

export const TABLE_REGISTRY_FINGERPRINT = registryBuild.fingerprint

type TableEnv = {TABLE_DB: D1Database; CACHE_EPOCH?: string}
const MAX_CSV = 50_000, CSV_PAGE = 10_000, BATCH = 200, MAX_FACETS = 100
const arrays = new Set(['portfolios','sectors','entities','bill','sitting'])
const quote = (key: string) => `"${key}"`
const tableName = (name: string) => 'table_' + name.replaceAll('-', '_')
const errorResponse = (status: number, error: string, headers = {}) => Response.json({error}, {status,headers:{'cache-control':'no-store','x-robots-tag':'noindex',...headers}})

/** The exact core serializer grammar, including optional URL-key prefixes. */
export function parseTableQuery(params: URLSearchParams, columns: Column[], defaultSort: NonNullable<Query['sort']>): Query {
  const clean = new URLSearchParams(); let prefix: string | undefined
  if (params.toString().length > 8192) throw new Error('invalid')
  for (const [key,value] of params) {
    if (key === 'format') continue
    const match = /^(.+)\.(q|sort|page|pageSize|f\.[^.]+)$/.exec(key)
    const field = /^(?:q|sort|page|pageSize|f\.[^.]+)$/.test(key) ? key : match?.[2]
    if (!field) throw new Error('invalid')
    const current = field === key ? '' : match![1]
    if (prefix != null && prefix !== current || clean.has(field)) throw new Error('invalid')
    prefix = current; clean.set(field,value)
  }
  const integer = (key: string, fallback: number, cap = Number.MAX_SAFE_INTEGER) => {
    const raw = clean.get(key); if (raw == null) return fallback
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) throw new Error('invalid')
    return Math.min(Number(raw),cap)
  }
  const q = tableText(clean.get('q') || '')
  if (q.length > 1000) throw new Error('invalid')
  const sort = clean.get('sort')?.split(':')
  if (sort && (sort.length !== 2 || !['asc','desc'].includes(sort[1]) || !columns.some(c=>c.key===sort[0] && c.sortable!==false))) throw new Error('invalid')
  const filters: NonNullable<Query['filters']> = Object.create(null)
  for (const [field,value] of clean) if (field.startsWith('f.')) {
    const c = columns.find(c=>c.key===field.slice(2))
    if (!c) throw new Error('invalid')
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && c.facet!=='range') {
      if (parsed.some(v=>typeof v!=='string' || v.length>1000)) throw new Error('invalid')
      const values = [...new Set(parsed.filter(v=>v!==''))].sort()
      if (values.length) filters[c.key]=values
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && c.facet==='range') {
      const raw = parsed as Record<string,unknown>, range: {min?:number;max?:number} = {}
      if (Object.keys(raw).some(k=>!['min','max'].includes(k))) throw new Error('invalid')
      for (const bound of ['min','max'] as const) if (raw[bound] != null) {
        if (typeof raw[bound]!=='number' || !Number.isFinite(raw[bound])) throw new Error('invalid')
        range[bound]=raw[bound]
      }
      if (range.min!=null && range.max!=null && range.min>range.max) throw new Error('invalid')
      if (Object.keys(range).length) filters[c.key]=range
    } else throw new Error('invalid')
  }
  const pageSize=integer('pageSize',50,200),page=integer('page',1,Math.floor(Number.MAX_SAFE_INTEGER/pageSize))
  return {q,filters,sort:sort ? {key:sort[0],dir:sort[1] as 'asc'|'desc'} : defaultSort,page,pageSize}
}
export function normalizedTableQuery(query: Query, csv = false): string {
  const params=new URLSearchParams()
  if (query.q) params.set('q',query.q)
  for (const key of Object.keys(query.filters || {}).sort()) params.set('f.'+key,JSON.stringify(query.filters![key]))
  if (query.sort) params.set('sort',`${query.sort.key}:${query.sort.dir}`)
  if (csv) {params.set('format','csv');params.set('page',String(query.page))}
  else {params.set('page',String(query.page));params.set('pageSize',String(query.pageSize))}
  return params.toString()
}

async function blocked(db: D1Database, values: Iterable<string>, lengths: number[], strippedLengths: number[]): Promise<boolean> {
  for (const value of values) {
    const candidates=[...identityCandidates(value,lengths,strippedLengths)]
    for (let start=0;start<candidates.length;start+=90) {
      const hashes=await Promise.all(candidates.slice(start,start+90).map(identityHash))
      if (hashes.length && await db.prepare(`SELECT 1 AS found FROM table_private_identity WHERE hash IN (${hashes.map(()=>'?').join(',')}) LIMIT 1`).bind(...hashes).first()) return true
    }
  }
  return false
}
function where(table: string, query: Query, except?: string) {
  const clauses: string[]=[], values: (string|number)[]=[]
  if (query.q) {
    const terms=[...new Set(tableTerms(query.q))]
    if (!terms.length) clauses.push('0')
    else {clauses.push(`t.rowid IN (SELECT rowid FROM ${table}_fts WHERE ${table}_fts MATCH ?)`);values.push(terms.map(t=>'"'+t+'"*').join(' AND '))}
  }
  for (const [key,filter] of Object.entries(query.filters || {})) {
    if (key===except) continue
    if (Array.isArray(filter)) {
      if (!filter.length) continue
      if (TABLE_DATASETS[table.slice(6).replaceAll('_','-')]?.columns.some(c=>c.key===key && (c.facet==='multi'||c.facet==='chips'))) {
        clauses.push(`t.rowid IN (SELECT rowid FROM ${table}_facets WHERE key=? AND value IN (SELECT value FROM json_each(?)))`);values.push(key,JSON.stringify(filter))
      } else {clauses.push(`t.${quote(key)} IN (SELECT value FROM json_each(?))`);values.push(JSON.stringify(filter))}
    } else for (const bound of ['min','max'] as const) if (filter[bound]!=null) {clauses.push(`t.${quote(key)} ${bound==='min' ? '>=' : '<='} ?`);values.push(filter[bound]!)}
  }
  return {sql:clauses.length ? ' WHERE '+clauses.join(' AND ') : '',values}
}
function order(query: Query, columns: Column[]) {
  const c=columns.find(c=>c.key===query.sort!.key)!
  return ` ORDER BY t.${quote(c.key)}${['text','category'].includes(c.type) ? ' COLLATE NOCASE' : ''} ${query.sort!.dir} NULLS LAST,t.rowid ${query.sort!.dir}`
}
const decode = (rows: Row[]) => rows.map(row => {
  if (/^aggregate:grants:(?:federal|qld):$/.test(String(row.id)) && row.recipientKind === 'aggregate' && Number.isSafeInteger(row.recipientCount) && Number(row.recipientCount) >= 0) row.aggregate = {kind: 'individual-donors', count: Number(row.recipientCount), subject: 'recipients'};
  for (const key of arrays) if (typeof row[key]==='string') {try {row[key]=JSON.parse(row[key] as string)} catch {row[key]=[]}}
  return row
})
const csvValue = (value: unknown) => {const raw=Array.isArray(value) ? value.join('; ') : String(value ?? '');return /[",\r\n]/.test(raw) ? '"'+raw.replaceAll('"','""')+'"' : raw}

export async function tableApi(request: Request, env: TableEnv, _ctx?: ExecutionContext): Promise<Response> {
  const url=new URL(request.url), name=url.pathname.slice('/api/table/'.length),config=TABLE_DATASETS[name]
  if (!config || !Object.hasOwn(TABLE_DATASETS,name)) return errorResponse(404,'not_found')
  if (request.method!=='GET') return errorResponse(405,'method_not_allowed',{allow:'GET'})
  if (url.search.length>20_000 || url.searchParams.toString().length>8192) return errorResponse(400,'invalid_query')
  try {
    // Check every raw key/value occurrence before a parser can discard input.
    const inputs=[...rawQueryValues(url.searchParams)]
    const db=env.TABLE_DB
    const meta=await db.prepare("SELECT key,value FROM table_meta WHERE key IN ('version','privacy_lengths','privacy_stripped_lengths','privacy_fingerprint') LIMIT 4").all<{key:string;value:string}>()
    const metadata=Object.fromEntries(meta.results.map(r=>[r.key,r.value]))
    // Only donor-sanitised rows depend on the registry they were loaded against.
    if (config.privacy === 'donors' && (!/^[a-f0-9]{64}$/.test(TABLE_REGISTRY_FINGERPRINT) || metadata.privacy_fingerprint !== TABLE_REGISTRY_FINGERPRINT)) return errorResponse(503,'unavailable',{'retry-after':'60'})
    if (!metadata.version || !metadata.privacy_lengths) throw new Error('unavailable')
    if(config.privacy && !metadata.privacy_stripped_lengths)throw new Error('unavailable')
    const denied=Boolean(config.privacy) && await blocked(db,inputs,JSON.parse(metadata.privacy_lengths),JSON.parse(metadata.privacy_stripped_lengths || '[]'))
    if (repeatedTableKeys(url.searchParams,null).size) return errorResponse(400,'invalid_query')
    let query: Query | undefined
    if (denied) query={q:'',filters:{},sort:config.defaultSort,page:1,pageSize:50}
    else try {query=parseTableQuery(url.searchParams,config.columns,config.defaultSort)} catch { /* Fixed grammar error, without echo. */ }
    if (!query) return errorResponse(400,'invalid_query')
    const csv=url.searchParams.get('format')==='csv'
    if (!denied && (url.searchParams.getAll('format').length>1 || url.searchParams.has('format') && !csv)) return errorResponse(400,'invalid_query')
    const key=normalizedTableQuery(query,csv)
    const digest=await identityHash(['decoded-privacy-v2',metadata.version,env.CACHE_EPOCH || '',name,denied ? 'withheld:'+csv : key].join('|'))
    const headers=new Headers({'cache-control':'public, max-age=60, s-maxage=60','etag':`"${digest}"`})
    if (!config.privacy) headers.set('content-location','/api/table/'+name+'?'+key)
    if (url.searchParams.size || csv) headers.set('x-robots-tag','noindex')
    if (request.headers.get('if-none-match')===headers.get('etag')) return new Response(null,{status:304,headers})
    const table=tableName(name), selection=where(table,query), columnSQL=config.columns.map(c=>'t.'+quote(c.key)).join(',')
    const total=denied ? 0 : Number(await db.prepare(`SELECT COUNT(*) FROM ${table} t${selection.sql}`).bind(...selection.values).first<number>('COUNT(*)'))
    if (csv) {
      const exportable=Math.min(MAX_CSV,total),exportLimited=total>MAX_CSV
      const csvPage=query.page!,pages=Math.ceil(exportable/CSV_PAGE)
      const start=csvPage>pages ? exportable : (csvPage-1)*CSV_PAGE
      const end=Math.min(exportable,start+CSV_PAGE),exported=end-start,truncated=exported<total
      const link=(page: number) => '/api/table/'+name+'?'+normalizedTableQuery({...query,page},true)
      const next=csvPage<pages ? link(csvPage+1) : undefined
      const links: string[]=[]
      if (next) links.push(`<${next}>; rel="next"`)
      if (csvPage>1 && pages) links.push(`<${link(Math.min(csvPage-1,pages))}>; rel="prev"`)
      if (links.length) headers.set('link',links.join(', '))
      headers.set('content-type','text/csv; charset=utf-8');headers.set('content-disposition',`attachment; filename="${name}-page-${csvPage}.csv"`)
      headers.set('x-table-total',String(total));headers.set('x-table-exported',String(exported));headers.set('x-table-page',String(csvPage))
      headers.set('x-table-truncated',String(truncated));headers.set('x-table-export-truncated',String(exportLimited))
      headers.set('access-control-expose-headers','Link, X-Table-Total, X-Table-Exported, X-Table-Page, X-Table-Truncated, X-Table-Export-Truncated, X-Table-Export-Note')
      const note=(exported ? `Showing rows ${(start+1).toLocaleString('en-AU')}-${end.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')}` : `Showing 0 rows of ${total.toLocaleString('en-AU')}`)
        +(exportLimited ? '; export limited to the first 50,000 rows' : '')
        +(next ? `; next export: ${next}` : '')
      if (truncated) headers.set('x-table-export-note',note)
      let offset=start,started=false
      const encoder=new TextEncoder()
      const stream=new ReadableStream<Uint8Array>({async pull(controller) {
        try {
          if (!started) {started=true;controller.enqueue(encoder.encode(config.columns.map(c=>csvValue(c.label)).join(',')+'\r\n'));return}
          if (offset>=end) {
            if (truncated) controller.enqueue(encoder.encode([csvValue(note),...config.columns.slice(1).map(()=>'')].join(',')+'\r\n'))
            if (exportLimited && !next) controller.enqueue(encoder.encode('# Export truncated at 50,000 rows.\r\n'))
            controller.close();return
          }
          const batch=await db.prepare(`SELECT ${columnSQL} FROM ${table} t${selection.sql}${order(query,config.columns)} LIMIT ? OFFSET ?`).bind(...selection.values,Math.min(BATCH,end-offset),offset).all<Row>()
          if (!batch.results.length) throw new Error('unavailable')
          const rows=decode(batch.results);offset+=rows.length
          controller.enqueue(encoder.encode(rows.map(row=>config.columns.map(c=>csvValue(row[c.key])).join(',')).join('\r\n')+'\r\n'))
        } catch {controller.error(new Error('Export unavailable'))}
      }},{highWaterMark:1})
      return new Response(stream,{headers})
    }
    const page=query.page!, pageSize=query.pageSize!,facets: NonNullable<Page['facets']>={}
    let rows: Row[]=[]
    if (!denied) {
      const statements=[db.prepare(`SELECT ${columnSQL} FROM ${table} t${selection.sql}${order(query,config.columns)} LIMIT ? OFFSET ?`).bind(...selection.values,pageSize,(page-1)*pageSize)]
      const facetColumns=config.columns.filter(c=>c.facet)
      for (const c of facetColumns) {
        const scope=where(table,query,c.key)
        statements.push(c.facet==='range' ? db.prepare(`SELECT MIN(t.${quote(c.key)}) AS min,MAX(t.${quote(c.key)}) AS max FROM ${table} t${scope.sql}`).bind(...scope.values) : db.prepare(`SELECT f.value,COUNT(*) AS count FROM ${table}_facets f JOIN ${table} t ON t.rowid=f.rowid${scope.sql ? scope.sql+' AND' : ' WHERE'} f.key=? GROUP BY f.value ORDER BY count DESC,f.value LIMIT ${MAX_FACETS}`).bind(...scope.values,c.key))
      }
      const results=await db.batch<Row>(statements);rows=decode(results[0].results)
      facetColumns.forEach((c,i)=>{
        const values=results[i+1].results
        if (c.facet==='range') {const range=values[0];if(range?.min!=null && range?.max!=null) facets[c.key]={min:Number(range.min),max:Number(range.max)}}
        else facets[c.key]=values as {value:string;count:number}[]
      })
    }
    headers.set('content-type','application/json; charset=utf-8')
    return Response.json({rows,total,page,pageSize,facets} satisfies Page,{headers})
  } catch {return errorResponse(503,'unavailable',config.privacy ? {'retry-after':'60'} : {})}
}
