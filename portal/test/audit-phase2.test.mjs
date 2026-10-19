import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {auditPage} from '../src/audit.ts';
import {auditComplete,filterAudit} from '../public/audit.js';
import {auditTableConfig,registerTableHTML,registerTableQuery,mountRegisterTable} from '../public/register-tables.js';
import {applyQuery} from '../public/datatable.js';
const root=new URL('./fixtures/audit-phase2-export/',import.meta.url);
const files=Object.fromEntries(readdirSync(root).map(n=>[n,readFileSync(new URL(n,root),'utf8')]));
const calls=[];
const read=async path=>{calls.push(path);return JSON.parse(files[path.replace('/audit/','')]);};
const block=(h,t,links='')=>`<section id="prerender"><h1>${h}</h1><p>${t}</p>${links}</section>`;
const m=await read('/audit/manifest.json'),index=await read('/audit/index.json'),id=index.records[0].id;

test('phase 2 export reconciles document provenance',()=>{
 assert.equal(auditComplete(m),true);assert.equal(m.phase,2);
 assert.equal(m.pdf_recommendations,2);assert.equal(m.responses,1);
 const row=JSON.parse(files['reports-1.json']).records[0];
 assert.deepEqual(row.recommendations.map(r=>r.provenance),['pdf p.4','pdf p.4']);
 assert.ok(row.pdf.sha256.length===64);assert.equal(row.pdf.page_count,8);
});

test('response filter has SSR facts and directory never loads response chunks',async()=>{
 calls.length=0;
 assert.equal(filterAudit(index.records,new URLSearchParams('responses=yes')).length,1);
 assert.equal(filterAudit([{...index.records[0],has_responses:false}],new URLSearchParams('responses=yes')).length,0);
 const p=await auditPage(null,new URL('https://opax.com.au/audit?responses=yes'),read,block);
 const dom=new JSDOM(p.prerender),table=dom.window.document;
 assert.match(table.body.textContent,/Has entity responses/);assert.match(table.querySelector('.dt-count').textContent,/1–1 of 1/);
 const config=JSON.parse(table.querySelector('[data-register-config]').textContent).config;
 assert.equal(config.rows[0].responses,'Yes');
 assert.equal(table.querySelectorAll('tbody tr').length,1);
 const catalogue=auditTableConfig([index.records[0],{...index.records[0],id:'qao-2000-01-2',has_responses:false}],()=>true);
 const query=registerTableQuery(new URLSearchParams('responses=yes'),catalogue);
 assert.deepEqual(query.filters.responses,['Yes']);
 assert.equal(applyQuery(catalogue.rows,catalogue,query).total,1);
 assert.equal(applyQuery(catalogue.rows,catalogue,{}).total,2);
 dom.window.close();
 assert.ok(calls.every(p=>!p.includes('responses-')));
});

test('an empty response filter survives hydration and Clear all restores the catalogue',async()=>{
 const config=auditTableConfig([{...index.records[0],has_responses:false}],()=>true);
 for(const search of ['responses=yes','audit.f.responses='+encodeURIComponent('["Yes"]')]){
  const url=new URL('https://fixture.test/audit?'+search);
  const html=registerTableHTML(config,registerTableQuery(url.searchParams,config),url);
  const dom=new JSDOM(html,{url:url.href,pretendToBeVisual:true});
  const root=dom.window.document.querySelector('[data-register-table]');
  const mounted=mountRegisterTable(root,config);
  const settle=async()=>{for(let i=0;i<100 && root.getAttribute('aria-busy')==='true';i++)await new Promise(resolve=>setTimeout(resolve,10));assert.notEqual(root.getAttribute('aria-busy'),'true');};
  const page=()=>JSON.parse(root.querySelector('[data-dt-page]').textContent);
  try{
   await settle();assert.equal(page().total,0);
   assert.equal(page().facets.responses.find(f=>f.value==='Yes').count,0);
   assert.equal(root.querySelector('[data-export]').disabled,true);
   root.querySelector('[data-clear]').click();await settle();assert.equal(page().total,1);
   assert.equal(new URL(dom.window.location.href).search,'');
  }finally{mounted.destroy();dom.window.close();}
 }
});

