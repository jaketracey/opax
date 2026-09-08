import {body,CommunityError,digest,json,limit,member,now,randomToken,sameOrigin,text} from './community-core'
const COOKIE='__Host-opax_session'
export async function authRoute(req:Request,env:Env,path:string):Promise<Response|null>{
 if(path==='/api/community/auth/request'&&req.method==='POST'){
  sameOrigin(req,env);const data=await body(req);const email=text(data.email,3,254,'Email').toLowerCase()
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new CommunityError(400,'Enter a valid email address.')
  await limit(env,'login-ip:'+(req.headers.get('cf-connecting-ip')||'local'),15,3600)
  // Both new and existing accounts take the same path and receive the same response.
  await limit(env,'login-email:'+email,5,3600)
  const token=randomToken(),hash=await digest(token),t=now()
  await env.COMMUNITY_DB.prepare('INSERT INTO login_links VALUES (?,?,?,NULL,?)').bind(hash,email,t+900,t).run()
  const link=env.COMMUNITY_ORIGIN+'/community?view=signin#token='+token
  try{const delivery=await env.COMMUNITY_EMAIL.send({from:{email:env.COMMUNITY_EMAIL_FROM,name:'Opax'},to:email,subject:'Your sign-in link for Opax',text:`Sign in to your Opax community account:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you did not request it, you can ignore this email.`,html:`<p>Here is your link to the Opax community.</p><p><a href="${link}">Sign in to Opax</a></p><p>This link works once and expires in 15 minutes. If you did not request it, you can ignore this email.</p>`});console.log(JSON.stringify({event:'community_email_accepted',message_id:delivery?.messageId}))}catch{await env.COMMUNITY_DB.prepare('DELETE FROM login_links WHERE token_hash=?').bind(hash).run();throw new CommunityError(503,'We could not send your sign-in email. Please try again shortly.')}
  await env.COMMUNITY_DB.batch([env.COMMUNITY_DB.prepare('DELETE FROM login_links WHERE expires_at<?').bind(t-86400),env.COMMUNITY_DB.prepare('DELETE FROM member_sessions WHERE expires_at<?').bind(t),env.COMMUNITY_DB.prepare('DELETE FROM community_limits WHERE expires_at<?').bind(t-86400)])
  return json({sent:true,message:'Check your email for a sign-in link. It expires in 15 minutes.'})
 }
 if(path==='/api/community/auth/consume'&&req.method==='POST'){
  sameOrigin(req,env);await limit(env,'consume:'+(req.headers.get('cf-connecting-ip')||'local'),30,900)
  const data=await body(req),token=text(data.token,43,43,'Sign-in token');if(!/^[\w-]{43}$/.test(token))throw new CommunityError(400,'This link is not valid.')
  const t=now(),link=await env.COMMUNITY_DB.prepare('UPDATE login_links SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING email').bind(t,await digest(token),t).first<{email:string}>()
  if(!link)throw new CommunityError(400,'This link has expired or was already used. Request a new one.')
  await env.COMMUNITY_DB.prepare('INSERT INTO members(id,email,created_at) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING').bind(crypto.randomUUID(),link.email,t).run()
  const m=await env.COMMUNITY_DB.prepare('SELECT id,disabled FROM members WHERE email=?').bind(link.email).first<{id:string,disabled:number}>();if(!m||m.disabled)throw new CommunityError(403,'This account is unavailable.')
  const session=randomToken();await env.COMMUNITY_DB.prepare('INSERT INTO member_sessions VALUES (?,?,?,?)').bind(await digest(session),m.id,t+30*86400,t).run()
  return json({signed_in:true},200,{'set-cookie':`${COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30*86400}`})
 }
 if(path==='/api/community/auth/logout'&&req.method==='POST'){
  sameOrigin(req,env);const m=await member(req,env),data=await body(req)
  if(m&&data.everywhere===true)await env.COMMUNITY_DB.prepare('DELETE FROM member_sessions WHERE member_id=?').bind(m.id).run()
  else{const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(token)await env.COMMUNITY_DB.prepare('DELETE FROM member_sessions WHERE token_hash=?').bind(await digest(token)).run()}
  return json({signed_out:true},200,{'set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`})
 }
 return null
}
