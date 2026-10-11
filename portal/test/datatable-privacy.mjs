// Shared rollout gate. Names are read at run time; failure messages contain counts only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MONEY_GRAPHS,withheldPhrases,namesWithheldPhrase} from '../public/donor-entity.js';
import {privacySourceGraphs} from '../../scripts/withhold_donor_assets.mjs';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableIdentityIndex as registryIdentityIndex} from '../../scripts/load_tables.mjs';
import {tablePrivacyCheckFrom} from '../src/table-privacy.ts';
import {isOrganisationRecipient} from '../public/recipient-entity.js';
const read=async path=>JSON.parse(await readFile(new URL(`../public${path}`,import.meta.url),'utf8'));
let pendingIndex;
export async function tablePrivacyIndex() {
 pendingIndex ||= (async()=>{
  const sharedSafe=await tablePrivacyCheckFrom(read),blocked=value=>!sharedSafe(String(value));
  const approved=new Map();let approvedBytes=0;
  const safe=value=>{
    const text=String(value);
    if(approved.has(text))return true;
    if(blocked(text))return false;
    const bytes=text.length*2;
    if(bytes<=262144){
      while(approved.size>=1024 || approvedBytes+bytes>8388608){const first=approved.keys().next().value;approvedBytes-=first.length*2;approved.delete(first);}
      approved.set(text,true);approvedBytes+=bytes;
    }
    return true;
  };
  // Raw values are derived only for negative probes, never for the guard.
  const policy=await registryIdentityIndex(),source=sourceTableDonorIdentities(),donors=[...new Set([...source.labels,...source.identifiers])],grantValues=new Set();
  for(const jur of ['federal','qld']) {
   const graph=await read(`/graph/grants.${jur}.json`);
   for(const recipient of graph.recipients.filter(r=>!isOrganisationRecipient(r)))for(const value of [recipient.n,...(recipient.aliases||[])])if(value)grantValues.add(value);
   for(const sh of new Set(graph.recipients.map(r=>r.sh).filter(Number.isInteger)))for(const recipient of Object.values(await read(`/grants/${jur}/shard-${String(sh).padStart(2,'0')}.json`)))if(!isOrganisationRecipient(recipient))for(const value of [recipient.n,recipient.abn,recipient.abr?.abn])if(value)grantValues.add(String(value));
  }
  const roster=await read('/parliamentarians.json'),access=await read('/access.json');
  const exempt=withheldPhrases(privacySourceGraphs(),[...roster.people.flatMap(p=>[p.name,p.full||'']),...Object.values(access.ministers||{}).map(m=>m.name)]);
  const officeValues=source.labels.filter(value=>!namesWithheldPhrase(exempt,`donor receipts ${value}`) && !safe(value));
  const samples=donors.filter((_,i)=>i%Math.max(1,Math.floor(donors.length/8))===0).slice(0,8);
  const identifierSamples=source.identifiers.filter((_,i)=>i%Math.max(1,Math.floor(source.identifiers.length/8))===0).slice(0,8);
  const probes=[...new Set([...samples,...identifierSamples,...officeValues,...grantValues])].filter(value=>!safe(value));
  return {phrases:withheldPhrases(privacySourceGraphs(),[]),values:[...policy.phrases],safe,check:blocked,probes,grantProbes:[...grantValues].filter(value=>!safe(value)),officeProbes:officeValues};
 })();
 return pendingIndex;
}

const approvedDownloads=new WeakMap();
/** CSV must be an actual browser download path. All listed surfaces are mandatory. */
export async function assertTablePrivacy(surfaces,index) {
  for (const key of ['clientInput','serverResponses','url','renderedText','accessibleText','analytics']) {
    assert.ok(Object.hasOwn(surfaces,key),`privacy surface missing: ${key}`);
    assert.ok(index.safe(typeof surfaces[key] === 'string' ? surfaces[key] : JSON.stringify(surfaces[key])),`withheld text on privacy surface: ${key}`);
  }
  assert.equal(typeof surfaces.csvPath,'string','privacy gate requires an actual downloaded file');
  const csv=await readFile(surfaces.csvPath,'utf8'),digest=createHash('sha256').update(csv).digest('hex');
  let approved=approvedDownloads.get(index);
  if(!approved)approvedDownloads.set(index,approved=new Set());
  if(!approved.has(digest)){
    assert.ok(index.safe(csv),'withheld text in downloaded CSV');
    if(approved.size>=128)approved.delete(approved.values().next().value);
    approved.add(digest);
  }
}

