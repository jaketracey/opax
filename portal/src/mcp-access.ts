// Who may call /mcp, and how often. Three kinds of caller:
//   anonymous  no token; the read-only public-record tools, under shared limits
//   key        a member's personal key (opax_…), as before
//   oauth      a member's connected client (opax_at_…), issued by community-oauth.ts
// No caller is identified by a cookie, so any website may call /mcp from a
// browser without gaining anything a direct request would not have.
import {CommunityError,digest,json,limit,now,type Member} from './community-core'
import {oauthMember} from './community-oauth'
import {ANTHROPIC_EGRESS,OPENAI_EGRESS} from './mcp-shared-egress'

export type McpCaller={kind:'anonymous',member:null}|{kind:'key'|'oauth',member:Member}
export const MCP_PATHS=['/mcp','/mcp/member']
export const MCP_SCOPE='records:read'
/** The address that always asks for sign-in, for clients that only start it on a 401. */
export const MCP_MEMBER_PATH='/mcp/member'

const CORS:Record<string,string>={
 'access-control-allow-origin':'*',
 'access-control-allow-methods':'POST, GET, OPTIONS',
 'access-control-allow-headers':'authorization, content-type, accept, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name, last-event-id',
 'access-control-expose-headers':'www-authenticate, retry-after, mcp-session-id',
 'access-control-max-age':'86400',
 vary:'origin',
}
/** Credential-free CORS for the tool endpoint and the token and metadata endpoints. */
export function withCors(response:Response):Response {
 const out=new Response(response.body,response)
 for(const [name,value] of Object.entries(CORS))out.headers.set(name,value)
 return out
}
export const preflight=()=>new Response(null,{status:204,headers:{...CORS,'cache-control':'no-store'}})

export const anonymousEnabled=(env:Env)=>String(env.MCP_ANON_ENABLED)==='true'
const setting=(env:Env,name:string,fallback:number)=>{const value=Number((env as unknown as Record<string,unknown>)[name]);return Number.isInteger(value)&&value>0?value:fallback}

/** RFC 9728 pointer for a 401: where a client finds the sign-in service. */
export function challenge(env:Env,path:string,error?:string):string {
 const resource=MCP_PATHS.includes(path)?path:'/mcp'
 return `Bearer realm="OPAX public record", resource_metadata="${env.COMMUNITY_ORIGIN}/.well-known/oauth-protected-resource${resource}", scope="${MCP_SCOPE}"`+(error?`, error="${error}"`:'')
}

const HOUR=3600
const hourKey=(bucket:number)=>'mcp-anon-hour:'+bucket
/** Count one anonymous request against this hour, and log once when the hour crosses the alert line. */
async function countAnonymous(env:Env):Promise<void> {
 const bucket=Math.floor(now()/HOUR)
 // Plain keys, unlike limit(): the volume reader sums these rows by hour. Login housekeeping removes them a day after expiry.
 const row=await env.COMMUNITY_DB.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(hourKey(bucket),(bucket+1)*HOUR).first<{hits:number}>()
 // Workers observability, the sink Ask monitoring writes to. Counts only; never an address or a query.
 if(row?.hits===setting(env,'MCP_ANON_ALERT_HOURLY',20000))console.warn(JSON.stringify({kind:'mcp_anon_volume',level:'alert',hour:bucket*HOUR,hits:row.hits}))
}
/** Sustained means three complete hours in a row over the alert line, at any point in the last day. */
export async function anonymousVolume(env:Env):Promise<{anonymous:boolean,volume:'normal'|'high',hours_over:number}> {
 const bucket=Math.floor(now()/HOUR),line=setting(env,'MCP_ANON_ALERT_HOURLY',20000)
 const hours=Array.from({length:24},(_,i)=>bucket-1-i)
 const rows=await env.COMMUNITY_DB.prepare(`SELECT key,hits FROM community_limits WHERE key IN (${hours.map(()=>'?').join(',')})`).bind(...hours.map(hourKey)).all<{key:string,hits:number}>()
 const over=new Set(rows.results.filter(row=>row.hits>=line).map(row=>row.key))
 let run=0,longest=0
 for(const hour of hours){run=over.has(hourKey(hour))?run+1:0;longest=Math.max(longest,run)}
 return {anonymous:anonymousEnabled(env),volume:longest>=3?'high':'normal',hours_over:over.size}
}

