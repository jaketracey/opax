import {body, CommunityError, json, limit, member, now, publicMember, requireMember, text, type Member} from './community-core'

type SocialMember = Member & {message_policy: 'everyone'|'following'|'nobody'}
type Conversation = {id:string, member_a:string, member_b:string}
// These predicates are shared by list/detail/count queries so badges cannot leak
// activity that a member is not allowed to see. All interpolated SQL is static.
const unblocked = (viewer:string, other:string) => `NOT EXISTS (SELECT 1 FROM member_blocks b WHERE (b.member_id=${viewer} AND b.blocked_id=${other}) OR (b.member_id=${other} AND b.blocked_id=${viewer}))`
const visibleNotification = `EXISTS (SELECT 1 FROM members a WHERE a.id=n.actor_id AND a.disabled=0)
 AND ${unblocked('n.member_id','n.actor_id')}
 AND (n.thread_id IS NULL OR EXISTS (SELECT 1 FROM community_threads t JOIN members owner ON owner.id=t.member_id WHERE t.id=n.thread_id AND t.hidden=0 AND owner.disabled=0 AND ${unblocked('n.member_id','t.member_id')}))
 AND (n.kind<>'reply' OR EXISTS (SELECT 1 FROM community_replies r WHERE r.id=n.target_id AND r.hidden=0))`
const unreadMessages = `SELECT count(*) AS n FROM direct_messages d JOIN direct_conversations c ON c.id=d.conversation_id
 JOIN members peer ON peer.id=CASE WHEN c.member_a=?1 THEN c.member_b ELSE c.member_a END
 LEFT JOIN direct_reads r ON r.conversation_id=c.id AND r.member_id=?1
 WHERE (c.member_a=?1 OR c.member_b=?1) AND d.sender_id<>?1 AND d.hidden=0 AND d.seq>coalesce(r.through_seq,0)
 AND peer.disabled=0 AND ${unblocked('?1','peer.id')}`
export async function socialCounts(env:Env, id:string) {
 const [messages, activity] = await Promise.all([
  env.COMMUNITY_DB.prepare(unreadMessages).bind(id).first<{n:number}>(),
  env.COMMUNITY_DB.prepare(`SELECT count(*) AS n FROM community_notifications n WHERE n.member_id=? AND n.read_at IS NULL AND ${visibleNotification}`).bind(id).first<{n:number}>()
 ])
 return {messages:messages?.n||0, activity:activity?.n||0}
}
export function notification(env:Env, recipient:string, actor:string, kind:string, target:string, thread:string|null) {
 return env.COMMUNITY_DB.prepare(`INSERT INTO community_notifications(member_id,actor_id,kind,target_id,thread_id,created_at)
 SELECT ?1,?2,?3,?4,?5,?6 WHERE ?1<>?2 AND ${unblocked('?1','?2')}
 ON CONFLICT(member_id,actor_id,kind,target_id) DO NOTHING`).bind(recipient,actor,kind,target,thread,now())
}
async function peerMember(env:Env,id:string){
 const peer=await env.COMMUNITY_DB.prepare('SELECT * FROM members WHERE id=? AND disabled=0').bind(id).first<SocialMember>()
 if(!peer)throw new CommunityError(404,'This member is unavailable.')
 return peer
}
async function isBlocked(env:Env,a:string,b:string){
 return !!await env.COMMUNITY_DB.prepare('SELECT 1 FROM member_blocks WHERE (member_id=? AND blocked_id=?) OR (member_id=? AND blocked_id=?)').bind(a,b,b,a).first()
}
async function mayMessage(env:Env, from:string, peer:SocialMember){
 if(from===peer.id || await isBlocked(env,from,peer.id))return false
 if(peer.message_policy==='nobody')return false
 if(peer.message_policy==='following')return !!await env.COMMUNITY_DB.prepare('SELECT 1 FROM member_follows WHERE follower_id=? AND followed_id=?').bind(peer.id,from).first()
 return true
}
async function ownedConversation(env:Env,id:string, m:Member){
 const c=await env.COMMUNITY_DB.prepare('SELECT * FROM direct_conversations WHERE id=? AND (member_a=? OR member_b=?)').bind(id,m.id,m.id).first<Conversation>()
 if(!c)throw new CommunityError(404,'This conversation is unavailable.')
 return c
}
function pageNumber(url:URL){return Math.floor(Math.max(0,Math.min(500,Number(url.searchParams.get('page'))||0)))}
function seqValue(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new CommunityError(400,'Choose a valid message or activity.');return n}
const threadColumns = `t.id,t.member_id,t.title,t.body,t.source_path,t.created_at,m.display_name,
 (SELECT count(*) FROM community_replies r JOIN members rm ON rm.id=r.member_id WHERE r.thread_id=t.id AND r.hidden=0 AND rm.disabled=0 AND ${unblocked('?1','r.member_id')}) AS replies,
 (SELECT count(*) FROM thread_likes l JOIN members lm ON lm.id=l.member_id WHERE l.thread_id=t.id AND lm.disabled=0) AS likes,
 EXISTS(SELECT 1 FROM thread_likes l WHERE l.thread_id=t.id AND l.member_id=?1) AS liked,
 EXISTS(SELECT 1 FROM thread_bookmarks b WHERE b.thread_id=t.id AND b.member_id=?1) AS saved`

