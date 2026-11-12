// Start: npx wrangler dev --config test/server-html.wrangler.jsonc --port 8915
// Run: PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node test/server-html-browser.mjs
import assert from 'node:assert/strict';
import {paths} from './fixtures/server-html.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const base = process.env.SERVER_HTML_BASE || 'http://localhost:8915';
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
let passed = 0;
try {
  for(const width of [1440,390]) for(const javaScriptEnabled of [false,true]) for(const path of paths) {
    const context = await browser.newContext({viewport:{width,height:900},javaScriptEnabled,reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    // Hold the app until the server answer has painted, then check it survives boot.
    await context.route('**/app.js?*',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue();});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+path,{waitUntil:'domcontentloaded'});
    if(!javaScriptEnabled) await page.waitForLoadState('load');
    const core = page.locator('#prerender[data-record-core]');
    await core.waitFor({state:'visible'});
    await page.evaluate(()=>document.fonts.ready);
    const head = await page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name=description]').content,canonical:document.querySelector('link[rel=canonical]').href}));
    const before = await core.evaluate(el=>({html:el.innerHTML,top:el.getBoundingClientRect().top+scrollY,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
    if(javaScriptEnabled) {
      await page.waitForFunction(()=>document.documentElement.classList.contains('spa-routed'));
      if(path.includes('/recipient/')) {
        await page.waitForSelector('.grant-recipient-records li');
        assert.equal(await page.locator('.grant-recipient-records li').count(),20);
        await page.getByRole('button',{name:'Next',exact:true}).click();
        assert.equal(await page.locator('.grant-recipient-records li').count(),5);
      } else if(path.includes('/agency/')) {
        await page.waitForSelector('.agency-suppliers .ui-row');
        await page.locator('[name="agency-supplier-query"]').fill('Supplier 25');
        assert.equal(await page.locator('.agency-suppliers .ui-row').count(),1);
      } else if(path.startsWith('/subject/topic/')) await page.waitForSelector('.topic-arc-item');
      else await page.waitForSelector('#program-records');
      const after = await core.evaluate(el=>({html:el.innerHTML,top:el.getBoundingClientRect().top+scrollY,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
      assert.equal(after.html,before.html,'Hydration retains the same factual content');
      assert.deepEqual(await page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name=description]').content,canonical:document.querySelector('link[rel=canonical]').href})),head,'Record metadata survives hydration');
      assert.equal(after.top,before.top,'Overview document position is stable');
      assert.equal(after.width,before.width,'Overview width is stable');
      assert.equal(after.height,before.height,'Overview height is stable');
      // Interacting with a list below may intentionally scroll; measure document position.
      assert.ok(await core.isVisible());
    }
    assert.equal(await core.locator('tbody tr').count(),path.includes('/agency/') ? 40 : 20);
    assert.equal(await core.locator('h1').count(),1);
    assert.deepEqual(errors,[],path);
    const layout = await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
      outside:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1&&!el.closest('table')).map(el=>({tag:el.tagName,id:el.id,class:el.className,right:el.getBoundingClientRect().right})).slice(0,12)}));
    assert.ok(layout.width<=layout.viewport,`${path}: ${width}: page fits viewport: ${JSON.stringify(layout)}`);
    if(javaScriptEnabled && path.includes('program=')) {
      await page.locator('#money-records-body .gr-open').first().click();
      await page.waitForFunction(()=>!document.querySelector('#prerender[data-record-core]'));
    }
    passed++;
    console.log(`PASS ${width} ${javaScriptEnabled?'hydrated':'no-JS'} ${path}`);
    await context.close();
  }
} finally { await browser.close(); }
console.log(`server-html-browser: ${passed} journeys passed`);
