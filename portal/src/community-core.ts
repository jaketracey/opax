export class CommunityError extends Error { constructor(public status:number,message:string){super(message)} }
export const now = () => Math.floor(Date.now()/1000)
export const randomToken = () => { const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','') }
export const digest = async (value:string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')
export const json = (body:unknown,status=200,headers:HeadersInit={}) => Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer',...headers}})
export async function body(req:Request,max=16000):Promise<Record<string,unknown>> {
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new CommunityError(415,'Use JSON for this request.')
 const reader=req.body?.getReader();if(!reader)throw new CommunityError(400,'Missing request body.')
 let length=0;const chunks:Uint8Array[]=[]
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new CommunityError(413,'This request is too large.')}chunks.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed}catch{throw new CommunityError(400,'Invalid JSON request.')}
}
export function text(value:unknown,min:number,max:number,name:string){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new CommunityError(400,`${name} must be ${min}–${max} characters.`);return value.trim()}
export function sameOrigin(req:Request,env:Env){if(req.headers.get('origin')!==env.COMMUNITY_ORIGIN)throw new CommunityError(403,'Open this action from your Opax account.')}
export async function limit(env:Env,key:string,count:number,seconds:number){
 const bucket=Math.floor(now()/seconds),hashed=await digest(key+':'+bucket)
 const row=await env.COMMUNITY_DB.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(hashed,(bucket+1)*seconds).first<{hits:number}>()
 if(!row||row.hits>count)throw new CommunityError(429,'Please wait a little before trying again.')
}
export type Member={id:string,email:string,display_name:string,bio:string,role:string,disabled:number,created_at:number}
export async function member(req:Request,env:Env):Promise<Member|null>{
 const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-opax_session='))?.slice(20)
 if(!token||!/^[\w-]{43}$/.test(token))return null
 return env.COMMUNITY_DB.prepare('SELECT m.* FROM members m JOIN member_sessions s ON s.member_id=m.id WHERE s.token_hash=? AND s.expires_at>? AND m.disabled=0').bind(await digest(token),now()).first<Member>()
}
export async function requireMember(req:Request,env:Env){const m=await member(req,env);if(!m)throw new CommunityError(401,'Sign in to continue.');return m}
export function publicMember(m:Member){return {id:m.id,name:m.display_name||'Community member',bio:m.bio,joined_at:m.created_at}}
export function sourcePath(value:unknown){if(value==null||value==='')return null;const path=text(value,1,600,'Record link');if(!/^\/(?:doc|subject|search|money|bills?|reports|connections|explore|discover|declared)(?:[/?#]|$)/.test(path)||/[\\\u0000-\u0020]/.test(path))throw new CommunityError(400,'Use a link to a record or page on Opax.');return path}
