// The newsletter's capture side (docs/NEWSLETTER.md): subscribe, confirm,
// unsubscribe. Editions are not sent from here; Cloudflare's email service is
// transactional only, so this module sends one email, the double opt-in.
//
// Rules this file keeps:
//  - NEWSLETTER_ENABLED must be exactly "true" for subscribe and confirm. Off
//    means 404 before any database read, check or email.
//  - Unsubscribe answers whatever the flag says: once an address is on the list
//    its way off must keep working.
//  - Retention runs whatever the flag says, for the same reason.
//  - No email address, token or IP address reaches a log line or a count, and the
//    confirmation token never travels in a URL the server sees (request logs keep URLs).
//  - Dates on a subscriber row are whole days, so a row cannot be matched to an
//    analytics event by its time.
import {body,CommunityError,digest,json,now,randomToken,sameOrigin} from './community-core'
import {newsletterConfirmEmail} from './community-email'

export const NEWSLETTER_EDITIONS:Record<string,string>={bills:'Bills that moved'}
/** The kinds of page a sign-up can be counted against; anything else is "other". */
export const NEWSLETTER_PAGE_TYPES=['home','person','bill','electorate','party','topic','ask','search','money','doc','other']
const DAY=86400
/** A confirmation link works until the end of the second full day after sign-up: at least 48 hours. */
const CONFIRM_DAYS=3
/** An address never confirmed is deleted once its sign-up day is this old: 7 to 8 days after signing up. */
export const UNCONFIRMED_KEEP_SECONDS=7*DAY
/** An unsubscribed address is deleted once its unsubscribe day is this old: 29 to 30 days after, so always within 30. */
export const UNSUBSCRIBED_KEEP_SECONDS=29*DAY
const REQUEST_MINIMUM_MS=100
const TURNSTILE_VERIFY='https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TOKEN=/^[\w-]{43}$/
// One addr-spec and nothing else: no display name, angle brackets, quotes, spaces or control characters.
const ADDRESS=/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export const newsletterEnabled=(env:Env)=>String(env.NEWSLETTER_ENABLED)==='true'
const pageType=(value:unknown)=>typeof value==='string'&&NEWSLETTER_PAGE_TYPES.includes(value)?value:'other'
/** Dates are kept as the start of their UTC day. */
const dayStart=(t:number)=>t-t%DAY
const day=(t:number)=>new Date(t*1000).toISOString().slice(0,10)
const count=(env:Env,event:string,type:string,t:number)=>env.COMMUNITY_DB.prepare('INSERT INTO newsletter_counts(day,event,page_type,n) VALUES (?,?,?,1) ON CONFLICT(day,event,page_type) DO UPDATE SET n=n+1').bind(day(t),event,type)
const unavailable=()=>new CommunityError(503,'Sign-up is not available right now.')

/** The address as stored: trimmed and lower-cased, or null if it is not one plain address. */
export function newsletterAddress(value:unknown):string|null {
 if(typeof value!=='string')return null
 const email=value.trim().toLowerCase()
 if(email.length>254||email.indexOf('@')>64||!ADDRESS.test(email))return null
 return email
}
/** The mailbox an address most likely reaches, for the rate limit only (never stored): the
 * plus-tag is dropped, and Gmail's dots, so tagged variants of one inbox share one allowance. */
export function newsletterMailbox(email:string):string {
 const at=email.lastIndexOf('@'),domain=email.slice(at+1)
 let local=email.slice(0,at).split('+')[0]
 if(domain==='gmail.com'||domain==='googlemail.com')local=local.replaceAll('.','')
 return (local||email.slice(0,at))+'@'+(domain==='googlemail.com'?'gmail.com':domain)
}
/** The network a request came from, for the rate limit only: an IPv4 address, or an IPv6 /64. */
export function newsletterNetwork(ip:string|null):string {
 if(!ip)return 'local'
 if(!ip.includes(':'))return ip
 const [left,right='']=ip.toLowerCase().split('::')
 const a=left?left.split(':'):[],b=right?right.split(':'):[]
 const groups=ip.includes('::')?[...a,...Array(Math.max(0,8-a.length-b.length)).fill('0'),...b]:a
 return groups.slice(0,4).map(group=>group.replace(/^0+(?=.)/,'')).join(':')+'::/64'
}

