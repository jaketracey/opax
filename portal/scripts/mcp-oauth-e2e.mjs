#!/usr/bin/env node
// End-to-end check of /mcp access against a running Worker (local or staging), with the official MCP client.
//
//   BASE=https://staging.opax.com.au SESSION=<member session cookie value> node scripts/mcp-oauth-e2e.mjs
//
// It never sends email. SESSION is the value of a member's __Host-opax_session cookie, made for a test
// member directly in that environment's community database; this script plays the part of that member's
// browser on the consent page. Without SESSION only the no-account checks run. Nothing secret is printed.
// LIMIT=1 also sends requests until the no-account limit answers 429 (about 60 requests).
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js'

const BASE=(process.env.BASE||'http://127.0.0.1:8963').replace(/\/$/,''),SESSION=process.env.SESSION||''
const REDIRECT='http://localhost:38475/callback'
let failed=0
const check=(name,ok,detail='')=>{console.log((ok?'PASS ':'FAIL ')+name+(detail?'  '+detail:''));if(!ok)failed++}
const mask=value=>typeof value==='string'?value.slice(0,8)+'…('+value.length+')':String(value)
const rpc=(path,body,headers={})=>fetch(BASE+path,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','user-agent':'opax-mcp-e2e/1',...headers},body:JSON.stringify(body)})
const toolCall={jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'corpus_coverage',arguments:{}}}

// --- no account ---------------------------------------------------------------
{
 const status=await (await fetch(BASE+'/api/mcp/status')).json().catch(()=>({}))
 console.log('status',JSON.stringify(status))
 const client=new Client({name:'opax-mcp-e2e',version:'1.0.0'})
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(BASE+'/mcp')))
  const tools=await client.listTools()
  check('no account: official client connects and lists tools',tools.tools.length>=6,tools.tools.length+' tools')
  const result=await client.callTool({name:'corpus_coverage',arguments:{}})
  check('no account: a tool call answers',!result.isError&&result.content?.length>0)
 }catch(error){check('no account: official client connects',!status.anonymous&&error instanceof UnauthorizedError,status.anonymous?String(error):'tier is off, 401 as expected')}
 finally{await client.close().catch(()=>{})}
 const init=await rpc('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'e2e',version:'1'}}},{origin:'https://inspector.example'})
 if(status.anonymous){
  check('no account: any Origin is answered with credential-free CORS',init.status===200&&init.headers.get('access-control-allow-origin')==='*'&&!init.headers.get('access-control-allow-credentials'))
  check('no account: a session id is issued at initialize',/^[0-9a-f-]{36}$/.test(init.headers.get('mcp-session-id')||''))
 }
 const member=await rpc('/mcp/member',toolCall)
 const pointer=member.headers.get('www-authenticate')||''
 check('/mcp/member without a token is 401 with the resource metadata pointer',member.status===401&&pointer.includes('resource_metadata="'+BASE+'/.well-known/oauth-protected-resource/mcp/member"'),pointer)
 const bad=await rpc('/mcp',toolCall,{authorization:'Bearer opax_at_'+'a'.repeat(43)})
 check('a wrong token is 401, not served as no-account',bad.status===401&&(bad.headers.get('www-authenticate')||'').includes('invalid_token'))
 const page=await fetch(BASE+'/mcp',{headers:{accept:'text/html'}}),stream=await fetch(BASE+'/mcp',{headers:{accept:'text/event-stream'}})
 check('an MCP client asking /mcp for an event stream is told POST only',stream.status===405)
 check('a browser opening /mcp gets the setup page',page.status===200&&(await page.text()).includes('Use OPAX in your AI tool'))
 if(process.env.LIMIT==='1'&&status.anonymous){
  let limited=null,sent=0
  // One client (one session id): the 61st tool call inside a minute is refused.
  for(;sent<70&&!limited;sent++){const response=await rpc('/mcp',toolCall,{'mcp-session-id':'e2e-limit-'+process.pid});if(response.status===429)limited=response;else await response.arrayBuffer()}
  const body=limited?await limited.json():null
  check('no account: the client limit answers 429 with retry-after and a clear message',!!limited&&limited.headers.get('retry-after')==='60'&&body?.jsonrpc==='2.0'&&/a minute for one client/.test(body?.error?.message||''),limited?`after ${sent-1} accepted: HTTP 429 retry-after=${limited.headers.get('retry-after')} ${JSON.stringify(body)}`:'no 429 in '+sent)
  const other=await rpc('/mcp',toolCall,{'mcp-session-id':'e2e-other-'+process.pid})
  check('no account: another session at the same address is still served',other.status===200)
 }
}

