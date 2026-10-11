import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseQuery} from '../public/datatable.js';
import {tablePrivacyIndex, assertTablePrivacy} from './datatable-privacy.mjs';
// Run through dt-votes-dev.mjs inside unshare -rn. Wrangler serves the real core.
// Only the local fixture entry replaces table APIs until DT-api merges.
const {chromium} = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const pub = resolve(new URL('../public/',import.meta.url).pathname);
const out = resolve(new URL('../private/dt-votes/',import.meta.url).pathname);
const phase = 'after-wrangler';
const base = 'http://127.0.0.1:8804';
const meta = await (await fetch(base+'/__fixtures/table/meta')).json();
const index = await tablePrivacyIndex();
const privacyResults = [];
await mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.OPAX_CHROME || '/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
const measurements = [];
try {
  for (const width of [390,1280]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
    const settled = () => page.waitForFunction(selector => !document.querySelector(selector).querySelector('[data-datatable]').hasAttribute('aria-busy'), activeSelector);
    let activeSelector;
    const requests = [];
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const responses = [];
    page.on('response', async response => {
      const path = new URL(response.url()).pathname;
      if (/^\/api\/table\/(divisions|votes)$/.test(path)) {
        requests.push(new URL(response.url()));
        responses.push(await response.text().catch(() => ''));
      }
    });
    await page.addInitScript(() => {
      window.privacyEvents = [];
      addEventListener('opax:analytics', event => window.privacyEvents.push(event.detail));
    });
    for (const [label,path,selector] of [['bill','/bill/au-federal-r7534','#bill-body [data-vote-table]'],['person','/subject/person/'+meta.slug,'#subject-votes [data-vote-table]'],['hub','/sitting/2026-09-14','.hub-section [data-vote-table]']]) {
      activeSelector = selector;
      requests.length = 0; errors.length = 0;
      const hydration = page.waitForResponse(response => new URL(response.url()).pathname === (label === 'person' ? '/api/table/votes' : '/api/table/divisions'));
      await page.goto(base+path);
      await hydration;
      const table = page.locator(selector);
      await table.waitFor({timeout:45000});
        await page.waitForFunction(selector=>{const root=document.querySelector(selector)?.querySelector('[data-datatable]');return root?.querySelector('.dt-count') && !root.hasAttribute('aria-busy');},selector);
        assert.ok(requests.length>0,'Server hydration must request its source');
        assert.equal(requests.length,1,'Hidden crawlable tables must not also hydrate');
        const initial = requests.at(-1);
        assert.equal(initial.pathname,label==='person'?'/api/table/votes':'/api/table/divisions');
        if (label==='bill') assert.equal(initial.searchParams.get('bill'),'au-federal-r7534');
        if (label==='person') assert.equal(initial.searchParams.get('person'),meta.pid);
        if (label==='hub') for (const [key,value] of Object.entries({jurisdiction:'federal',start:'2026-09-14',end:'2026-09-17'})) assert.equal(initial.searchParams.get(key),value);
      await table.scrollIntoViewIfNeeded();
      await page.evaluate(el=>window.scrollBy(0,el.getBoundingClientRect().top-90),await table.elementHandle());
      await page.waitForTimeout(200);
      await page.screenshot({path:resolve(out,`${phase}-${label}-${width}.png`)});
      measurements.push({phase,label,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
        assert.ok(await table.locator('tbody a').count()>0);
        if (label!=='person') assert.ok(await table.locator('.ui-status').count()>0);
        if (width===390) {
          assert.equal(await table.locator('tbody tr').first().evaluate(el=>getComputedStyle(el).display),'grid');
          if (label!=='person') {
            assert.equal(await table.locator('[data-prominent]').first().getAttribute('data-label'),'Ayes');
            assert.equal(await table.locator('[data-prominent]').first().evaluate(el=>getComputedStyle(el).gridRowStart),'2');
          }
        }
        const search = table.locator('input[type="search"]');
        await search.fill(label==='person'?'Recorded bill 1':'Second reading');
        const urlKey = label==='person'?'vr':'dv';
        await page.waitForFunction(key=>new URL(location.href).searchParams.has(key+'.q'),urlKey);
        await settled();
        assert.ok(requests.at(-1).searchParams.get('q'));
        const shared = page.url();
        await page.reload();
        await table.waitFor();
        await page.waitForFunction(({selector,value}) => document.querySelector(selector)?.querySelector('[data-search]')?.value === value && !document.querySelector(selector).querySelector('[data-datatable]').hasAttribute('aria-busy'),{selector,value:new URL(shared).searchParams.get(urlKey+'.q')});
        assert.equal(await search.inputValue(),new URL(shared).searchParams.get(urlKey+'.q'));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        if (await table.locator('[data-clear]').count()) await table.locator('[data-clear]').last().click();
        await page.waitForFunction(key=>!new URL(location.href).searchParams.has(key+'.q'),urlKey);
        await settled();
        const facetKey = label==='person'?'vote':'outcome';
        const facetValue = label==='person'?'Aye':'Agreed';
        await table.locator('[data-panel="filters"] > summary').click();
        await table.locator(`[data-panel="facet-${facetKey}"] > summary`).click();
        await table.locator(`[data-facet="${facetKey}"][data-value="${facetValue}"]`).click();
        await page.waitForFunction(([key,field,value])=>JSON.parse(new URL(location.href).searchParams.get(key+'.f.'+field)||'[]').includes(value),[urlKey,facetKey,facetValue]);
        await settled();
        assert.ok(parseQuery(requests.at(-1).searchParams).filters[facetKey].includes(facetValue));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        if (await table.locator('[data-clear]').count()) await table.locator('[data-clear]').last().click();
        await settled();
        if (width===1280) await table.locator('[data-sort="date"]').click();
        else await table.locator('[data-sort-select]').selectOption('date:asc');
        await page.waitForFunction(key=>new URL(location.href).searchParams.get(key+'.sort')==='date:asc',urlKey);
        await settled();
        if (label!=='hub') {
          await table.locator('[data-page="2"]').click();
          await page.waitForFunction(key=>new URL(location.href).searchParams.get(key+'.page')==='2',urlKey);
          await settled();
          assert.equal(requests.at(-1).searchParams.get('page'),'2');
        }
        const downloadPromise = page.waitForEvent('download');
        await table.locator('[data-export]').click();
        const download = await downloadPromise;
        const csv = await readFile(await download.path(),'utf8');
        assert.ok(csv.split('\n').length>25 || label==='hub');
        assert.equal(requests.at(-1).searchParams.get('format'),'csv');
        assert.ok((await page.evaluate(() => window.privacyEvents)).some(event => event.event === 'table_export'),'Privacy gate must inspect actual export analytics');
        const csvPath = resolve(out, `${phase}-${label}-${width}.csv`);
        await download.saveAs(csvPath);
        const clientInput = await page.evaluate(async () => {
          const module = await import(document.querySelector('script[src^="/vote-tables.js"]').src);
          return {columns:[module.divisionColumns,module.voteColumns],config:JSON.parse(document.querySelector('[data-vote-config]').textContent)};
        });
        const privacy = async path => assertTablePrivacy({clientInput,serverResponses:responses,csvPath:path,
          url:decodeURIComponent(page.url()),renderedText:await table.innerHTML(),accessibleText:await table.ariaSnapshot(),analytics:await page.evaluate(() => window.privacyEvents)},index);
        await privacy(csvPath);
        const sample = index.values.filter((_,i) => i % Math.max(1,Math.floor(index.values.length/8)) === 0).slice(0,8);
        for (const value of sample) for (const kind of ['q','facet']) {
          await page.evaluate(({value,kind,key,facet}) => {
            const url = new URL(location.href);
            url.searchParams.set(kind === 'q' ? key+'.q' : key+'.f.'+facet, kind === 'q' ? value : JSON.stringify([value]));
            url.searchParams.set('campaign','fixture');
            history.replaceState(null,'',url); dispatchEvent(new PopStateEvent('popstate'));
          },{value,kind,key:urlKey,facet:facetKey});
          assert.ok(index.safe(await table.innerHTML()), 'Pending state must not reflect withheld text');
          await page.waitForFunction(selector => !document.querySelector(selector).querySelector('[data-datatable]').hasAttribute('aria-busy'),selector);
          if (kind === 'q') {
            await table.locator('[data-search]').fill(value);
            await table.locator('form').evaluate(el => el.requestSubmit());
            await settled();
            assert.equal(await table.locator('.dt-count').textContent(),'Showing 0–0 of 0');
            // The rejected search must download headers only, not old rows.
            const rejectedDownload = page.waitForEvent('download');
            await table.locator('[data-export]').click();
            const rejected = await rejectedDownload;
            const rejectedPath = resolve(out,`${phase}-${label}-${width}-rejected.csv`);
            await rejected.saveAs(rejectedPath);
            assert.equal((await readFile(rejectedPath,'utf8')).trim().split('\n').length,1);
            await privacy(rejectedPath);
          } else await privacy(csvPath);
          assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');
          await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        if (await table.locator('[data-clear]').count()) await table.locator('[data-clear]').last().click();
          await page.waitForFunction(selector => !document.querySelector(selector).querySelector('[data-datatable]').hasAttribute('aria-busy'),selector);
        }
        // An unsafe initial URL must also be cleaned after a full SSR load.
        const reloadUrl = new URL(page.url()); reloadUrl.searchParams.set(urlKey+'.q',sample[0]);
        await page.goto(reloadUrl.href); await table.waitFor();
        await page.waitForFunction(selector => !document.querySelector(selector).querySelector('[data-datatable]').hasAttribute('aria-busy') && document.querySelector(selector).querySelector('.dt-count').textContent === 'Showing 0–0 of 0',selector);
        await privacy(csvPath);
        privacyResults.push({table:label,width,withheldValues:index.values.length,queryCases:sample.length*2+1,surfaces:7});
      assert.deepEqual(errors,[]);
      console.log(`${phase} ${label} ${width}: passed`);
    }
    if (width === 1280) for (const kind of ['divisions','votes']) {
      console.log(`Checking ${kind} CSV cap under Wrangler`);
      await page.evaluate(async ({kind,pid}) => {
        const module = await import(document.querySelector('script[src^="/vote-tables.js"]').src);
        const {mountDataTable} = await import('/datatable.js');
        const config = kind === 'votes' ? module.voteTableConfig(pid) : module.divisionTableConfig();
        config.id = `cap-${kind}`; config.urlKey = 'cap'; config.source.params.fixture = 'cap';
        const host = document.createElement('div'); host.id = 'cap'; document.body.append(host);
        window.capHandle = mountDataTable(host,config);
      },{kind,pid:meta.pid});
      const cap = page.locator('#cap');
      await page.waitForFunction(() => document.querySelector('#cap .dt-count')?.textContent.includes('of 50,003') && !document.querySelector('#cap').hasAttribute('aria-busy'),{},{timeout:120000});
      const downloadPromise = page.waitForEvent('download',{timeout:120000});
      await cap.locator('[data-export]').click();
      const download = await downloadPromise, csvPath = resolve(out,`${phase}-${kind}-cap.csv`);
      await download.saveAs(csvPath);
      assert.equal((await readFile(csvPath,'utf8')).trim().split('\n').length,50001);
      assert.equal(await cap.locator('.dt-count').textContent(),'Export limited to 50,000 rows. Narrow the filters to export more.');
      await assertTablePrivacy({clientInput:[],serverResponses:responses,csvPath,url:decodeURIComponent(page.url()),renderedText:await cap.innerHTML(),accessibleText:await cap.ariaSnapshot(),analytics:await page.evaluate(() => window.privacyEvents)},index);
      await page.evaluate(() => {window.capHandle.destroy(); document.querySelector('#cap').remove();});
    }
    await page.close();
  }
} finally {await browser.close();}
await writeFile(resolve(out,`${phase}-measurements.json`),JSON.stringify({server:'wrangler dev --local',coreSHA:createHash('sha256').update(await readFile(pub+'/datatable.js')).digest('hex'),privacy:privacyResults,measurements},null,2)+'\n');
assert.ok(measurements.every(m=>!m.overflow),'Tables must fit both viewport widths');