/** Rate-limit counters hold an HMAC under a Worker secret, never the IP address or the email
 * address, in the newsletter's own table, and are deleted when their window ends (purgeNewsletter). */
async function allow(env:Env,name:string,value:string,most:number,seconds:number) {
 const secret=env.NEWSLETTER_HASH_SECRET||''
 if(secret.length<32)throw unavailable()
 const encoder=new TextEncoder(),bucket=Math.floor(now()/seconds)
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const mac=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`newsletter:${name}:${value}:${bucket}`)))].map(v=>v.toString(16).padStart(2,'0')).join('')
 const row=await env.COMMUNITY_DB.prepare('INSERT INTO newsletter_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(mac,(bucket+1)*seconds).first<{hits:number}>()
 if(!row||row.hits>most)throw new CommunityError(429,'Please wait a little before trying again.')
}

/** Cloudflare Turnstile, checked on the server: the token must be good, for this site and for this form. Fails closed without a secret. */
async function passedCheck(env:Env,req:Request,token:unknown) {
 if(!env.TURNSTILE_SECRET_KEY)throw unavailable()
 if(typeof token!=='string'||!token||token.length>2048)throw new CommunityError(400,'Complete the check, then try again.')
 const form=new FormData()
 form.set('secret',env.TURNSTILE_SECRET_KEY);form.set('response',token)
 const ip=req.headers.get('cf-connecting-ip');if(ip)form.set('remoteip',ip)
 let passed=false
 try{
  const result=await (await fetch(TURNSTILE_VERIFY,{method:'POST',body:form})).json() as {success?:boolean,hostname?:string,action?:string}
  passed=result?.success===true&&result.hostname===new URL(env.COMMUNITY_ORIGIN).hostname&&result.action==='newsletter'
 }catch{throw unavailable()}
 if(!passed)throw new CommunityError(400,'The check did not pass. Reload the page and try again.')
}

type Row={id:string,confirmed_at:number|null,unsubscribed_at:number|null,unsubscribe_token:string}