/** Each protected rollout registers its real page. Optional readInput/modes and
 * responseType adapters support client tables with factory configs and SSR HTML;
 * all seven privacy surfaces and withheld query/facet probes remain required. */
export function registerTablePrivacy(registry, rollout) {
  for (const key of ['id','path','host','facet','endpoint']) assert.ok(rollout[key],`privacy registration missing: ${key}`);
  if (!rollout.readInput) for (const key of ['module','configExport','rowsExport','serverExample']) assert.ok(rollout[key],`privacy registration missing: ${key}`);
  registry.push(async ({page,base,index,outputDir})=>{
    await page.goto(base+rollout.path);
    await page.waitForFunction(host=>{const el=document.querySelector(host),table=el?.matches('[data-datatable]')?el:el?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !el.hasAttribute('aria-busy') && !table.hasAttribute('aria-busy') && !el.querySelector('[data-register-config]')},rollout.host);
    const {clientInput,donorContext}=rollout.readInput ? await rollout.readInput(page) : await page.evaluate(async r=>{const module=await import(r.module);return {clientInput:module[r.rowsExport],donorContext:module[r.configExport].privacy === 'donors'};},rollout);
    assert.ok(donorContext,`${rollout.id}: shared privacy registration`);
    assert.ok(index.safe(JSON.stringify(clientInput)),`${rollout.id}: unsafe public client input`);
    const responses=[];let downloads=0;
    const downloadListener=()=>downloads++;page.on('download',downloadListener);
    const capture=async response=>{
      if (new URL(response.url()).pathname.startsWith('/api/table/') && new URL(response.url()).pathname !== '/api/table/privacy') {
        const value=await response.text().catch(()=> ''); responses.push(value);
      }
    };
    page.on('response',capture);
    console.log(JSON.stringify({table:rollout.id,stage:'input-approved'}));
    const modes=rollout.modes || ['client','server'];
    // Browser arguments contain data only; custom input adapters stay in Node.
    const browserRollout={...rollout,readInput:undefined};
    for (const mode of modes) {
      await page.goto(base+rollout.path);
      if (mode === 'server' && rollout.serverExample) await page.locator(`[data-example="${rollout.serverExample}"]`).click();
      await page.waitForFunction(host=>{const el=document.querySelector(host),table=el?.matches('[data-datatable]')?el:el?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !el.hasAttribute('aria-busy') && !table.hasAttribute('aria-busy') && !el.querySelector('[data-register-config]')},rollout.host);
      await page.evaluate(r=>{
        window.privacyEvents=[]; window.privacyServerResponses=[];
        addEventListener('opax:analytics',event=>window.privacyEvents.push(event.detail));
        const original=window.fetch;
        window.fetch=async (input,options)=>{
          const response=await original(input,options);
          if (new URL(input,location.href).pathname === new URL(r.endpoint,location.href).pathname) window.privacyServerResponses.push(await response.clone().text());
          return response;
        };
      },browserRollout);
      const host=page.locator(rollout.host);
      console.log(JSON.stringify({table:rollout.id,stage:'export-start'}));
      const download=page.waitForEvent('download',{timeout:60000}); await host.locator('[data-export]').click();
      const downloaded=await download.catch(async()=>{const status=await host.locator('.dt-count').textContent();throw Error(`${rollout.id}: export timed out; ${index.safe(status)?status:'status suppressed'}`);});
      const csvPath=outputDir ? `${outputDir}/${rollout.id}-${mode}.csv` : await downloaded.path();
      assert.ok(index.safe(await readFile(await downloaded.path(),'utf8')),`${rollout.id}: downloaded CSV privacy`);
      if (outputDir) await downloaded.saveAs(csvPath);
      const serverResponses=await page.evaluate(async r=>{
        const response=await fetch(r.endpoint);
        if (r.responseType === 'table') {const doc=new DOMParser().parseFromString(await response.text(),'text/html');return [...doc.querySelectorAll('[data-register-table]')].map(el=>el.outerHTML).join('');}
        return r.responseType === 'text' ? await response.text() : await response.json();
      },browserRollout);
      await assertTablePrivacy({clientInput,serverResponses:[serverResponses,...responses,...await page.evaluate(()=>window.privacyServerResponses)],csvPath,url:decodeURIComponent(page.url()),renderedText:await host.innerHTML(),accessibleText:await host.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
      const events=await page.evaluate(()=>window.privacyEvents);
      assert.ok(events.some(event=>event.event === 'table_export'),`${rollout.id}: export analytics observed`);
      for (const event of events) assert.deepEqual(Object.keys(event.properties).sort(),['page_type','table_id'],`${rollout.id}: analytics property boundary`);
      let probes=0;
      for (const value of rollout.fullPrivacy ? index.probes : index.values.filter((_,i)=>i % Math.max(1,Math.floor(index.values.length/8)) === 0).slice(0,8)) {
        for (const kind of /^\d{11}$/.test(value) ? ['q','facet','range'] : ['q','facet']) {
          await page.evaluate(({r,value,kind})=>{
            const url=new URL(location.href), key=r.urlKey ? r.urlKey+'.' : '';
            if (kind === 'q') url.searchParams.set(key+'q',value);
            else if (kind === 'range') url.searchParams.set(key+'f.'+(r.rangeFacet || r.facet),JSON.stringify({min:Number(value),max:Number(value)}));
            else url.searchParams.set(key+'f.'+r.facet,JSON.stringify([value]));
            url.searchParams.set('campaign','fixture');
            history.replaceState(null,'',url); dispatchEvent(new PopStateEvent('popstate'));
          },{r:browserRollout,value,kind});
          // This immediate check detects old SSR rows/query echoes during validation.
          assert.ok(index.safe(await host.innerHTML()),`${rollout.id}: reflected pending state`);
          await page.waitForFunction(host=>{const el=document.querySelector(host),table=el?.matches('[data-datatable]')?el:el?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !el.hasAttribute('aria-busy') && !table.hasAttribute('aria-busy') && !el.querySelector('[data-register-config]')},rollout.host);
          if (kind === 'q') {
            await host.locator('[data-search]').fill(value);
            await host.locator('form').evaluate(el=>el.requestSubmit());
            await page.waitForFunction(host=>{const el=document.querySelector(host),table=el?.matches('[data-datatable]')?el:el?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !el.hasAttribute('aria-busy') && !table.hasAttribute('aria-busy') && !el.querySelector('[data-register-config]')},rollout.host);
          }
          await assertTablePrivacy({clientInput,serverResponses:[serverResponses,...responses,...await page.evaluate(()=>window.privacyServerResponses)],csvPath,url:decodeURIComponent(page.url()),renderedText:await host.innerHTML(),accessibleText:await host.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
          assert.ok(index.safe(await host.locator('[role=status]').textContent()),`${rollout.id}: live region safe`);
          assert.equal(await host.locator('[data-export]').isDisabled(),true,`${rollout.id}: rejected CSV is disabled`);
          const before=downloads;await host.locator('[data-export]').evaluate(el=>el.click());
          assert.equal(downloads,before,`${rollout.id}: rejected state creates no download`);
          responses.length=0;await page.evaluate(()=>{window.privacyServerResponses=[];});
          assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');
          assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
          await page.evaluate(({r})=>{ const url=new URL(location.href),key=r.urlKey ? r.urlKey+'.' : '';url.searchParams.delete(key+'q');url.searchParams.delete(key+'f.'+r.facet);url.searchParams.delete(key+'f.'+(r.rangeFacet || r.facet));history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate')); },{r:browserRollout});
          await page.waitForFunction(host=>{const el=document.querySelector(host),table=el?.matches('[data-datatable]')?el:el?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !el.hasAttribute('aria-busy') && !table.hasAttribute('aria-busy') && !el.querySelector('[data-register-config]')},rollout.host);
          assert.equal(await host.locator('[data-export]').isDisabled(),false,`${rollout.id}: clearing each probe restores export`);
        }
        if(++probes%10===0)console.log(JSON.stringify({table:rollout.id,probes}));
      }
    }
    console.log(JSON.stringify({table:rollout.id,stage:'complete'}));
    page.off('response',capture);page.off('download',downloadListener);
    return {id:rollout.id,withheldValues:index.values.length,modes:modes.length,surfaces:8,probes:rollout.fullPrivacy ? index.probes.length : 8};
  });
}
