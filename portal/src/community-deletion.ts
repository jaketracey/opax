import {body,CommunityError,digest,json,limit,now,randomToken,requireMember,sameOrigin,type Member} from './community-core'
import {macHex,matchesSignInCode,randomSignInCode,requireSignInCodeSecret,signInCodeMac} from './community-signin-code'

const FAILURE='This deletion could not be completed. Request a new deletion code and try again.'
const UNAVAILABLE='This action could not be completed. Please try again shortly.'
const CODE_LIFETIME=900

/** Refuse before quota/email on the post-0011 schema or a partial 0012. */
async function requireDeletionSchema(env:Env) {
 try{
  requireSignInCodeSecret(env)
  await env.COMMUNITY_DB.prepare('SELECT challenge_id,member_id,code_mac,attempts,created_at,expires_at,used_at,superseded_at,redemption_token FROM community_deletion_challenges LIMIT 0').first()
  for(const table of ['voice_sessions','community_threads','direct_conversations']){
   const keys=await env.COMMUNITY_DB.prepare(`PRAGMA foreign_key_list(${table})`).all<{from:string,on_delete:string}>()
   const columns=table==='direct_conversations'?['member_a','member_b']:['member_id']
   if(columns.some(column=>!keys.results.some(key=>key.from===column&&key.on_delete==='SET NULL')))throw new Error('Deletion migration missing')
  }
 }catch{throw new CommunityError(503,UNAVAILABLE)}
}

export async function deletionRoute(req:Request,env:Env,path:string):Promise<Response|null> {
 if(!['/api/community/account/deletion-code','/api/community/account/delete'].includes(path))return null
 if(req.method!=='POST')return json({error:'Use POST for account deletion.'},405,{allow:'POST'})
 sameOrigin(req,env)
 const m=await requireMember(req,env)
 await requireDeletionSchema(env)
 const issuing=path.endsWith('/deletion-code')
 try{
  if(issuing){
   await body(req,2000)
   await limit(env,'login-ip:'+(req.headers.get('cf-connecting-ip')||'local'),15,3600)
   await limit(env,'login-email:'+m.email.toLowerCase(),5,3600)
   const challengeId=randomToken(),code=randomSignInCode(),t=now()
   const mac=macHex(await signInCodeMac(env,challengeId,code,m.id))
   const results=await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare('UPDATE community_deletion_challenges SET superseded_at=?,expires_at=? WHERE member_id=? AND used_at IS NULL AND superseded_at IS NULL').bind(t,t,m.id),
    env.COMMUNITY_DB.prepare('INSERT INTO community_deletion_challenges(challenge_id,member_id,code_mac,created_at,expires_at) SELECT ?,id,?,?,? FROM members WHERE id=? AND disabled=0').bind(challengeId,mac,t,t+CODE_LIFETIME,m.id),
    env.COMMUNITY_DB.prepare('DELETE FROM community_deletion_challenges WHERE expires_at<?').bind(t-86400)
   ])
   if(!results[1].meta.changes)throw new CommunityError(400,FAILURE)
   // Never include a sign-in link or expose the code in the HTTP response/logs.
   try{await env.COMMUNITY_EMAIL.send({from:{email:env.COMMUNITY_EMAIL_FROM,name:'Opax'},to:m.email,subject:'Confirm your Opax account deletion',text:`Your Opax account deletion code: ${code}\n\nIt expires in 15 minutes. Enter it only if you requested permanent account deletion. Never share this code. If you did not request deletion, ignore this email.`})}
   catch{await env.COMMUNITY_DB.prepare('DELETE FROM community_deletion_challenges WHERE challenge_id=?').bind(challengeId).run();throw new CommunityError(503,UNAVAILABLE)}
   return json({sent:true,challenge_id:challengeId,message:'Check your email for a deletion code. It expires in 15 minutes.'})
  }
  let data:Record<string,unknown>={}
  try{data=await body(req,2000)}catch(e){if(!(e instanceof CommunityError))throw e}
  const challengeId=typeof data.challenge_id==='string'&&/^[\w-]{43}$/.test(data.challenge_id)?data.challenge_id:null
  await limit(env,'consume:'+(req.headers.get('cf-connecting-ip')||'local'),30,900)
  const proof=challengeId?await env.COMMUNITY_DB.prepare('SELECT challenge_id FROM community_deletion_challenges WHERE challenge_id=? AND member_id=?').bind(challengeId,m.id).first():null
  if(!proof)throw new CommunityError(400,FAILURE)
  await limit(env,'consume-code-email:'+await digest(m.email.toLowerCase()),10,86400)
  const admitted=await env.COMMUNITY_DB.prepare('UPDATE community_deletion_challenges SET attempts=attempts+1 WHERE challenge_id=? AND member_id=? AND used_at IS NULL AND superseded_at IS NULL AND expires_at>? AND attempts<5 RETURNING code_mac').bind(challengeId,m.id,now()).first<{code_mac:string}>()
  if(!admitted||typeof data.code!=='string'||!/^\d{8}$/.test(data.code)||!await matchesSignInCode(env,challengeId!,data.code,admitted.code_mac,m.id))throw new CommunityError(400,FAILURE)
  const session=req.headers.get('cookie')!.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-opax_session='))!.slice(20)
  const sessionHash=await digest(session),limitKeys=await accountLimitKeys(m,now()),t=now()
  const results=await env.COMMUNITY_DB.batch(deletionBatch(env,m,challengeId!,sessionHash,t,limitKeys))
  if(!results[0].meta.changes)throw new CommunityError(400,FAILURE)
  return json({deleted:true,signed_out:true,message:'Your account and authored content have been deleted.'},200,{'set-cookie':'__Host-opax_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'})
 }catch(e){
  if(e instanceof CommunityError)throw new CommunityError(e.status===503?503:400,e.status===503?UNAVAILABLE:FAILURE)
  throw e
 }
}

