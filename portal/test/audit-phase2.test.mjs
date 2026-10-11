import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
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

test('rights and no text layer holds keep metadata and prevent detail body and response reads',async()=>{
 for(const reason of ['pdf_restrictive_licence','no_text_layer']){
  const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);row.pdf.status='held';row.pdf.reasons=[reason];row.recommendations=[];row.licence.body_skipped=true;row.licence.exceptions=[reason];
  const seen=[];const heldRead=async path=>{seen.push(path);return path.includes('reports-')?{records:[row]}:read(path);};
  const p=await auditPage(id,new URL('https://opax.com.au/audit/'+id),heldRead,block);
  assert.equal(p.status,200);assert.match(p.prerender,/PDF body held/);assert.match(p.prerender,/not reproduced here/);
  assert.ok(!seen.some(p=>p.includes('responses-')));assert.doesNotMatch(p.prerender,/signature as published|agrees with recommendation 1/);
 }
});

test('unknown phase 2 id returns 404 without fetching responses',async()=>{
 calls.length=0;const p=await auditPage('qao-9999-1',new URL('https://opax.com.au/audit/qao-9999-1'),read,block);
 assert.equal(p.status,404);assert.ok(!calls.some(p=>p.includes('responses-')));
 // Worker noindex headers are exercised by audit.test.mjs against the route dispatcher.
});

test('filtered metadata title is marked while the authoritative report link stays intact',async()=>{
 const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);row.title_privacy_filtered=true;
 const p=await auditPage(id,new URL('https://opax.com.au/audit/'+id),async path=>path.includes('reports-')?{records:[row]}:read(path),block);
 assert.match(p.prerender,/title has been filtered under OPAX/);
 assert.ok(p.prerender.includes(`href="${row.canonical_url}"`));
});
