import {partyMoneyData,type PartyGraph} from '../public/register-tables.js'
/** Source-backed donor names and references, with confident links only. */
export async function partyMoneyResponse(request:Request,assets:Fetcher):Promise<Response> {
 const headers={'cache-control':'no-store','x-robots-tag':'noindex'}
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers})
 const id=new URL(request.url).searchParams.get('partyId') || ''
 if(!id.startsWith('party:') || id.length>200)return Response.json({error:'Party unavailable'},{status:404,headers})
 try {
  const response=await assets.fetch(new Request('https://opax.com.au/graph/money.json'))
  if(!response.ok)throw Error('unavailable')
  const graph=await response.json() as PartyGraph
  if(!graph.nodes.some(node=>node.kind==='party'&&node.id===id))return Response.json({error:'Party unavailable'},{status:404,headers})
  const data=partyMoneyData(graph,id)
  return request.method==='HEAD'?new Response(null,{headers}):Response.json(data,{headers})
 }catch{return Response.json({error:'Party unavailable'},{status:503,headers})}
}