/** Redemption and every scope mutation share one transaction and winner guard. */
function deletionBatch(env:Env,m:Member,challengeId:string,sessionHash:string,t:number,limitKeys:string[]):D1PreparedStatement[] {
 const winner=randomToken()
 const guard='EXISTS(SELECT 1 FROM community_deletion_challenges WHERE challenge_id=? AND member_id=? AND redemption_token=?)'
 const statement=(sql:string,args:unknown[]=[])=>env.COMMUNITY_DB.prepare(sql+' AND '+guard).bind(...args,challengeId,m.id,winner)
 const emptyStubs='SELECT id FROM community_threads WHERE member_id IS NULL AND NOT EXISTS(SELECT 1 FROM community_replies WHERE thread_id=community_threads.id)'
 return [
  env.COMMUNITY_DB.prepare(`UPDATE community_deletion_challenges SET used_at=?,redemption_token=? WHERE challenge_id=? AND member_id=? AND used_at IS NULL AND superseded_at IS NULL AND expires_at>?
   AND EXISTS(SELECT 1 FROM members WHERE id=? AND disabled=0) AND EXISTS(SELECT 1 FROM member_sessions WHERE token_hash=? AND member_id=? AND expires_at>?)`).bind(t,winner,challengeId,m.id,t,m.id,sessionHash,m.id,t),
  statement('DELETE FROM community_email_outbox WHERE (member_id=? OR reply_id IN (SELECT id FROM community_replies WHERE member_id=?))',[m.id,m.id]),
  statement('DELETE FROM community_email_unsubscribes WHERE member_id=?',[m.id]),
  statement(`DELETE FROM community_notifications WHERE (member_id=? OR actor_id=? OR thread_id IN (SELECT id FROM community_threads WHERE member_id=?) OR target_id IN (SELECT id FROM community_replies WHERE member_id=?))`,[m.id,m.id,m.id,m.id]),
  statement(`DELETE FROM community_reports WHERE (member_id=? OR target_id IN (SELECT id FROM community_threads WHERE member_id=? UNION ALL SELECT id FROM community_replies WHERE member_id=? UNION ALL SELECT id FROM direct_messages WHERE sender_id=?))`,[m.id,m.id,m.id,m.id]),
  statement('DELETE FROM thread_likes WHERE (member_id=? OR thread_id IN (SELECT id FROM community_threads WHERE member_id=?))',[m.id,m.id]),
  statement('DELETE FROM thread_bookmarks WHERE (member_id=? OR thread_id IN (SELECT id FROM community_threads WHERE member_id=?))',[m.id,m.id]),
  statement('DELETE FROM community_replies WHERE member_id=?',[m.id]),
  statement('DELETE FROM community_threads WHERE member_id=? AND NOT EXISTS(SELECT 1 FROM community_replies WHERE thread_id=community_threads.id)',[m.id]),
  statement("UPDATE community_threads SET title='Deleted discussion',body='',source_path=NULL,created_at=0 WHERE member_id=?",[m.id]),
  statement('DELETE FROM direct_messages WHERE sender_id=?',[m.id]),
  statement('DELETE FROM direct_reads WHERE (member_id=? OR conversation_id IN (SELECT id FROM direct_conversations WHERE (member_a=? OR member_b=?) AND NOT EXISTS(SELECT 1 FROM direct_messages WHERE conversation_id=direct_conversations.id)))',[m.id,m.id,m.id]),
  statement('DELETE FROM direct_conversations WHERE (member_a=? OR member_b=?) AND NOT EXISTS(SELECT 1 FROM direct_messages WHERE conversation_id=direct_conversations.id)',[m.id,m.id]),
  statement('UPDATE direct_conversations SET created_at=0 WHERE (member_a=? OR member_b=?)',[m.id,m.id]),
  statement('DELETE FROM member_follows WHERE (follower_id=? OR followed_id=?)',[m.id,m.id]),
  statement('DELETE FROM member_blocks WHERE (member_id=? OR blocked_id=?)',[m.id,m.id]),
  statement('DELETE FROM reading_lists WHERE member_id=?',[m.id]), // items cascade
  statement('DELETE FROM member_chats WHERE member_id=?',[m.id]),
  statement('DELETE FROM voice_access WHERE member_id=?',[m.id]),
  statement('DELETE FROM mcp_keys WHERE member_id=?',[m.id]),
  statement('DELETE FROM login_links WHERE email=? COLLATE NOCASE',[m.email]),
  statement('DELETE FROM member_sessions WHERE member_id=?',[m.id]),
  statement(`DELETE FROM community_limits WHERE (expires_at<=? OR key IN (${limitKeys.map(()=>'?').join(',')}))`,[t,...limitKeys]),
  // Remove dependent rows before a last-replier deletion removes an empty stub.
  // Keep the proof until these guarded statements finish; member deletion cascades it.
  statement(`DELETE FROM thread_likes WHERE thread_id IN (${emptyStubs})`),
  statement(`DELETE FROM thread_bookmarks WHERE thread_id IN (${emptyStubs})`),
  statement(`DELETE FROM community_notifications WHERE thread_id IN (${emptyStubs})`),
  statement(`DELETE FROM community_reports WHERE target_id IN (${emptyStubs})`),
  statement(`DELETE FROM community_threads WHERE id IN (${emptyStubs})`),
  statement('DELETE FROM members WHERE id=?',[m.id]) // links SET NULL; challenges cascade
 ]
}

// Existing limiter keys are hashed with their fixed-window bucket. Drop expired
// buckets and this account's current buckets rather than keeping an email hash.
// Shared IP quotas remain, including deletion issuance/consumption admission.
async function accountLimitKeys(m:Member,t:number):Promise<string[]> {
 const scopes:[string,number][]=[['login-email:'+m.email.toLowerCase(),3600],['consume-code-email:'+await digest(m.email.toLowerCase()),86400],
  ...['social','keys','chats'].map(prefix=>[prefix+':'+m.id,3600] as [string,number]),
  ...['thread','reply','report','list','message-day','message-new'].map(prefix=>[prefix+':'+m.id,86400] as [string,number]),
  ['message-minute:'+m.id,60],['voice-start-member:'+m.id,60],['mcp:'+m.id,60]]
 return Promise.all(scopes.map(([key,seconds])=>digest(key+':'+Math.floor(t/seconds))))
}
