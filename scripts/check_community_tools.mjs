import assert from 'node:assert/strict';
// Run against a preview server. Every account request is mocked; no real keys are created.
// Requires Playwright: optionally set OPAX_PLAYWRIGHT_MODULE to its module path,
// OPAX_BROWSER_EXECUTABLE for a custom browser, and OPAX_BASE for the target site.
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {webkit,chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.OPAX_BASE||'http://localhost:8803';
const fakeKey='opax_'+'a'.repeat(43);
const browserType=process.env.OPAX_BROWSER||'webkit';
const browser=await ({webkit,chromium}[browserType]).launch({headless:true,...(process.env.OPAX_BROWSER_EXECUTABLE?{executablePath:process.env.OPAX_BROWSER_EXECUTABLE}:{})});
async function fixture(width){
 const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});
 const errors=[],requests=[];let keys=[],fail=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.copies=[];window.failClipboard=false;Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{if(window.failClipboard)throw Error('blocked');window.copies.push(value)}}})});
 await page.route('**/api/community/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;requests.push({path,method:request.method(),data:request.postData()});
  if(path.endsWith('/status'))return route.fulfill({json:{enabled:true,member:{id:'layout-preview',name:'Preview',role:'member'},mcp_url:'https://opax.com.au/mcp'}});
  if(path.endsWith('/keys')&&request.method()==='POST'){
   if(fail)return route.fulfill({status:400,json:{error:'Revoke an old key before creating another.'}});
   const key={id:'fake-key',name:request.postDataJSON().name,prefix:fakeKey.slice(0,12),expires_at:Date.now()/1000+90*86400};keys.unshift(key);
   await new Promise(r=>setTimeout(r,150));return route.fulfill({status:201,json:{...key,token:fakeKey}});
  }
  if(path.endsWith('/keys'))return route.fulfill({json:{keys}});
  if(path.endsWith('/keys/fake-key')&&request.method()==='DELETE'){keys[0].revoked_at=Date.now()/1000;return route.fulfill({json:{ok:true}})}
  throw new Error('Unexpected account request: '+path);
 });
 await page.goto(base+'/community?view=tools');await page.getByRole('button',{name:'Create API key',exact:true}).waitFor();
 return {page,errors,requests,setFail:value=>fail=value,setKeys:value=>keys=value};
}
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
for(const width of [320,390,768,1280]){
 const f=await fixture(width),p=f.page;
 await noOverflow(p);
 assert.equal(await p.locator('.setup-intro').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await p.screenshot({path:join(tmpdir(),`opax-tools-before-${browserType}-${width}.png`),fullPage:true});
 await p.getByRole('radio',{name:'Claude Code',exact:true}).focus();
 await p.keyboard.press('ArrowRight');
 assert.equal(await p.getByRole('radio',{name:'Codex',exact:true}).isChecked(),true);
 await p.getByRole('button',{name:'Create API key',exact:true}).click();
 await p.getByRole('heading',{name:'Your API key is ready'}).waitFor();
 assert.equal(f.requests.find(r=>r.method==='POST').data,JSON.stringify({name:'Codex'}));
 assert.equal(await p.locator('#setup-api-key').getAttribute('type'),'password');
 assert.equal(await p.evaluate(()=>document.activeElement.id),'setup-key-ready');
 await p.getByRole('button',{name:'Copy API key',exact:true}).click();
 assert.equal(await p.evaluate(()=>window.copies.at(-1)),fakeKey);
 await p.getByRole('button',{name:'Copy settings with API key'}).click();
 assert.match(await p.evaluate(()=>window.copies.at(-1)),/http_headers = \{ Authorization = "Bearer opax_a+" \}/);
 assert.equal(await p.locator('pre').textContent(),`[mcp_servers.opax]\nurl = "https://opax.com.au/mcp"\nhttp_headers = { Authorization = "Bearer YOUR_OPAX_API_KEY" }`);
 for(const tool of ['Cursor','Claude Code','Other tools']){
  await p.getByRole('radio',{name:tool,exact:true}).check();
  assert.equal(await p.locator('#setup-api-key').inputValue(),fakeKey);
  if(tool==='Cursor'){
   await p.getByRole('button',{name:'Copy settings with API key'}).click();
   const json=JSON.parse(await p.evaluate(()=>window.copies.at(-1)));assert.equal(json.mcpServers.opax.headers.Authorization,'Bearer '+fakeKey);
  }else if(tool==='Claude Code'){
   await p.getByRole('button',{name:'Copy command with API key'}).click();
   assert.equal(await p.evaluate(()=>window.copies.at(-1)),`claude mcp add --scope user --transport http opax https://opax.com.au/mcp --header "Authorization: Bearer ${fakeKey}"`);
  }else{
   await p.getByRole('button',{name:'Copy URL',exact:true}).click();assert.equal(await p.evaluate(()=>window.copies.at(-1)),'https://opax.com.au/mcp');
   await p.getByText('My tool asks for a header instead',{exact:true}).click();
   await p.getByRole('button',{name:'Copy header value'}).click();assert.equal(await p.evaluate(()=>window.copies.at(-1)),'Bearer '+fakeKey);
  }
  await noOverflow(p);
 }
 await p.getByRole('radio',{name:'Claude Code',exact:true}).check();
 await p.screenshot({path:join(tmpdir(),`opax-tools-ready-${browserType}-${width}.png`),fullPage:true});
 // Clipboard fallback is selectable, then cleared by successful copying.
 await p.evaluate(()=>window.failClipboard=true);
 await p.getByRole('button',{name:'Copy command with API key'}).click();
 assert.equal(await p.locator('#setup-copy-fallback').inputValue(),`claude mcp add --scope user --transport http opax https://opax.com.au/mcp --header "Authorization: Bearer ${fakeKey}"`);
 assert.equal(await p.locator('#setup-copy-fallback').evaluate(el=>el.selectionEnd-el.selectionStart),await p.locator('#setup-copy-fallback').evaluate(el=>el.value.length));
 await noOverflow(p);
 await p.evaluate(()=>window.failClipboard=false);
 await p.getByRole('button',{name:'Copy command with API key'}).click();assert.equal(await p.locator('#setup-copy-fallback').count(),0);
 assert.equal(await p.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage)+location.href).then(v=>v.includes(fakeKey)),false);
 await p.reload();await p.getByRole('button',{name:'Create API key',exact:true}).waitFor();assert.equal(await p.locator('#setup-api-key').count(),0);
 await p.getByText('I already have an API key',{exact:true}).click();
 await p.getByLabel('Paste your Opax API key').fill(fakeKey);await p.getByRole('button',{name:'Use this API key'}).click();
 await p.getByRole('heading',{name:'Your API key is ready'}).waitFor();
 assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
 assert.deepEqual(f.errors,[]);
 console.log(JSON.stringify({browser:browserType,width,flow:'create/copy/all-clients/fallback/reload/existing-key',passed:true}));
 await p.close();
}
{
 const f=await fixture(390),p=f.page;
 await p.getByText('I already have an API key',{exact:true}).click();
 await p.getByLabel('Paste your Opax API key').fill('opax_shortened');
 await p.getByRole('button',{name:'Use this API key'}).click();
 await p.getByText('Paste the full Opax API key you saved. It starts with opax_.').waitFor();
 assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
 await p.getByRole('button',{name:'Create API key',exact:true}).click();
 await p.getByRole('heading',{name:'Your API key is ready'}).waitFor();
 await p.getByRole('button',{name:'Show API key',exact:true}).click();
 assert.equal(await p.locator('#setup-api-key').getAttribute('type'),'text');
 await p.getByRole('button',{name:'Hide API key',exact:true}).click();
 assert.equal(await p.locator('#setup-api-key').getAttribute('type'),'password');
 await p.getByText('Manage your API keys',{exact:false}).click();
 await p.getByRole('button',{name:'Remove API key for Claude Code',exact:true}).click();
 await p.getByText('API key removed. Tools using it can no longer connect.').waitFor();
 assert.equal(await p.locator('#setup-api-key').count(),0);
 assert.equal(await p.locator('#setup-instructions pre').count(),0);
 assert.equal(await p.locator('#setup-saved-keys').evaluate(el=>el.open),true);
 assert.deepEqual(f.errors,[]);
 console.log(JSON.stringify({browser:browserType,flow:'invalid-key/show-hide/revoke',passed:true}));await p.close();
}
{
 const f=await fixture(390),p=f.page;f.setFail(true);
 await p.getByRole('button',{name:'Create API key',exact:true}).click();await p.getByText('Revoke an old key before creating another.').waitFor();
 assert.equal(await p.getByRole('button',{name:'Create API key',exact:true}).isEnabled(),true);
 assert.equal(await p.locator('#setup-api-key').count(),0);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'community-message');
 f.setKeys(Array.from({length:3},(_,i)=>({id:String(i),name:'Tool '+i,prefix:'opax_example',expires_at:Date.now()/1000+10000})));
 await p.reload();await p.getByText('You have three active API keys.',{exact:false}).waitFor();
 assert.equal(await p.getByRole('button',{name:'Create API key',exact:true}).count(),0);
 await p.getByRole('link',{name:'Remove an old key'}).click();assert.equal(await p.locator('#setup-saved-keys').evaluate(el=>el.open),true);
 console.log(JSON.stringify({browser:browserType,flow:'failed-request/key-limit',passed:true}));await p.close();
}
await browser.close();
