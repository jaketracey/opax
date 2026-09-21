import {CommunityError,digest,now,randomToken} from './community-core'
import {replyEmail} from './community-email'

export const REPLY_EMAIL_CRON='*/5 * * * *'
const eligible=`recipient.disabled=0 AND recipient.reply_email_notifications=1 AND actor.disabled=0
 AND r.hidden=0 AND t.hidden=0 AND t.member_id=recipient.id AND r.member_id<>recipient.id
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.member_id=recipient.id AND b.blocked_id=actor.id) OR (b.member_id=actor.id AND b.blocked_id=recipient.id))`

/** Include in the reply transaction so a committed reply always has its notification job. */
export function queueReplyEmail(env:Env,replyId:string) {
 return env.COMMUNITY_DB.prepare(`INSERT INTO community_email_outbox(reply_id,member_id,next_attempt_at,created_at)
 SELECT r.id,recipient.id,?2,?2 FROM community_replies r JOIN community_threads t ON t.id=r.thread_id
 JOIN members recipient ON recipient.id=t.member_id JOIN members actor ON actor.id=r.member_id
 WHERE r.id=?1 AND ${eligible} ON CONFLICT(reply_id) DO NOTHING`).bind(replyId,now())
}

type Job={reply_id:string,member_id:string,attempts:number,created_at:number}
type Delivery={email:string,author:string,title:string,body:string,thread_id:string}
const retryable=new Set(['E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED','E_INTERNAL_SERVER_ERROR','E_DELIVERY_FAILED'])
const permanent=new Set(['E_RECIPIENT_SUPPRESSED','E_RECIPIENT_NOT_ALLOWED','E_VALIDATION_ERROR','E_SENDER_NOT_VERIFIED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_CONTENT_TOO_LARGE','E_FIELD_MISSING','E_TOO_MANY_RECIPIENTS','E_HEADER_NOT_ALLOWED','E_HEADER_USE_API_FIELD','E_HEADER_VALUE_INVALID','E_HEADER_VALUE_TOO_LONG','E_HEADER_NAME_INVALID','E_HEADERS_TOO_LARGE','E_HEADERS_TOO_MANY'])

/** Immediate delivery runs after the response. Cron retries only explicit provider failures. */
export async function deliverReplyEmails(env:Env,replyId='',maximum=10) {
 const result={sent:0,skipped:0,retry:0,failed:0,uncertain:0}
 if(String(env.COMMUNITY_ENABLED)!=='true')return result
 // A send may have been accepted before a Worker stopped. Never blindly resend it.
 const stale=await env.COMMUNITY_DB.prepare("UPDATE community_email_outbox SET state='uncertain',last_error_code='delivery_interrupted' WHERE state='sending' AND lease_until<?").bind(now()).run()
 result.uncertain=Number(stale.meta.changes||0)
 if(stale.meta.changes)console.warn(JSON.stringify({event:'community_reply_email_uncertain',count:stale.meta.changes}))
 for(let i=0;i<Math.min(Math.max(maximum,1),20);i++){
  const claim=randomToken(),t=now()
  const job=await env.COMMUNITY_DB.prepare(`UPDATE community_email_outbox SET state='sending',attempts=attempts+1,claim_token=?3,lease_until=?1+600
   WHERE reply_id=(SELECT reply_id FROM community_email_outbox WHERE state='pending' AND next_attempt_at<=?1 AND (?2='' OR reply_id=?2) ORDER BY next_attempt_at,reply_id LIMIT 1)
   AND state='pending' RETURNING reply_id,member_id,attempts,created_at`).bind(t,replyId,claim).first<Job>()
  if(!job)break
  const finish=async(state:string,code:string|null=null,provider:string|null=null,next=t)=>{
   await env.COMMUNITY_DB.prepare('UPDATE community_email_outbox SET state=?,last_error_code=?,provider_id=?,next_attempt_at=?,lease_until=NULL,claim_token=NULL WHERE reply_id=? AND claim_token=?')
    .bind(state,code,provider,next,job.reply_id,claim).run()
  }
  const delivery=env.COMMUNITY_DB.prepare(`SELECT recipient.email,actor.display_name AS author,t.title,r.body,t.id AS thread_id
   FROM community_email_outbox o JOIN community_replies r ON r.id=o.reply_id JOIN community_threads t ON t.id=r.thread_id
   JOIN members recipient ON recipient.id=o.member_id JOIN members actor ON actor.id=r.member_id
   WHERE o.reply_id=? AND ${eligible}`).bind(job.reply_id)
  let data:Delivery|null=null,token=''
  try{
   data=await delivery.first<Delivery>()
   if(data&&job.created_at>=t-7*86400){
    token=randomToken()
    await env.COMMUNITY_DB.prepare('INSERT INTO community_email_unsubscribes(token_hash,member_id,created_at) VALUES (?,?,?)').bind(await digest(token),job.member_id,t).run()
    // Preferences or moderation may change while the unsubscribe token is being saved.
    data=await delivery.first<Delivery>()
   }else data=null
  }catch{
   const state=job.attempts<5?'pending':'failed'
   await finish(state,'preparation_failed',null,t+300)
   result[state==='pending'?'retry':'failed']++
   console.warn(JSON.stringify({event:'community_reply_email_preparation_failed',reply_id:job.reply_id,state}))
   continue
  }
  if(!data){await finish('skipped');result.skipped++;continue}
  const unsubscribeUrl=env.COMMUNITY_ORIGIN+'/api/community/email/unsubscribe?token='+token
  let receipt:EmailSendResult
  try{
   receipt=await env.COMMUNITY_EMAIL.send({from:{email:env.COMMUNITY_EMAIL_FROM,name:'Opax'},to:data.email,
    ...replyEmail({origin:env.COMMUNITY_ORIGIN,author:data.author||'A community member',title:data.title,body:data.body,threadId:data.thread_id,replyId:job.reply_id,unsubscribeUrl})})
  }catch(error){
   const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'?error.code:''
   const state=retryable.has(code)?(job.attempts<5?'pending':'failed'):permanent.has(code)?'failed':'uncertain'
   const delay=code==='E_DAILY_LIMIT_EXCEEDED'?86400:Math.min(3600,60*2**job.attempts)
   // Log only a known error code, never provider messages, email addresses or reply text.
   await finish(state,retryable.has(code)||permanent.has(code)?code:'delivery_unknown',null,t+delay)
   result[state==='pending'?'retry':state]++
   console.warn(JSON.stringify({event:'community_reply_email_failed',reply_id:job.reply_id,state,code:retryable.has(code)||permanent.has(code)?code:'delivery_unknown'}))
   continue
  }
  // Keep this outside the send catch: a failed receipt write must not schedule a second email.
  await finish('sent',null,receipt.messageId)
  result.sent++
 }
 return result
}

