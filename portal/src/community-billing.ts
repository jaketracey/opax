import Stripe from 'stripe'
import {body,CommunityError,json,limit,now,randomToken,requireMember,sameOrigin,type Member} from './community-core'
export function stripe(env:Env){if(!env.STRIPE_SECRET_KEY)throw new CommunityError(503,'Supporter contributions are not open yet.');return new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient(),timeout:10000,maxNetworkRetries:2})}
export function billingReady(env:Env){return Boolean(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET&&env.STRIPE_SUPPORTER_PRICE)}
export async function supporter(env:Env,id:string){const row=await env.COMMUNITY_DB.prepare("SELECT period_end,cancel_at_period_end FROM supporter_subscriptions WHERE member_id=? AND status='active' AND price_id=? AND period_end>? ORDER BY period_end DESC LIMIT 1").bind(id,env.STRIPE_SUPPORTER_PRICE,now()).first<{period_end:number,cancel_at_period_end:number}>();return row?{active:true,until:row.period_end,cancels_at_end:!!row.cancel_at_period_end}:{active:false,until:null,cancels_at_end:false}}
export async function syncSupporter(env:Env,m:Member,eventCreated=0){
 if(!m.stripe_customer||!billingReady(env))return
 const checked=Date.now(),subscriptions=await stripe(env).subscriptions.list({customer:m.stripe_customer,status:'all',limit:100})
 if(subscriptions.has_more)throw new CommunityError(503,'Your contribution needs a status check. Please try again shortly.')
 const statements=subscriptions.data.map(sub=>{
  const item=sub.items.data.find(i=>i.price.id===env.STRIPE_SUPPORTER_PRICE)
  return env.COMMUNITY_DB.prepare(`INSERT INTO supporter_subscriptions(id,member_id,customer,status,price_id,period_end,cancel_at_period_end,checked_at,event_created) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,price_id=excluded.price_id,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=excluded.checked_at,event_created=max(event_created,excluded.event_created) WHERE checked_at<=excluded.checked_at`).bind(sub.id,m.id,m.stripe_customer,sub.status,item?.price.id||'',item?.current_period_end||0,sub.cancel_at_period_end?1:0,checked,eventCreated)
 })
 // A fresh list is authoritative even if an old subscription disappeared.
 statements.push(env.COMMUNITY_DB.prepare(`UPDATE supporter_subscriptions SET status='canceled',checked_at=? WHERE member_id=? AND checked_at<? AND id NOT IN (SELECT value FROM json_each(?))`).bind(checked,m.id,checked,JSON.stringify(subscriptions.data.map(s=>s.id))))
 await env.COMMUNITY_DB.batch(statements)
}
export async function billingRoute(req:Request,env:Env,path:string):Promise<Response|null>{
 if(path==='/api/community/billing/webhook'&&req.method==='POST'){
  if(!billingReady(env))throw new CommunityError(503,'Contributions are not configured.')
  const reader=req.body?.getReader();if(!reader)throw new CommunityError(400,'Missing event.')
  const parts:Uint8Array[]=[];let size=0
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw new CommunityError(413,'Event too large.')}parts.push(value)}
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}
  let event:Stripe.Event
  try{event=await stripe(env).webhooks.constructEventAsync(new TextDecoder().decode(bytes),req.headers.get('stripe-signature')||'',env.STRIPE_WEBHOOK_SECRET!,300,Stripe.createSubtleCryptoProvider())}catch{throw new CommunityError(400,'Invalid event signature.')}
  if(!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','checkout.session.completed','invoice.paid','invoice.payment_failed'].includes(event.type))return json({received:true})
  const object=event.data.object as {customer?:string|{id:string}|null};const customer=typeof object.customer==='string'?object.customer:object.customer?.id
  if(customer){const m=await env.COMMUNITY_DB.prepare('SELECT * FROM members WHERE stripe_customer=?').bind(customer).first<Member>();if(m){await syncSupporter(env,m,event.created)
   if(event.type==='checkout.session.completed'){const session=event.data.object as Stripe.Checkout.Session;await env.COMMUNITY_DB.prepare('DELETE FROM supporter_checkouts WHERE member_id=? AND session_id=?').bind(m.id,session.id).run()}
  }}
  return json({received:true})
 }
 if(!path.startsWith('/api/community/billing/'))return null
 sameOrigin(req,env);if(req.method!=='POST')throw new CommunityError(405,'Use POST for this action.')
 const m=await requireMember(req,env);await body(req);await limit(env,'billing:'+m.id,10,600)
 if(!billingReady(env))throw new CommunityError(503,'Supporter contributions are not open yet.')
 const client=stripe(env)
 if(path==='/api/community/billing/refresh'){await syncSupporter(env,m);return json({supporter:await supporter(env,m.id)})}
 if(path==='/api/community/billing/portal'){
  if(!m.stripe_customer)throw new CommunityError(400,'There is no contribution to manage yet.')
  const portal=await client.billingPortal.sessions.create({customer:m.stripe_customer,return_url:env.COMMUNITY_ORIGIN+'/community?view=account'});return json({url:portal.url})
 }
 if(path!=='/api/community/billing/checkout')return null
 if(!m.stripe_customer){const customer=await client.customers.create({email:m.email,metadata:{opax_member:m.id}},{idempotencyKey:'opax-member-'+m.id});await env.COMMUNITY_DB.prepare('UPDATE members SET stripe_customer=? WHERE id=? AND stripe_customer IS NULL').bind(customer.id,m.id).run();m.stripe_customer=customer.id}
 await syncSupporter(env,m)
 if((await supporter(env,m.id)).active)throw new CommunityError(409,'You are already supporting Opax. Manage your contribution from your account.')
 // Reserve before contacting Stripe. Concurrent clicks share one checkout.
 let nonce=randomToken();const t=now();let expires=t+3600
 const reserved=await env.COMMUNITY_DB.prepare('INSERT INTO supporter_checkouts(member_id,nonce,expires_at) VALUES (?,?,?) ON CONFLICT(member_id) DO UPDATE SET nonce=excluded.nonce,session_id=NULL,url=NULL,expires_at=excluded.expires_at WHERE supporter_checkouts.expires_at<=? RETURNING nonce').bind(m.id,nonce,t+3600,t).first<{nonce:string}>()
 if(!reserved){
  const existing=await env.COMMUNITY_DB.prepare('SELECT nonce,expires_at,session_id,url FROM supporter_checkouts WHERE member_id=?').bind(m.id).first<{nonce:string,expires_at:number,session_id:string|null,url:string|null}>()
  if(!existing)throw new CommunityError(409,'Please try opening checkout again.')
  if(existing.session_id){
   const session=await client.checkout.sessions.retrieve(existing.session_id)
   if(session.status==='open'&&session.url)return json({url:session.url})
   if(session.status==='complete'){await syncSupporter(env,m);throw new CommunityError(409,'Your contribution is being confirmed. Return to your account in a moment.')}
   await env.COMMUNITY_DB.prepare('DELETE FROM supporter_checkouts WHERE member_id=? AND nonce=?').bind(m.id,existing.nonce).run()
   throw new CommunityError(409,'That checkout expired. Please try again.')
  }
  // Recover an interrupted create with the same Stripe idempotency key and
  // identical parameters, rather than reserving a second subscription.
  nonce=existing.nonce;expires=existing.expires_at
 }

 const price=await client.prices.retrieve(env.STRIPE_SUPPORTER_PRICE)
 if(!price.active||!price.recurring||price.currency!=='aud')throw new CommunityError(503,'The supporter contribution is not available yet.')
 const checkout=await client.checkout.sessions.create({mode:'subscription',customer:m.stripe_customer,line_items:[{price:price.id,quantity:1}],client_reference_id:m.id,metadata:{opax_member:m.id,nonce},subscription_data:{metadata:{opax_member:m.id}},success_url:env.COMMUNITY_ORIGIN+'/community?view=account&contribution=thanks',cancel_url:env.COMMUNITY_ORIGIN+'/community?view=support',expires_at:expires,custom_text:{submit:{message:'Your recurring contribution supports Opax. The public record stays open to everyone. You can cancel through your account.'}}},{idempotencyKey:'opax-checkout-'+nonce})
 if(!checkout.url)throw new CommunityError(503,'Checkout could not be opened.')
 await env.COMMUNITY_DB.prepare('UPDATE supporter_checkouts SET session_id=?,url=? WHERE member_id=? AND nonce=?').bind(checkout.id,checkout.url,m.id,nonce).run()
 return json({url:checkout.url})
}
