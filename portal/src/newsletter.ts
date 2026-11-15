// The newsletter's capture side (docs/NEWSLETTER.md): subscribe, confirm,
// unsubscribe. Editions are not sent from here; Cloudflare's email service is
// transactional only, so this module sends one email, the double opt-in.
//
// Rules this file keeps:
//  - NEWSLETTER_ENABLED must be exactly "true" for subscribe and confirm. Off
//    means 404 before any database read, check or email.
//  - Unsubscribe answers whatever the flag says: once an address is on the list
//    its way off must keep working.
//  - No email address, token or IP address reaches a log line or a count.
import {body,CommunityError,digest,json,limit,now,randomToken,sameOrigin} from './community-core'
import {newsletterConfirmEmail} from './community-email'

export const NEWSLETTER_EDITIONS:Record<string,string>={bills:'Bills that moved',mp:'Your MP this week'}
/** The kinds of page a sign-up can be counted against; anything else is "other". */
export const NEWSLETTER_PAGE_TYPES=['home','person','bill','electorate','party','topic','ask','search','money','doc','other']
const CONFIRM_SECONDS=48*3600
/** An unconfirmed address is deleted after this long. */
export const UNCONFIRMED_KEEP_SECONDS=7*86400
/** An unsubscribed address is deleted after this long (privacy page: within 30 days). */
export const UNSUBSCRIBED_KEEP_SECONDS=30*86400
const REQUEST_MINIMUM_MS=100
const TURNSTILE_VERIFY='https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TOKEN=/^[\w-]{43}$/

export const newsletterEnabled=(env:Env)=>String(env.NEWSLETTER_ENABLED)==='true'
const pageType=(value:unknown)=>typeof value==='string'&&NEWSLETTER_PAGE_TYPES.includes(value)?value:'other'
const day=(t:number)=>new Date(t*1000).toISOString().slice(0,10)
const count=(env:Env,event:string,type:string,t:number)=>env.COMMUNITY_DB.prepare('INSERT INTO newsletter_counts(day,event,page_type,n) VALUES (?,?,?,1) ON CONFLICT(day,event,page_type) DO UPDATE SET n=n+1').bind(day(t),event,type)

