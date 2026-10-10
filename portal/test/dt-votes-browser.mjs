import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {divisions, votes, hubDivisions} from './fixtures/dt-votes.mjs';

// Run inside unshare -rn. Every local request is fulfilled from disk or fixtures;
// non-local hosts are also blocked by Chrome's resolver and request interception.
const {chromium} = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const pub = resolve(new URL('../public/',import.meta.url).pathname);
const out = resolve(new URL('../private/dt-votes/',import.meta.url).pathname);
const core = process.env.OPAX_DT_CORE_DIR;
const phase = core ? 'after-core' : 'after';
await mkdir(out,{recursive:true});
const overrides = core ? Object.fromEntries(await Promise.all(['datatable.js','datatable.css'].map(async name=>[name,await readFile(resolve(core,name))]))) : {};
const coreReady = !String(overrides['datatable.js'] || await readFile(pub+'/datatable.js')).includes('STUB');
const compiled = await build({stdin:{contents:`export * from './src/hubs.ts'; export * from './public/vote-tables.js'; export {applyQuery,parseQuery,toCSV} from './public/datatable.js';`,resolveDir:resolve(pub,'..'),loader:'js'},bundle:true,platform:'node',format:'esm',write:false,
  plugins:core ? [{name:'local-core-preview',setup(b){b.onLoad({filter:/\/datatable\.js$/},()=>({contents:overrides['datatable.js'].toString(),loader:'js',resolveDir:pub}));}}] : []});
const renderer = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const hubData = JSON.parse(await readFile(pub+'/hubs/index.json','utf8'));
const week = {...hubData.weeks[0],bills:[],divisions:hubDivisions};
let hubHTML = await readFile(pub+'/index.html','utf8');
hubHTML = hubHTML.replace(/<script\b[^>]*src="\/(?:app|spa-entry|spa-shell)\.js[^\"]*"[^>]*><\/script>/g,'')
  .replace(/<main\b[^>]*>[\s\S]*?<\/main>/,'<main id="main">'+renderer.renderSittingWeek(hubData,week,[],new Map(),'2026-10-10').html+'</main>')
  .replace('</head>','<link rel="stylesheet" href="/hubs.css"></head>');
