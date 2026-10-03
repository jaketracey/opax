// Local browser regression. Install Playwright outside the tracked dependencies
// and set OPAX_PLAYWRIGHT_MODULE; all API/email/provider traffic stays local.
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const {chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE||'playwright');
crypto.subtle.timingSafeEqual??=timingSafeEqual;
const folder=mkdtempSync(join(tmpdir(),'opax-deletion-browser-'));
await build({entryPoints:[new URL('../src/community.ts',import.meta.url).pathname],outfile:join(folder,'community.mjs'),bundle:true,platform:'node',format:'esm'});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-days','1','-keyout',join(folder,'key.pem'),'-out',join(folder,'cert.pem')],{stdio:'ignore'});
const tls={key:readFileSync(join(folder,'key.pem')),cert:readFileSync(join(folder,'cert.pem'))};
const {communityRoute}=await import(pathToFileURL(join(folder,'community.mjs')));
const browser=await chromium.launch({headless:true,executablePath:process.env.OPAX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
let checks=0;
try{
 for(const width of [390,768,1280])for(const {enabled,disabled} of [{enabled:true,disabled:false},{enabled:false,disabled:false},{enabled:true,disabled:true},{enabled:false,disabled:true}]){
  const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const mail=[],token='a'.repeat(43),at=Math.floor(Date.now()/1000),errors=[],outbound=[];
  db.prepare("INSERT INTO members(id,email,display_name,created_at) VALUES ('browser','browser@example.test','Browser reader',?)").run(at);
  if(disabled)db.exec("UPDATE members SET disabled=1 WHERE id='browser'");
  db.prepare("INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at) VALUES (?,'browser',?,?)").run(createHash('sha256').update(token).digest('hex'),at+3600,at);
  const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}});
  const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const result=[];for(const s of stmts)result.push(await s.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}},COMMUNITY_ENABLED:String(enabled),COMMUNITY_CODE_MAC_SECRET:'test-only-deletion-browser-code-key-000000000000000',COMMUNITY_EMAIL_FROM:'signin@example.test',COMMUNITY_EMAIL:{async send(m){mail.push(m);return {messageId:'test'}}}};
  const server=createServer(tls,async(req,res)=>{
   try{
    const url=new URL(req.url,env.COMMUNITY_ORIGIN);
    if(url.pathname.startsWith('/api/')){
     const chunks=[];for await(const chunk of req)chunks.push(chunk);
     const r=await communityRoute(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env);
     res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
    }
    const path=url.pathname==='/community'?'/community.html':url.pathname;
    if(path.includes('..'))throw Error('Invalid asset path');
    const file=new URL('../public'+path,import.meta.url),type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(readFileSync(file));
   }catch(e){errors.push(e.message);res.writeHead(500);res.end('Local test error')}
  });
  await new Promise(resolve=>server.listen(0,'::1',resolve));const base='https://localhost:'+server.address().port;env.COMMUNITY_ORIGIN=base;
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await context.addCookies([{name:'__Host-opax_session',value:token,url:base+'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();outbound.push(route.request().url());return route.abort()});
  try{
   await page.goto(base+'/community?view=account');await page.getByRole('link',{name:'Delete your account',exact:true}).click();await page.getByRole('heading',{name:'Delete your account',exact:true}).waitFor();
   // Keyboard activation, initial focus, native validation and loading name.
   const send=page.getByRole('button',{name:'Email me a deletion code',exact:true});await send.focus();await page.keyboard.press('Enter');const input=page.getByLabel('Deletion code (required)',{exact:true});await input.waitFor();await page.waitForFunction(()=>document.activeElement?.id==='deletion-code');assert.equal(await input.getAttribute('inputmode'),'numeric');assert.equal(await input.getAttribute('autocomplete'),'one-time-code');checks++;
   const code=mail.at(-1).text.match(/deletion code: (\d{8})/)[1];await input.fill(code==='00000000'?'00000001':'00000000');await page.getByRole('button',{name:'Permanently delete my account',exact:true}).click();await page.locator('#deletion-code-error').filter({hasText:'Request a new deletion code'}).waitFor();assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(db.prepare('SELECT count(*) n FROM members').get().n,1);checks++;
   await page.getByRole('button',{name:'Send a new deletion code',exact:true}).click();await page.locator('#deletion-status').filter({hasText:'Check your email'}).waitFor();assert.equal(mail.length,2);assert.equal(db.prepare('SELECT count(*) n FROM community_deletion_challenges WHERE superseded_at IS NOT NULL').get().n,1);checks++;
   await page.evaluate(()=>localStorage.setItem('opax-chats','private browser cache'));await input.fill(mail.at(-1).text.match(/deletion code: (\d{8})/)[1]);await page.getByRole('button',{name:'Permanently delete my account',exact:true}).click();await page.locator('#community-message').filter({hasText:'Your account and authored content have been deleted'}).waitFor();assert.equal(db.prepare('SELECT count(*) n FROM members').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);assert.equal(await page.evaluate(()=>localStorage.getItem('opax-chats')),null);checks++;
   await page.getByRole('link',{name:'Sign in',exact:true}).first().waitFor();assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
   console.log(`Chromium ${width}px (community ${enabled?'on':'off'}, member ${disabled?'disabled':'enabled'}): deletion code, error/focus, reissue, success/session revocation/cache cleanup, no outbound/overflow passed`);
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close()}
 }
 console.log(`${checks} browser checks passed`);
}finally{await browser.close();rmSync(folder,{recursive:true,force:true})}
