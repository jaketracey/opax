import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {tablePrivacyIndex,assertTablePrivacy} from './datatable-privacy.mjs';
import {registerServerCSVContract,assertServerCSVCap} from './datatable-endpoint-contract.mjs';
import {csvRecords} from '../public/server-csv.js';
import {personVoteKeys} from '../public/vote-tables.js';
import {aliasVotingProfiles} from './dt-votes-aliases.mjs';

// Real Worker, assets and local D1. No table response substitution.
const {chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const pub=resolve('public'),out=resolve('private/dt-votes'),base='http://127.0.0.1:8804',phase='after-api';
const read=async path=>JSON.parse(await readFile(pub+'/'+path));
const index=await tablePrivacyIndex(),roster=await read('parliamentarians.json'),records=await read('votes.json');
const person=roster.people.filter(p=>p.pid && records[p.pid]?.name && index.safe(p.name) && index.safe(records[p.pid].name)).sort((a,b)=>(records[b.pid].for?.length || 0)-(records[a.pid].for?.length || 0))[0];
assert.ok(person,'a populated public voting record');
const slug=person.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const cases=[['bill','/bill/au-federal-r7534','#bill-body [data-vote-table]','dv','outcome'],['person','/subject/person/'+slug,'#subject-votes [data-vote-table]','vr','vote'],['hub','/sitting/2026-09-14','.hub-section [data-vote-table]','dv','outcome']];
const samples=[...new Set([...index.donors.slice(0,2),...index.recipients.slice(0,3),...index.recipientABNs.slice(0,3)])];
const privacyResults=[],measurements=[],csvGates=[],aliasChecks=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.OPAX_CHROME || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
let stage='start';
try {
  for(const kind of ['divisions','votes']) {
    let contractPage;
    registerServerCSVContract((name,run)=>csvGates.push({name,run}),{
      name:`Wrangler ${kind}`,
      seed:async rows=>{
        contractPage=await browser.newPage({serviceWorkers:'block'});
        await contractPage.route('**/*',route=>new URL(route.request().url()).origin===base ? route.continue() : route.abort());
        await contractPage.goto(base+'/server-csv.js');
        const params=new URLSearchParams({[kind==='votes' ? 'f.person' : 'f.bill']:'["csv-cap-fixture"]',pageSize:'1'});
        const total=await contractPage.evaluate(async url=>(await (await fetch(url)).json()).total,base+'/api/table/'+kind+'?'+params);
        assert.equal(total,rows.length);
      },
      request:async search=>{
        const url=new URL(base+'/api/table/'+kind+search);url.searchParams.set(kind==='votes' ? 'f.person' : 'f.bill','["csv-cap-fixture"]');
        try {
          // Exercise the same browser transport and continuation consumer as export.
          const exported=await contractPage.evaluate(async url=>{const {readServerCSV}=await import('/server-csv.js');const result=await readServerCSV(url,fetch.bind(window));return {csv:result.csv,headers:[...result.headers]};},url.href);
          return new Response(exported.csv,{headers:exported.headers});
        } finally {await contractPage.close();}
      },
    });
  }
  for(const gate of csvGates){stage=gate.name;await gate.run();console.log(`${gate.name} CSV contract: passed`);}
  for(const width of [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
    await page.route('**/*',route=>new URL(route.request().url()).origin===base ? route.continue() : route.abort());
    await page.addInitScript(()=>{window.privacyEvents=[];addEventListener('opax:analytics',e=>window.privacyEvents.push(e.detail));});
    const responses=[],requests=[],errors=[];
    page.on('pageerror',error=>errors.push(error.name));
    page.on('response',async response=>{
      if (/^\/api\/table\/(divisions|votes)$/.test(new URL(response.url()).pathname)) {
        requests.push({url:new URL(response.url()),status:response.status()});responses.push(await response.text().catch(()=>''));
      }
    });
    for(const [label,path,selector,urlKey,facet] of cases) {
      stage=`${label}-${width}: hydration`;requests.length=0;responses.length=0;errors.length=0;
      const settled=()=>page.waitForFunction(selector=>{const table=document.querySelector(selector)?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !table.hasAttribute('aria-busy');},selector,{timeout:90000});
      const hydration=page.waitForResponse(r=>new URL(r.url()).pathname===(label==='person' ? '/api/table/votes' : '/api/table/divisions'));
      await page.goto(base+path);await hydration;await settled();
      const table=page.locator(selector),initial=requests[0];
      assert.equal(initial.status,200);assert.equal(requests.length,1,'one visible table hydrates');
      if(label==='bill')assert.deepEqual(JSON.parse(initial.url.searchParams.get('f.bill')),['au-federal-r7534']);
      if(label==='person')assert.deepEqual(JSON.parse(initial.url.searchParams.get('f.person')),personVoteKeys(person.name,person.pid,records));
      if(label==='hub')assert.deepEqual(JSON.parse(initial.url.searchParams.get('f.sitting')),['2026-09-14']);
      const data=JSON.parse(responses[0]);
      await table.scrollIntoViewIfNeeded();await page.evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-90),await table.elementHandle());
      await page.screenshot({path:resolve(out,`${phase}-${label}-${width}.png`)});
      measurements.push({label,width,rows:data.total,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      const clientInput=await table.locator('[data-vote-config]').evaluate(el=>JSON.parse(el.textContent));
      if(data.total>0) {
        assert.ok(await table.locator('tbody a').count()>0);
        if(width===390)assert.equal(await table.locator('tbody tr').first().evaluate(el=>getComputedStyle(el).display),'grid');
        if(label!=='person')assert.ok(await table.locator('.ui-status').count()>0);
        stage=`${label}-${width}: search and filters`;
        const searchValue=data.rows[0].title.match(/[\p{L}\p{N}]+/u)[0];
        await table.locator('[data-search]').fill(searchValue);await table.locator('form').evaluate(el=>el.requestSubmit());await settled();
        await page.reload();await settled();assert.equal(await table.locator('[data-search]').inputValue(),searchValue);
        await page.keyboard.press('Escape');await page.keyboard.press('Escape');
        if(await table.locator('[data-clear]').count())await table.locator('[data-clear]').last().click();await settled();
        const value=data.facets[facet]?.[0]?.value;assert.ok(value,'the source supplies category facets');
        await table.locator('[data-panel="filters"] > summary').click();await table.locator(`[data-panel="facet-${facet}"] > summary`).click();
        await table.locator(`[data-facet="${facet}"]`).filter({hasText:value}).first().click();await settled();
        assert.ok(JSON.parse(new URL(page.url()).searchParams.get(urlKey+'.f.'+facet)).includes(value));
        await page.keyboard.press('Escape');await page.keyboard.press('Escape');
        if(await table.locator('[data-clear]').count())await table.locator('[data-clear]').last().click();await settled();
        if(width===1280)await table.locator('[data-sort="date"]').click();else await table.locator('[data-sort-select]').selectOption('date:asc');await settled();
        if(data.total>25){await table.locator('[data-page="2"]').click();await settled();assert.equal(requests.at(-1).url.searchParams.get('page'),'2');}
        stage=`${label}-${width}: actual CSV`;
        const pending=page.waitForEvent('download');await table.locator('[data-export]').click();const download=await pending;
        const csvPath=resolve(out,`${phase}-${label}-${width}.csv`);await download.saveAs(csvPath);
        assert.ok((await page.evaluate(()=>window.privacyEvents)).some(e=>e.event==='table_export'));
        assert.ok(requests.some(r=>r.url.searchParams.get('format')==='csv'));
        const check=async()=>assertTablePrivacy({clientInput,serverResponses:responses,csvPath,url:decodeURIComponent(page.url()),renderedText:await table.innerHTML(),accessibleText:await table.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
        await check();
        for(const value of samples)for(const kind of ['q','facet']) {
          stage=`${label}-${width}: rejected ${kind}`;
          await page.evaluate(({value,key,facet,kind})=>{const url=new URL(location.href);url.searchParams.set(kind==='q' ? key+'.q' : key+'.f.'+facet,kind==='q' ? value : JSON.stringify([value]));url.searchParams.set('campaign','local');history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate'));},{value,key:urlKey,facet,kind});
          assert.ok(index.safe(await table.innerHTML()),'pending state is private');await settled();
          assert.equal(await table.locator('.dt-count').textContent(),'Showing 0–0 of 0');
          assert.equal(await table.locator('[data-export]').isDisabled(),true,'rejected state cannot download a CSV');await check();
          if(kind==='q') {
            const initialURL=new URL(base+path);initialURL.searchParams.set(urlKey+'.q',value);
            await page.goto(initialURL.href);await settled();await page.waitForLoadState('networkidle');await settled();
            assert.equal(await table.locator('.dt-count').textContent(),'Showing 0–0 of 0');
            assert.equal(await table.locator('[data-export]').isDisabled(),true,'initial URL rejection survives hydration');await check();
          }
          await page.goto(base+path);await settled();
        }
        privacyResults.push({label,width,surfaces:7,derivedValues:index.values.length,recipientNames:index.recipients.length,recipientABNs:index.recipientABNs.length,queryCases:samples.length*3});
      } else {
        assert.equal(await table.locator('[data-export]').isDisabled(),true);assert.equal(await table.locator('.dt-count').textContent(),'Showing 0–0 of 0');
      }
      assert.deepEqual(errors,[]);console.log(`${phase} ${label} ${width}: passed`);
    }
    if(width===1280) {
      const profiles=aliasVotingProfiles(roster,records,index.safe);
      assert.equal(profiles.length,2,'both affected alias profiles must be covered');
      for(const [number,profile] of profiles.entries()) {
        stage=`alias profile ${number+1}: SSR, hydration and actual CSV`;
        const aliasSlug=profile.person.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        const pendingResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/table/votes' && new URL(r.url()).searchParams.get('format')!=='csv');
        await page.goto(base+'/subject/person/'+aliasSlug);
        const response=await pendingResponse,data=await response.json();
        const table=page.locator('#subject-votes [data-vote-table]');
        await page.waitForFunction(()=>document.querySelector('#subject-votes .dt-count') && !document.querySelector('#subject-votes [data-datatable]').hasAttribute('aria-busy'));
        assert.deepEqual(JSON.parse(new URL(response.url()).searchParams.get('f.person')),profile.keys,'hydration keeps every alias ID');
        assert.equal(data.total,14);
        const ssr=page.locator('#prerender [data-vote-table] tbody tr');
        assert.equal(await ssr.count(),14,'SSR count');
        assert.equal(await table.locator('tbody tr').count(),14,'hydrated count');
        assert.deepEqual((await table.locator('tbody tr').allTextContents()).sort(),(await ssr.allTextContents()).sort(),'SSR and hydrated records agree');
        const pending=page.waitForEvent('download');await table.locator('[data-export]').click();const download=await pending;
        const csvPath=resolve(out,`alias-profile-${number+1}.csv`);await download.saveAs(csvPath);
        const exported=csvRecords(await readFile(csvPath,'utf8')).slice(1);
        assert.equal(exported.length,14,'actual CSV count');
        for(const row of data.rows)assert.ok(exported.some(record=>record.startsWith(row.id+',')),'actual CSV includes every hydrated record');
        assert.ok(index.safe(await readFile(csvPath,'utf8')));
        aliasChecks.push({profile:number+1,ssr:14,hydrated:14,csv:14});
        console.log(`alias profile ${number+1}: 14 SSR, hydrated and exported rows`);
      }
      const bundled=await build({entryPoints:[resolve('src/hubs.ts')],bundle:true,write:false,platform:'node',format:'esm'});
      const {renderSittingWeek}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
      const hubs=await read('hubs/index.json'),week=hubs.weeks.find(w=>w.start==='2026-09-14');
      for(const value of [index.donors[0],index.recipients[0],index.recipientABNs[0]]) {
        stage='filtered JSON-LD hydration';
        const rendered=renderSittingWeek(hubs,{...week,bills:[],divisions:[{key:'private-probe',slug:'private-probe',stage:value,date:week.start,house:'senate'}]},[],new Map(),'2026-10-11',{}, {},index.safe);
        assert.ok(index.safe(rendered.html));assert.ok(index.safe(JSON.stringify(rendered.jsonLd)));
        await page.goto(base+'/sitting/'+week.start);
        await page.evaluate(({html,jsonLd})=>{document.querySelector('#prerender').outerHTML=html;document.querySelector('script[type="application/ld+json"]').textContent=JSON.stringify(jsonLd);},{html:rendered.html,jsonLd:rendered.jsonLd});
        await page.waitForFunction(()=>document.querySelector('[data-vote-table] [data-datatable] .dt-count')?.textContent==='Showing 0–0 of 0' && !document.querySelector('[data-vote-table] [data-datatable]').hasAttribute('aria-busy'));
        assert.ok(index.safe(await page.locator('[data-vote-table]').innerHTML()));assert.ok(index.safe(await page.locator('script[type="application/ld+json"]').textContent()));
      }
      for(const kind of ['divisions','votes']) {
        stage=kind+' actual capped CSV';
        await page.evaluate(async kind=>{const module=await import(document.querySelector('script[src^="/vote-tables.js"]').src),{mountDataTable}=await import('/datatable.js');const config=kind==='votes' ? module.voteTableConfig('csv-cap-fixture') : module.divisionTableConfig({bill:'csv-cap-fixture'});config.id='cap-'+kind;config.urlKey='cap';const host=document.createElement('div');host.id='cap';document.body.append(host);window.capHandle=mountDataTable(host,config);},kind);
        const cap=page.locator('#cap');await page.waitForFunction(()=>document.querySelector('#cap .dt-count')?.textContent.includes('of 50,001') && !document.querySelector('#cap').hasAttribute('aria-busy'),{},{timeout:120000});
        const pending=page.waitForEvent('download',{timeout:180000});await cap.locator('[data-export]').click();const download=await pending;
        const csvPath=resolve(out,`${phase}-${kind}-cap.csv`);await download.saveAs(csvPath);assertServerCSVCap(await readFile(csvPath,'utf8'));
        assert.equal(await cap.locator('.dt-count').textContent(),'Export limited to 50,000 rows. Narrow the filters to export more.');
        await assertTablePrivacy({clientInput:[],serverResponses:responses,csvPath,url:decodeURIComponent(page.url()),renderedText:await cap.innerHTML(),accessibleText:await cap.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
        await page.evaluate(()=>{window.capHandle.destroy();document.querySelector('#cap').remove();});
      }
    }
    await page.close();
  }
  assert.ok(measurements.every(m=>!m.overflow));
  await writeFile(resolve(out,`${phase}-measurements.json`),JSON.stringify({server:'wrangler dev --local / real D1',coreSHA:createHash('sha256').update(await readFile(pub+'/datatable.js')).digest('hex'),privacy:privacyResults,measurements,aliasChecks,csvContracts:csvGates.length,jsonLdChecks:3},null,2)+'\n');
} catch(error) {console.error(JSON.stringify({stage,type:error.name,message:index.safe(error.message) ? error.message : 'private details omitted'}));process.exitCode=1;} finally {await browser.close();}