export async function socialRoute(req:Request,env:Env):Promise<Response|null>{
 const url=new URL(req.url),path=url.pathname.replace('/api/community/',''),read=req.method==='GET',t=now()
 const threadId=path.match(/^threads\/([\w-]+)$/)?.[1]
 const profileId=path.match(/^members\/([\w-]+)$/)?.[1]
 // Public social views expose only names, bios and public contributions.
 if(read&&(path==='threads'||threadId||profileId)){
  const viewer=await member(req,env),id=viewer?.id||''
  if(path==='threads'){
   const feed=url.searchParams.get('feed')||'all',q=(url.searchParams.get('q')||'').trim().slice(0,120),page=pageNumber(url)
   if(!['all','following','saved'].includes(feed))throw new CommunityError(400,'Choose a discussion feed.')
   if(feed!=='all'&&!viewer)throw new CommunityError(401,'Sign in to see your discussions.')
   const filter=feed==='following'?'AND EXISTS (SELECT 1 FROM member_follows f WHERE f.follower_id=?1 AND f.followed_id=t.member_id)':feed==='saved'?'AND EXISTS (SELECT 1 FROM thread_bookmarks b WHERE b.member_id=?1 AND b.thread_id=t.id)':''
   const rows=await env.COMMUNITY_DB.prepare(`SELECT ${threadColumns} FROM community_threads t JOIN members m ON m.id=t.member_id
    WHERE t.hidden=0 AND m.disabled=0 AND ${unblocked('?1','t.member_id')} ${filter}
    AND (?2='' OR instr(lower(t.title||' '||t.body),lower(?2))>0) ORDER BY t.created_at DESC,t.id DESC LIMIT 21 OFFSET ?3`).bind(id,q,page*20).all()
   return json({threads:rows.results.slice(0,20),more:rows.results.length>20})
  }
  if(threadId){
   const thread=await env.COMMUNITY_DB.prepare(`SELECT ${threadColumns} FROM community_threads t JOIN members m ON m.id=t.member_id WHERE t.id=?2 AND t.hidden=0 AND m.disabled=0 AND ${unblocked('?1','t.member_id')}`).bind(id,threadId).first()
   if(!thread)throw new CommunityError(404,'This discussion is unavailable.')
   const replies=await env.COMMUNITY_DB.prepare(`SELECT r.id,r.member_id,r.body,r.created_at,m.display_name FROM community_replies r JOIN members m ON m.id=r.member_id WHERE r.thread_id=?2 AND r.hidden=0 AND m.disabled=0 AND ${unblocked('?1','r.member_id')} ORDER BY r.created_at,r.id LIMIT 200`).bind(id,threadId).all()
   return json({thread,replies:replies.results})
  }
  if(profileId){
   const peer=await peerMember(env,profileId),blocked=viewer?await isBlocked(env,id,peer.id):false
   const [stats,relationship,lists,threads]=await Promise.all([
    env.COMMUNITY_DB.prepare(`SELECT (SELECT count(*) FROM member_follows f JOIN members m ON m.id=f.follower_id WHERE f.followed_id=? AND m.disabled=0) AS followers,
    (SELECT count(*) FROM member_follows f JOIN members m ON m.id=f.followed_id WHERE f.follower_id=? AND m.disabled=0) AS following,
    (SELECT count(*) FROM community_threads WHERE member_id=? AND hidden=0) AS discussions`).bind(peer.id,peer.id,peer.id).first(),
    env.COMMUNITY_DB.prepare('SELECT EXISTS(SELECT 1 FROM member_follows WHERE follower_id=? AND followed_id=?) AS following, EXISTS(SELECT 1 FROM member_blocks WHERE member_id=? AND blocked_id=?) AS blocked').bind(id,peer.id,id,peer.id).first(),
    env.COMMUNITY_DB.prepare('SELECT id,title,description,created_at FROM reading_lists WHERE member_id=? AND public=1 AND ?=0 ORDER BY created_at DESC LIMIT 100').bind(peer.id,Number(blocked)).all(),
    env.COMMUNITY_DB.prepare(`SELECT ${threadColumns} FROM community_threads t JOIN members m ON m.id=t.member_id WHERE t.member_id=?2 AND t.hidden=0 AND ?3=0 ORDER BY t.created_at DESC,t.id DESC LIMIT 20`).bind(id,peer.id,Number(blocked)).all()
   ])
   const conversation=viewer&&!blocked?await env.COMMUNITY_DB.prepare('SELECT id FROM direct_conversations WHERE (member_a=? AND member_b=?) OR (member_a=? AND member_b=?)').bind(id,peer.id,peer.id,id).first<{id:string}>():null
   return json({member:publicMember(peer),stats,relationship,can_message:viewer?await mayMessage(env,id,peer):false,conversation_id:conversation?.id||null,lists:lists.results,threads:threads.results})
  }
 }
 const socialPath=path==='members'||path==='conversations'||path==='notifications'||path==='notifications/read'||path==='preferences'||path==='blocks'||/^members\/[\w-]+\/(follow|block)$/.test(path)||/^threads\/[\w-]+\/(like|save)$/.test(path)||/^conversations\/[\w-]+(?:\/(read|messages))?$/.test(path)||/^messages\/[\w-]+\/report$/.test(path)
 if(!socialPath)return null
 const m=await requireMember(req,env)
 if(path==='members'&&read){
  const q=(url.searchParams.get('q')||'').trim().slice(0,120),page=pageNumber(url),following=url.searchParams.get('following')==='true'
  const rows=await env.COMMUNITY_DB.prepare(`SELECT m.id,m.display_name AS name,m.bio,m.created_at AS joined_at,
    EXISTS(SELECT 1 FROM member_follows f WHERE f.follower_id=?1 AND f.followed_id=m.id) AS following
    FROM members m WHERE m.disabled=0 AND m.display_name<>'' AND m.id<>?1 AND ${unblocked('?1','m.id')}
    AND (?2='' OR instr(lower(m.display_name||' '||m.bio),lower(?2))>0)
    AND (?3=0 OR EXISTS(SELECT 1 FROM member_follows f WHERE f.follower_id=?1 AND f.followed_id=m.id))
    ORDER BY m.display_name COLLATE NOCASE,m.id LIMIT 25 OFFSET ?4`).bind(m.id,q,Number(following),page*24).all()
  return json({members:rows.results.slice(0,24),more:rows.results.length>24})
 }
 if(path==='preferences'){
  if(read){const own=await peerMember(env,m.id);return json({message_policy:own.message_policy})}
  if(req.method==='PATCH'){const d=await body(req);if(!['everyone','following','nobody'].includes(String(d.message_policy)))throw new CommunityError(400,'Choose who can message you.');await env.COMMUNITY_DB.prepare('UPDATE members SET message_policy=? WHERE id=?').bind(d.message_policy,m.id).run();return json({saved:true})}
 }
 if(path==='blocks'&&read){const rows=await env.COMMUNITY_DB.prepare('SELECT m.id,m.display_name AS name FROM member_blocks b JOIN members m ON m.id=b.blocked_id WHERE b.member_id=? ORDER BY b.created_at DESC LIMIT 200').bind(m.id).all();return json({members:rows.results})}
 const relationship=path.match(/^members\/([\w-]+)\/(follow|block)$/)
 if(relationship&&['PUT','DELETE'].includes(req.method)){
  const [,id,action]=relationship
  if(id===m.id)throw new CommunityError(400,'Choose another member.')
  const adding=req.method==='PUT'
  if(adding){await peerMember(env,id);await limit(env,'social:'+m.id,120,3600)}
  if(action==='block'){
   if(adding)await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare('INSERT INTO member_blocks VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(m.id,id,t),
    env.COMMUNITY_DB.prepare('DELETE FROM member_follows WHERE (follower_id=? AND followed_id=?) OR (follower_id=? AND followed_id=?)').bind(m.id,id,id,m.id)
   ])
   else await env.COMMUNITY_DB.prepare('DELETE FROM member_blocks WHERE member_id=? AND blocked_id=?').bind(m.id,id).run()
   return json({blocked:adding})
  }
  if(adding){
   if(await isBlocked(env,m.id,id))throw new CommunityError(403,'This connection is unavailable.')
   await env.COMMUNITY_DB.batch([env.COMMUNITY_DB.prepare('INSERT INTO member_follows VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(m.id,id,t),notification(env,id,m.id,'follow',m.id,null)])
  }else await env.COMMUNITY_DB.prepare('DELETE FROM member_follows WHERE follower_id=? AND followed_id=?').bind(m.id,id).run()
  return json({following:adding})
 }
 const reaction=path.match(/^threads\/([\w-]+)\/(like|save)$/)
 if(reaction&&['PUT','DELETE'].includes(req.method)){
  const [,id,action]=reaction,adding=req.method==='PUT'
  const thread=await env.COMMUNITY_DB.prepare(`SELECT t.member_id FROM community_threads t JOIN members m ON m.id=t.member_id WHERE t.id=?2 AND t.hidden=0 AND m.disabled=0 AND ${unblocked('?1','t.member_id')}`).bind(m.id,id).first<{member_id:string}>()
  if(!thread)throw new CommunityError(404,'This discussion is unavailable.')
  const table=action==='like'?'thread_likes':'thread_bookmarks'
  if(adding){await limit(env,'social:'+m.id,120,3600);const insert=env.COMMUNITY_DB.prepare(`INSERT INTO ${table}(thread_id,member_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING`).bind(id,m.id,t);if(action==='like')await env.COMMUNITY_DB.batch([insert,notification(env,thread.member_id,m.id,'like',id,id)]);else await insert.run()}
  else await env.COMMUNITY_DB.prepare(`DELETE FROM ${table} WHERE thread_id=? AND member_id=?`).bind(id,m.id).run()
  const count=await env.COMMUNITY_DB.prepare('SELECT count(*) AS n FROM thread_likes l JOIN members m ON m.id=l.member_id WHERE l.thread_id=? AND m.disabled=0').bind(id).first<{n:number}>()
  return json({active:adding,likes:count?.n||0})
 }
 if(path==='notifications'&&read){
  const before=url.searchParams.get('before'),rows=await env.COMMUNITY_DB.prepare(`SELECT n.*,a.display_name,t.title FROM community_notifications n JOIN members a ON a.id=n.actor_id LEFT JOIN community_threads t ON t.id=n.thread_id WHERE n.member_id=? AND ${visibleNotification} AND n.id<? ORDER BY n.id DESC LIMIT 31`).bind(m.id,before?seqValue(before):Number.MAX_SAFE_INTEGER).all<{id:number}>()
  return json({notifications:rows.results.slice(0,30),more:rows.results.length>30})
 }
 if(path==='notifications/read'&&req.method==='POST'){const d=await body(req);await env.COMMUNITY_DB.prepare('UPDATE community_notifications SET read_at=? WHERE member_id=? AND id<=? AND read_at IS NULL').bind(t,m.id,seqValue(d.through)).run();return json({saved:true})}
 if(path==='conversations'&&read){
  const page=pageNumber(url)
  const rows=await env.COMMUNITY_DB.prepare(`SELECT c.id,peer.id AS member_id,peer.display_name AS name, d.created_at AS updated_at,
   CASE WHEN d.hidden=1 THEN 'Message removed' ELSE substr(d.body,1,160) END AS preview,
   (SELECT count(*) FROM direct_messages msg WHERE msg.conversation_id=c.id AND msg.sender_id<>?1 AND msg.hidden=0 AND msg.seq>coalesce(r.through_seq,0)) AS unread
   FROM direct_conversations c JOIN members peer ON peer.id=CASE WHEN c.member_a=?1 THEN c.member_b ELSE c.member_a END
   JOIN direct_messages d ON d.seq=(SELECT max(seq) FROM direct_messages WHERE conversation_id=c.id)
   LEFT JOIN direct_reads r ON r.conversation_id=c.id AND r.member_id=?1
   WHERE (c.member_a=?1 OR c.member_b=?1) AND peer.disabled=0 AND ${unblocked('?1','peer.id')}
   ORDER BY d.seq DESC LIMIT 31 OFFSET ?2`).bind(m.id,page*30).all()
  return json({conversations:rows.results.slice(0,30),more:rows.results.length>30})
 }
 const conversationId=path.match(/^conversations\/([\w-]+)(?:\/(read|messages))?$/)
 if(conversationId){
  const [,id,action]=conversationId,c=await ownedConversation(env,id,m),peer=await peerMember(env,c.member_a===m.id?c.member_b:c.member_a)
  if(await isBlocked(env,m.id,peer.id))throw new CommunityError(404,'This conversation is unavailable.')
  if(read&&!action){
   const before=url.searchParams.get('before'),after=url.searchParams.get('after'),incremental=after!==null
   const rows=await env.COMMUNITY_DB.prepare(`SELECT seq,id,sender_id,CASE WHEN hidden=1 THEN '' ELSE body END AS body,created_at,hidden FROM direct_messages WHERE conversation_id=? AND seq${incremental?'>':'<'}? ORDER BY seq ${incremental?'ASC':'DESC'} LIMIT 51`).bind(id,incremental?(after==='0'?0:seqValue(after)):before?seqValue(before):Number.MAX_SAFE_INTEGER).all<{seq:number}>()
   return json({conversation:{id,member:publicMember(peer)},can_message:await mayMessage(env,m.id,peer),messages:incremental?rows.results.slice(0,50):rows.results.slice(0,50).reverse(),more:rows.results.length>50})
  }
  if(action==='read'&&req.method==='POST'){
   const d=await body(req),seq=seqValue(d.through)
   await env.COMMUNITY_DB.prepare(`INSERT INTO direct_reads(conversation_id,member_id,through_seq) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM direct_messages WHERE conversation_id=?1 AND seq=?3)
    ON CONFLICT(conversation_id,member_id) DO UPDATE SET through_seq=max(through_seq,excluded.through_seq)`).bind(id,m.id,seq).run()
   return json({saved:true})
  }
  if(action==='messages'&&req.method==='POST')return sendMessage(req,env,m,peer,c)
 }
 if(path==='conversations'&&req.method==='POST'){
  const d=await body(req),peer=await peerMember(env,text(d.recipient_id,1,64,'Recipient'))
  return sendMessage(req,env,m,peer,null,d)
 }
 const reportId=path.match(/^messages\/([\w-]+)\/report$/)?.[1]
 if(reportId&&req.method==='POST'){
  const d=await body(req),reason=text(d.reason,5,500,'Reason')
  const target=await env.COMMUNITY_DB.prepare('SELECT d.id FROM direct_messages d JOIN direct_conversations c ON c.id=d.conversation_id WHERE d.id=? AND d.sender_id<>? AND (c.member_a=? OR c.member_b=?)').bind(reportId,m.id,m.id,m.id).first()
  if(!target)throw new CommunityError(404,'This message is unavailable.')
  await limit(env,'report:'+m.id,20,86400)
  await env.COMMUNITY_DB.prepare('INSERT INTO community_reports VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(m.id,reportId,reason,t).run()
  return json({reported:true})
 }
 throw new CommunityError(405,'This action is unavailable.')
}

async function sendMessage(req:Request,env:Env,m:Member,peer:SocialMember,c:Conversation|null,input?:Record<string,unknown>){
 if(!m.display_name)throw new CommunityError(400,'Choose a display name in your account first.')
 if(!await mayMessage(env,m.id,peer))throw new CommunityError(403,'You cannot message this member. They may have limited who can contact them.')
 const d=input||await body(req),message=text(d.body,1,3000,'Message'),id=text(d.client_id,16,64,'Message ID')
 if(!/^[\w-]+$/.test(id))throw new CommunityError(400,'Choose a valid message ID.')
 const [a,b]=[m.id,peer.id].sort(),t=now()
 // A client ID makes a retry safe after a dropped response, without duplicating
 // a private message. Ownership and recipient are checked before acknowledging it.
 const existing=await env.COMMUNITY_DB.prepare('SELECT d.conversation_id,d.sender_id,c.member_a,c.member_b,d.body FROM direct_messages d JOIN direct_conversations c ON c.id=d.conversation_id WHERE d.id=?').bind(id).first<{conversation_id:string,sender_id:string,member_a:string,member_b:string,body:string}>()
 if(existing){if(existing.sender_id!==m.id||existing.member_a!==a||existing.member_b!==b||existing.body!==message)throw new CommunityError(409,'This message ID has already been used.');return json({id:existing.conversation_id,sent:true})}
 await limit(env,'message-minute:'+m.id,20,60)
 await limit(env,'message-day:'+m.id,200,86400)
 if(!c){
  c=await env.COMMUNITY_DB.prepare('SELECT * FROM direct_conversations WHERE member_a=? AND member_b=?').bind(a,b).first<Conversation>()
  if(!c)await limit(env,'message-new:'+m.id,20,86400)
 }
 // Permission is checked again inside the insert. A simultaneous block/privacy
 // change cannot slip a message through between the read and the write.
 const results=await env.COMMUNITY_DB.batch([
  env.COMMUNITY_DB.prepare('INSERT INTO direct_conversations(id,member_a,member_b,created_at) VALUES (?,?,?,?) ON CONFLICT(member_a,member_b) DO NOTHING').bind(c?.id||crypto.randomUUID(),a,b,t),
  env.COMMUNITY_DB.prepare(`INSERT INTO direct_messages(id,conversation_id,sender_id,body,created_at)
   SELECT ?1,c.id,?2,?3,?4 FROM direct_conversations c JOIN members recipient ON recipient.id=?5 JOIN members sender ON sender.id=?2
   WHERE c.member_a=?6 AND c.member_b=?7 AND recipient.disabled=0 AND sender.disabled=0 AND ${unblocked('?2','?5')}
   AND (recipient.message_policy='everyone' OR (recipient.message_policy='following' AND EXISTS(SELECT 1 FROM member_follows WHERE follower_id=?5 AND followed_id=?2)))
   ON CONFLICT(id) DO NOTHING`).bind(id,m.id,message,t,peer.id,a,b)
 ])
 if(!results[1].meta.changes){
  const retry=await env.COMMUNITY_DB.prepare('SELECT conversation_id FROM direct_messages WHERE id=? AND sender_id=? AND body=? AND conversation_id IN (SELECT id FROM direct_conversations WHERE member_a=? AND member_b=?)').bind(id,m.id,message,a,b).first<{conversation_id:string}>()
  if(retry)return json({id:retry.conversation_id,sent:true})
  throw new CommunityError(403,'This message could not be sent. Check the member’s profile before trying again.')
 }
 const sent=await env.COMMUNITY_DB.prepare('SELECT conversation_id FROM direct_messages WHERE id=?').bind(id).first<{conversation_id:string}>()
 return json({id:sent!.conversation_id,sent:true},201)
}
