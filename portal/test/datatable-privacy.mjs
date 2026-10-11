// Shared rollout gate. Names are read at run time; failure messages contain counts only.
import {recipientIdentityIndex} from '../src/recipient-index.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MONEY_GRAPHS,isOrganisationDonor,withheldPhrases,namesWithheldPhrase} from '../public/donor-entity.js';

export async function tablePrivacyIndex({donorContext=true,recipients=false} = {}) {
  const graphs=await Promise.all(MONEY_GRAPHS.map(path=>readFile(new URL(`../public${path}`,import.meta.url),'utf8').then(JSON.parse)));
  const officeHolders=[];
  if (!donorContext) {
    const roster=JSON.parse(await readFile(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
    const access=JSON.parse(await readFile(new URL('../public/access.json',import.meta.url),'utf8'));
    officeHolders.push(...roster.people.flatMap(p=>[p.name,p.full || '']),...Object.values(access.ministers || {}).map(m=>m.name));
  }
  const phrases=withheldPhrases(graphs,officeHolders.filter(Boolean));
  const values=[...new Set(graphs.flatMap(g=>g.nodes.filter(n=>n.kind === 'donor' && !isOrganisationDonor(n)).flatMap(n=>[n.label,...(n.aliases || [])])))].filter(v=>namesWithheldPhrase(phrases,`donor receipts ${v}`));
  const donorSafe=value=>!namesWithheldPhrase(phrases,`donor receipts ${value}`);
  if(!recipients) return {phrases,values,safe:donorSafe};
  const policy=await recipientIdentityIndex(path=>readFile(new URL(`../public${path}`,import.meta.url),'utf8').then(JSON.parse));
  const recipientValues=[...policy.phrases];
  return {phrases,values:[...new Set([...values,...recipientValues])],recipientValues,dataSafe:value=>!policy.check(value),safe:value=>donorSafe(value)&&!policy.check(value)};
}

/** CSV must be an actual browser download path. All listed surfaces are mandatory. */
export async function assertTablePrivacy(surfaces,index) {
  for (const key of ['clientInput','serverResponses','url','renderedText','accessibleText','analytics']) {
    assert.ok(Object.hasOwn(surfaces,key),`privacy surface missing: ${key}`);
    const check=['url','analytics'].includes(key) ? index.safe : index.dataSafe || index.safe;
    assert.ok(check(typeof surfaces[key] === 'string' ? surfaces[key] : JSON.stringify(surfaces[key])),`withheld text on privacy surface: ${key}`);
  }
  assert.equal(typeof surfaces.csvPath,'string','privacy gate requires an actual downloaded file');
  assert.ok((index.dataSafe || index.safe)(await readFile(surfaces.csvPath,'utf8')),'withheld text in downloaded CSV');
}

/** Each donor rollout adds one registration to its browser gate and runs it locally. */
export function registerTablePrivacy(registry, rollout) {
  for (const key of ['id','path','module','configExport','rowsExport','host','facet','endpoint']) assert.ok(rollout[key],`privacy registration missing: ${key}`);
  assert.ok(rollout.modes || rollout.serverExample,'privacy registration requires modes or a server example');
  registry.push(async ({page,base,index,outputDir,onProgress})=>{
    const responses=[],inputCounts={};
    page.on('response',async response=>{
      if (new URL(response.url()).pathname.startsWith('/api/table/') && new URL(response.url()).pathname !== '/api/table/privacy' && new URL(response.url()).searchParams.get('format') !== 'csv') {
        const value=await response.text().catch(()=> ''); responses.push(value);
      }
    });
    for (const mode of ['client','server']) {
      const active={...rollout,...rollout.modes?.[mode]};
      await page.goto(base+active.path);
      if (mode === 'server' && !rollout.modes) await page.locator(`[data-example="${rollout.serverExample}"]`).click();
      await page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),active.host);
      const {clientInput,donorContext}=await page.evaluate(async r=>{
        const module=await import(r.module),rows=module[r.rowsExport],config=module[r.configExport];
        return {clientInput:typeof rows === 'function' ? rows(document.querySelector(r.host)) : rows,
          donorContext:(typeof config === 'function' ? config(r.configArgs) : config).privacy === 'donors'};
      },active);
      if (!donorContext) index=await tablePrivacyIndex({donorContext:false});
      inputCounts[mode]=clientInput.length;
      if (rollout.modes && mode === 'client' && rollout.clientRequired !== false) assert.ok(clientInput.length>0,`${rollout.id}: actual client input is required`);
      assert.ok((index.dataSafe || index.safe)(JSON.stringify(clientInput)),`${rollout.id}: unsafe public client input`);
      await page.evaluate(r=>{
        window.privacyEvents=[]; window.privacyServerResponses=[];
        addEventListener('opax:analytics',event=>window.privacyEvents.push(event.detail));
        const original=window.fetch;
        window.fetch=async (input,options)=>{
          const response=await original(input,options);
          if (new URL(input,location.href).pathname === r.endpoint && new URL(input,location.href).searchParams.get('format') !== 'csv') window.privacyServerResponses.push(await response.clone().text());
          return response;
        };
      },active);
      const host=page.locator(active.host);
      const download=page.waitForEvent('download'); await host.locator('[data-export]').click();
      const downloaded=await download;
      const csvPath=outputDir ? `${outputDir}/${rollout.id}-${mode}.csv` : await downloaded.path();
      if (outputDir) await downloaded.saveAs(csvPath);
      const serverResponses=await page.evaluate(async r=>{
        const response=await fetch(r.endpoint);
        return await response.json();
      },active);
      assert.ok(Array.isArray(serverResponses.rows) && serverResponses.rows.length>0 && serverResponses.total>0,`${rollout.id}: actual endpoint must supply a populated page`);
      await assertTablePrivacy({clientInput,serverResponses:[serverResponses,...responses,...await page.evaluate(()=>window.privacyServerResponses)],csvPath,url:decodeURIComponent(page.url()),renderedText:await host.innerHTML(),accessibleText:await host.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
      onProgress?.({id:rollout.id,mode,stage:'baseline'});
      if (!donorContext) continue;
      let samples=0;
      for (const value of [...new Set([...index.values.filter((_,i)=>i % Math.max(1,Math.floor(index.values.length/6)) === 0).slice(0,6),...index.values.filter(v=>/^\d{11}$/.test(v)).slice(0,2)])]) {
        for (const kind of ['q','facet']) {
          await page.evaluate(({r,value,kind})=>{
            const url=new URL(location.href), key=r.urlKey ? r.urlKey+'.' : '';
            if (kind === 'q') url.searchParams.set(key+'q',value);
            else url.searchParams.set(key+'f.'+r.facet,JSON.stringify([value]));
            url.searchParams.set('campaign','fixture');
            history.replaceState(null,'',url); dispatchEvent(new PopStateEvent('popstate'));
          },{r:active,value,kind});
          // This immediate check detects old SSR rows/query echoes during validation.
          assert.ok((index.dataSafe || index.safe)(await host.innerHTML()),`${rollout.id}: reflected pending state`);
          await page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),active.host);
          if (kind === 'q') {
            await host.locator('[data-search]').fill(value);
            await host.locator('form').evaluate(el=>el.requestSubmit());
            await page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),active.host);
          }
          const rejectedDownload=page.waitForEvent('download'); await host.locator('[data-export]').click();
          const rejectedFile=await rejectedDownload;
          const rejectedPath=await rejectedFile.path();
          assert.equal((await readFile(rejectedPath,'utf8')).split('\r\n').length,1,`${rollout.id}: rejected CSV must be header-only`);
          await assertTablePrivacy({clientInput,serverResponses:[serverResponses,...responses,...await page.evaluate(()=>window.privacyServerResponses)],csvPath:rejectedPath,url:decodeURIComponent(page.url()),renderedText:await host.innerHTML(),accessibleText:await host.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
          assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');
          assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
          await page.evaluate(({r})=>{ const url=new URL(location.href),key=r.urlKey ? r.urlKey+'.' : '';url.searchParams.delete(key+'q');url.searchParams.delete(key+'f.'+r.facet);history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate')); },{r:active});
          await page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),active.host);
        }
        onProgress?.({id:rollout.id,mode,samples:++samples});
      }
    }
    return {id:rollout.id,withheldValues:index.values.length,modes:2,surfaces:7,inputCounts};
  });
}