test('detail SSR shows PDF provenance and collapsed verbatim public body responses with page references',async()=>{
 calls.length=0;const p=await auditPage(id,new URL('https://opax.com.au/audit/'+id),read,block);
 assert.equal(p.status,200);assert.match(p.prerender,/<section id="prerender">/);
 assert.match(p.prerender,/<h2 class="ui-section-title">Recommendations<\/h2>/);assert.match(p.prerender,/Source: pdf p.4/);
 assert.match(p.prerender,/<h2 class="ui-section-title">Entity responses<\/h2><details class="ui-disclosure audit-response"><summary>Queensland Health · PDF p.7/);
 assert.match(p.prerender,/Queensland Health agrees with recommendation 1/);assert.match(p.prerender,/Names recommendation 1/);
 assert.doesNotMatch(p.prerender,/<details[^>]*open|subject\/person|person_id|signatory_name/);
 assert.equal((p.prerender.match(/class="ui-pop ui-source"/g)||[]).length,1);
 assert.ok(calls.includes(`/audit/responses-${id}.json`));
 const response=JSON.parse(files[`responses-${id}.json`]).records[0];
 assert.deepEqual(Object.keys(response).sort(),['body','id','page_end','page_start','recommendation_numbers','text'].sort());
 assert.ok(response.text.includes('[signature as published]'));
 assert.ok(!Object.entries(response).some(([key,value])=>key!=='text'&&JSON.stringify(value).includes('[signature as published]')));
 assert.doesNotMatch(files['index.json'],/signature as published|Director-General/);
});

test('internal holds never render and still prevent body and response reads',async()=>{
 for(const reason of ['pdf_restrictive_licence','no_text_layer','individual_donor_text_hold','published_redaction_hold']){
  const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);row.pdf.status='held';row.pdf.document_licence='CC BY-NC-ND 4.0';row.pdf.reasons=[reason];row.recommendations=[];row.licence.body_skipped=true;row.licence.exceptions=[reason];
  const seen=[];const heldRead=async path=>{seen.push(path);return path.includes('reports-')?{records:[row]}:read(path);};
  const p=await auditPage(id,new URL('https://opax.com.au/audit/'+id),heldRead,block);
  assert.equal(p.status,200);assert.ok(p.prerender.includes('Full report (PDF)</a> on qao.qld.gov.au (CC BY-NC-ND 4.0, so we link to it rather than reproduce it).'));assert.doesNotMatch(p.prerender+p.description,/body held|held with|Not named on/i); // 'uncleared copyright exception' is held for Jake (19 Oct)
  assert.doesNotMatch(p.prerender+p.description,/donor|privacy rule|text[ _]layer|redaction|pdf_restrictive_licence/i);
  assert.ok(p.description.endsWith('Full report on qao.qld.gov.au.'));
  assert.ok(!seen.some(p=>p.includes('responses-')));assert.doesNotMatch(p.prerender,/signature as published|agrees with recommendation 1/);
 }
});

test('unknown phase 2 id returns 404 without fetching responses',async()=>{
 calls.length=0;const p=await auditPage('qao-9999-1',new URL('https://opax.com.au/audit/qao-9999-1'),read,block);
 assert.equal(p.status,404);assert.ok(!calls.some(p=>p.includes('responses-')));
 // Worker noindex headers are exercised by audit.test.mjs against the route dispatcher.
});

test('HTML recommendations stay live beside each licence-only PDF hold variant',async()=>{
 for(const [licence,term,note] of [
  ['CC BY-NC-ND 4.0','CC BY-NC-ND 4.0',"CC BY-NC-ND 4.0, so we link to it rather than reproduce it"],
  ['Prior written permission required',"reuse needs QAO&#39;s written permission","reuse needs QAO&#39;s written permission, so we link to it rather than reproduce it"],
  ['Uncleared document notice; no document grant accepted','reuse terms not confirmed',"QAO&#39;s reuse terms for it aren&#39;t confirmed, so we link to it rather than reproduce it"]]){
  const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);row.pdf.status='held';row.pdf.reasons=['pdf_restrictive_licence'];row.pdf.document_licence=licence;
  row.licence.body_skipped=false;row.responses_path=undefined;row.response_count=0;
  row.recommendations=[{number:1,text:'Fixture HTML advice.',html:'<p>Fixture HTML advice.</p>',source_text:"QAO's text",provenance:'html',addressed_to:null}];
  const seen=[];const page=await auditPage(id,new URL('https://opax.com.au/audit/'+id),async path=>{seen.push(path);return path.includes('reports-')?{records:[row]}:read(path);},block);
  assert.equal(page.status,200);assert.match(page.prerender,/Fixture HTML advice/);assert.match(page.prerender,/Source: the report’s web page/);assert.doesNotMatch(page.prerender,/Source: html/);
  assert.match(page.prerender,/Source: Queensland Audit Office report page, CC BY 4.0/);
  assert.ok(page.prerender.includes(`Full report (PDF): ${term}`));assert.ok(page.prerender.includes(`<p class="audit-meta"><a href="${row.pdf_url}" rel="noopener">Full report (PDF)</a> on qao.qld.gov.au (${note}).</p>`));
  assert.doesNotMatch(page.prerender+page.description,/donor|privacy rule|text[ _]layer|pdf_restrictive_licence/i);
  assert.ok(page.description.endsWith('Full report on qao.qld.gov.au.'));
  assert.ok(!seen.some(path=>path.includes('responses-')));assert.equal((page.prerender.match(/class="ui-pop ui-source"/g)||[]).length,1);
 }
});