/** A four-digit postcode or an electorate name, kept as a slug. Empty means not given. */
function electorate(value:unknown):string|null {
 if(value==null||value==='')return null
 if(typeof value!=='string'||value.length>60)throw new CommunityError(400,'Enter a four-digit postcode or an electorate name.')
 const typed=value.trim()
 if(!typed)return null
 if(/^\d{4}$/.test(typed))return typed
 const slug=typed.toLowerCase().normalize('NFKD').replace(/[̀-ͯ’']/g,'').replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'')
 if(!/^[a-z][a-z-]{1,47}$/.test(slug))throw new CommunityError(400,'Enter a four-digit postcode or an electorate name.')
 return slug
}

function editions(value:unknown,place:string|null):string[] {
 if(value!==undefined&&!Array.isArray(value))throw new CommunityError(400,'Choose a newsletter edition.')
 const chosen=Object.keys(NEWSLETTER_EDITIONS).filter(key=>(value as unknown[]|undefined)?.includes(key))
 // The default: bills for everyone, and their member's week for a reader who gave a place.
 if(!chosen.length)return place?['bills','mp']:['bills']
 if(chosen.includes('mp')&&!place)throw new CommunityError(400,'Add a postcode or electorate to get Your MP this week.')
 return chosen
}

/** Cloudflare Turnstile, checked on the server. Fails closed without a secret. */
async function passedCheck(env:Env,req:Request,token:unknown) {
 if(!env.TURNSTILE_SECRET_KEY)throw new CommunityError(503,'Sign-up is not available right now.')
 if(typeof token!=='string'||!token||token.length>2048)throw new CommunityError(400,'Complete the check, then try again.')
 const form=new FormData()
 form.set('secret',env.TURNSTILE_SECRET_KEY);form.set('response',token)
 const ip=req.headers.get('cf-connecting-ip');if(ip)form.set('remoteip',ip)
 let passed=false
 try{const result=await (await fetch(TURNSTILE_VERIFY,{method:'POST',body:form})).json() as {success?:boolean};passed=result?.success===true}catch{throw new CommunityError(503,'Sign-up is not available right now.')}
 if(!passed)throw new CommunityError(400,'The check did not pass. Reload the page and try again.')
}

type Row={id:string,confirmed_at:number|null,unsubscribed_at:number|null,unsubscribe_token:string}

async function subscribe(req:Request,env:Env,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response> {
 const started=performance.now()
 sameOrigin(req,env)
 // The sender's legal identity goes in every email; without it nothing may be sent.
 if(!env.NEWSLETTER_SENDER?.trim())throw new CommunityError(503,'Sign-up is not available right now.')
 const data=await body(req,4000)
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():''
 if(email.length<3||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new CommunityError(400,'Enter a valid email address.')
 const place=electorate(data.electorate),chosen=editions(data.editions,place),from=pageType(data.page_type)
 // The IP address is used here only: hashed with the hour into a counter that expires.
 await limit(env,'newsletter-ip:'+(req.headers.get('cf-connecting-ip')||'local'),5,3600)
 await passedCheck(env,req,data.turnstile)
 // One address gets at most three confirmation emails a day, whoever asks.
 await limit(env,'newsletter-email:'+email,3,86400)
 // A ceiling on confirmation emails across the whole site.
 await limit(env,'newsletter-all',300,86400)
 const t=now(),token=randomToken(),hash=await digest(token)
 const existing=await env.COMMUNITY_DB.prepare('SELECT id,confirmed_at,unsubscribed_at,unsubscribe_token FROM newsletter_subscribers WHERE email=?').bind(email).first<Row>()
 // A confirmed subscriber is left exactly as they are and is not emailed: the form cannot be used to pester them.
 const current=!!existing&&existing.confirmed_at!=null&&existing.unsubscribed_at==null
 // An address keeps one unsubscribe token, so the link in an earlier email still works.
 const unsubscribeToken=existing?.unsubscribe_token||randomToken()
 if(!current){
  if(existing)await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET editions=?,electorate=?,confirm_token_hash=?,confirm_expires_at=?,created_at=?,confirmed_at=NULL,unsubscribed_at=NULL WHERE id=?')
   .bind(chosen.join(','),place,hash,t+CONFIRM_SECONDS,t,existing.id).run()
  else await env.COMMUNITY_DB.prepare('INSERT INTO newsletter_subscribers(id,email,editions,electorate,confirm_token_hash,confirm_expires_at,unsubscribe_token,created_at) VALUES (?,?,?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),email,chosen.join(','),place,hash,t+CONFIRM_SECONDS,unsubscribeToken,t).run()
  const origin=env.COMMUNITY_ORIGIN
  const send=(async()=>{
   try{
    const receipt=await env.COMMUNITY_EMAIL.send({from:{email:env.COMMUNITY_EMAIL_FROM,name:'OPAX'},to:email,
     ...newsletterConfirmEmail({origin,link:`${origin}/api/newsletter/confirm?token=${token}&from=${from}`,unsubscribeUrl:`${origin}/api/newsletter/unsubscribe?token=${unsubscribeToken}`,sender:env.NEWSLETTER_SENDER!.trim(),editions:chosen.map(key=>NEWSLETTER_EDITIONS[key])})})
    console.log(JSON.stringify({event:'newsletter_confirm_email_accepted',message_id:receipt?.messageId}))
   }catch(error){
    // An address that could not be emailed is not kept. Only a provider error code is logged.
    const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^E_[A-Z_]{1,60}$/.test(error.code)?error.code:'delivery_unknown'
    console.warn(JSON.stringify({event:'newsletter_confirm_email_failed',code}))
    await env.COMMUNITY_DB.prepare('DELETE FROM newsletter_subscribers WHERE confirm_token_hash=? AND confirmed_at IS NULL').bind(hash).run().catch(()=>{})
   }
  })()
  // Sent after the response where the runtime allows, so the reply takes the same time whether or not an email goes.
  if(ctx)ctx.waitUntil(send);else await send
 }
 await count(env,'submitted',from,t).run()
 const remaining=REQUEST_MINIMUM_MS-(performance.now()-started)
 if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining))
 // The same answer for a new address, a pending one and a subscriber.
 return json({ok:true,message:'Check your email and confirm to finish. The link works for 48 hours.'})
}

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
/** A script-free page: a title, a sentence and at most one button that posts back to the same link.
 * Its policy allows no stylesheet from the site, so it is styled inline, at the browser's own text sizes. */
function page(status:number,title:string,text:string,form?:{action:string,button:string}) {
 return new Response(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)} · OPAX</title><style>body{margin:0;background:#faf9f6;color:#23271f;font-family:Arial,sans-serif;line-height:1.6}header{background:#142a43;border-bottom:4px solid #d9a84a;padding:20px 24px}header a{color:#fff;font-family:Georgia,serif;text-decoration:none}main{max-width:640px;padding:24px;margin:auto}h1{font-family:Georgia,serif;line-height:1.3}a{color:#8a5a12}button{background:#142a43;color:#fff;border:0;border-radius:4px;padding:15px 24px;font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #d9a84a;outline-offset:4px}</style></head><body><header><a href="/">OPAX</a></header><main><h1>${escape(title)}</h1><p>${escape(text)}</p>${form?`<form action="${escape(form.action)}" method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">${escape(form.button)}</button></form>`:''}<p><a href="/">Back to OPAX</a></p></main></body></html>`,
  {status,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'}})
}

/** A small form post: the page's own button, or a mailbox's one-click unsubscribe. */
async function posted(req:Request) {
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))throw new CommunityError(415,'Use the button in your email.')
 const reader=req.body?.getReader();if(!reader)throw new CommunityError(400,'Use the button in your email.')
 const chunks:Uint8Array[]=[];let size=0
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw new CommunityError(413,'This request is too large.')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 if(new URLSearchParams(new TextDecoder().decode(bytes)).get('List-Unsubscribe')!=='One-Click')throw new CommunityError(400,'Use the button in your email.')
}

/** The link opens a page; only its button confirms, so a mail scanner that follows links cannot consent for anyone. */
async function confirm(req:Request,env:Env,url:URL):Promise<Response> {
 const token=url.searchParams.get('token')||'',from=pageType(url.searchParams.get('from'))
 const invalid=()=>page(400,'This link has expired','Confirmation links work for 48 hours and stop working once you unsubscribe. Sign up again on OPAX to get a new one.')
 if(!TOKEN.test(token))return invalid()
 const hash=await digest(token),t=now()
 const row=await env.COMMUNITY_DB.prepare('SELECT confirmed_at,unsubscribed_at,confirm_expires_at FROM newsletter_subscribers WHERE confirm_token_hash=?').bind(hash).first<{confirmed_at:number|null,unsubscribed_at:number|null,confirm_expires_at:number|null}>()
 const done=()=>page(200,'You are subscribed','Thanks for confirming. Every edition has an unsubscribe link.')
 if(!row||row.unsubscribed_at!=null)return invalid()
 // A link used twice changes nothing the second time.
 if(row.confirmed_at!=null)return done()
 if((row.confirm_expires_at??0)<t)return invalid()
 if(req.method!=='POST')return page(200,'Confirm your subscription','Press the button to start getting the OPAX newsletter at this address.',{action:`${url.pathname}?token=${token}&from=${from}`,button:'Confirm subscription'})
 await posted(req)
 const updated=await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET confirmed_at=? WHERE confirm_token_hash=? AND confirmed_at IS NULL AND unsubscribed_at IS NULL AND confirm_expires_at>=?').bind(t,hash,t).run()
 if(updated.meta.changes)await count(env,'confirmed',from,t).run()
 return done()
}

async function unsubscribe(req:Request,env:Env,url:URL):Promise<Response> {
 const token=url.searchParams.get('token')||''
 const invalid=()=>page(400,'This unsubscribe link is not active','The address may already have been removed. If you still get emails from OPAX, write to privacy@opax.com.au.')
 if(!TOKEN.test(token))return invalid()
 const row=await env.COMMUNITY_DB.prepare('SELECT unsubscribed_at FROM newsletter_subscribers WHERE unsubscribe_token=?').bind(token).first<{unsubscribed_at:number|null}>()
 if(!row)return invalid()
 const done=()=>page(200,'You are unsubscribed','OPAX will send no more newsletters to this address, and deletes it from the list within 30 days.')
 if(row.unsubscribed_at!=null)return done()
 if(req.method!=='POST')return page(200,'Unsubscribe from the OPAX newsletter?','Press the button to stop all newsletter emails to this address.',{action:`${url.pathname}?token=${token}`,button:'Unsubscribe'})
 await posted(req)
 const t=now()
 // Takes effect at once; the confirmation link dies with it.
 const updated=await env.COMMUNITY_DB.prepare('UPDATE newsletter_subscribers SET unsubscribed_at=?,confirm_token_hash=NULL,confirm_expires_at=NULL WHERE unsubscribe_token=? AND unsubscribed_at IS NULL').bind(t,token).run()
 if(updated.meta.changes)await count(env,'unsubscribed','other',t).run()
 return done()
}

/** Everything under /api/newsletter/. */
export async function newsletterRoute(req:Request,env:Env,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response> {
 const url=new URL(req.url),path=url.pathname
 try{
  if(path==='/api/newsletter/unsubscribe'){
   if(!['GET','HEAD','POST'].includes(req.method))throw new CommunityError(405,'Use the unsubscribe link in your email.')
   const response=await unsubscribe(req,env,url)
   return req.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response
  }
  if(!newsletterEnabled(env))return json({error:'Not found'},404)
  if(path==='/api/newsletter/subscribe'&&req.method==='POST')return await subscribe(req,env,ctx)
  if(path==='/api/newsletter/confirm'&&['GET','HEAD','POST'].includes(req.method)){
   const response=await confirm(req,env,url)
   return req.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response
  }
  return json({error:'Not found'},404)
 }catch(e){
  if(e instanceof CommunityError)return json({error:e.message},e.status)
  console.error(JSON.stringify({event:'newsletter_request_failed',path}))
  return json({error:'This could not be completed. Please try again shortly.'},503)
 }
}

/** Retention: unsubscribed addresses go after 30 days, unconfirmed ones after 7. Runs from the five-minute cron while the flag is on. */
export async function purgeNewsletter(env:Env,t=now()) {
 if(!newsletterEnabled(env))return {unsubscribed:0,unconfirmed:0}
 const [gone,pending]=await env.COMMUNITY_DB.batch([
  env.COMMUNITY_DB.prepare('DELETE FROM newsletter_subscribers WHERE unsubscribed_at IS NOT NULL AND unsubscribed_at<?').bind(t-UNSUBSCRIBED_KEEP_SECONDS),
  env.COMMUNITY_DB.prepare('DELETE FROM newsletter_subscribers WHERE confirmed_at IS NULL AND unsubscribed_at IS NULL AND created_at<?').bind(t-UNCONFIRMED_KEEP_SECONDS),
 ])
 return {unsubscribed:Number(gone.meta.changes||0),unconfirmed:Number(pending.meta.changes||0)}
}

/** The only addresses an edition may go to: confirmed through the double opt-in and not unsubscribed.
 * The sending job (not built yet, docs/NEWSLETTER.md) must take its recipients from here and nowhere else. */
export async function newsletterRecipients(env:Env,edition:string) {
 if(!newsletterEnabled(env)||!Object.hasOwn(NEWSLETTER_EDITIONS,edition))return []
 const rows=await env.COMMUNITY_DB.prepare("SELECT email,electorate,unsubscribe_token FROM newsletter_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND instr(','||editions||',',','||?||',')>0 ORDER BY id").bind(edition).all<{email:string,electorate:string|null,unsubscribe_token:string}>()
 return rows.results
}