async function subscribe(req:Request,env:Env,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response> {
 const started=performance.now()
 sameOrigin(req,env)
 // The sender's legal identity goes in every email; without it nothing may be sent.
 if(!env.NEWSLETTER_SENDER?.trim())throw unavailable()
 const data=await body(req,4000)
 const email=newsletterAddress(data.email)
 if(!email)throw new CommunityError(400,'Enter a valid email address.')
 const chosen=Object.keys(NEWSLETTER_EDITIONS),from=pageType(data.page_type)
 // Five sign-ups an hour from one network (an IPv4 address or an IPv6 /64).
 await allow(env,'network',newsletterNetwork(req.headers.get('cf-connecting-ip')),5,3600)
 await passedCheck(env,req,data.turnstile)
 // One mailbox gets at most three confirmation emails a day, whoever asks and however the address is tagged.
 await allow(env,'mailbox',newsletterMailbox(email),3,DAY)
 // A ceiling on confirmation emails across the whole site.
 const cap=Number(env.NEWSLETTER_DAILY_CAP)
 await allow(env,'all','',Number.isInteger(cap)&&cap>0?cap:300,DAY)
 const t=now(),token=randomToken(),hash=await digest(token),expires=dayStart(t)+CONFIRM_DAYS*DAY
 const existing=await env.COMMUNITY_DB.prepare('SELECT id,confirmed_at,unsubscribed_at,unsubscribe_token FROM newsletter_subscribers WHERE email=?').bind(email).first<Row>()
 // A confirmed subscriber is left exactly as they are and is not emailed: the form cannot be used to pester them.
 const current=!!existing&&existing.confirmed_at!=null&&existing.unsubscribed_at==null
 // An address keeps one unsubscribe token, so the link in an earlier email still works.
 const unsubscribeToken=existing?.unsubscribe_token||randomToken()
 // Every path makes one write here, so the reply takes the same time for a new, pending or subscribed address.
 // A resubmitted address gets a fresh confirmation link and nothing else: its dates stand, so nobody can
 // keep an unconfirmed or unsubscribed address on the list by signing it up again.
 if(current)await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET editions=editions WHERE id=?').bind(existing.id).run()
 else if(existing)await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET confirm_token_hash=?,confirm_expires_at=? WHERE id=?').bind(hash,expires,existing.id).run()
 else await env.COMMUNITY_DB.prepare('INSERT INTO newsletter_subscribers(id,email,editions,confirm_token_hash,confirm_expires_at,unsubscribe_token,created_at) VALUES (?,?,?,?,?,?,?)')
  .bind(crypto.randomUUID(),email,chosen.join(','),hash,expires,unsubscribeToken,dayStart(t)).run()
 if(!current){
  const origin=env.COMMUNITY_ORIGIN
  const send=(async()=>{
   try{
    // The confirmation token rides in the link's fragment, which a browser never sends to a server.
    const receipt=await env.COMMUNITY_EMAIL.send({from:{email:env.COMMUNITY_EMAIL_FROM,name:'OPAX'},to:email,
     ...newsletterConfirmEmail({origin,link:`${origin}/api/newsletter/confirm#t=${token}&from=${from}`,unsubscribeUrl:`${origin}/api/newsletter/unsubscribe?token=${unsubscribeToken}`,sender:env.NEWSLETTER_SENDER!.trim(),editions:chosen.map(key=>NEWSLETTER_EDITIONS[key])})})
    console.log(JSON.stringify({event:'newsletter_confirm_email_accepted',message_id:receipt?.messageId}))
   }catch(error){
    // An address that could not be emailed is not kept. Only a provider error code is logged.
    const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^E_[A-Z_]{1,60}$/.test(error.code)?error.code:'delivery_unknown'
    console.warn(JSON.stringify({event:'newsletter_confirm_email_failed',code}))
    await (existing
     ?env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET confirm_token_hash=NULL,confirm_expires_at=NULL WHERE confirm_token_hash=?').bind(hash)
     :env.COMMUNITY_DB.prepare('DELETE FROM newsletter_subscribers WHERE confirm_token_hash=? AND confirmed_at IS NULL').bind(hash)).run().catch(()=>{})
   }
  })()
  // Sent after the response, so the reply does not wait on the email provider.
  if(ctx)ctx.waitUntil(send);else await send
 }
 // The sign-up count: a daily number by page type, with nothing that identifies anyone.
 await count(env,'submitted',from,t).run()
 const remaining=REQUEST_MINIMUM_MS-(performance.now()-started)
 if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining))
 // The same answer for a new address, a pending one and a subscriber.
 return json({ok:true,message:'Check your email and confirm to finish. The link works for two days.'})
}

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
/** A small page styled inline, at the browser's own text sizes (its policy allows no stylesheet from the site):
 * a title, a sentence and at most one button. */
