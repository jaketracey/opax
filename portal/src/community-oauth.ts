// Sign in to connect: an OAuth 2.1 authorisation server for the MCP endpoint,
// following the MCP authorisation specification (RFC 9728 resource metadata,
// RFC 8414 server metadata, RFC 7591 registration, PKCE S256, RFC 8707 resource
// indicators, RFC 7009 revocation, RFC 9207 issuer in the response).
//
// Every client is public: there are no client secrets, so a client is trusted
// only as far as its exactly registered redirect address and the PKCE proof.
// The member is the existing email-login account; consent is given on a
// script-free page. Codes and tokens are stored as hashes only.
import {CommunityError,digest,json,limit,now,randomToken,type Member} from './community-core'
import {networkKey,sharedAddress} from './mcp-access'

const SCOPE='records:read'
const RESOURCE_PATHS=['/mcp','/mcp/member']
const CODE_SECONDS=120,ACCESS_SECONDS=3600,REFRESH_SECONDS=60*86400
const CLIENT_IDLE_SECONDS=90*86400,RETRY_GRACE_SECONDS=10
const MAX_GRANTS=20
const COOKIE='__Host-opax_session='

class OAuthError extends Error { constructor(public code:string,public description:string,public status=400){super(description)} }
type Client={id:string,name:string,redirect_uris:string}
type Params={client_id:string,redirect_uri:string,code_challenge:string,state:string,resource:string}

const address=(req:Request)=>req.headers.get('cf-connecting-ip')||'local'
/** The unit address limits count: an IPv4 address or an IPv6 /64. */
const ip=(req:Request)=>networkKey(address(req))
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))
const resources=(env:Env)=>RESOURCE_PATHS.map(path=>env.COMMUNITY_ORIGIN+path)
const oauthJson=(body:unknown,status=200,headers:HeadersInit={})=>json(body,status,{pragma:'no-cache','access-control-allow-origin':'*',...headers})
const fail=(e:OAuthError)=>oauthJson({error:e.code,error_description:e.description},e.status)

// --- metadata ---------------------------------------------------------------

export function protectedResourceMetadata(env:Env,path:string):Response {
 const origin=env.COMMUNITY_ORIGIN
 return Response.json({
  resource:origin+(RESOURCE_PATHS.includes(path)?path:'/mcp'),
  authorization_servers:[origin],
  scopes_supported:[SCOPE],
  bearer_methods_supported:['header'],
  resource_name:'OPAX public record',
  resource_documentation:origin+'/mcp',
 },{headers:{'cache-control':'public, max-age=300','access-control-allow-origin':'*'}})
}
export function authorizationServerMetadata(env:Env):Response {
 const origin=env.COMMUNITY_ORIGIN
 return Response.json({
  issuer:origin,
  authorization_endpoint:origin+'/oauth/authorize',
  token_endpoint:origin+'/oauth/token',
  registration_endpoint:origin+'/oauth/register',
  revocation_endpoint:origin+'/oauth/revoke',
  response_types_supported:['code'],
  response_modes_supported:['query'],
  grant_types_supported:['authorization_code','refresh_token'],
  code_challenge_methods_supported:['S256'],
  token_endpoint_auth_methods_supported:['none'],
  revocation_endpoint_auth_methods_supported:['none'],
  scopes_supported:[SCOPE],
  authorization_response_iss_parameter_supported:true,
  service_documentation:origin+'/mcp',
 },{headers:{'cache-control':'public, max-age=300','access-control-allow-origin':'*'}})
}

// --- redirect addresses -----------------------------------------------------

