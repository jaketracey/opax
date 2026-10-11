import {tablePrivacyCheck} from './table-privacy.ts'
import {applyQuery, parseQuery, toCSV} from '../public/datatable.js'
import {instrumentTableConfig} from '../public/register-tables.js'
import {catalogueComplete, instrumentTableRows, type CatalogueRow} from '../public/instruments.js'
import {catalogueReader} from './catalogue-reader.mjs'

interface Manifest {count:number;exported?:number;index_url:string;schemas:string[][];strings?:string[];chunks:{path:string}[]}

/** Only static metadata is read; no model, auth, production binding or write is involved. */
export async function instrumentTableResponse(request:Request, assets:Fetcher):Promise<Response> {
  const headers = {'x-robots-tag':'noindex','cache-control':'public, max-age=60, s-maxage=60'}
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405,headers:{...headers,allow:'GET, HEAD'}})
  try {
    const url = new URL(request.url), safe=await tablePrivacyCheck(assets), config = instrumentTableConfig(safe), read = catalogueReader(assets)
    const manifest = await read<Manifest>('/instruments/manifest.json')
    if (!catalogueComplete(manifest)) throw new Error('unavailable')
    const index = await read<{records:CatalogueRow[]}>(manifest.index_url)
    if (index.records.length !== (manifest.exported ?? manifest.count)) throw new Error('unavailable')
    const rows = (await instrumentTableRows(read,manifest,index.records)).filter(row=>safe(JSON.stringify(row)))
    const query = parseQuery(url.searchParams)
    query.pageSize = Math.max(1,Math.min(200,query.pageSize || 50))
    if (url.searchParams.get('format') === 'csv') {
      if ((query.q && !safe(query.q)) || Object.values(query.filters || {}).some(values=>Array.isArray(values) && values.some(value=>!safe(value)))) return new Response(null,{status:403,headers:{...headers,'cache-control':'no-store'}})
      const page = applyQuery(rows,config,{...query,page:1,pageSize:50_000})
      const truncated = page.total > 50_000
      const csv = toCSV(page.rows,config) + (truncated ? '\r\n# Export truncated at 50,000 rows.' : '')
      return new Response(request.method === 'HEAD' ? null : csv,{headers:{...headers,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="instruments.csv"',...(truncated ? {'x-table-export-truncated':'true'} : {})}})
    }
    const page = applyQuery(rows,config,query)
    return request.method === 'HEAD' ? new Response(null,{headers:{...headers,'content-type':'application/json'}}) : Response.json(page,{headers})
  } catch {return Response.json({error:'Instrument catalogue unavailable'},{status:503,headers:{...headers,'cache-control':'no-store'}})}
}