// --- sign in to connect ---------------------------------------------------------
if(SESSION){
 const cookie='__Host-opax_session='+SESSION
 const store={client:undefined,tokens:undefined,verifier:undefined,authorize:undefined}
 const provider={
  get redirectUrl(){return REDIRECT},
  get clientMetadata(){return {client_name:'OPAX e2e (official MCP client)',redirect_uris:[REDIRECT],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'}},
  clientInformation:()=>store.client,saveClientInformation:info=>{store.client=info},
  tokens:()=>store.tokens,saveTokens:tokens=>{store.tokens=tokens},
  redirectToAuthorization:url=>{store.authorize=url},
  saveCodeVerifier:verifier=>{store.verifier=verifier},codeVerifier:()=>store.verifier,
 }
 /** The member's browser: open the consent page signed in, press Allow, and read the code off the redirect. */
 async function consent(url,decision='allow'){
  const page=await fetch(url,{headers:{cookie},redirect:'manual'})
  const html=await page.text()
  check('consent page: script-free, names the client, form-action allows only OPAX and the return address',page.status===200&&!html.includes('<script')&&html.includes('OPAX e2e')&&/form-action 'self' http:\/\/localhost:\*;/.test(page.headers.get('content-security-policy')||''),page.headers.get('content-security-policy')||'')
  const fields=Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&')]))
  const forged=await fetch(BASE+'/oauth/authorize',{method:'POST',redirect:'manual',headers:{cookie,origin:'https://evil.example','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,decision})})
  check('consent: a cross-site form post is refused',forged.status===403)
  const noProof=await fetch(BASE+'/oauth/authorize',{method:'POST',redirect:'manual',headers:{cookie,origin:BASE,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,proof:'0'.repeat(64),decision})})
  check('consent: a post without the page proof is refused',noProof.status===403)
  const response=await fetch(BASE+'/oauth/authorize',{method:'POST',redirect:'manual',headers:{cookie,origin:BASE,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,decision})})
  const to=new URL(response.headers.get('location')||'http://invalid/')
  check('consent: Allow returns to the registered address with code, state and iss',response.status===303&&to.origin+to.pathname===REDIRECT&&!!to.searchParams.get('code')&&to.searchParams.get('iss')===BASE)
  return to.searchParams.get('code')
 }
 const client=new Client({name:'opax-mcp-e2e',version:'1.0.0'})
 let transport=new StreamableHTTPClientTransport(new URL(BASE+'/mcp/member'),{authProvider:provider})
 let challenged=false
 try{await client.connect(transport)}catch(error){challenged=error instanceof UnauthorizedError;if(!challenged)console.log(String(error))}
 check('official client: 401, discovery, dynamic registration and a PKCE authorisation request',challenged&&!!store.client?.client_id&&store.authorize?.searchParams.get('code_challenge_method')==='S256'&&store.authorize?.searchParams.get('resource')===BASE+'/mcp/member',store.authorize?[...store.authorize.searchParams.keys()].join(','):'')
 if(challenged&&store.authorize){
  const signedOut=await fetch(store.authorize,{redirect:'manual'})
  check('consent page: signed out shows sign-in, not a form',signedOut.status===200&&!(await signedOut.text()).includes('<form'))
  const wrong=new URL(store.authorize);wrong.searchParams.set('redirect_uri','https://evil.example/cb')
  const refused=await fetch(wrong,{headers:{cookie},redirect:'manual'})
  check('a wrong redirect address is refused on the page, with no redirect',refused.status===400&&!refused.headers.get('location'))
  const code=await consent(store.authorize)
  await transport.finishAuth(code)
  check('official client: code exchanged for tokens',/^opax_at_/.test(store.tokens?.access_token||'')&&/^opax_rt_/.test(store.tokens?.refresh_token||''),'access '+mask(store.tokens?.access_token)+' expires_in '+store.tokens?.expires_in)
  transport=new StreamableHTTPClientTransport(new URL(BASE+'/mcp/member'),{authProvider:provider})
  await client.connect(transport)
  const tools=await client.listTools(),result=await client.callTool({name:'corpus_coverage',arguments:{}})
  check('official client: signed-in tool calls work at /mcp/member',tools.tools.length>=6&&!result.isError,tools.tools.length+' tools')
  await client.close().catch(()=>{})
  const form=fields=>fetch(BASE+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)})
  const replay=await form({grant_type:'authorization_code',client_id:store.client.client_id,code,code_verifier:store.verifier,redirect_uri:REDIRECT})
  check('a replayed code is refused',replay.status===400&&(await replay.json()).error==='invalid_grant')
  const dead=await rpc('/mcp',toolCall,{authorization:'Bearer '+store.tokens.access_token})
  check('the replay removed the tokens from the first use',dead.status===401)
  // A fresh connection for rotation and removal.
  const fresh=async()=>{
   const verifier='e2e-verifier-'+'x'.repeat(40),challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url')
   const url=new URL(BASE+'/oauth/authorize');for(const [k,v] of Object.entries({response_type:'code',client_id:store.client.client_id,redirect_uri:REDIRECT,code_challenge:challenge,code_challenge_method:'S256',state:'e2e',resource:BASE+'/mcp'}))url.searchParams.set(k,v)
   const page=await fetch(url,{headers:{cookie}}),html=await page.text()
   const fields=Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&')]))
   const response=await fetch(BASE+'/oauth/authorize',{method:'POST',redirect:'manual',headers:{cookie,origin:BASE,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,decision:'allow'})})
   return {code:new URL(response.headers.get('location')).searchParams.get('code'),verifier}
  }
  const bad=await fresh()
  const pkce=await form({grant_type:'authorization_code',client_id:store.client.client_id,code:bad.code,code_verifier:'wrong-verifier-'+'y'.repeat(40),redirect_uri:REDIRECT})
  check('a wrong PKCE verifier is refused',pkce.status===400&&(await pkce.json()).error==='invalid_grant')
  const good=await fresh()
  const first=await (await form({grant_type:'authorization_code',client_id:store.client.client_id,code:good.code,code_verifier:good.verifier,redirect_uri:REDIRECT,resource:BASE+'/mcp'})).json()
  const second=await (await form({grant_type:'refresh_token',client_id:store.client.client_id,refresh_token:first.refresh_token})).json()
  check('refresh rotates both tokens',!!second.access_token&&second.refresh_token!==first.refresh_token&&second.access_token!==first.access_token)
  check('the rotated access token works; the earlier one does not',(await rpc('/mcp',toolCall,{authorization:'Bearer '+second.access_token})).status===200&&(await rpc('/mcp',toolCall,{authorization:'Bearer '+first.access_token})).status===401)
  const listed=await (await fetch(BASE+'/api/community/connections',{headers:{cookie}})).json()
  check('the member sees the connected client in their account',listed.connections?.some(c=>c.name.startsWith('OPAX e2e')),(listed.connections?.length??0)+' connection(s)')
  await new Promise(resolve=>setTimeout(resolve,12000)) // past the few seconds in which a repeat is treated as a retry
  const reuse=await form({grant_type:'refresh_token',client_id:store.client.client_id,refresh_token:first.refresh_token})
  check('reusing a rotated refresh token is refused and removes the connection',reuse.status===400&&(await rpc('/mcp',toolCall,{authorization:'Bearer '+second.access_token})).status===401)
  const last=await fresh()
  const tokens=await (await form({grant_type:'authorization_code',client_id:store.client.client_id,code:last.code,code_verifier:last.verifier,redirect_uri:REDIRECT})).json()
  const revoked=await fetch(BASE+'/oauth/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh_token})})
  check('revocation removes the connection',revoked.status===200&&(await rpc('/mcp',toolCall,{authorization:'Bearer '+tokens.access_token})).status===401)
  const after=await (await fetch(BASE+'/api/community/connections',{headers:{cookie}})).json()
  check('no connection is left behind',after.connections?.length===0)
 }
}else console.log('SKIP sign in to connect (no SESSION)')
console.log(failed?`${failed} check(s) failed`:'all checks passed')
process.exit(failed?1:0)