function page(status:number,title:string,text:string,control='') {
 return new Response(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)} · OPAX</title><style>body{margin:0;background:#faf9f6;color:#23271f;font-family:Arial,sans-serif;line-height:1.6}header{background:#142a43;border-bottom:4px solid #d9a84a;padding:20px 24px}header a{color:#fff;font-family:Georgia,serif;text-decoration:none}main{max-width:640px;padding:24px;margin:auto}h1{font-family:Georgia,serif;line-height:1.3}a{color:#8a5a12}button{background:#142a43;color:#fff;border:0;border-radius:4px;padding:15px 24px;font:inherit;cursor:pointer}button:disabled{opacity:.6}button:focus-visible,a:focus-visible{outline:3px solid #d9a84a;outline-offset:4px}</style></head><body><header><a href="/">OPAX</a></header><main><h1 id="title" tabindex="-1">${escape(title)}</h1><p id="text" role="status">${escape(text)}</p>${control}<p><a href="/">Back to OPAX</a></p></main></body></html>`,
  {status,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'}})
}
const postForm=(action:string,button:string)=>`<form action="${escape(action)}" method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">${escape(button)}</button></form>`

/** The one-click post (RFC 8058 section 3.2): the pair List-Unsubscribe=One-Click, sent as
 * multipart/form-data (SHOULD) or application/x-www-form-urlencoded (MAY). The page's own button sends the second. */
async function oneClick(req:Request) {
 const type=req.headers.get('content-type')||'',kind=type.toLowerCase().split(';')[0].trim()
 if(kind!=='multipart/form-data'&&kind!=='application/x-www-form-urlencoded')throw new CommunityError(415,'Use the unsubscribe link in your email.')
 const reader=req.body?.getReader();if(!reader)throw new CommunityError(400,'Use the unsubscribe link in your email.')
 const chunks:Uint8Array[]=[];let size=0
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new CommunityError(413,'This request is too large.')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 let value:unknown=null
 try{value=(await new Response(bytes,{headers:{'content-type':type}}).formData()).get('List-Unsubscribe')}catch{/* not a form */}
 if(value!=='One-Click')throw new CommunityError(400,'Use the unsubscribe link in your email.')
}

const CONFIRM_TEXT={confirmed:'Thanks for confirming. Every edition has an unsubscribe link.',expired:'Confirmation links work for two days and stop working once you unsubscribe. Sign up again on OPAX to get a new one.'}
/** The link in the email opens this page with the token in its fragment. The page's script
 * (public/newsletter-confirm.js) posts the token only when the reader presses the button, so
 * a mail scanner that follows links cannot consent for anyone, and the token is in no URL the
 * server receives. */
function confirmPage() {
 return page(200,'Confirm your subscription','Press the button to start getting the OPAX newsletter at this address.',
  '<p><button type="button" id="confirm" disabled>Confirm subscription</button></p><noscript><p>This page needs JavaScript to confirm. If you cannot turn it on, write to privacy@opax.com.au from the address you signed up with.</p></noscript><script src="/newsletter-confirm.js" defer></script>')
}
async function confirm(req:Request,env:Env):Promise<Response> {
 sameOrigin(req,env)
 const data=await body(req,1000),token=typeof data.token==='string'?data.token:'',from=pageType(data.from)
 const expired=()=>json({ok:false,state:'expired',title:'This link has expired',message:CONFIRM_TEXT.expired},400)
 if(!TOKEN.test(token))return expired()
 const hash=await digest(token),t=now()
 // Pending means never confirmed, or unsubscribed and asking again; unsubscribing clears the link, so an old one cannot bring an address back.
 const updated=await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET confirmed_at=?,unsubscribed_at=NULL WHERE confirm_token_hash=? AND (confirmed_at IS NULL OR unsubscribed_at IS NOT NULL) AND confirm_expires_at>=?').bind(dayStart(t),hash,t).run()
 if(updated.meta.changes)await count(env,'confirmed',from,t).run()
 else{
  // A link used twice changes nothing the second time.
  const row=await env.COMMUNITY_DB.prepare('SELECT confirmed_at,unsubscribed_at FROM newsletter_subscribers WHERE confirm_token_hash=?').bind(hash).first<{confirmed_at:number|null,unsubscribed_at:number|null}>()
  if(!row||row.confirmed_at==null||row.unsubscribed_at!=null)return expired()
 }
 return json({ok:true,state:'confirmed',title:'You are subscribed',message:CONFIRM_TEXT.confirmed})
}

/** The unsubscribe token has to be in the link (RFC 8058 section 3.1: the URI identifies the recipient,
 * and a mailbox posts to it with no other context), so it can appear in request logs. All it can do is unsubscribe. */
async function unsubscribe(req:Request,env:Env,url:URL):Promise<Response> {
 const token=url.searchParams.get('token')||''
 const invalid=()=>page(400,'This unsubscribe link is not active','The address may already have been removed. If you still get emails from OPAX, write to privacy@opax.com.au.')
 if(!TOKEN.test(token))return invalid()
 const row=await env.COMMUNITY_DB.prepare('SELECT unsubscribed_at FROM newsletter_subscribers WHERE unsubscribe_token=?').bind(token).first<{unsubscribed_at:number|null}>()
 if(!row)return invalid()
 const done=()=>page(200,'You are unsubscribed','OPAX will send no more newsletters to this address, and deletes it from the list within 30 days.')
 if(req.method!=='POST')return row.unsubscribed_at!=null?done():page(200,'Unsubscribe from the OPAX newsletter?','Press the button to stop all newsletter emails to this address.',postForm(`${url.pathname}?token=${token}`,'Unsubscribe'))
 await oneClick(req)
 const t=now()
 // Takes effect at once; any confirmation link dies with it. The first unsubscribe date stands.
 const updated=await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET unsubscribed_at=coalesce(unsubscribed_at,?),confirm_token_hash=NULL,confirm_expires_at=NULL WHERE unsubscribe_token=?').bind(dayStart(t),token).run()
 if(updated.meta.changes&&row.unsubscribed_at==null)await count(env,'unsubscribed','other',t).run()
 return done()
}

/** Everything under /api/newsletter/. */
export async function newsletterRoute(req:Request,env:Env,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response> {
 const url=new URL(req.url),path=url.pathname
 const headOf=(response:Response)=>req.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response
 try{
  if(path==='/api/newsletter/unsubscribe'){
   if(!['GET','HEAD','POST'].includes(req.method))throw new CommunityError(405,'Use the unsubscribe link in your email.')
   return headOf(await unsubscribe(req,env,url))
  }
  if(!newsletterEnabled(env))return json({error:'Not found'},404)
  if(path==='/api/newsletter/subscribe'&&req.method==='POST')return await subscribe(req,env,ctx)
  if(path==='/api/newsletter/confirm'&&(req.method==='GET'||req.method==='HEAD'))return headOf(confirmPage())
  if(path==='/api/newsletter/confirm'&&req.method==='POST')return await confirm(req,env)
  return json({error:'Not found'},404)
 }catch(e){
  if(e instanceof CommunityError)return json({error:e.message},e.status)
  console.error(JSON.stringify({event:'newsletter_request_failed',path}))
  return json({error:'This could not be completed. Please try again shortly.'},503)
 }
}

/** Retention, from the five-minute cron whatever the flag says (an address that could unsubscribe with the
 * flag off must also be deleted with it off): unsubscribed addresses within 30 days, unconfirmed ones within 8,
 * rate-limit counters when their window ends. Null before the migration has been applied. */
export async function purgeNewsletter(env:Env,t=now()) {
 try{
  const [gone,pending]=await env.COMMUNITY_DB.batch([
   env.COMMUNITY_DB.prepare('DELETE FROM newsletter_subscribers WHERE unsubscribed_at IS NOT NULL AND unsubscribed_at<?').bind(t-UNSUBSCRIBED_KEEP_SECONDS),
   env.COMMUNITY_DB.prepare('DELETE FROM newsletter_subscribers WHERE confirmed_at IS NULL AND unsubscribed_at IS NULL AND created_at<?').bind(t-UNCONFIRMED_KEEP_SECONDS),
   env.COMMUNITY_DB.prepare('DELETE FROM newsletter_limits WHERE expires_at<?').bind(t),
  ])
  return {unsubscribed:Number(gone.meta.changes||0),unconfirmed:Number(pending.meta.changes||0)}
 }catch(error){
  if(/no such table/i.test(String(error)))return null
  throw error
 }
}

/** The only addresses an edition may go to: confirmed through the double opt-in and not unsubscribed.
 * The sending job (not built yet, docs/NEWSLETTER.md) must take its recipients from here and nowhere else. */
export async function newsletterRecipients(env:Env,edition:string) {
 if(!newsletterEnabled(env)||!Object.hasOwn(NEWSLETTER_EDITIONS,edition))return []
 const rows=await env.COMMUNITY_DB.prepare("SELECT email,unsubscribe_token FROM newsletter_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND instr(','||editions||',',','||?||',')>0 ORDER BY id").bind(edition).all<{email:string,unsubscribe_token:string}>()
 return rows.results
}
