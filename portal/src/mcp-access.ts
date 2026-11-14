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
// Counted per UTC day in community_limits, as numbers only, in two pools: the addresses assistants share
// (Claude's and ChatGPT's servers) and everyone else ("direct"), so neither crowd can pause the other.
// Each pool keeps two counts:
//  - progress: queries to the Progress knowledge base, the one backend billed per call. Each is counted as
//    it is made (progressMeter, below), so a search that makes two (its main query and a keyword retry)
//    counts two; cached answers count nothing. No MCP tool calls a language model or Workers AI.
//  - requests: every no-account request, which bounds Cloudflare's own charges.
// A pool at either cap pauses the tier for its callers until the day ends: /mcp answers as it does with the
// kill switch off. Inside the direct pool each network (an IPv4 address or an IPv6 /48) also has a daily
// allowance of its own, so one network cannot spend the pool: past it, that network alone is refused until
// midnight UTC. Members are not counted.
type Pool='shared'|'direct'
type Count='progress'|'requests'
const DAY=86400
const DAILY:Record<Count,Record<Pool|'network',[string,number]>>={
 progress:{shared:['MCP_ANON_DAILY_PROGRESS_SHARED',250],direct:['MCP_ANON_DAILY_PROGRESS_DIRECT',250],network:['MCP_ANON_DAILY_PROGRESS_NETWORK',150]},
 requests:{shared:['MCP_ANON_DAILY_REQUESTS_SHARED',100000],direct:['MCP_ANON_DAILY_REQUESTS_DIRECT',100000],network:['MCP_ANON_DAILY_REQUESTS_NETWORK',20000]},
}
const cap=(env:Env,count:Count,scope:Pool|'network')=>setting(env,...DAILY[count][scope])
const today=()=>Math.floor(now()/DAY)
const untilMidnight=()=>DAY-now()%DAY
// A pool's count is a plain key, which the status reader sums. A network's is hashed, like every other per-address row.
const poolKey=(count:Count,pool:Pool)=>`mcp-anon-${count}-day:${pool}:${today()}`
const networkDayKey=(count:Count,network:string)=>digest(`mcp-anon-${count}-day:network:${network}:${today()}`)
type Place={shared:boolean,pool:Pool,network:string,wide:string|null}
/** Where a no-account request comes from, for counting: its pool, its address unit and, for a direct caller, its wider network. */
function place(req:Request,env:Env):Place {
 const ip=req.headers.get('cf-connecting-ip')||'local',shared=sharedAddress(env,ip)
 return {shared,pool:shared?'shared':'direct',network:networkKey(ip),wide:shared?null:wideNetwork(ip)}
}
async function addToday(env:Env,key:string):Promise<number> {
 const row=await env.COMMUNITY_DB.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,(today()+1)*DAY).first<{hits:number}>()
 return row?.hits??0
}
/**
 * Count one against the caller's network (direct callers) and then its pool; say which, if either, is now over.
 * The network comes first, so a request refused for its network never uses up the pool.
 * Logged once as each cap is reached (Workers observability, with the hourly volume line); never an address.
 */
