// Shared rollout gate. Names are read at run time; failure messages contain counts only.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {withheldPhrases,namesWithheldPhrase} from '../public/donor-entity.js';
import {privacySourceGraphs} from '../../scripts/withhold_donor_assets.mjs';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableIdentityIndex} from '../../scripts/load_tables.mjs';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';

export async function tablePrivacyIndex({donorContext=true} = {}) {
  const graphs=privacySourceGraphs();
  const officeHolders=[];
  if (!donorContext) {
    const roster=JSON.parse(await readFile(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
    const access=JSON.parse(await readFile(new URL('../public/access.json',import.meta.url),'utf8'));
    officeHolders.push(...roster.people.flatMap(p=>[p.name,p.full || '']),...Object.values(access.ministers || {}).map(m=>m.name));
  }
  const phrases=withheldPhrases(graphs,officeHolders.filter(Boolean));
  const policy=await tableIdentityIndex(),source=sourceTableDonorIdentities();
  const recipients=new Set(),recipientABNs=new Set();
  const add=entity=>{
    for(const value of [entity.label,entity.name,entity.n,entity.identity?.legal_name,entity.abr?.name,entity.abr?.legal_name,...(entity.aliases || []),...(entity.lookup_names || []),...[entity.id,entity.canonical_id].filter(id=>String(id || '').startsWith('person:')).map(id=>id.slice(7))])if(typeof value==='string'&&value.trim())recipients.add(value);
    for(const value of [entity.abn,entity.abr?.abn,...[entity.id,entity.canonical_id].filter(id=>/^(?:abn:)?\d{11}$/.test(String(id || '')))]){
      const digits=String(value || '').replace(/\D/g,'');if(digits.length===11)recipientABNs.add(digits);
    }
  };
  const root=new URL('../public/',import.meta.url);
  for(const jur of ['federal','qld']){
    const graph=JSON.parse(await readFile(new URL('graph/grants.'+jur+'.json',root),'utf8'));
    for(const recipient of graph.recipients)if(!isOrganisationRecipient(recipient))add(recipient);
    const directory=new URL('grants/'+jur+'/',root);
    for(const file of (await readdir(directory)).filter(f=>f.startsWith('shard-')&&f.endsWith('.json')))for(const recipient of Object.values(JSON.parse(await readFile(new URL(file,directory),'utf8'))))if(!isOrganisationRecipient(recipient))add(recipient);
  }
  const abns=[...new Set([...source.identifiers,...recipientABNs])],values=[...new Set([...source.labels,...recipients,...abns])];
  return {...policy,values,donors:source.labels,recipients:[...recipients],recipientABNs:[...recipientABNs],abns,safe:value=>!policy.check(value)&&!namesWithheldPhrase(phrases,`donor receipts ${value}`)};
}

/** CSV must be an actual browser download path. All listed surfaces are mandatory. */
export async function assertTablePrivacy(surfaces,index) {
  for (const key of ['clientInput','serverResponses','url','renderedText','accessibleText','analytics']) {
    assert.ok(Object.hasOwn(surfaces,key),`privacy surface missing: ${key}`);
    assert.ok(index.safe(typeof surfaces[key] === 'string' ? surfaces[key] : JSON.stringify(surfaces[key])),`withheld text on privacy surface: ${key}`);
  }
  assert.equal(typeof surfaces.csvPath,'string','privacy gate requires an actual downloaded file');
  assert.ok(index.safe(await readFile(surfaces.csvPath,'utf8')),'withheld text in downloaded CSV');
}

/** Each donor rollout adds one registration to its browser gate and runs it locally. */
export function registerTablePrivacy(registry, rollout) {
  for (const key of ['id','path','module','configExport','rowsExport','host','facet','serverExample','endpoint']) assert.ok(rollout[key],`privacy registration missing: ${key}`);
  registry.push(async ({page,base,index,outputDir})=>{
    await page.goto(base+rollout.path);
    await page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),rollout.host);
    const {clientInput,donorContext}=await page.evaluate(async r=>{const module=await import(r.module);return {clientInput:module[r.rowsExport],donorContext:module[r.configExport].privacy === 'donors'};},rollout);
    if (!donorContext) index=await tablePrivacyIndex({donorContext:false});
    assert.ok(index.safe(JSON.stringify(clientInput)),`${rollout.id}: unsafe public client input`);
    const responses=[];
    page.on('response',async response=>{
      if (new URL(response.url()).pathname.startsWith('/api/table/') && new URL(response.url()).pathname !== '/api/table/privacy') {
        const value=await response.text().catch(()=> ''); responses.push(value);
      }
    });
    for (const mode of ['client','server']) {
      await page.goto(base+rollout.path);
      if (mode === 'server') await page.locator(`[data-example="${rollout.serverExample}"]`).click();
      await page.waitForFunction(host=>!document.querySelector(host).hasAttribute('aria-busy'),rollout.host);
      await page.evaluate(r=>{
        window.privacyEvents=[]; window.privacyServerResponses=[];
        addEventListener('opax:analytics',event=>window.privacyEvents.push(event.detail));
        const original=window.fetch;
        window.fetch=async (input,options)=>{
          const response=await original(input,options);
          if (new URL(input,location.href).pathname === r.endpoint) window.privacyServerResponses.push(await response.clone().text());
          return response;
        };
      },rollout);
      const host=page.locator(rollout.host);
      const download=page.waitForEvent('download'); await host.locator('[data-export]').click();
      const downloaded=await download;
      const csvPath=outputDir ? `${outputDir}/${rollout.id}-${mode}.csv` : await downloaded.path();
      if (outputDir) await downloaded.saveAs(csvPath);
      const serverResponses=await page.evaluate(async r=>{
        const config=(await import(r.module))[r.configExport];
        const response=await fetch(r.endpoint);
        return await response.json();
      },rollout);
      await assertTablePrivacy({clientInput,serverResponses:[serverResponses,...responses,...await page.evaluate(()=>window.privacyServerResponses)],csvPath,url:decodeURIComponent(page.url()),renderedText:await host.innerHTML(),accessibleText:await host.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
      if (!donorContext) continue;
      for (const value of index.values.filter((_,i)=>i % Math.max(1,Math.floor(index.values.length/8)) === 0).slice(0,8)) {
        for (const kind of ['q','facet']) {
          await page.evaluate(({r,value,kind})=>{
            const url=new URL(location.href), key=r.urlKey ? r.urlKey+'.' : '';
            if (kind === 'q') url.searchParams.set(key+'q',value);
            else url.searchParams.set(key+'f.'+r.facet,JSON.stringify([value]));
            url.searchParams.set('campaign','fixture');
            history.replaceState(null,'',url); dispatchEvent(new PopStateEvent('popstate'));
          },{r:rollout,value,kind});
          // This immediate check detects old SSR rows/query echoes during validation.
          assert.ok(index.safe(await host.innerHTML()),`${rollout.id}: reflected pending state`);
          await page.waitForFunction(host=>!document.querySelector(host).hasAttribute('aria-busy'),rollout.host);
          if (kind === 'q') {
            await host.locator('[data-search]').fill(value);
            await host.locator('form').evaluate(el=>el.requestSubmit());
            await page.waitForFunction(host=>!document.querySelector(host).hasAttribute('aria-busy'),rollout.host);
          }
          await assertTablePrivacy({clientInput,serverResponses:[serverResponses,...responses,...await page.evaluate(()=>window.privacyServerResponses)],csvPath,url:decodeURIComponent(page.url()),renderedText:await host.innerHTML(),accessibleText:await host.ariaSnapshot(),analytics:await page.evaluate(()=>window.privacyEvents)},index);
          assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');
          if (kind === 'q') assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
          await page.evaluate(({r})=>{ const url=new URL(location.href),key=r.urlKey ? r.urlKey+'.' : '';url.searchParams.delete(key+'q');url.searchParams.delete(key+'f.'+r.facet);history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate')); },{r:rollout});
          await page.waitForFunction(host=>!document.querySelector(host).hasAttribute('aria-busy'),rollout.host);
        }
      }
    }
    return {id:rollout.id,withheldValues:index.values.length,modes:2,surfaces:7};
  });
}
