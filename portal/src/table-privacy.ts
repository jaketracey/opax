import {tableIdentityIndex} from './table-identity-index.mjs'
const indices=new WeakMap<Fetcher,Promise<(text:string)=>boolean>>()
/** One server-only donor/recipient index for every table, without exemptions. */
export async function tablePrivacyCheck(assets:Fetcher):Promise<(text:string)=>boolean> {
 let pending=indices.get(assets)
 if(!pending){
  const read=async(path:string)=>{
   const response=await assets.fetch(new Request(`https://opax.com.au${path}`))
   if(!response.ok)throw Error('Privacy index unavailable')
   return response.json()
  }
  pending=tableIdentityIndex(read).then(index=>index.safe).catch(()=>{indices.delete(assets);return ()=>false})
  indices.set(assets,pending)
 }
 return pending
}
/** Read-only validation never reflects the input or publishes the index. */
export async function tablePrivacy(request:Request,assets:Fetcher):Promise<Response> {
 const headers={'cache-control':'no-store','x-robots-tag':'noindex','content-type':'application/json'}
 if(request.method!=='POST')return Response.json({safe:false},{status:405,headers})
 try{
  const value:unknown=JSON.parse(await request.text()).text
  if(typeof value!=='string')return Response.json({safe:false},{status:400,headers})
  const check=await tablePrivacyCheck(assets)
  return Response.json({safe:check(value)},{headers})
 }catch{return Response.json({safe:false},{status:503,headers})}
}
