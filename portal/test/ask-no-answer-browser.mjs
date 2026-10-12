// Run after ask-no-answer-prepare.mjs and local Wrangler with
// --config test/fixtures/ask-no-answer-wrangler.jsonc --local.
// Worker generation is stubbed; the browser refuses external requests.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {question, speaker} from './fixtures/ask-no-answer.mjs';
const {chromium} = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://127.0.0.1:8793';
const output = fileURLToPath(new URL('../private/ask-no-answer/', import.meta.url));
await mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.OPAX_BROWSER_EXECUTABLE || undefined});
const proof = [];
try {
 for (const surface of ['ask','chat']) for (const width of [390,820,1440]) for (const mode of ['declined','grounding_failed','answered']) {
  const page = await browser.newPage({viewport:{width,height:960},userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',reducedMotion:'reduce'});
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.origin !== origin) return route.abort();
   if (url.pathname === '/api/ask') {
    requests.push(route.request().postDataJSON());
    return route.continue({headers:{...route.request().headers(), 'x-fixture-case':mode}});
   }
   if (url.pathname === '/api/person-slugs') return route.continue();
   if (url.pathname === '/api/speakers') return route.fulfill({json:[[speaker,1]]});
   if (url.pathname === '/api/stats') return route.fulfill({json:{total:1,kinds:{speech:1},states:{federal:1}}});
   if (url.pathname === '/api/followups') return route.fulfill({json:{questions:[]}});
   if (url.pathname === '/api/search' || url.pathname === '/api/search-all') return route.fulfill({json:{total:1,results:[{resource:'fixture',slug:'speech-90000',title:'Fixture housing debate',kind:'speech',speaker,snippet:'Synthetic record for local QA.'}]}});
   if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/community/')) return route.fulfill({json:{account:null,user:null,enabled:false,items:[],chats:[]}});
   return route.continue();
  });
  await page.goto(origin+'/'+surface, {waitUntil:'networkidle'});
  await page.waitForFunction(() => typeof runAsk === 'function');
  if (surface==='ask') {
   await page.locator('#ask-input').fill(question);
   await page.locator('#ask-submit').click();
  } else {
   await page.evaluate(({speaker,question})=>askSpeakerInConversation(speaker,question),{speaker,question});
  }
  const answer = surface==='ask' ? page.locator('#ask-result') : page.locator('.chat-turn-answer').last();
  await answer.waitFor();
  if (mode === 'answered') {
   assert.ok((await answer.innerText()).includes('She called for scrutiny of housing proposals.'));
   assert.equal(await page.evaluate(() => {
    const a=document.createElement('div'),b=document.createElement('div');
    a.askEvidence=b.askEvidence=[];
    renderAnswer(a,'A normal answer.',{});renderAnswer(b,'A normal answer.',{answered:true});
    return a.outerHTML===b.outerHTML;
   }),true);
  } else {
   await answer.getByText("OPAX couldn't find a clear answer to this in the record.",{exact:true}).waitFor();
   assert.equal(await answer.locator('.ui-machine').count(),0);
   assert.equal(await answer.getByRole('link',{name:'Melissa McIntosh’s page'}).getAttribute('href'),'/subject/person/melissa-mcintosh');
   assert.ok((await answer.innerText()).includes('Fixture housing debate'));
   assert.equal(await answer.locator(surface==='ask' ? '#ask-sources' : '.chat-sources').evaluate(el=>el.open),true);
   assert.ok(!(await answer.innerText()).includes('fabricated'));
   if(surface==='chat') {
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.chat-turn-answer').last().getByText("OPAX couldn't find a clear answer to this in the record.",{exact:true}).waitFor();
    assert.equal(await page.locator('.chat-turn-answer').last().locator('.ui-machine').count(),0);
   }

  }
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  const shot=resolve(output,`${surface==='ask'?'':'chat-'}${mode}-${width}.png`);
  await page.screenshot({path:shot,fullPage:true});
  proof.push({surface,width,mode,shot,ask_requests:requests.length,errors});
  await page.close();
 }
 await writeFile(resolve(output,'browser-proof.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify(proof));
} finally {await browser.close()}
