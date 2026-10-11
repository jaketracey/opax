import {withheldNameCheck} from './donor-index'
import {interestTableData, type InterestRegister} from '../public/register-tables.js'

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
    const withheld = await withheldNameCheck(assets)
    const data = interestTableData(register,withheld,text=>!withheld(`donor receipts ${text}`))
    return request.method === 'HEAD' ? new Response(null,{headers}) : Response.json(data,{headers})
  } catch { return Response.json({error:'Register unavailable'},{status:503,headers}) }
}
