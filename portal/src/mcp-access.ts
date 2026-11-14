// Who may call /mcp, and how often. Three kinds of caller:
//   anonymous  no token; the read-only public-record tools, under shared limits
//   key        a member's personal key (opax_…), as before
//   oauth      a member's connected client (opax_at_…), issued by community-oauth.ts
// No caller is identified by a cookie, so any website may call /mcp from a
// browser without gaining anything a direct request would not have.
import {CommunityError,digest,json,limit,now,type Member} from './community-core'
import {oauthMember,type OAuthMember} from './community-oauth'
import {ANTHROPIC_EGRESS,OPENAI_EGRESS} from './mcp-shared-egress'

export type McpCaller={kind:'anonymous',member:null}|{kind:'key',member:Member&{key_id:string}}|{kind:'oauth',member:OAuthMember}
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
 // Once an hour, clear limit rows a day past their window, so the table cannot grow without bound when nobody is signing in.
 if(row?.hits===1)await env.COMMUNITY_DB.prepare('DELETE FROM community_limits WHERE expires_at<?').bind(now()-86400).run()
 // Workers observability, the sink Ask monitoring writes to. Counts only; never an address or a query.
 if(row?.hits===setting(env,'MCP_ANON_ALERT_HOURLY',20000))console.warn(JSON.stringify({kind:'mcp_anon_volume',level:'alert',hour:bucket*HOUR,hits:row.hits}))
}
// --- the daily spend guard ---------------------------------------------------
// Two counts per UTC day, each a number only. When either reaches its cap the no-account tier pauses by
// itself until the day ends: /mcp answers as it does with the kill switch off, and members are unaffected.
//  - metered: calls that can reach a backend billed per call. Today that is the Progress knowledge base
//    (record search and reading); no MCP tool calls a language model or Workers AI.
//  - requests: every no-account request, which bounds Cloudflare's own per-request and per-row charges.
const DAY=86400
const dayKey=(kind:'metered'|'requests',day:number)=>`mcp-anon-${kind}-day:${day}`
const caps=(env:Env)=>({metered:setting(env,'MCP_ANON_DAILY_METERED_CAP',3000),requests:setting(env,'MCP_ANON_DAILY_REQUEST_CAP',200000)})
async function countDay(env:Env,kind:'metered'|'requests'):Promise<number> {
 const day=Math.floor(now()/DAY)
 const row=await env.COMMUNITY_DB.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(dayKey(kind,day),(day+1)*DAY).first<{hits:number}>()
 const hits=row?.hits??0
 // Logged once, as the cap is reached (Workers observability, with the hourly volume line).
 if(hits===caps(env)[kind])console.warn(JSON.stringify({kind:'mcp_anon_daily_cap',level:'alert',count:kind,day:day*DAY,hits}))
 return hits
}
/** Which daily cap, if any, has paused the no-account tier today. */
export async function anonymousPaused(env:Env):Promise<'metered'|'requests'|null> {
 const day=Math.floor(now()/DAY),cap=caps(env)
 const rows=await env.COMMUNITY_DB.prepare('SELECT key,hits FROM community_limits WHERE key IN (?,?)').bind(dayKey('metered',day),dayKey('requests',day)).all<{key:string,hits:number}>()
 const hits=(kind:'metered'|'requests')=>rows.results.find(row=>row.key===dayKey(kind,day))?.hits??0
 return hits('metered')>=cap.metered?'metered':hits('requests')>=cap.requests?'requests':null
}
const pausedMessage=(env:Env)=>'OPAX tools are paused for callers without an account until tomorrow (UTC): today\'s shared allowance is used up. Connect with a free OPAX account to keep going: '+env.COMMUNITY_ORIGIN+'/mcp'
/** Count one call to a metered backend for a no-account caller; refuse it once today's cap is spent. */
export async function spendMetered(env:Env):Promise<void> {
 if(await countDay(env,'metered')>caps(env).metered)throw new McpLimitError(pausedMessage(env),DAY-now()%DAY)
}