const htmlEscape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
function unsubscribePage(origin:string,action:string,complete:boolean) {
 const title=complete?'Reply emails are turned off':'Turn off reply emails?'
 return new Response(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title} · Opax</title><style>body{margin:0;background:#faf9f6;color:#23271f;font:17px/1.6 Arial,sans-serif}header{background:#142a43;color:white;border-bottom:4px solid #d9a84a;padding:24px max(24px,calc((100% - 640px)/2));font:bold 28px Georgia,serif}main{max-width:640px;padding:40px 24px;margin:auto}h1{font:700 32px/1.3 Georgia,serif}a{color:#8a5a12}button{background:#142a43;color:white;border:0;border-radius:4px;padding:15px 24px;font:600 16px Arial,sans-serif;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #d9a84a;outline-offset:4px}</style></head><body><header>OPAX</header><main><h1>${title}</h1><p>${complete?'You will no longer receive emails when someone replies to a discussion you started.':'This turns off email notifications for replies to discussions you started.'} Sign-in emails and activity in the community stay available.</p>${complete?'':`<form action="${htmlEscape(action)}" method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Turn off reply emails</button></form>`}<p><a href="${htmlEscape(origin)}/community?view=settings">Manage your community settings</a></p></main></body></html>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'}})
}

/** GET only confirms. Token-authenticated POST also supports mailbox one-click unsubscribe. */
export async function replyEmailUnsubscribe(req:Request,env:Env):Promise<Response|null> {
 const url=new URL(req.url)
 if(url.pathname!=='/api/community/email/unsubscribe')return null
 if(!['GET','POST','HEAD'].includes(req.method))throw new CommunityError(405,'Use the unsubscribe link in your email.')
 const token=url.searchParams.get('token')||''
 if(!/^[\w-]{43}$/.test(token))throw new CommunityError(400,'This unsubscribe link is not valid. You can change email notifications in your account.')
 const hash=await digest(token)
 const row=await env.COMMUNITY_DB.prepare('SELECT u.member_id,m.reply_email_notifications FROM community_email_unsubscribes u JOIN members m ON m.id=u.member_id WHERE u.token_hash=?').bind(hash).first<{member_id:string,reply_email_notifications:number}>()
 if(!row)throw new CommunityError(400,'This unsubscribe link is no longer active. You can change email notifications in your account.')
 let complete=!row.reply_email_notifications
 if(req.method==='POST'){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))throw new CommunityError(415,'Use the unsubscribe button in your email.')
  const reader=req.body?.getReader();if(!reader)throw new CommunityError(400,'Confirm that you want to turn off reply emails.')
  const chunks:Uint8Array[]=[];let size=0
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw new CommunityError(413,'This request is too large.')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  if(new URLSearchParams(new TextDecoder().decode(bytes)).get('List-Unsubscribe')!=='One-Click')throw new CommunityError(400,'Confirm that you want to turn off reply emails.')
  const updated=await env.COMMUNITY_DB.batch([
   env.COMMUNITY_DB.prepare('UPDATE members SET reply_email_notifications=0 WHERE id=? AND EXISTS(SELECT 1 FROM community_email_unsubscribes WHERE token_hash=? AND member_id=members.id)').bind(row.member_id,hash),
   env.COMMUNITY_DB.prepare("UPDATE community_email_outbox SET state='skipped' WHERE member_id=? AND state='pending' AND EXISTS(SELECT 1 FROM members WHERE id=? AND reply_email_notifications=0)").bind(row.member_id,row.member_id)
  ])
  if(!updated[0].meta.changes)throw new CommunityError(400,'This unsubscribe link is no longer active. You can change email notifications in your account.')
  complete=true
 }
 const response=unsubscribePage(env.COMMUNITY_ORIGIN,url.pathname+'?token='+token,complete)
 return req.method==='HEAD'?new Response(null,{headers:response.headers}):response
}
