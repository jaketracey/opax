import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {auditPage} from '../src/audit.ts';
import {auditComplete,filterAudit} from '../public/audit.js';
const root=new URL('./fixtures/audit-phase2-export/',import.meta.url);
const files=Object.fromEntries(readdirSync(root).map(n=>[n,readFileSync(new URL(n,root),'utf8')]));
const calls=[];
const read=async path=>{calls.push(path);return JSON.parse(files[path.replace('/audit/','')]);};
const block=(h,t,links='')=>`<section id="prerender"><h1>${h}</h1><p>${t}</p>${links}</section>`;
const m=await read('/audit/manifest.json'),index=await read('/audit/index.json'),id=index.records[0].id;

test('phase 2 export reconciles the 150 file and 30 MB limits with provenance',()=>{
 assert.equal(auditComplete(m),true);assert.equal(m.phase,2);
 assert.ok(Object.keys(files).length<=150);assert.ok(Object.values(files).reduce((n,s)=>n+Buffer.byteLength(s),0)<=30_000_000);
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
 assert.match(p.prerender,/Has entity responses/);assert.match(p.prerender,/1 of 1 reports match/);
 assert.ok(calls.every(p=>!p.includes('responses-')));
});

test('detail SSR shows PDF provenance and collapsed verbatim public body responses with page references',async()=>{
 calls.length=0;const p=await auditPage(id,new URL('https://opax.com.au/audit/'+id),read,block);
 assert.equal(p.status,200);assert.match(p.prerender,/<section id="prerender">/);
 assert.match(p.prerender,/<h2>Recommendations<\/h2>/);assert.match(p.prerender,/Source: pdf p.4/);
 assert.match(p.prerender,/<h2>Entity responses<\/h2><details class="audit-response"><summary>Queensland Health · PDF p.7/);
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
  assert.equal(p.status,200);assert.match(p.prerender,/PDF body held/);assert.match(p.prerender,/don&#39;t allow us to reproduce it here/);
  assert.doesNotMatch(p.prerender+p.description,/donor|privacy rule|text[ _]layer|redaction|pdf_restrictive_licence/i);
  assert.ok(p.description.endsWith('PDF body held.'));
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
  ['CC BY-NC-ND 4.0','CC BY-NC-ND 4.0',"PDF body held: QAO&#39;s terms for this PDF (CC BY-NC-ND 4.0) don&#39;t allow us to reproduce it here."],
  ['Prior written permission required',"reuse needs QAO&#39;s written permission","PDF body held: QAO&#39;s terms for this PDF require QAO&#39;s written permission."],
  ['Uncleared document notice; no document grant accepted','reuse grant unverified',"PDF body held: we couldn&#39;t confirm QAO&#39;s terms for this PDF."]]){
  const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);row.pdf.status='held';row.pdf.reasons=['pdf_restrictive_licence'];row.pdf.document_licence=licence;
  row.licence.body_skipped=false;row.responses_path=undefined;row.response_count=0;
  row.recommendations=[{number:1,text:'Fixture HTML advice.',html:'<p>Fixture HTML advice.</p>',source_text:"QAO's text",provenance:'html',addressed_to:null}];
  const seen=[];const page=await auditPage(id,new URL('https://opax.com.au/audit/'+id),async path=>{seen.push(path);return path.includes('reports-')?{records:[row]}:read(path);},block);
  assert.equal(page.status,200);assert.match(page.prerender,/Fixture HTML advice/);assert.match(page.prerender,/Source: html/);
  assert.match(page.prerender,/Source: Queensland Audit Office report page, CC BY 4.0/);
  assert.ok(page.prerender.includes(`Full report (PDF)</a>: ${term}`));assert.ok(page.prerender.includes(`<p class="audit-meta">${note}</p>`));
  assert.doesNotMatch(page.prerender+page.description,/donor|privacy rule|text[ _]layer|pdf_restrictive_licence/i);
  assert.ok(page.description.endsWith('PDF body held.'));
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
  assert.ok(page.description.endsWith('PDF body held.'));
 }
 const directory=await auditPage(null,new URL('https://opax.com.au/audit'),publicRead,block);
 assert.ok(!forbidden.test(directory.prerender+directory.description));
 const receipt=JSON.parse(readFileSync(new URL('../../docs/coverage/qao-phase2-receipt.json',import.meta.url)));
 assert.ok(forbidden.test(JSON.stringify(receipt)),'Internal rights receipt retains its review reasons');
});

test('accepted catalogue restores all phase 1 HTML recommendations while preserving every PDF hold',()=>{
 const publicRoot=new URL('../public/audit/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',publicRoot)));
 const rows=manifest.chunks.flatMap(chunk=>JSON.parse(readFileSync(new URL(chunk.path.replace('/audit/',''),publicRoot))).records);
 assert.equal(manifest.count,296);assert.equal(manifest.html_recommendations,647);assert.equal(manifest.recommendations,647);
 assert.equal(rows.reduce((n,row)=>n+row.recommendations.length,0),647);assert.ok(rows.every(row=>row.recommendations.every(rec=>rec.provenance==='html')));
 assert.equal(rows.filter(row=>row.licence.body_skipped).length,2);assert.ok(rows.every(row=>row.pdf.status==='held'));
 assert.equal(manifest.bodies,0);assert.equal(manifest.responses,0);assert.equal(manifest.pdf_recommendations,0);
});