/** Sustained means three complete hours in a row over the alert line, at any point in the last day. */
export async function anonymousVolume(env:Env):Promise<{anonymous:boolean,volume:'normal'|'high',hours_over:number,paused_today:'metered'|'requests'|null}> {
 const bucket=Math.floor(now()/HOUR),line=setting(env,'MCP_ANON_ALERT_HOURLY',20000)
 const hours=Array.from({length:24},(_,i)=>bucket-1-i)
 const rows=await env.COMMUNITY_DB.prepare(`SELECT key,hits FROM community_limits WHERE key IN (${hours.map(()=>'?').join(',')})`).bind(...hours.map(hourKey)).all<{key:string,hits:number}>()
 const over=new Set(rows.results.filter(row=>row.hits>=line).map(row=>row.key))
 let run=0,longest=0
 for(const hour of hours){run=over.has(hourKey(hour))?run+1:0;longest=Math.max(longest,run)}
 const paused=anonymousEnabled(env)?await anonymousPaused(env):null
 return {anonymous:anonymousEnabled(env)&&!paused,volume:longest>=3?'high':'normal',hours_over:over.size,paused_today:paused}
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

/** The unit a limit counts: an IPv4 address, or an IPv6 /64 (one subscriber holds a whole /64, so the full address would be no limit at all). */
export function networkKey(ip:string):string {
 if(!ip.includes(':'))return ip
 const [head,tail='']=ip.toLowerCase().split('::'),left=head?head.split(':'):[],right=tail?tail.split(':'):[]
 const groups=ip.includes('::')?[...left,...Array(Math.max(0,8-left.length-right.length)).fill('0'),...right]:left
 return groups.slice(0,4).map(group=>group.replace(/^0+(?=.)/,'')).join(':')+'::/64'
}

// Requests every client makes just to connect. They count toward the address ceiling but not a client's own allowance.
const HANDSHAKE=new Set(['initialize','notifications/initialized','tools/list','ping'])
/**
 * A token bucket for one client: a steady rate with room for a burst, because assistants fire several
 * tool calls at once. Kept as one number per key (the time the bucket would be full again, in milliseconds;
 * the "generic cell rate" form), so a request is admitted or refused by a single statement with no race.
 * Returns 0 when admitted, otherwise the seconds until the next request would be.
 */
async function bucket(env:Env,key:string,perMinute:number,burst:number):Promise<number> {
 const t=Date.now(),step=Math.ceil(60000/perMinute),room=(burst-1)*step,hashed=await digest('bucket:'+key)
 const admitted=await env.COMMUNITY_DB.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=max(hits,?)+?,expires_at=excluded.expires_at WHERE max(hits,?)-?<=? RETURNING hits')
  .bind(hashed,t+step,Math.ceil((t+room+step)/1000)+60,t,step,t,t,room).first<{hits:number}>()
 if(admitted)return 0
 const row=await env.COMMUNITY_DB.prepare('SELECT hits FROM community_limits WHERE key=?').bind(hashed).first<{hits:number}>()
 return Math.max(1,Math.ceil(((row?.hits??t)-t-room)/1000))
}
const burstOf=(perMinute:number)=>Math.max(1,Math.ceil(perMinute/2))
const sessionOf=(req:Request)=>{const session=req.headers.get('mcp-session-id');return session&&/^[\x21-\x7e]{8,128}$/.test(session)?session:null}
/** Seconds until a per-minute ceiling's window turns over. */
const windowLeft=()=>60-now()%60
/**
 * Limits for a request without an account, spent once the method is known:
 *  - one client: 60 a minute with bursts of 30 at once. A client is its session (Mcp-Session-Id, issued
 *    at initialize) at its address, otherwise its User-Agent at its address. The session id is the
 *    caller's own word, so this is fairness between honest clients; the address ceiling is the real stop;
 *  - one address: a high ceiling only, far higher again for the addresses assistants share;
 *  - everyone together: a ceiling that protects the database.
 */
export async function spendAnonymous(req:Request,env:Env,method:unknown):Promise<void> {
 const ip=req.headers.get('cf-connecting-ip')||'local',shared=sharedAddress(env,ip),network=networkKey(ip)
 // The daily guard first, by a read alone: a paused tier costs no write.
 if(await anonymousPaused(env))throw new CommunityError(401,pausedMessage(env))
 const named=sessionOf(req)
 const perClient=setting(env,'MCP_ANON_PER_CLIENT_MINUTE',60),everyone=setting(env,'MCP_ANON_GLOBAL_MINUTE',3000)
 const perIp=shared?setting(env,'MCP_ANON_SHARED_IP_MINUTE',1500):setting(env,'MCP_ANON_PER_IP_MINUTE',300)
 const tooMany=(what:string)=>`Too many requests without an account: ${what} Wait and try again, or connect with a free OPAX account for your own limit: ${env.COMMUNITY_ORIGIN}/mcp`
 const addressMessage=tooMany(`the ceiling is ${perIp} a minute for one network address.`)
 // The Workers limiter refuses a flood from one ordinary address before it costs a database write. It fails open; the exact counts below still apply.
 if(!shared){
  const edge=await env.MCP_ANON_LIMITER?.limit({key:network}).catch(()=>null)
  if(edge&&!edge.success)throw new McpLimitError(addressMessage,windowLeft())
 }
 // On a shared address a client with no session cannot be told from the next person's, so only the ceilings apply to it.
 const clientKey=named?'session:'+named:shared?null:'agent:'+(req.headers.get('user-agent')||'unnamed').slice(0,200)
 const countsForClient=clientKey&&!(typeof method==='string'&&HANDSHAKE.has(method))
 // In order, so a request refused for its address or client never uses up anyone else's allowance:
 // one caller cannot fill the overall ceiling from a single address.
 const refusedAt=async(check:Promise<void>)=>{try{await check;return false}catch(e){if(e instanceof CommunityError&&e.status===429)return true;throw e}}
 if(await refusedAt(limit(env,'mcp-anon-ip:'+network,perIp,60)))throw new McpLimitError(addressMessage,windowLeft())
 if(countsForClient){
  const wait=await bucket(env,'mcp-anon-client:'+network+':'+clientKey,perClient,burstOf(perClient))
  if(wait)throw new McpLimitError(tooMany(`the limit is ${perClient} a minute for one client, with up to ${burstOf(perClient)} at once.`),wait)
 }
 // Assistants' shared addresses and everyone else have separate overall ceilings, so neither crowd can shut the other out.
 if(await refusedAt(limit(env,shared?'mcp-anon-all-shared':'mcp-anon-all',everyone,60)))throw new McpLimitError('OPAX tools are busy for callers without an account. Wait and try again, or connect with a free OPAX account for your own limit: '+env.COMMUNITY_ORIGIN+'/mcp',windowLeft())
 await countAnonymous(env)
 await countDay(env,'requests')
}
/** A session id for a client, so its later requests are counted as its own. Nothing is stored for it. */
export function withSession(response:Response,method:unknown):Response {
 if(method!=='initialize'||!response.ok||response.headers.has('mcp-session-id'))return response
 const out=new Response(response.body,response);out.headers.set('mcp-session-id',crypto.randomUUID());return out
}
export class McpLimitError extends CommunityError { constructor(message:string,public retryAfter=60){super(429,message)} }

/** Decide the caller, or answer the request here (preflight, 401). Limits are spent afterwards, once the method is known. */
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
  return {kind:'oauth',member}
 }
 const key=header.match(/^Bearer (opax_[\w-]{43})$/)?.[1]
 if(!key)return unauthorised('Use an OPAX member key or sign in.','invalid_token')
 const record=await env.COMMUNITY_DB.prepare('SELECT m.*,k.id AS key_id FROM mcp_keys k JOIN members m ON m.id=k.member_id WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND m.disabled=0').bind(await digest(key),now()).first<Member&{key_id:string}>()
 if(!record)return unauthorised('This access token is expired or revoked.','invalid_token')
 return {kind:'key',member:record}
}
/**
 * A member's limits, spent once the method is known:
 *  - one session: 60 tool calls a minute with bursts of 30 at once, so parallel calls from one conversation pass;
 *  - the account (or one connected client): a ceiling of 300 tool calls a minute across its sessions;
 *  - connecting and listing tools, which every new session repeats, are counted apart.
 * A connected client is counted per connection, so it cannot use up the allowance of the member's keys.
 */
export async function spendMember(caller:Exclude<McpCaller,{kind:'anonymous'}>,req:Request,env:Env,method:unknown):Promise<void> {
 const who=caller.kind==='oauth'?'mcp-grant:'+caller.member.grant_id:'mcp:'+caller.member.id
 const ceiling=async(key:string)=>{try{await limit(env,key,300,60)}catch(e){if(e instanceof CommunityError&&e.status===429)throw new McpLimitError('Too many requests: the ceiling is 300 a minute for one account. Wait and try again.',windowLeft());throw e}}
 if(typeof method==='string'&&HANDSHAKE.has(method))await ceiling(who+':connect')
 else{
  await ceiling(who)
  const wait=await bucket(env,who+':session:'+(sessionOf(req)??'none'),60,30)
  if(wait)throw new McpLimitError('Too many requests: the limit is 60 tool calls a minute for one session, with up to 30 at once. Wait and try again.',wait)
 }
 if(caller.kind==='key')await env.COMMUNITY_DB.prepare('UPDATE mcp_keys SET last_used_at=? WHERE id=?').bind(now(),caller.member.key_id).run()
}
