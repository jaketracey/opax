import {actInvoiceCoverageNotes} from '../public/act-invoices-context.js'
import {actInvoicesMetadata,actInvoicesPublicCopy} from './act-invoices-metadata.ts'
import {loadDonorIndex} from './donor-index.ts'
import {donorDisclosure,type DonorDisclosureRecord} from '../public/donor-disclosure.js'
import {foldDonorName} from '../public/donor-entity.js'
async function tableQueryHash(text: string): Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
}
import type {Column, Page, Query, Row} from '../public/datatable.js'
import {TABLE_DATASETS, tableText, tableTerms} from './table-datasets.mjs'
import {repeatedTableKeys} from '../public/datatable-query.js'


type TableEnv = {TABLE_DB: D1Database; CACHE_EPOCH?: string; ASSETS?: Fetcher; CF_VERSION_METADATA?: {id?: string}}
/** JSON pages kept in the edge cache: the key already names the data version, cache epoch and Worker version. */
const PAGE_CACHE_SECONDS = 86_400
const MAX_CSV = 50_000, CSV_PAGE = 10_000, BATCH = 200, MAX_FACETS = 100
const arrays = new Set(['portfolios','sectors','entities','bill','sitting'])
const quote = (key: string) => `"${key}"`
const tableName = (name: string) => 'table_' + name.replaceAll('-', '_')
/**
 * Whole-table counts, facet counts and ranges depend only on the loaded data, which the version row
 * names, so an isolate keeps them per version instead of scanning a whole table on every page view
 * (the grants facets alone read about 35M rows a day). Filtered aggregates are never kept.
 */
let aggregateVersion = '', aggregates = new Map<string, unknown>()
export function tableAggregates(version: string): Map<string, unknown> {
  if (aggregateVersion !== version) {aggregateVersion = version;aggregates = new Map()}
  return aggregates
}
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

