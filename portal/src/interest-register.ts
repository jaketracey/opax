import {applyQuery} from '../public/datatable.js'
import {memoisedCheck,tablePrivacyCheck} from './table-privacy.ts'
import {interestTableData, interestTableConfig, type InterestRegister} from '../public/register-tables.js'

/** A complete public projection for client tables. No query, paging or remote calls. */
export async function interestRegisterResponse(request: Request, assets: Fetcher): Promise<Response> {
  const headers = {'cache-control':'no-store','x-robots-tag':'noindex'}
  if (!['GET','HEAD'].includes(request.method)) return Response.json({error:'Method not allowed'},{status:405,headers})
  const pid = new URL(request.url).searchParams.get('pid') || ''
  if (!/^[\w-]+$/.test(pid)) return Response.json({error:'Register unavailable'},{status:404,headers})
  try {
    const response = await assets.fetch(new Request(`https://opax.com.au/interests/${pid}.json`))
    if (!response.ok) throw new Error('unavailable')
    const register = await response.json() as InterestRegister
    const safe = memoisedCheck(await tablePrivacyCheck(assets))
    const safeRows = memoisedCheck(await tablePrivacyCheck(assets,'row'))
    const data = interestTableData(register,(...texts)=>texts.some(text=>!safeRows(String(text))),safeRows)
    const rows=applyQuery(data.rows,interestTableConfig(data.rows,safe,safeRows),{pageSize:50_000}).rows
    return request.method === 'HEAD' ? new Response(null,{headers}) : Response.json({rows,omitted:data.omitted+data.rows.length-rows.length},{headers})
  } catch { return Response.json({error:'Register unavailable'},{status:503,headers}) }
}
