import {authRoute} from './community-auth'
import {socialRoute,socialCounts,notification} from './community-social'
import {body,CommunityError,digest,json,limit,member,now,publicMember,randomToken,requireMember,sameOrigin,sourcePath,text} from './community-core'
export async function communityRoute(req:Request,env:Env):Promise<Response>{
 try{return await route(req,env)}catch(e){if(e instanceof CommunityError)return json({error:e.message},e.status);console.error(JSON.stringify({event:'community_request_failed',path:new URL(req.url).pathname}));return json({error:'This action could not be completed. Please try again shortly.'},503)}
}
async function route(req:Request,env:Env):Promise<Response>{
 const url=new URL(req.url),path=url.pathname,t=now()
 if(path==='/api/community/status'&&req.method==='GET'){
  const m=await member(req,env)
  return json({enabled:String(env.COMMUNITY_ENABLED)==='true',member:m?{...publicMember(m),email:m.email,role:m.role}:null,unread:m&&String(env.COMMUNITY_ENABLED)==='true'?await socialCounts(env,m.id):{messages:0,activity:0},mcp_url:env.COMMUNITY_ORIGIN+'/mcp'})
 }
 if(String(env.COMMUNITY_ENABLED)!=='true')throw new CommunityError(503,'The community is being prepared. Please check back soon.')
 const auth=await authRoute(req,env,path);if(auth)return auth
 const read=req.method==='GET'
 if(!read)sameOrigin(req,env)
 const social=await socialRoute(req,env);if(social)return social
 const threadId=path.match(/^\/api\/community\/threads\/([\w-]+)$/)?.[1]
 const listId=path.match(/^\/api\/community\/lists\/([\w-]+)$/)?.[1]
 if(listId&&read){const list=await env.COMMUNITY_DB.prepare('SELECT l.*,m.display_name FROM reading_lists l JOIN members m ON m.id=l.member_id WHERE l.id=? AND m.disabled=0').bind(listId).first<{member_id:string,public:number}>();const m=await member(req,env);if(!list||(!list.public&&list.member_id!==m?.id))throw new CommunityError(404,'This reading list is unavailable.');const items=await env.COMMUNITY_DB.prepare('SELECT * FROM reading_list_items WHERE list_id=? ORDER BY created_at,id LIMIT 100').bind(listId).all();return json({list,items:items.results})}
 const m=await requireMember(req,env)
 // Saved conversations: the chat's threads, mirrored from the browser once a
 // reader is signed in. One owner reads and writes each as a unit; the
 // reader's own clock decides between two devices (last write wins).
 if(path==='/api/community/chats'&&read){const rows=await env.COMMUNITY_DB.prepare('SELECT id,title,kind,turns,created_at,updated_at FROM member_chats WHERE member_id=? ORDER BY updated_at DESC LIMIT 50').bind(m.id).all();return json({chats:rows.results})}
 const chatId=path.match(/^\/api\/community\/chats\/([\w-]{8,64})$/)?.[1]
 if(chatId&&read){const row=await env.COMMUNITY_DB.prepare('SELECT id,title,kind,turns,data,created_at,updated_at FROM member_chats WHERE id=? AND member_id=?').bind(chatId,m.id).first<{data:string}>();if(!row)throw new CommunityError(404,'This conversation is unavailable.');return json({chat:{...row,data:JSON.parse(row.data)}})}
 if(chatId&&req.method==='PUT'){const c=chatRecord(await body(req,CHAT_BYTES));await limit(env,'chats:'+m.id,600,3600);const r=await env.COMMUNITY_DB.prepare('INSERT INTO member_chats(id,member_id,title,kind,turns,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,turns=excluded.turns,data=excluded.data,updated_at=excluded.updated_at WHERE member_chats.member_id=excluded.member_id AND excluded.updated_at>=member_chats.updated_at').bind(chatId,m.id,c.title,c.kind,c.turns,c.data,t,c.updated).run();if(!r.meta.changes){const own=await env.COMMUNITY_DB.prepare('SELECT updated_at FROM member_chats WHERE id=? AND member_id=?').bind(chatId,m.id).first<{updated_at:number}>();if(!own)throw new CommunityError(404,'This conversation is unavailable.');return json({ok:true,updated_at:own.updated_at,stale:true})}await env.COMMUNITY_DB.prepare('DELETE FROM member_chats WHERE member_id=? AND id NOT IN (SELECT id FROM member_chats WHERE member_id=? ORDER BY updated_at DESC LIMIT 50)').bind(m.id,m.id).run();return json({ok:true,updated_at:c.updated})}
 if(chatId&&req.method==='DELETE'){const r=await env.COMMUNITY_DB.prepare('DELETE FROM member_chats WHERE id=? AND member_id=?').bind(chatId,m.id).run();if(!r.meta.changes)throw new CommunityError(404,'This conversation is unavailable.');return json({ok:true})}
 if(path==='/api/community/profile'&&req.method==='PATCH'){const d=await body(req);const name=text(d.name,2,60,'Display name'),bio=text(d.bio??'',0,280,'Bio');await env.COMMUNITY_DB.prepare('UPDATE members SET display_name=?,bio=? WHERE id=?').bind(name,bio,m.id).run();return json({saved:true})}
 if(path==='/api/community/threads'&&req.method==='POST'){if(!m.display_name)throw new CommunityError(400,'Choose a display name in your account first.');const d=await body(req);await limit(env,'thread:'+m.id,10,86400);const id=crypto.randomUUID();await env.COMMUNITY_DB.prepare('INSERT INTO community_threads(id,member_id,title,body,source_path,created_at) VALUES (?,?,?,?,?,?)').bind(id,m.id,text(d.title,5,140,'Title'),text(d.body,10,5000,'Discussion'),sourcePath(d.source_path),t).run();return json({id},201)}
 if(threadId&&req.method==='POST'){
  if(!m.display_name)throw new CommunityError(400,'Choose a display name in your account first.')
  const d=await body(req),reply=text(d.body,2,3000,'Reply'),id=crypto.randomUUID()
  const thread=await env.COMMUNITY_DB.prepare(`SELECT t.member_id FROM community_threads t JOIN members owner ON owner.id=t.member_id WHERE t.id=? AND t.hidden=0 AND owner.disabled=0 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.member_id=? AND b.blocked_id=t.member_id) OR (b.member_id=t.member_id AND b.blocked_id=?))`).bind(threadId,m.id,m.id).first<{member_id:string}>()
  if(!thread)throw new CommunityError(404,'This discussion is unavailable.')
  await limit(env,'reply:'+m.id,30,86400)
  await env.COMMUNITY_DB.batch([env.COMMUNITY_DB.prepare('INSERT INTO community_replies(id,thread_id,member_id,body,created_at) VALUES (?,?,?,?,?)').bind(id,threadId,m.id,reply,t),notification(env,thread.member_id,m.id,'reply',id,threadId)])
  return json({saved:true},201)
 }
 if(threadId&&req.method==='DELETE'){const r=await env.COMMUNITY_DB.prepare('UPDATE community_threads SET hidden=1 WHERE id=? AND (member_id=? OR ?=\'moderator\')').bind(threadId,m.id,m.role).run();if(!r.meta.changes)throw new CommunityError(404,'This discussion is unavailable.');return json({removed:true})}
 const replyId=path.match(/^\/api\/community\/replies\/([\w-]+)$/)?.[1]
 if(replyId&&req.method==='DELETE'){const r=await env.COMMUNITY_DB.prepare("UPDATE community_replies SET hidden=1 WHERE id=? AND (member_id=? OR ?='moderator')").bind(replyId,m.id,m.role).run();if(!r.meta.changes)throw new CommunityError(404,'This reply is unavailable.');return json({removed:true})}
 if(path==='/api/community/reports'&&req.method==='POST'){const d=await body(req),target=text(d.target,1,64,'Discussion');await limit(env,'report:'+m.id,20,86400);const exists=await env.COMMUNITY_DB.prepare('SELECT id FROM community_threads WHERE id=? UNION ALL SELECT id FROM community_replies WHERE id=? LIMIT 1').bind(target,target).first();if(!exists)throw new CommunityError(404,'This content is unavailable.');await env.COMMUNITY_DB.prepare('INSERT INTO community_reports VALUES (?,?,?,?) ON CONFLICT(member_id,target_id) DO NOTHING').bind(m.id,target,text(d.reason,5,500,'Reason'),t).run();return json({reported:true})}
 if(path==='/api/community/reports'&&read){if(m.role!=='moderator')throw new CommunityError(403,'Moderators only.');const rows=await env.COMMUNITY_DB.prepare("SELECT r.*,coalesce(t.body,p.body,d.body) AS body,coalesce(t.hidden,p.hidden,d.hidden) AS hidden,CASE WHEN d.id IS NOT NULL THEN 'message' WHEN t.id IS NULL THEN 'reply' ELSE 'thread' END AS kind FROM community_reports r LEFT JOIN community_threads t ON t.id=r.target_id LEFT JOIN community_replies p ON p.id=r.target_id LEFT JOIN direct_messages d ON d.id=r.target_id ORDER BY r.created_at DESC LIMIT 100").all();return json({reports:rows.results})}
 const reportedMessage=path.match(/^\/api\/community\/messages\/([\w-]+)$/)?.[1]
 if(reportedMessage&&req.method==='DELETE'){if(m.role!=='moderator')throw new CommunityError(403,'Moderators only.');const r=await env.COMMUNITY_DB.prepare('UPDATE direct_messages SET hidden=1 WHERE id=? AND EXISTS(SELECT 1 FROM community_reports WHERE target_id=direct_messages.id)').bind(reportedMessage).run();if(!r.meta.changes)throw new CommunityError(404,'This reported message is unavailable.');return json({removed:true})}
 if(path==='/api/community/lists'&&read){const rows=await env.COMMUNITY_DB.prepare('SELECT l.*,(SELECT count(*) FROM reading_list_items i WHERE i.list_id=l.id) AS count FROM reading_lists l WHERE member_id=? ORDER BY created_at DESC').bind(m.id).all();return json({lists:rows.results})}
 if(path==='/api/community/lists'&&req.method==='POST'){const d=await body(req);await limit(env,'list:'+m.id,20,86400);const count=await env.COMMUNITY_DB.prepare('SELECT count(*) AS n FROM reading_lists WHERE member_id=?').bind(m.id).first<{n:number}>();if(count&&count.n>=50)throw new CommunityError(400,'You can keep up to 50 reading lists.');const id=crypto.randomUUID();await env.COMMUNITY_DB.prepare('INSERT INTO reading_lists VALUES (?,?,?,?,?,?)').bind(id,m.id,text(d.title,2,120,'Title'),text(d.description??'',0,500,'Description'),d.public===true?1:0,t).run();return json({id},201)}
 if(listId&&(req.method==='PATCH'||req.method==='DELETE')){const own=await env.COMMUNITY_DB.prepare('SELECT id FROM reading_lists WHERE id=? AND member_id=?').bind(listId,m.id).first();if(!own)throw new CommunityError(404,'This reading list is unavailable.');if(req.method==='DELETE'){await env.COMMUNITY_DB.prepare('DELETE FROM reading_lists WHERE id=? AND member_id=?').bind(listId,m.id).run();return json({removed:true})}const d=await body(req);await env.COMMUNITY_DB.prepare('UPDATE reading_lists SET title=?,description=?,public=? WHERE id=? AND member_id=?').bind(text(d.title,2,120,'Title'),text(d.description??'',0,500,'Description'),d.public===true?1:0,listId,m.id).run();return json({saved:true})}
 const itemList=path.match(/^\/api\/community\/lists\/([\w-]+)\/items$/)?.[1]
 if(itemList&&req.method==='POST'){const d=await body(req);const own=await env.COMMUNITY_DB.prepare('SELECT id FROM reading_lists WHERE id=? AND member_id=?').bind(itemList,m.id).first();if(!own)throw new CommunityError(404,'This reading list is unavailable.');const count=await env.COMMUNITY_DB.prepare('SELECT count(*) AS n FROM reading_list_items WHERE list_id=?').bind(itemList).first<{n:number}>();if(count&&count.n>=100)throw new CommunityError(400,'This list has reached 100 records.');const path=sourcePath(d.path);if(!path)throw new CommunityError(400,'Add an Opax record link.');await env.COMMUNITY_DB.prepare('INSERT INTO reading_list_items VALUES (?,?,?,?,?,?) ON CONFLICT(list_id,path) DO UPDATE SET title=excluded.title,note=excluded.note').bind(crypto.randomUUID(),itemList,text(d.title,2,160,'Title'),path,text(d.note??'',0,1000,'Note'),t).run();return json({saved:true},201)}
 const itemId=path.match(/^\/api\/community\/items\/([\w-]+)$/)?.[1]
 if(itemId&&req.method==='DELETE'){const r=await env.COMMUNITY_DB.prepare('DELETE FROM reading_list_items WHERE id=? AND list_id IN (SELECT id FROM reading_lists WHERE member_id=?)').bind(itemId,m.id).run();if(!r.meta.changes)throw new CommunityError(404,'This record is unavailable.');return json({removed:true})}
 if(path==='/api/community/keys'&&read){const rows=await env.COMMUNITY_DB.prepare('SELECT id,name,prefix,created_at,expires_at,last_used_at,revoked_at FROM mcp_keys WHERE member_id=? ORDER BY created_at DESC LIMIT 30').bind(m.id).all();return json({keys:rows.results})}
 if(path==='/api/community/keys'&&req.method==='POST'){const d=await body(req);await limit(env,'keys:'+m.id,10,3600);const count=await env.COMMUNITY_DB.prepare('SELECT count(*) AS n FROM mcp_keys WHERE member_id=? AND revoked_at IS NULL AND expires_at>?').bind(m.id,t).first<{n:number}>();if(count&&count.n>=3)throw new CommunityError(400,'Revoke an old key before creating another. You can have three active keys.');const token='opax_'+randomToken(),id=crypto.randomUUID();const inserted=await env.COMMUNITY_DB.prepare('INSERT INTO mcp_keys(id,member_id,token_hash,name,prefix,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM mcp_keys WHERE member_id=? AND revoked_at IS NULL AND expires_at>?)<3').bind(id,m.id,await digest(token),text(d.name,2,60,'Key name'),token.slice(0,12),t,t+90*86400,m.id,t).run();if(!inserted.meta.changes)throw new CommunityError(400,'You can have three active keys. Revoke an old key first.');return json({id,token,expires_at:t+90*86400},201)}
 const keyId=path.match(/^\/api\/community\/keys\/([\w-]+)$/)?.[1]
 if(keyId&&req.method==='DELETE'){const r=await env.COMMUNITY_DB.prepare('UPDATE mcp_keys SET revoked_at=? WHERE id=? AND member_id=?').bind(t,keyId,m.id).run();if(!r.meta.changes)throw new CommunityError(404,'This key is unavailable.');return json({revoked:true})}
 throw new CommunityError(404,'This action is unavailable.')
}

/** A saved conversation's body: a title, its kind, the one speaker it is held
 * with (if any), the reader's clock and up to eighty turns. */
const CHAT_BYTES=600000
function chatRecord(d:Record<string,unknown>){
 const title=text(d.title??'Conversation',1,160,'Title')
 const kind=d.kind==='speech'?'speech':'all'
 const speaker=typeof d.speaker==='string'&&d.speaker.trim()?text(d.speaker,1,120,'Speaker'):''
 const thread=Array.isArray(d.thread)?d.thread as Record<string,unknown>[]:null
 if(!thread||thread.length===0||thread.length>80||!thread.every(m=>m&&typeof m==='object'&&(m.role==='user'||m.role==='answer')&&typeof m.text==='string'))throw new CommunityError(400,'A conversation needs its turns.')
 const t=now()
 const updated=typeof d.updated==='number'&&Number.isFinite(d.updated)&&d.updated>0&&d.updated<=t+60?Math.floor(d.updated):t
 return {title,kind,turns:thread.filter(m=>m.role==='user').length,updated,data:JSON.stringify(speaker?{thread,speaker}:{thread})}
}