/** Keep the funding-profile link scoped to the source's supplier records. */
async function donorSupplierIds(assets: Fetcher | undefined, donor: string): Promise<string[]> {
  if (!assets) throw new Error('unavailable')
  const response = await assets.fetch(new Request('https://local.invalid/suppliers.json'))
  if (!response.ok) throw new Error('unavailable')
  const directory = await response.json<{suppliers?: {id:string;money_node_ids?:string[]}[]}>()
  if (!Array.isArray(directory.suppliers)) throw new Error('unavailable')
  return [...new Set(directory.suppliers.filter(row => /^s-[a-f0-9]{20}$/.test(row.id) && row.money_node_ids?.includes(donor)).map(row => row.id))].sort()
}
function where(table: string, query: Query, except?: string, supplierIds?: string[]) {
  const clauses: string[]=[], values: (string|number)[]=[]
  if (supplierIds) {clauses.push('t.id IN (SELECT value FROM json_each(?))');values.push(JSON.stringify(supplierIds))}
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

/**
 * Public table requests (a caller passes `ctx`) keep each JSON page in the colo's edge cache. The
 * key holds the table version, the cache epoch, the Worker version and the canonical query state,
 * so a stored page is exactly what the same request would build again; headers that depend on the
 * request's own URL are written fresh. CSV exports and server-side renders are never cached.
 */
export async function tableApi(request: Request, env: TableEnv, ctx?: ExecutionContext): Promise<Response> {
  const url=new URL(request.url), name=url.pathname.slice('/api/table/'.length),config=TABLE_DATASETS[name]
  if (!config || !Object.hasOwn(TABLE_DATASETS,name)) return errorResponse(404,'not_found')
  if (request.method!=='GET') return errorResponse(405,'method_not_allowed',{allow:'GET'})
  if (url.search.length>20_000 || url.searchParams.toString().length>8192) return errorResponse(400,'invalid_query')
  try {
    const db=env.TABLE_DB
    const version=await db.prepare("SELECT value FROM table_meta WHERE key='version'").first<string>('value')
    if (!version) throw new Error('unavailable')
    const actReceipt=name==='act-invoices'?await actInvoicesMetadata(db):null
    if (name === 'act-invoices' && !actReceipt) return errorResponse(404,'not_available')
    if (repeatedTableKeys(url.searchParams,null).size) return errorResponse(400,'invalid_query')
    const queryParams = new URLSearchParams(url.searchParams)
    const supplier = name === 'contracts' ? queryParams.get('supplier') : null
    const donor = name === 'suppliers' ? queryParams.get('donor') : null
    if (supplier !== null) queryParams.delete('supplier')
    if (donor !== null) queryParams.delete('donor')
    if (supplier !== null && (!/^s-[a-f0-9]{20}$/.test(supplier) || url.searchParams.getAll('supplier').length !== 1)) return errorResponse(400,'invalid_query')
    if (donor !== null && (!donor || donor.length > 1000 || url.searchParams.getAll('donor').length !== 1)) return errorResponse(400,'invalid_query')
    let query: Query | undefined
    try {query=parseTableQuery(queryParams,config.columns,config.defaultSort)} catch { /* Fixed grammar error, without echo. */ }
    if (!query) return errorResponse(400,'invalid_query')
    if (name === 'act-invoices') {
      if (Object.keys(query.filters || {}).some(key=>!config.filterKeys!.includes(key))) return errorResponse(400,'invalid_query')
      // Reject user-supplied labels unless they are published public-body/period facets.
      // Unknown supplier names and ABNs never become selected facet values.
      for (const [key,values] of Object.entries(query.filters || {})) if (Array.isArray(values)) {
        const valid=await db.prepare('SELECT COUNT(DISTINCT value) AS n FROM table_act_invoices_facets WHERE key=? AND value IN (SELECT value FROM json_each(?))').bind(key,JSON.stringify(values)).first<number>('n')
        if (Number(valid)!==values.length) return errorResponse(400,'invalid_query')
      }
    }
    if (supplier) {query.filters ||= {};query.filters.supplier_id = [supplier]}
    const supplierIds = donor !== null ? await donorSupplierIds(env.ASSETS, donor) : undefined
    const stateKey = (state: Query, csv: boolean) => {
      const params = new URLSearchParams(normalizedTableQuery(state, csv))
      if (donor !== null) params.set('donor', donor)
      return params.toString()
    }
    const csv=url.searchParams.get('format')==='csv'
    if ((url.searchParams.getAll('format').length>1 || url.searchParams.has('format') && !csv)) return errorResponse(400,'invalid_query')
    const key=stateKey(query,csv)
    const digest=await tableQueryHash(['table-v3',version,env.CACHE_EPOCH || '',name,key].join('|'))
    const headers=new Headers({'cache-control':'public, max-age=60, s-maxage=60','etag':`"${digest}"`})
    headers.set('content-location','/api/table/'+name+'?'+key)
    if (url.searchParams.size || csv || name==='act-invoices') headers.set('x-robots-tag','noindex')
    if (request.headers.get('if-none-match')===headers.get('etag')) return new Response(null,{status:304,headers})
    const cache=ctx && !csv && typeof caches!=='undefined' ? caches.default : null
    const cacheKey=cache ? new Request(`https://cache.opax.internal/table/${name}/${digest}/${encodeURIComponent(env.CF_VERSION_METADATA?.id || '')}`) : null
    if (cache && cacheKey) {
      const hit=await cache.match(cacheKey).catch(()=>undefined)
      if (hit) {
        headers.set('content-type','application/json; charset=utf-8');headers.set('x-opax-cache','HIT')
        return new Response(hit.body,{headers})
      }
    }
    const disclosures=['money-connections','party-money'].includes(name) && env.ASSETS ? await loadDonorIndex(env.ASSETS).catch(()=>new Map<string,DonorDisclosureRecord>()) : null
    const enrich=(rows:Row[])=>rows.map(row=>{
      if(!['money-connections','party-money'].includes(name))return row
      const identity=(key:'from'|'to')=>disclosures?.get(String(row.jurisdiction)+':'+foldDonorName(row[key]))
      const from=identity('from'),to=identity('to'),donor=from || to
      return {...row,from:name==='party-money' ? row.from : from ? donorDisclosure(from).name : row.from,to:to ? donorDisclosure(to).name : row.to,from_href:from ? donorDisclosure(from).href : null,to_href:to ? donorDisclosure(to).href : null,return_reference:donor ? donorDisclosure(donor).reference : row.type==='receipts' ? [({federal:'AEC',qld:'ECQ',vic:'VEC',tas:'TEC'} as Record<string,string>)[String(row.jurisdiction)] || String(row.jurisdiction),'disclosure returns',row.firstYear===row.lastYear ? row.firstYear : `${row.firstYear}–${row.lastYear}`,({federal:'https://transparency.aec.gov.au/',qld:'https://disclosures.ecq.qld.gov.au/',vic:'https://disclosures.vec.vic.gov.au/',tas:'https://www.tec.tas.gov.au/disclosure-and-funding/registers-and-reports/'} as Record<string,string>)[String(row.jurisdiction)]].filter(Boolean).join(' · ') : ''}
    })
    const table=tableName(name), selection=where(table,query,undefined,supplierIds), columnSQL=config.columns.filter(c=>!c.computed).map(c=>'t.'+quote(c.key)).join(',')
    const kept=tableAggregates(version+'|'+(env.CACHE_EPOCH || '')),totalKey=name+'|count'
    const total=!selection.sql && kept.has(totalKey) ? kept.get(totalKey) as number : Number(await db.prepare(`SELECT COUNT(*) FROM ${table} t${selection.sql}`).bind(...selection.values).first<number>('COUNT(*)'))
    if (!selection.sql) kept.set(totalKey,total)
    if (csv) {
      const csvNotes=actReceipt?actInvoiceCoverageNotes({...actReceipt,public_copy:actInvoicesPublicCopy(actReceipt)}):[]
      if (name==='party-money') {
        const stored=await db.prepare("SELECT value FROM table_meta WHERE key='party-money'").first<string>('value')
        const scopes=stored ? (JSON.parse(stored) as {scopes?:Record<string,Record<string,string>>}).scopes : null
        const jurisdictions=query.filters?.jurisdiction,parties=query.filters?.to
        if (Array.isArray(jurisdictions) && jurisdictions.length===1 && Array.isArray(parties) && parties.length===1) {
          const scope=scopes?.[jurisdictions[0]]?.[parties[0]]
          if (scope) csvNotes.push(`${jurisdictions[0]}: ${parties[0]}: ${scope}`)
        }
      }
      if(csvNotes.length)headers.set('x-table-csv-notes',encodeURIComponent(JSON.stringify(csvNotes)))
      const exportable=Math.min(MAX_CSV,total),exportLimited=total>MAX_CSV
      const csvPage=query.page!,pages=Math.ceil(exportable/CSV_PAGE)
      const start=csvPage>pages ? exportable : (csvPage-1)*CSV_PAGE
      const end=Math.min(exportable,start+CSV_PAGE),exported=end-start,truncated=exported<total
      const link=(page: number) => '/api/table/'+name+'?'+stateKey({...query,page},true)
      const next=csvPage<pages ? link(csvPage+1) : undefined
      const links: string[]=[]
      if (next) links.push(`<${next}>; rel="next"`)
      if (csvPage>1 && pages) links.push(`<${link(Math.min(csvPage-1,pages))}>; rel="prev"`)
      if (links.length) headers.set('link',links.join(', '))
      headers.set('content-type','text/csv; charset=utf-8');headers.set('content-disposition',`attachment; filename="${name}-page-${csvPage}.csv"`)
      headers.set('x-table-total',String(total));headers.set('x-table-exported',String(exported));headers.set('x-table-page',String(csvPage))
      headers.set('x-table-truncated',String(truncated));headers.set('x-table-export-truncated',String(exportLimited))
      headers.set('access-control-expose-headers','Link, X-Table-Total, X-Table-Exported, X-Table-Page, X-Table-Truncated, X-Table-Export-Truncated, X-Table-Export-Note, X-Table-CSV-Notes')
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
            for(const note of csvNotes)controller.enqueue(encoder.encode([csvValue('# '+note),...config.columns.slice(1).map(()=>'')].join(',')+'\r\n'))
            controller.close();return
          }
          const batch=await db.prepare(`SELECT ${columnSQL} FROM ${table} t${selection.sql}${order(query,config.columns)} LIMIT ? OFFSET ?`).bind(...selection.values,Math.min(BATCH,end-offset),offset).all<Row>()
          if (!batch.results.length) throw new Error('unavailable')
          const rows=enrich(decode(batch.results));offset+=rows.length
          controller.enqueue(encoder.encode(rows.map(row=>config.columns.map(c=>csvValue(row[c.key])).join(',')).join('\r\n')+'\r\n'))
        } catch {controller.error(new Error('Export unavailable'))}
      }},{highWaterMark:1})
      return new Response(stream,{headers})
    }
    const page=query.page!, pageSize=query.pageSize!,facets: NonNullable<Page['facets']>={}
    let rows: Row[]=[]
    {
      const statements=[db.prepare(`SELECT ${columnSQL} FROM ${table} t${selection.sql}${order(query,config.columns)} LIMIT ? OFFSET ?`).bind(...selection.values,pageSize,(page-1)*pageSize)]
      const facetColumns=config.columns.filter(c=>c.facet),pending: {c: Column; at: number; key?: string}[]=[],known=new Map<string,Row[]>()
      for (const c of facetColumns) {
        const scope=where(table,query,c.key,supplierIds),key=scope.sql ? undefined : name+'|'+c.facet+'|'+c.key
        if (key && kept.has(key)) {known.set(c.key,kept.get(key) as Row[]);continue}
        pending.push({c,at:statements.length,key})
        // Unfiltered: MIN and MAX as separate subqueries each use the column index (one row each),
        // and every facet row has its table row, so the join only filters.
        statements.push(c.facet==='range'
          ? db.prepare(scope.sql ? `SELECT MIN(t.${quote(c.key)}) AS min,MAX(t.${quote(c.key)}) AS max FROM ${table} t${scope.sql}` : `SELECT (SELECT MIN(${quote(c.key)}) FROM ${table}) AS min,(SELECT MAX(${quote(c.key)}) FROM ${table}) AS max`).bind(...scope.values)
          : db.prepare(scope.sql ? `SELECT f.value,COUNT(*) AS count FROM ${table}_facets f JOIN ${table} t ON t.rowid=f.rowid${scope.sql} AND f.key=? GROUP BY f.value ORDER BY count DESC,f.value LIMIT ${MAX_FACETS}` : `SELECT f.value,COUNT(*) AS count FROM ${table}_facets f WHERE f.key=? GROUP BY f.value ORDER BY count DESC,f.value LIMIT ${MAX_FACETS}`).bind(...scope.values,c.key))
      }
      const results=await db.batch<Row>(statements);rows=enrich(decode(results[0].results))
      for (const {c,at,key} of pending) {known.set(c.key,results[at].results);if (key) kept.set(key,results[at].results)}
      for (const c of facetColumns) {
        const values=known.get(c.key)!
        if (c.facet==='range') {const range=values[0];if(range?.min!=null && range?.max!=null) facets[c.key]={min:Number(range.min),max:Number(range.max)}}
        else facets[c.key]=values as {value:string;count:number}[]
      }
    }
    headers.set('content-type','application/json; charset=utf-8')
    const body=JSON.stringify({rows,total,page,pageSize,facets} satisfies Page)
    if (cache && cacheKey && ctx) {
      headers.set('x-opax-cache','MISS')
      const stored=new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':`public, max-age=${PAGE_CACHE_SECONDS}`}})
      ctx.waitUntil(cache.put(cacheKey,stored).catch(()=>{}))
    }
    return new Response(body,{headers})
  } catch {return errorResponse(503,'unavailable',{})}
}