// App schemes: the MCP clients known to use one, or a reverse-domain scheme an app owns (RFC 8252 section 7.1).
// Anything else could launch an unrelated program on the member's device.
const APP_SCHEMES=new Set(['cursor:','vscode:','vscode-insiders:','windsurf:','zed:','claude:','raycast:','jetbrains:'])
const LOOPBACK=new Set(['localhost','127.0.0.1'])
function parse(value:string):URL|null {try{return new URL(value)}catch{return null}}
const loopback=(url:URL)=>url.protocol==='http:'&&LOOPBACK.has(url.hostname)&&!url.username&&!url.password
/** A redirect address a client may register: https, a loopback http address, or an app's own scheme. */
export function registrableRedirect(value:unknown,origin:string):value is string {
 if(typeof value!=='string'||value.length>512||value.includes('#')||/[\s\\\u0000-\u001f]/.test(value))return false
 const url=parse(value);if(!url||url.username||url.password)return false
 if(url.protocol==='https:')return url.origin!==origin
 if(url.protocol==='http:')return loopback(url)
 return (APP_SCHEMES.has(url.protocol)||/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+:$/.test(url.protocol))&&url.protocol.length<=60&&value.startsWith(url.protocol+'//')
}
/** Exact match only. A loopback address may differ in its port alone (RFC 8252 section 7.3). */
export function redirectMatches(registered:string[],presented:string):boolean {
 if(registered.includes(presented))return true
 const url=parse(presented);if(!url||!loopback(url)||presented.includes('#'))return false
 return registered.some(item=>{const other=parse(item);return !!other&&loopback(other)&&other.hostname===url.hostname&&other.pathname===url.pathname&&other.search===url.search})
}
/** What the consent page names: the place the sign-in result is sent. */
function redirectLabel(value:string):string {
 const url=parse(value)!
 if(url.protocol==='https:')return url.host
 if(loopback(url))return 'this computer ('+url.hostname+')'
 return 'the app that handles '+url.protocol+'// links'
}
function redirectWith(redirect:string,values:Record<string,string>):string {
 const url=new URL(redirect);for(const [name,value] of Object.entries(values))if(value)url.searchParams.set(name,value)
 return url.href
}

// --- registration (RFC 7591) ------------------------------------------------