/** IPv4 ranges as [network, mask]; anything malformed is dropped. */
function ranges(list:string):[number,number][] {
 const out:[number,number][]=[]
 for(const entry of list.split(',')){
  const [address,bitsRaw='32']=entry.trim().split('/'),ip=ipv4(address),bits=Number(bitsRaw)
  if(ip===null||!Number.isInteger(bits)||bits<8||bits>32)continue
  const mask=bits===32?0xffffffff:(~(0xffffffff>>>bits))>>>0
  out.push([(ip&mask)>>>0,mask])
 }
 return out
}
function ipv4(raw:string|undefined):number|null {
 const parts=(raw??'').trim().split('.');if(parts.length!==4)return null
 let n=0;for(const part of parts){if(!/^\d{1,3}$/.test(part)||Number(part)>255)return null;n=n*256+Number(part)}
 return n
}
const builtInShared=ranges(ANTHROPIC_EGRESS+','+OPENAI_EGRESS)
/** True for an address that many people's assistants arrive from (Claude's and ChatGPT's servers). */
export function sharedAddress(env:Env,ip:string):boolean {
 const n=ipv4(ip);if(n===null)return false
 return [...builtInShared,...ranges(String(env.MCP_ANON_SHARED_RANGES??''))].some(([network,mask])=>((n&mask)>>>0)===network)
}

// Requests every client makes just to connect. They count toward the address ceiling but not a client's own allowance.
const HANDSHAKE=new Set(['initialize','notifications/initialized','tools/list','ping'])
/**
 * Limits for a request without an account, spent once the method is known:
 *  - one client: 60 a minute. A client is its session (Mcp-Session-Id, issued at initialize) at its
 *    address, otherwise its User-Agent at its address;
 *  - one address: a high ceiling only, far higher again for the addresses assistants share;
 *  - everyone together: a ceiling that protects the database.
 */
export async function spendAnonymous(req:Request,env:Env,method:unknown):Promise<void> {
 const ip=req.headers.get('cf-connecting-ip')||'local',shared=sharedAddress(env,ip)
 const session=req.headers.get('mcp-session-id'),named=session&&/^[\x21-\x7e]{8,128}$/.test(session)?session:null
 const perClient=setting(env,'MCP_ANON_PER_CLIENT_MINUTE',60),everyone=setting(env,'MCP_ANON_GLOBAL_MINUTE',3000)
 const perIp=shared?setting(env,'MCP_ANON_SHARED_IP_MINUTE',1500):setting(env,'MCP_ANON_PER_IP_MINUTE',300)
 const tooMany=(what:string)=>`Too many requests without an account: ${what} Wait a minute and try again, or connect with a free OPAX account for your own limit: ${env.COMMUNITY_ORIGIN}/mcp`
 const addressMessage=tooMany(`the ceiling is ${perIp} a minute for one network address.`)
 // The Workers limiter refuses a flood from one ordinary address before it costs a database write. It fails open; the exact counts below still apply.
 if(!shared){
  const edge=await env.MCP_ANON_LIMITER?.limit({key:ip}).catch(()=>null)
  if(edge&&!edge.success)throw new McpLimitError(addressMessage)
 }
 // On a shared address a client with no session cannot be told from the next person's, so only the ceilings apply to it.
 const clientKey=named?'session:'+named:shared?null:'agent:'+(req.headers.get('user-agent')||'unnamed').slice(0,200)
 const countsForClient=clientKey&&!(typeof method==='string'&&HANDSHAKE.has(method))
 const checks=await Promise.allSettled([
  limit(env,'mcp-anon-ip:'+ip,perIp,60),
  countsForClient?limit(env,'mcp-anon-client:'+ip+':'+clientKey,perClient,60):Promise.resolve(),
  limit(env,'mcp-anon-all',everyone,60),
  countAnonymous(env),
 ])
 const failed=checks.find(check=>check.status==='rejected') as PromiseRejectedResult|undefined
 if(!failed)return
 if(!(failed.reason instanceof CommunityError)||failed.reason.status!==429)throw failed.reason
 if(checks[1].status==='rejected')throw new McpLimitError(tooMany(`the limit is ${perClient} a minute for one client.`))
 if(checks[0].status==='rejected')throw new McpLimitError(addressMessage)
 throw new McpLimitError('OPAX tools are busy for callers without an account. Wait a minute and try again, or connect with a free OPAX account for your own limit: '+env.COMMUNITY_ORIGIN+'/mcp')
}
/** A session id for a no-account client, so its later requests are counted as its own. Nothing is stored for it. */
export function withAnonymousSession(response:Response,method:unknown):Response {
 if(method!=='initialize'||!response.ok||response.headers.has('mcp-session-id'))return response
 const out=new Response(response.body,response);out.headers.set('mcp-session-id',crypto.randomUUID());return out
}
export class McpLimitError extends CommunityError { constructor(message:string){super(429,message)} }

