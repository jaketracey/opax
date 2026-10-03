import {body,CommunityError,digest,json,limit,member,now,randomToken,sameOrigin,text} from './community-core'
import {signInEmail} from './community-email'
import {macHex,matchesSignInCode,randomSignInCode,requireSignInCodeSecret,signInCodeMac} from './community-signin-code'
const COOKIE='__Host-opax_session'
const CODE_FAILURE='This code could not be used. Request a new sign-in email or use its link to sign in through your browser.'
export async function authRoute(req:Request,env:Env,path:string):Promise<Response|null>{
 if(path==='/api/community/auth/request'&&req.method==='POST'){
  sameOrigin(req,env);const data=await body(req);const email=text(data.email,3,254,'Email').toLowerCase()
  if(data.client!==undefined&&data.client!=='ios')throw new CommunityError(400,'Use client "ios" for code sign-in.')
  const client=data.client==='ios'?'ios':'web'
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new CommunityError(400,'Enter a valid email address.')
  if(client==='ios')await requireNativeSignIn(env)
  await limit(env,'login-ip:'+(req.headers.get('cf-connecting-ip')||'local'),15,3600)
  // Both new and existing accounts take the same path and receive the same response.
  await limit(env,'login-email:'+email,5,3600)
  const token=randomToken(),hash=await digest(token),t=now()
  const challengeId=client==='ios'?randomToken():null,code=client==='ios'?randomSignInCode():undefined
  const codeMac=challengeId&&code?macHex(await signInCodeMac(env,challengeId,code)):null
  if(client==='ios')await env.COMMUNITY_DB.prepare('INSERT INTO login_links(token_hash,email,expires_at,created_at,client,challenge_id,code_mac) VALUES (?,?,?,?,?,?,?)').bind(hash,email,t+900,t,client,challengeId,codeMac).run()
  else await env.COMMUNITY_DB.prepare('INSERT INTO login_links(token_hash,email,expires_at,used_at,created_at) VALUES (?,?,?,NULL,?)').bind(hash,email,t+900,t).run()
  const link=env.COMMUNITY_ORIGIN+'/community?view=signin#token='+token
  try{const delivery=await env.COMMUNITY_EMAIL.send({from:{email:env.COMMUNITY_EMAIL_FROM,name:'Opax'},to:email,...signInEmail(link,code)});console.log(JSON.stringify({event:'community_email_accepted',message_id:delivery?.messageId}))}catch{await env.COMMUNITY_DB.prepare('DELETE FROM login_links WHERE token_hash=?').bind(hash).run();throw new CommunityError(503,'We could not send your sign-in email. Please try again shortly.')}
  // Only accepted delivery replaces older native proofs. Row order breaks same-second
  // ties and prevents an earlier, delayed send from invalidating a newer request.
  if(client==='ios'){
   const acceptedAt=now()
   await env.COMMUNITY_DB.prepare("UPDATE login_links SET superseded_at=?,expires_at=? WHERE email=? AND client='ios' AND used_at IS NULL AND superseded_at IS NULL AND rowid<(SELECT rowid FROM login_links WHERE token_hash=?)").bind(acceptedAt,acceptedAt,email,hash).run()
  }
  await env.COMMUNITY_DB.batch([env.COMMUNITY_DB.prepare('DELETE FROM login_links WHERE expires_at<?').bind(t-86400),env.COMMUNITY_DB.prepare('DELETE FROM member_sessions WHERE expires_at<?').bind(t),env.COMMUNITY_DB.prepare('DELETE FROM community_limits WHERE expires_at<?').bind(t-86400)])
  return json({sent:true,message:'Check your email for a sign-in link. It expires in 15 minutes.',...(challengeId?{challenge_id:challengeId}:{})})
 }
 if(path==='/api/community/auth/consume'&&req.method==='POST'){
  sameOrigin(req,env);await limit(env,'consume:'+(req.headers.get('cf-connecting-ip')||'local'),30,900)
  const data=await body(req),token=text(data.token,43,43,'Sign-in token');if(!/^[\w-]{43}$/.test(token))throw new CommunityError(400,'This link is not valid.')
  const t=now(),proofHash=await digest(token),link=await env.COMMUNITY_DB.prepare('UPDATE login_links SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING email').bind(t,proofHash,t).first<{email:string}>()
  if(!link)throw new CommunityError(400,'This link has expired or was already used. Request a new one.')
  return issueSession(env,link.email,t,'web',proofHash)
 }
 if(path==='/api/community/auth/consume-code'&&req.method==='POST'){
  sameOrigin(req,env)
  await requireNativeSignIn(env)
  try{
   // Malformed input also spends IP quota; it cannot become a cheaper guessing path.
   let data:Record<string,unknown>={}
   try{data=await body(req)}catch(e){if(!(e instanceof CommunityError))throw e}
   const challengeId=typeof data.challenge_id==='string'&&/^[\w-]{43}$/.test(data.challenge_id)?data.challenge_id:null
   const link=challengeId?await env.COMMUNITY_DB.prepare("SELECT email FROM login_links WHERE challenge_id=? AND client='ios'").bind(challengeId).first<{email:string}>():null
   await limit(env,'consume:'+(req.headers.get('cf-connecting-ip')||'local'),30,900)
   if(!link)throw new CommunityError(400,CODE_FAILURE)
   await limit(env,'consume-code-email:'+await digest(link.email),10,86400)
   const t=now(),admitted=await env.COMMUNITY_DB.prepare("UPDATE login_links SET attempts=attempts+1 WHERE challenge_id=? AND client='ios' AND used_at IS NULL AND superseded_at IS NULL AND expires_at>? AND attempts<5 RETURNING code_mac").bind(challengeId,t).first<{code_mac:string}>()
   if(!admitted||typeof data.code!=='string'||!/^\d{8}$/.test(data.code))throw new CommunityError(400,CODE_FAILURE)
   if(!await matchesSignInCode(env,challengeId!,data.code,admitted.code_mac))throw new CommunityError(400,CODE_FAILURE)
   // This write competes with link consumption and rechecks expiry and supersession.
   const redeemed=await env.COMMUNITY_DB.prepare("UPDATE login_links SET used_at=? WHERE challenge_id=? AND client='ios' AND used_at IS NULL AND superseded_at IS NULL AND expires_at>? RETURNING email,token_hash").bind(now(),challengeId,now()).first<{email:string,token_hash:string}>()
   if(!redeemed)throw new CommunityError(400,CODE_FAILURE)
   return await issueSession(env,redeemed.email,now(),'ios',redeemed.token_hash)
  }catch(e){if(e instanceof CommunityError)throw new CommunityError(400,CODE_FAILURE);throw e}
 }
 if(path==='/api/community/auth/logout'&&req.method==='POST'){
  sameOrigin(req,env);const m=await member(req,env),data=await body(req)
  if(m&&data.everywhere===true)await env.COMMUNITY_DB.prepare('DELETE FROM member_sessions WHERE member_id=?').bind(m.id).run()
  else{const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(token)await env.COMMUNITY_DB.prepare('DELETE FROM member_sessions WHERE token_hash=?').bind(await digest(token)).run()}
  return json({signed_out:true},200,{'set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`})
 }
 return null
}

async function issueSession(env:Env,email:string,t:number,client:'web'|'ios',proofHash:string):Promise<Response> {
 const session=randomToken(),hash=await digest(session)
 // The redeemed proof must still exist in the same transaction that issues the
 // session. Concurrent account deletion removes it and cannot resurrect an account.
 const results=await env.COMMUNITY_DB.batch([
  env.COMMUNITY_DB.prepare('INSERT INTO members(id,email,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM login_links WHERE token_hash=? AND email=? AND used_at IS NOT NULL) ON CONFLICT(email) DO NOTHING').bind(crypto.randomUUID(),email,t,proofHash,email),
  env.COMMUNITY_DB.prepare(client==='ios'?
   "INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at,client) SELECT ?,m.id,?,?,'ios' FROM members m WHERE m.email=? AND m.disabled=0 AND EXISTS(SELECT 1 FROM login_links WHERE token_hash=? AND email=m.email AND used_at IS NOT NULL)":
   'INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at) SELECT ?,m.id,?,? FROM members m WHERE m.email=? AND m.disabled=0 AND EXISTS(SELECT 1 FROM login_links WHERE token_hash=? AND email=m.email AND used_at IS NOT NULL)').bind(hash,t+30*86400,t,email,proofHash)
 ])
 if(!results[1].meta.changes)throw new CommunityError(403,'This account is unavailable.')
 return json({signed_in:true},200,{'set-cookie':`${COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30*86400}`})
}

async function requireNativeSignIn(env:Env):Promise<void> {
 try{
  requireSignInCodeSecret(env)
  // Validate every native column without reading rows or spending shared quota.
  await env.COMMUNITY_DB.prepare('SELECT l.client,l.challenge_id,l.code_mac,l.attempts,l.superseded_at,s.client FROM login_links l,member_sessions s LIMIT 0').first()
 }catch{throw new CommunityError(503,'This action could not be completed. Please try again shortly.')}
}