async function register(req:Request,env:Env):Promise<Response> {
 // Assistants register from their makers' servers, which many people share; an ordinary address needs only a few.
 // Each crowd has its own daily ceiling, so neither can use up the other's.
 const shared=sharedAddress(env,address(req))
 await guarded(()=>limit(env,'oauth-register-ip:'+ip(req),shared?300:10,3600))
 await guarded(()=>limit(env,shared?'oauth-register-all-shared':'oauth-register-all',2000,86400))
 const data=await readBody(req,'json')
 const uris=data.redirect_uris
 if(!Array.isArray(uris)||uris.length<1||uris.length>8||!uris.every(uri=>registrableRedirect(uri,env.COMMUNITY_ORIGIN)))throw new OAuthError('invalid_redirect_uri','Give one to eight redirect addresses: https, a loopback http address, or an app scheme, with no fragment.')
 const method=data.token_endpoint_auth_method
 if(method!==undefined&&method!=='none')throw new OAuthError('invalid_client_metadata','Only public clients are supported: use token_endpoint_auth_method "none".')
 for(const [field,allowed] of [['grant_types',['authorization_code','refresh_token']],['response_types',['code']]] as const){
  const value=data[field]
  if(value!==undefined&&(!Array.isArray(value)||!value.every(item=>(allowed as readonly string[]).includes(item as string))))throw new OAuthError('invalid_client_metadata',field+' may only contain '+allowed.join(' and ')+'.')
 }
 const rawName=typeof data.client_name==='string'?data.client_name:''
 // The name is the client's own claim; keep it short and plain so it cannot dress up the consent page.
 const name=rawName.replace(/[^\p{L}\p{N} .,'()&+_-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,60)||'Unnamed client'
 const id=randomToken(),t=now()
 await env.COMMUNITY_DB.batch([
  env.COMMUNITY_DB.prepare('INSERT INTO oauth_clients(id,name,redirect_uris,created_at) VALUES (?,?,?,?)').bind(id,name,JSON.stringify(uris),t),
  // Registrations nobody is connected through lapse after 90 idle days.
  env.COMMUNITY_DB.prepare('DELETE FROM oauth_clients WHERE coalesce(last_used_at,created_at)<? AND NOT EXISTS(SELECT 1 FROM oauth_grants g WHERE g.client_id=oauth_clients.id)').bind(t-CLIENT_IDLE_SECONDS),
 ])
 return oauthJson({client_id:id,client_id_issued_at:t,client_name:name,redirect_uris:uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:SCOPE},201)
}

// --- authorisation and consent ----------------------------------------------

// The site's own tokens (public/tokens.css): colours, type roles and spacing. No other stylesheet and no script.
const PAGE_STYLE='body{margin:0;font:var(--type-body);color:var(--ink);background:var(--paper)}main{max-width:34rem;margin:8vh auto;padding:2rem;background:var(--paper-raised);border:1px solid var(--divider-subtle);border-radius:10px}h1{font:var(--type-heading);margin:0 0 1rem}p,li{margin:0 0 .75rem}ul{padding-left:1.2rem}.who,.note{color:var(--ink-soft)}.note{font:var(--type-fine)}.row{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1.5rem}button,.button{font:var(--type-strong);padding:.6rem 1.1rem;border-radius:6px;border:1px solid var(--navy);background:var(--paper-raised);color:var(--navy);cursor:pointer;text-decoration:none;display:inline-block}button.primary,.button.primary{background:var(--navy);color:var(--paper-raised)}code{word-break:break-all}'
function page(title:string,bodyHtml:string,status=200,formAction="'self'"):Response {
 return new Response(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · OPAX</title><link rel="stylesheet" href="/tokens.css"><style>${PAGE_STYLE}</style></head><body><main>${bodyHtml}</main></body></html>`,{status,headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY',
  // same-origin, not no-referrer: under no-referrer a browser sends "Origin: null" with the form, and the decision needs the real Origin.
  // The address holds no code or token, and nothing is sent to another site.
  'referrer-policy':'same-origin',
  // No scripts at all. form-action must name the client's address too: browsers apply it to the redirect that follows the form.
  'content-security-policy':`default-src 'none'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action ${formAction}; frame-ancestors 'none'`,
 }})
}
const problem=(message:string,status=400)=>page('Connection problem',`<h1>This connection could not be started</h1><p>${esc(message)}</p><p class="note">Nothing was shared. You can close this page and try again from your AI tool.</p>`,status)

function sessionToken(req:Request):string|null {
 const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE))?.slice(COOKIE.length)
 return token&&/^[\w-]{43}$/.test(token)?token:null
}
async function sessionMember(req:Request,env:Env):Promise<Member|null> {
 const token=sessionToken(req);if(!token)return null
 return env.COMMUNITY_DB.prepare('SELECT m.* FROM members m JOIN member_sessions s ON s.member_id=m.id WHERE s.token_hash=? AND s.expires_at>? AND m.disabled=0').bind(await digest(token),now()).first<Member>()
}
/** Bound to the signed-in session and to this exact request, so a consent cannot be forged or moved to another client. */
const consentProof=(session:string,p:Params)=>digest('opax-oauth-consent-v1\n'+session+'\n'+JSON.stringify([p.client_id,p.redirect_uri,p.code_challenge,p.state,p.resource]))

/** Every fault in a request is shown on this page and never sent on: OPAX redirects only after a signed-in
 * member presses Allow or Cancel, so the address cannot be used to bounce a reader to someone else's site. */
async function authorizeRequest(env:Env,get:(name:string)=>string|null):Promise<{client:Client,params:Params}|Response> {
 const clientId=get('client_id')||''
 const client=/^[\w-]{43}$/.test(clientId)?await env.COMMUNITY_DB.prepare('SELECT id,name,redirect_uris FROM oauth_clients WHERE id=?').bind(clientId).first<Client>():null
 if(!client)return problem('OPAX does not recognise this app. Remove OPAX from your AI tool and add it again.')
 let registered:string[];try{registered=JSON.parse(client.redirect_uris)}catch{registered=[]}
 const redirect=get('redirect_uri')??(registered.length===1?registered[0]:'')
 if(!redirect||redirect.length>512||!redirectMatches(registered,redirect))return problem('The return address in this request does not match the one this app registered with OPAX.')
 const state=get('state')||''
 const back=(error:string,description:string)=>problem(`This app sent a request OPAX cannot accept (${error}). ${description}`)
 if(state.length>1024)return back('invalid_request','state is too long.')
 if(get('response_type')!=='code')return back('unsupported_response_type','Only the authorisation code flow is supported.')
 const challenge=get('code_challenge')||''
 if(!/^[A-Za-z0-9_-]{43}$/.test(challenge)||get('code_challenge_method')!=='S256')return back('invalid_request','PKCE with the S256 method is required.')
 const resource=(get('resource')||env.COMMUNITY_ORIGIN+'/mcp').replace(/\/$/,'')
 if(!resources(env).includes(resource))return back('invalid_target','This sign-in only covers '+env.COMMUNITY_ORIGIN+'/mcp')
 return {client,params:{client_id:client.id,redirect_uri:redirect,code_challenge:challenge,state,resource}}
}
/** The redirect target as a CSP source, for the form's follow-on redirect. */
function formActionFor(redirect:string):string {
 const url=new URL(redirect)
 if(url.protocol==='https:')return `'self' ${url.origin}`
 if(loopback(url))return `'self' http://${url.hostname}:*`
 return `'self' ${url.protocol}`
}

async function authorizePage(req:Request,env:Env):Promise<Response> {
 await guarded(()=>limit(env,'oauth-authorize-ip:'+ip(req),120,600))
 const url=new URL(req.url)
 const checked=await authorizeRequest(env,name=>url.searchParams.get(name))
 if(checked instanceof Response)return checked
 const {client,params}=checked,member=await sessionMember(req,env),session=sessionToken(req)
 const name=esc(client.name),where=esc(redirectLabel(params.redirect_uri)),local=new URL(params.redirect_uri).protocol!=='https:'
 if(!member||!session){
  // The community page remembers this address and returns here once the emailed link has been used.
  const signIn='/community?view=signin&next='+encodeURIComponent(url.pathname+url.search)
  return page('Sign in to connect',`<h1>Sign in to OPAX to connect ${name}</h1><p>An app that calls itself <strong>${name}</strong> wants to read the public record through your OPAX account. It will send you back to <strong>${where}</strong>.</p><p>Connecting needs a free OPAX account. Sign in with your email first, then you will be asked whether to allow it.</p><div class="row"><a class="button primary" href="${esc(signIn)}">Sign in to OPAX</a><a class="button" href="${esc(url.pathname+url.search)}">I have signed in, continue</a></div><p class="note">If you did not start this from your AI tool, close this page.</p>`)
 }
 const hidden=Object.entries({...params,proof:await consentProof(session,params)}).map(([key,value])=>`<input type="hidden" name="${key}" value="${esc(value)}">`).join('')
 return page('Allow connection',`<h1>Allow ${name} to read the public record as you?</h1><p class="who">Signed in as ${esc(member.email)}</p><p>An app that calls itself <strong>${name}</strong> is asking to connect. OPAX cannot confirm who made it. After you choose, you will be sent to <strong>${where}</strong>.</p>${local?'<p>That is a program on your own device, not a website. Any program on this device could have opened this page, so only allow it if you started the connection yourself a moment ago.</p>':''}<ul><li>It can search and read public records with the OPAX tools, under your account's limits.</li><li>It cannot see your email address, reading lists, messages or anything else in your account, and it cannot post or change anything.</li><li>You can remove it at any time under Connect AI tools in your OPAX account.</li></ul><form method="post" action="/oauth/authorize">${hidden}<div class="row"><button class="primary" name="decision" value="allow">Allow</button><button name="decision" value="deny">Cancel</button></div></form><p class="note">Only allow this if you just asked your AI tool to connect to OPAX.</p>`,200,formActionFor(params.redirect_uri))
}

async function authorizeDecision(req:Request,env:Env):Promise<Response> {
 // Three independent checks: same-origin form post, the session cookie, and a proof bound to both the session and the request.
 if(req.headers.get('origin')!==env.COMMUNITY_ORIGIN)return problem('Open this page from OPAX to continue.',403)
 const form=await readBody(req,'form')
 // The page only renders for a code request with S256, so the form carries the fields that vary and the proof covers them.
 const fixed:Record<string,string>={response_type:'code',code_challenge_method:'S256'}
 const checked=await authorizeRequest(env,name=>fixed[name]??(typeof form[name]==='string'?form[name] as string:null))
 if(checked instanceof Response)return checked
 const {client,params}=checked,member=await sessionMember(req,env),session=sessionToken(req)
 if(!member||!session)return problem('Your OPAX sign-in has ended. Go back to your AI tool and connect again.',401)
 const proof=typeof form.proof==='string'?form.proof:''
 const expected=await consentProof(session,params)
 // Fixed-length digests compared without an early exit.
 let difference=proof.length^expected.length;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^(proof.charCodeAt(i)||0)
 if(difference!==0)return problem('This page has expired. Go back to your AI tool and connect again.',403)
 const leave=(values:Record<string,string>)=>new Response(null,{status:303,headers:{location:redirectWith(params.redirect_uri,{...values,state:params.state,iss:env.COMMUNITY_ORIGIN}),'cache-control':'no-store','referrer-policy':'no-referrer'}})
 if(form.decision!=='allow')return leave({error:'access_denied',error_description:'The member did not allow this connection.'})
 await guarded(()=>limit(env,'oauth-consent:'+member.id,30,3600))
 const code=randomToken(),grant=crypto.randomUUID(),t=now()
 const lapsed='SELECT id FROM oauth_grants WHERE member_id=? AND id NOT IN (SELECT id FROM oauth_grants WHERE member_id=? ORDER BY created_at DESC,id LIMIT ?)'
 await env.COMMUNITY_DB.batch([
  // A member keeps at most twenty connections; the oldest lapse first.
  ...['oauth_tokens','oauth_codes'].map(table=>env.COMMUNITY_DB.prepare(`DELETE FROM ${table} WHERE grant_id IN (${lapsed})`).bind(member.id,member.id,MAX_GRANTS-1)),
  env.COMMUNITY_DB.prepare(`DELETE FROM oauth_grants WHERE id IN (${lapsed})`).bind(member.id,member.id,MAX_GRANTS-1),
  env.COMMUNITY_DB.prepare('INSERT INTO oauth_grants(id,member_id,client_id,client_name,redirect_host,resource,scope,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(grant,member.id,client.id,client.name,redirectLabel(params.redirect_uri),params.resource,SCOPE,t),
  env.COMMUNITY_DB.prepare('INSERT INTO oauth_codes(code_hash,grant_id,client_id,redirect_uri,code_challenge,expires_at) VALUES (?,?,?,?,?,?)').bind(await digest(code),grant,client.id,params.redirect_uri,params.code_challenge,t+CODE_SECONDS),
  env.COMMUNITY_DB.prepare('UPDATE oauth_clients SET last_used_at=? WHERE id=?').bind(t,client.id),
  env.COMMUNITY_DB.prepare('DELETE FROM oauth_codes WHERE expires_at<?').bind(t-86400),
  env.COMMUNITY_DB.prepare('DELETE FROM oauth_tokens WHERE expires_at<?').bind(t-86400),
 ])
 return leave({code})
}

// --- tokens -----------------------------------------------------------------

const removeGrant=(env:Env,grant:string)=>env.COMMUNITY_DB.batch([
 env.COMMUNITY_DB.prepare('DELETE FROM oauth_tokens WHERE grant_id=?').bind(grant),
 env.COMMUNITY_DB.prepare('DELETE FROM oauth_codes WHERE grant_id=?').bind(grant),
 env.COMMUNITY_DB.prepare('DELETE FROM oauth_grants WHERE id=?').bind(grant),
])
const challengeOf=async(verifier:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')

/** Issue a fresh pair for a live connection. Earlier access tokens stop working at once. */
async function issue(env:Env,grant:string,t:number):Promise<Response> {
 const access='opax_at_'+randomToken(),refresh='opax_rt_'+randomToken()
 const results=await env.COMMUNITY_DB.batch([
  env.COMMUNITY_DB.prepare("DELETE FROM oauth_tokens WHERE grant_id=? AND kind='access'").bind(grant),
  // The connection must still exist and its member must still be in good standing when the tokens are written.
  env.COMMUNITY_DB.prepare("INSERT INTO oauth_tokens(token_hash,grant_id,kind,created_at,expires_at) SELECT ?,g.id,'access',?,? FROM oauth_grants g JOIN members m ON m.id=g.member_id WHERE g.id=? AND m.disabled=0").bind(await digest(access),t,t+ACCESS_SECONDS,grant),
  env.COMMUNITY_DB.prepare("INSERT INTO oauth_tokens(token_hash,grant_id,kind,created_at,expires_at) SELECT ?,g.id,'refresh',?,? FROM oauth_grants g JOIN members m ON m.id=g.member_id WHERE g.id=? AND m.disabled=0").bind(await digest(refresh),t,t+REFRESH_SECONDS,grant),
 ])
 if(!results[1].meta.changes||!results[2].meta.changes)throw new OAuthError('invalid_grant','This connection is no longer available. Sign in again.')
 return oauthJson({access_token:access,token_type:'Bearer',expires_in:ACCESS_SECONDS,refresh_token:refresh,scope:SCOPE})
}

async function token(req:Request,env:Env):Promise<Response> {
 // Assistants' servers share addresses between many members, so the address limit is wide. Codes and tokens are 256-bit, so guessing is not the risk.
 await guarded(()=>limit(env,'oauth-token-ip:'+ip(req),600,60))
 // No limit is keyed on client_id: it is public, so such a limit would let anyone lock a client's members out.
 const form=await readBody(req,'form'),field=(name:string)=>typeof form[name]==='string'?form[name] as string:''
 const clientId=field('client_id')
 if(!/^[\w-]{43}$/.test(clientId))throw new OAuthError('invalid_client','Send the client_id this app registered with.',401)
 const t=now(),grantType=field('grant_type')
 const resource=field('resource').replace(/\/$/,'')
 if(resource&&!resources(env).includes(resource))throw new OAuthError('invalid_target','This sign-in only covers '+env.COMMUNITY_ORIGIN+'/mcp')
 if(grantType==='authorization_code'){
  const code=field('code'),verifier=field('code_verifier')
  if(!/^[\w-]{43}$/.test(code))throw new OAuthError('invalid_grant','This code is not valid.')
  const hash=await digest(code)
  // Single use: only one request can claim the code.
  const row=await env.COMMUNITY_DB.prepare('UPDATE oauth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>? RETURNING grant_id,client_id,redirect_uri,code_challenge').bind(t,hash,t).first<{grant_id:string,client_id:string,redirect_uri:string,code_challenge:string}>()
  if(!row){
   // A second use of a code means it leaked: remove the connection and any tokens the first use produced.
   const spent=await env.COMMUNITY_DB.prepare('SELECT grant_id FROM oauth_codes WHERE code_hash=? AND used_at IS NOT NULL').bind(hash).first<{grant_id:string}>()
   if(spent)await removeGrant(env,spent.grant_id)
   throw new OAuthError('invalid_grant','This code has expired or was already used.')
  }
  // The code is now spent whatever happens next; a failed proof also removes the pending connection.
  const redirect=field('redirect_uri')
  const proven=/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)&&await challengeOf(verifier)===row.code_challenge
  if(row.client_id!==clientId||(redirect&&redirect!==row.redirect_uri)||!proven||(resource&&resource!==await grantResource(env,row.grant_id))){
   await removeGrant(env,row.grant_id)
   throw new OAuthError('invalid_grant',!proven?'The PKCE code_verifier does not match this code.':'This code was issued to a different client, return address or resource.')
  }
  return issue(env,row.grant_id,t)
 }
 if(grantType==='refresh_token'){
  const presented=field('refresh_token')
  if(!/^opax_rt_[\w-]{43}$/.test(presented))throw new OAuthError('invalid_grant','This refresh token is not valid.')
  const hash=await digest(presented)
  // Rotation: each refresh token works once.
  const row=await env.COMMUNITY_DB.prepare("UPDATE oauth_tokens SET used_at=? WHERE token_hash=? AND kind='refresh' AND used_at IS NULL AND expires_at>? RETURNING grant_id").bind(t,hash,t).first<{grant_id:string}>()
  if(!row){
   // A rotated token presented again is treated as stolen: the whole connection goes.
   // A repeat within a few seconds is a client retrying a request it thought was lost: refused, but the connection stays.
   const spent=await env.COMMUNITY_DB.prepare("SELECT grant_id,used_at FROM oauth_tokens WHERE token_hash=? AND kind='refresh' AND used_at IS NOT NULL").bind(hash).first<{grant_id:string,used_at:number}>()
   if(spent&&t-spent.used_at>RETRY_GRACE_SECONDS)await removeGrant(env,spent.grant_id)
   throw new OAuthError('invalid_grant','This refresh token has expired, was removed or was already used. Sign in again.')
  }
  const grant=await env.COMMUNITY_DB.prepare('SELECT client_id,resource FROM oauth_grants WHERE id=?').bind(row.grant_id).first<{client_id:string,resource:string}>()
  if(!grant||grant.client_id!==clientId||(resource&&resource!==grant.resource)){
   await removeGrant(env,row.grant_id)
   throw new OAuthError('invalid_grant','This refresh token was issued to a different client or resource.')
  }
  return issue(env,row.grant_id,t)
 }
 throw new OAuthError('unsupported_grant_type','Use authorization_code or refresh_token.')
}
const grantResource=async(env:Env,grant:string)=>(await env.COMMUNITY_DB.prepare('SELECT resource FROM oauth_grants WHERE id=?').bind(grant).first<{resource:string}>())?.resource

/** RFC 7009: removing either token removes the connection. Always 200, so the endpoint says nothing about what exists. */
async function revoke(req:Request,env:Env):Promise<Response> {
 await guarded(()=>limit(env,'oauth-revoke-ip:'+ip(req),120,60))
 const form=await readBody(req,'form'),presented=typeof form.token==='string'?form.token:''
 if(/^opax_(?:at|rt)_[\w-]{43}$/.test(presented)){
  const row=await env.COMMUNITY_DB.prepare('SELECT grant_id FROM oauth_tokens WHERE token_hash=?').bind(await digest(presented)).first<{grant_id:string}>()
  if(row)await removeGrant(env,row.grant_id)
 }
 return oauthJson({})
}

/** The member behind an access token, if it is live and was issued for this server's own addresses. */
export type OAuthMember=Member&{grant_id:string}
export async function oauthMember(env:Env,accessToken:string,audience:string[]):Promise<OAuthMember|null> {
 const t=now()
 const row=await env.COMMUNITY_DB.prepare("SELECT m.*,g.id AS grant_id,g.resource AS grant_resource,g.last_used_at AS grant_used FROM oauth_tokens k JOIN oauth_grants g ON g.id=k.grant_id JOIN members m ON m.id=g.member_id WHERE k.token_hash=? AND k.kind='access' AND k.expires_at>? AND m.disabled=0").bind(await digest(accessToken),t).first<OAuthMember&{grant_resource:string,grant_used:number|null}>()
 if(!row||!audience.includes(row.grant_resource))return null
 if(!row.grant_used||row.grant_used<t-60)await env.COMMUNITY_DB.prepare('UPDATE oauth_grants SET last_used_at=? WHERE id=?').bind(t,row.grant_id).run()
 return row
}

// --- a member's connected clients (called from the account API, already signed in and same-origin) ---

export async function memberConnections(env:Env,memberId:string) {
 const rows=await env.COMMUNITY_DB.prepare('SELECT id,client_name AS name,redirect_host AS returns_to,created_at,last_used_at FROM oauth_grants WHERE member_id=? ORDER BY created_at DESC LIMIT 30').bind(memberId).all()
 return rows.results
}
export async function removeConnection(env:Env,memberId:string,grant:string):Promise<boolean> {
 const own=await env.COMMUNITY_DB.prepare('SELECT id FROM oauth_grants WHERE id=? AND member_id=?').bind(grant,memberId).first()
 if(!own)return false
 await removeGrant(env,grant);return true
}

// --- plumbing ---------------------------------------------------------------

async function guarded(check:()=>Promise<void>):Promise<void> {
 try{await check()}catch(e){if(e instanceof CommunityError&&e.status===429)throw new OAuthError('slow_down','Too many requests. Wait a little and try again.',429);throw e}
}
async function readBody(req:Request,kind:'json'|'form'):Promise<Record<string,unknown>> {
 const type=req.headers.get('content-type')?.toLowerCase()||''
 const isJson=type.startsWith('application/json'),isForm=type.startsWith('application/x-www-form-urlencoded')
 if(kind==='json'?!isJson:!isForm&&!isJson)throw new OAuthError('invalid_request',kind==='json'?'Send JSON.':'Send a form-encoded body.')
 const reader=req.body?.getReader();if(!reader)throw new OAuthError('invalid_request','Missing request body.')
 let length=0;const chunks:Uint8Array[]=[]
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();throw new OAuthError('invalid_request','This request is too large.',413)}chunks.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const text=new TextDecoder().decode(bytes)
 if(isJson){try{const parsed=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed}catch{throw new OAuthError('invalid_request','Invalid JSON.')}}
 // A repeated field is ambiguous; OAuth forbids it.
 const out:Record<string,unknown>={},seen=new URLSearchParams(text)
 for(const name of new Set(seen.keys())){if(seen.getAll(name).length>1)throw new OAuthError('invalid_request','A field was sent more than once: '+name.slice(0,40));out[name]=seen.get(name)}
 return out
}

const preflight=()=>new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, GET, OPTIONS','access-control-allow-headers':'content-type, authorization, mcp-protocol-version','access-control-max-age':'86400','cache-control':'no-store'}})

/** Every sign-in address: metadata, registration, consent, tokens and revocation. Null when the path is not one of them. */
export async function oauthRoute(req:Request,env:Env):Promise<Response|null> {
 const path=new URL(req.url).pathname
 const metadata=path==='/.well-known/oauth-authorization-server'||path==='/.well-known/oauth-protected-resource'||RESOURCE_PATHS.some(p=>path==='/.well-known/oauth-protected-resource'+p)
 if(!metadata&&!['/oauth/register','/oauth/authorize','/oauth/token','/oauth/revoke'].includes(path))return null
 const browserPage=path==='/oauth/authorize'
 try{
  if(req.method==='OPTIONS'&&!browserPage)return preflight()
  if(metadata){
   if(req.method!=='GET'&&req.method!=='HEAD')return oauthJson({error:'invalid_request',error_description:'Use GET.'},405,{allow:'GET'})
   return path==='/.well-known/oauth-authorization-server'?authorizationServerMetadata(env):protectedResourceMetadata(env,path.slice('/.well-known/oauth-protected-resource'.length))
  }
  if(String(env.COMMUNITY_ENABLED)!=='true')return browserPage?problem('OPAX accounts are being prepared. Please try again soon.',503):oauthJson({error:'temporarily_unavailable',error_description:'OPAX accounts are being prepared.'},503)
  if(browserPage){
   if(req.method==='GET')return await authorizePage(req,env)
   if(req.method==='POST')return await authorizeDecision(req,env)
   return problem('Use your AI tool to start this connection.',405)
  }
  if(req.method!=='POST')return oauthJson({error:'invalid_request',error_description:'Use POST.'},405,{allow:'POST'})
  if(path==='/oauth/register')return await register(req,env)
  if(path==='/oauth/token')return await token(req,env)
  return await revoke(req,env)
 }catch(e){
  if(e instanceof OAuthError)return browserPage?problem(e.description,e.status):fail(e)
  console.error(JSON.stringify({event:'oauth_request_failed',path}))
  return browserPage?problem('OPAX could not complete this just now. Please try again shortly.',503):oauthJson({error:'server_error',error_description:'OPAX could not complete this just now.'},503)
 }
}