const voteData = JSON.parse(await readFile(pub+'/votes.json','utf8'));
const roster = JSON.parse(await readFile(pub+'/parliamentarians.json','utf8'));
const member = roster.people.find(p=>p.pid && voteData[p.pid]?.for?.length>=6);
assert.ok(member);
const slug = member.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const ssrShells = new Map();
for (const [path, config, rows] of [
  ['/bill/au-federal-r7534',renderer.divisionTableConfig({bill:'au-federal-r7534'}),renderer.divisionRows(divisions)],
  ['/subject/person/'+slug,renderer.voteTableConfig(member.pid),renderer.votingRows(votes)],
]) {
  config.id += '-ssr';
  const table = renderer.voteTableHTML(config,renderer.voteTablePage(rows,config));
  const shell = await readFile(pub+'/index.html','utf8');
  ssrShells.set(path,shell.replace(/<main\b[^>]*>[\s\S]*?<\/main>/,'<main id="main" data-server-rendered><section id="prerender"><h1>Fixture</h1>'+table+'</section></main>'));
}
const base = 'http://127.0.0.1:8804';
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const browser = await chromium.launch({executablePath:process.env.OPAX_CHROME || '/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
const measurements = [];
try {
  for (const width of [390,1280]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
    const requests = [];
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (/^\/api\/table\/(divisions|votes)$/.test(url.pathname)) {
        requests.push(url);
        const isVote = url.pathname.endsWith('/votes');
        const config = isVote ? renderer.voteTableConfig(member.pid) : renderer.divisionTableConfig({},'Divisions');
        const rows = isVote ? renderer.votingRows(votes) : renderer.divisionRows(url.searchParams.has('start') ? hubDivisions : divisions);
        const query = renderer.parseQuery(url.searchParams);
        if (url.searchParams.get('format') === 'csv') {
          const all = renderer.applyQuery(rows,config,{...query,page:1,pageSize:50000});
          return route.fulfill({contentType:'text/csv',body:renderer.toCSV(all.rows,config)});
        }
        return route.fulfill({contentType:'application/json',body:JSON.stringify(renderer.applyQuery(rows,config,query))});
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ingest/')) return route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname==='/api/stats'?{total:0,collections:[]}:{results:[],total:0})});
      if (url.pathname === '/sitting/2026-09-14') return route.fulfill({contentType:'text/html',body:hubHTML});
      if (ssrShells.has(url.pathname)) return route.fulfill({contentType:'text/html',body:ssrShells.get(url.pathname)});
      const path = extname(url.pathname) ? url.pathname : '/index.html';
      const file = resolve(pub,'.'+decodeURIComponent(path));
      assert.ok(file.startsWith(pub+sep));
      try {return route.fulfill({contentType:mime[extname(path)] || 'application/octet-stream',body:overrides[path.slice(1)] || await readFile(file)});}
      catch {return route.fulfill({status:404,body:''});}
    });
    for (const [label,path,selector] of [['bill','/bill/au-federal-r7534','#bill-body [data-vote-table]'],['person','/subject/person/'+slug,'#subject-votes [data-vote-table]'],['hub','/sitting/2026-09-14','.hub-section [data-vote-table]']]) {
      requests.length = 0; errors.length = 0;
      await page.goto(base+path);
      const table = page.locator(selector);
      await table.waitFor({timeout:45000});
      if (coreReady) {
        await page.waitForFunction(()=>document.querySelector('.dt-count')?.textContent.includes('of 64') || document.querySelector('.dt-count')?.textContent.includes('of 4'));
        assert.ok(requests.length>0,'Server hydration must request its source');
        assert.equal(requests.length,1,'Hidden crawlable tables must not also hydrate');
        const initial = requests.at(-1);
        assert.equal(initial.pathname,label==='person'?'/api/table/votes':'/api/table/divisions');
        if (label==='bill') assert.equal(initial.searchParams.get('bill'),'au-federal-r7534');
        if (label==='person') assert.equal(initial.searchParams.get('person'),member.pid);
        if (label==='hub') for (const [key,value] of Object.entries({jurisdiction:'federal',start:week.start,end:week.end})) assert.equal(initial.searchParams.get(key),value);
      }
      await table.scrollIntoViewIfNeeded();
      await page.evaluate(el=>window.scrollBy(0,el.getBoundingClientRect().top-90),await table.elementHandle());
      await page.waitForTimeout(200);
      await page.screenshot({path:resolve(out,`${phase}-${label}-${width}.png`)});
      measurements.push({phase,label,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      if (coreReady) {
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
        await page.waitForTimeout(400);
        assert.ok(requests.at(-1).searchParams.get('q'));
        const shared = page.url();
        await page.reload();
        await table.waitFor();
        await page.waitForTimeout(600);
        assert.equal(await search.inputValue(),new URL(shared).searchParams.get(urlKey+'.q'));
        await table.locator('[data-clear]').click();
        await page.waitForFunction(key=>!new URL(location.href).searchParams.has(key+'.q'),urlKey);
        await page.waitForTimeout(400);
        const facetKey = label==='person'?'vote':'outcome';
        const facetValue = label==='person'?'Aye':'Agreed';
        await table.locator(`[data-panel="facet-${facetKey}"] summary`).click();
        await table.locator(`[data-facet="${facetKey}"][data-value="${facetValue}"]`).click();
        await page.waitForFunction(([key,field,value])=>JSON.parse(new URL(location.href).searchParams.get(key+'.f.'+field)||'[]').includes(value),[urlKey,facetKey,facetValue]);
        await page.waitForTimeout(400);
        assert.ok(renderer.parseQuery(requests.at(-1).searchParams).filters[facetKey].includes(facetValue));
        await table.locator('[data-clear]').click();
        await page.waitForTimeout(400);
        if (width===1280) await table.locator('[data-sort="date"]').click();
        else await table.locator('[data-sort-select]').selectOption('date:asc');
        await page.waitForFunction(key=>new URL(location.href).searchParams.get(key+'.sort')==='date:asc',urlKey);
        await page.waitForTimeout(400);
        if (label!=='hub') {
          await table.locator('[data-page="2"]').click();
          await page.waitForFunction(key=>new URL(location.href).searchParams.get(key+'.page')==='2',urlKey);
          await page.waitForTimeout(400);
          assert.equal(requests.at(-1).searchParams.get('page'),'2');
        }
        const downloadPromise = page.waitForEvent('download');
        await table.locator('[data-export]').click();
        const download = await downloadPromise;
        const csv = await readFile(await download.path(),'utf8');
        assert.ok(csv.split('\n').length>25 || label==='hub');
        assert.equal(requests.at(-1).searchParams.get('format'),'csv');
      }
      assert.deepEqual(errors,[]);
      console.log(`${phase} ${label} ${width}: passed`);
    }
    await page.close();
  }
} finally {await browser.close();}
await writeFile(resolve(out,`${phase}-measurements.json`),JSON.stringify({coreReady,coreSHA:core?createHash('sha256').update(overrides['datatable.js']).digest('hex'):null,measurements},null,2)+'\n');
assert.ok(measurements.every(m=>!m.overflow),'Tables must fit both viewport widths');