async function countToday(env:Env,count:Count,at:Place):Promise<'network'|'pool'|null> {
 if(at.wide){
  const hits=await addToday(env,await networkDayKey(count,at.wide)),most=cap(env,count,'network')
  if(hits===most)console.warn(JSON.stringify({kind:'mcp_anon_network_cap',level:'warn',count,day:today()*DAY,hits}))
  if(hits>most)return 'network'
 }
 const hits=await addToday(env,poolKey(count,at.pool)),most=cap(env,count,at.pool)
 if(hits===most)console.warn(JSON.stringify({kind:'mcp_anon_daily_cap',level:'alert',count,pool:at.pool,day:today()*DAY,hits}))
 return hits>most?'pool':null
}
/** Whether the caller's pool is paused or its network has spent today's allowance, by a read alone. */
async function spentToday(env:Env,at:Place):Promise<'network'|'pool'|null> {
 const counts:Count[]=['progress','requests']
 const keys=[...counts.map(count=>poolKey(count,at.pool)),...(at.wide?await Promise.all(counts.map(count=>networkDayKey(count,at.wide as string))):[])]
 const rows=await env.COMMUNITY_DB.prepare(`SELECT key,hits FROM community_limits WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all<{key:string,hits:number}>()
 const hits=(key:string)=>rows.results.find(row=>row.key===key)?.hits??0
 if(counts.some((count,i)=>hits(keys[i])>=cap(env,count,at.pool)))return 'pool'
 if(at.wide&&counts.some((count,i)=>hits(keys[2+i])>=cap(env,count,'network')))return 'network'
 return null
}
/** The pools the daily guard has paused today, as "pool:count". */
export async function anonymousPaused(env:Env):Promise<string[]> {
 const all=(['shared','direct'] as Pool[]).flatMap(pool=>(['progress','requests'] as Count[]).map(count=>({pool,count,key:poolKey(count,pool)})))
 const rows=await env.COMMUNITY_DB.prepare(`SELECT key,hits FROM community_limits WHERE key IN (${all.map(()=>'?').join(',')})`).bind(...all.map(one=>one.key)).all<{key:string,hits:number}>()
 return all.filter(one=>(rows.results.find(row=>row.key===one.key)?.hits??0)>=cap(env,one.count,one.pool)).map(one=>one.pool+':'+one.count)
}
const accountLink=(env:Env)=>'Connect with a free OPAX account to keep going: '+env.COMMUNITY_ORIGIN+'/mcp'
const pausedMessage=(env:Env)=>'OPAX tools are paused for callers without an account until tomorrow (UTC): today\'s shared allowance is used up. '+accountLink(env)
const networkMessage=(env:Env)=>'This network has used today\'s allowance for callers without an account. It resets at midnight UTC. '+accountLink(env)
/** Spend one Progress query for a caller without an account; refuse it once their network or pool has spent today's. */
async function spendProgress(req:Request,env:Env):Promise<void> {
 const over=await countToday(env,'progress',place(req,env))
 if(over==='network')throw new McpLimitError(networkMessage(env),untilMidnight())
 if(over==='pool')throw new McpLimitError(pausedMessage(env),untilMidnight())
}

/** Called just before each Progress query; hedge marks the keyword retry a search starts when its main query is slow or fails. */
export type KbMeter=(path:string,hedge?:boolean)=>Promise<void>
export type ProgressMeter={spend:KbMeter,refused:()=>McpLimitError|null,report:()=>string|null}
/**
 * One request's Progress queries. Each is counted as it is made and, for a caller without an account, spent
 * against today's allowance first, so the cap bounds real queries rather than tool calls. A refusal is kept,
 * and the request is answered as the limit it hit (429 with Retry-After) even where the tool would have
 * turned the error into a result. Where MCP_PROGRESS_REPORT is "true" (staging) the counts go back in
 * x-opax-progress, and a caller may lower its own budget for the request with x-opax-progress-budget; the
 * probe portal/scripts/mcp-progress-probe.mjs relies on both. A caller can only lower it, never raise it.
 */
export function progressMeter(req:Request,env:Env,anonymous:boolean):ProgressMeter {
 const reporting=String(env.MCP_PROGRESS_REPORT)==='true',asked=req.headers.get('x-opax-progress-budget')
 const budget=reporting&&asked!==null&&/^\d{1,4}$/.test(asked)?Number(asked):null
 const used={find:0,hedge:0,other:0}
 let taken=0,refused:McpLimitError|null=null
 return {
  async spend(path,hedge=false){
   if(refused)throw refused
   // Checked and taken before any wait, so queries a tool makes in parallel cannot pass the budget together.
   if(budget!==null&&taken>=budget){refused=new McpLimitError('This request has used the Progress budget its caller set.',1);throw refused}
   taken++
   try{if(anonymous)await spendProgress(req,env)}
   catch(error){taken--;if(error instanceof McpLimitError)refused=error;throw error}
   used[path==='/find'?hedge?'hedge':'find':'other']++
  },
  refused:()=>refused,
  report:()=>reporting?`find=${used.find}, hedge=${used.hedge}, other=${used.other}`:null,
 }
}

/** Sustained means three complete hours in a row over the alert line, at any point in the last day. */
export async function anonymousVolume(env:Env):Promise<{anonymous:boolean,volume:'normal'|'high',hours_over:number,paused_today:string[]}> {
 const bucket=Math.floor(now()/HOUR),line=setting(env,'MCP_ANON_ALERT_HOURLY',20000)
 const hours=Array.from({length:24},(_,i)=>bucket-1-i)
 const rows=await env.COMMUNITY_DB.prepare(`SELECT key,hits FROM community_limits WHERE key IN (${hours.map(()=>'?').join(',')})`).bind(...hours.map(hourKey)).all<{key:string,hits:number}>()
 const over=new Set(rows.results.filter(row=>row.hits>=line).map(row=>row.key))
 let run=0,longest=0
 for(const hour of hours){run=over.has(hourKey(hour))?run+1:0;longest=Math.max(longest,run)}
 const paused=anonymousEnabled(env)?await anonymousPaused(env):[]
 // On while either pool is open.
 const closed=new Set(paused.map(entry=>entry.split(':')[0]))
 return {anonymous:anonymousEnabled(env)&&closed.size<2,volume:longest>=3?'high':'normal',hours_over:over.size,paused_today:paused}
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

/** An IPv6 address as its eight groups, without leading zeros. */
function groups(ip:string):string[] {
 const [head,tail='']=ip.toLowerCase().split('::'),left=head?head.split(':'):[],right=tail?tail.split(':'):[]
 const all=ip.includes('::')?[...left,...Array(Math.max(0,8-left.length-right.length)).fill('0'),...right]:left
 return all.map(group=>group.replace(/^0+(?=.)/,''))
}
/** The unit a per-minute limit counts: an IPv4 address, or an IPv6 /64 (one subscriber holds a whole /64, so the full address would be no limit at all). */
export function networkKey(ip:string):string {
 return ip.includes(':')?groups(ip).slice(0,4).join(':')+'::/64':ip
}
/** The unit a daily allowance counts: an IPv4 address, or an IPv6 /48, the most a single site is usually given. */
export function wideNetwork(ip:string):string {
 return ip.includes(':')?groups(ip).slice(0,3).join(':')+'::/48':ip
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
 const at=place(req,env),{shared,network}=at
 // The daily guard first, by a read alone: a paused pool or a spent network costs no write.
 const spent=await spentToday(env,at)
 if(spent==='pool')throw new CommunityError(401,pausedMessage(env))
 if(spent==='network')throw new McpLimitError(networkMessage(env),untilMidnight())
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
 const over=await countToday(env,'requests',at)
 if(over==='network')throw new McpLimitError(networkMessage(env),untilMidnight())
 if(over==='pool')throw new CommunityError(401,pausedMessage(env))
}
/**
 * The key a per-address limit elsewhere in the Worker counts an MCP request under (SEARCH_LIMITER, which
 * search_records passes through in src/index.ts). An ordinary address is its own key, as on the website. On an
 * address many people's assistants share, one person is the unit instead, chosen as the limits above choose
 * it: their account (a member key or connected client), else their session. A caller there with neither is
 * counted by the address, as before.
 */
export function limitKey(req:Request,env:Env,caller:McpCaller):string {
 const ip=req.headers.get('cf-connecting-ip')||'local'
 if(!sharedAddress(env,ip))return ip
 const session=sessionOf(req)
 const who=caller.kind==='oauth'?'grant:'+caller.member.grant_id:caller.kind==='key'?'key:'+caller.member.key_id:session?'session:'+session:null
 return who?'shared:'+who:ip
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