test('every public audit asset and rendered report omits internal review reasons',async()=>{
 const publicRoot=new URL('../public/audit/',import.meta.url),publicFiles=Object.fromEntries(readdirSync(publicRoot).map(name=>[name,JSON.parse(readFileSync(new URL(name,publicRoot)))]));
 const forbidden=/donor|privacy rule|text[ _]layer|published_redaction|extraction_holds/i;
 for(const value of Object.values(publicFiles))assert.ok(!forbidden.test(JSON.stringify(value)),'Public audit JSON contains no internal review wording');
 const manifest=publicFiles['manifest.json'],publicRead=async path=>publicFiles[path.replace('/audit/','')];
 const rows=manifest.chunks.flatMap(chunk=>publicFiles[chunk.path.replace('/audit/','')].records);
 for(const row of rows){
  assert.equal('reasons' in row.pdf,false);assert.equal('no_text_pages' in row.pdf,false);
  const page=await auditPage(row.id,new URL('https://opax.com.au/audit/'+row.id),publicRead,block);
  assert.equal(page.status,200);assert.ok(!forbidden.test(page.prerender+page.description),'Rendered audit report contains no internal review wording');
  if(row.pdf.status==='held') assert.ok(page.description.endsWith('Full report on qao.qld.gov.au.'));
 }
 const directory=await auditPage(null,new URL('https://opax.com.au/audit'),publicRead,block);
 const dom=new JSDOM(directory.prerender),table=dom.window.document;
 const config=JSON.parse(table.querySelector('[data-register-config]').textContent).config;
 assert.ok(!forbidden.test(JSON.stringify(config.rows)),'Directory rows contain no internal review wording');
 table.querySelectorAll('script').forEach(script=>script.remove());
 assert.ok(!forbidden.test(table.body.textContent+directory.description));
 dom.window.close();
 const receipt=JSON.parse(readFileSync(new URL('../../docs/coverage/qao-phase2-receipt.json',import.meta.url)));
 assert.ok(forbidden.test(JSON.stringify(receipt)),'Internal rights receipt retains its review reasons');
});

test('accepted catalogue reconciles per-document rights, hashes, provenance and aggregate counts',()=>{
 const publicRoot=new URL('../public/audit/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',publicRoot)));
 const rows=manifest.chunks.flatMap(chunk=>{
  const bytes=readFileSync(new URL(chunk.path.replace('/audit/',''),publicRoot));
  assert.equal(bytes.byteLength,chunk.bytes);
  const records=JSON.parse(bytes).records;assert.equal(records.length,chunk.count);return records;
 });
 assert.equal(rows.length,manifest.count);
 assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
 assert.equal(rows.reduce((n,row)=>n+row.recommendations.length,0),manifest.recommendations);
 assert.equal(rows.filter(row=>row.licence.body_skipped).length,manifest.licence_exceptions.length);
 assert.equal(rows.filter(row=>row.pdf.status==='ready').length,manifest.bodies);
 const recommendations=rows.flatMap(row=>row.recommendations);
 assert.equal(recommendations.filter(rec=>rec.provenance==='html').length,manifest.html_recommendations);
 assert.equal(recommendations.filter(rec=>rec.provenance!=='html').length,manifest.pdf_recommendations);
 assert.equal(rows.reduce((n,row)=>n+row.response_count,0),manifest.responses);
 // The production validator enforces each document's licence, hash, source
 // provenance and held/ready boundary without assuming the snapshot is frozen.
 const checked=spawnSync('python3',['-c',
  'from scripts.vm.validate_data import check_audit; import json; print(json.dumps(check_audit(compare_head=False)))'],
  {cwd:new URL('../../',import.meta.url),encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);assert.deepEqual(JSON.parse(checked.stdout),[]);
});

test('Entities audited shows only when the report page names them',async()=>{
 const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);
 const page=async entities=>{row.entities=entities;return (await auditPage(id,new URL('https://opax.com.au/audit/'+id),async path=>path.includes('reports-')?{records:[row]}:read(path),block)).prerender;};
 const empty=await page([]);assert.doesNotMatch(empty,/Entities audited|Not named on/);
 assert.match(await page(['Queensland Health']),/<h2 class="ui-section-title">Entities audited<\/h2>.*Queensland Health/);
});