/** Decide the caller, or answer the request here (preflight, 401). A member's limit is spent here on POST; a no-account caller's in spendAnonymous. */
export async function mcpCaller(req:Request,env:Env):Promise<McpCaller|Response> {
 const path=new URL(req.url).pathname
 if(req.method==='OPTIONS')return preflight()
 const header=req.headers.get('authorization')
 const unauthorised=(message:string,error?:string)=>json({error:message},401,{'www-authenticate':challenge(env,path,error)})
 if(!header){
  if(path===MCP_MEMBER_PATH)return unauthorised('Sign in to OPAX to use this address. The address without sign-in is '+env.COMMUNITY_ORIGIN+'/mcp')
  if(!anonymousEnabled(env))return unauthorised('Connect with an OPAX account or a member key: '+env.COMMUNITY_ORIGIN+'/mcp')
  return {kind:'anonymous',member:null}
 }
 // A presented credential is never downgraded to anonymous: a client must learn its token has lapsed.
 if(String(env.COMMUNITY_ENABLED)!=='true')throw new CommunityError(503,'Community access is being prepared.')
 const oauth=header.match(/^Bearer (opax_at_[\w-]{43})$/)?.[1]
 if(oauth){
  const member=await oauthMember(env,oauth,MCP_PATHS.map(p=>env.COMMUNITY_ORIGIN+p))
  if(!member)return unauthorised('This connection has expired or was removed. Sign in again.','invalid_token')
  if(req.method==='POST')await limit(env,'mcp:'+member.id,60,60)
  return {kind:'oauth',member}
 }
 const key=header.match(/^Bearer (opax_[\w-]{43})$/)?.[1]
 if(!key)return unauthorised('Use an OPAX member key or sign in.','invalid_token')
 const record=await env.COMMUNITY_DB.prepare('SELECT m.*,k.id AS key_id FROM mcp_keys k JOIN members m ON m.id=k.member_id WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND m.disabled=0').bind(await digest(key),now()).first<Member&{key_id:string}>()
 if(!record)return unauthorised('This access token is expired or revoked.','invalid_token')
 if(req.method==='POST'){
  await limit(env,'mcp:'+record.id,60,60)
  await env.COMMUNITY_DB.prepare('UPDATE mcp_keys SET last_used_at=? WHERE id=?').bind(now(),record.key_id).run()
 }
 return {kind:'key',member:record}
}
