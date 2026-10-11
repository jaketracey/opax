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

test('HTML recommendations stay live beside held PDF terms and the report page source line',async()=>{
 for(const [licence,term] of [['CC BY-NC-ND 4.0','CC BY-NC-ND 4.0'],['Prior written permission required',"reuse needs QAO&#39;s written permission"],['Uncleared document notice; no document grant accepted','reuse grant unverified']]){
  const row=structuredClone(JSON.parse(files['reports-1.json']).records[0]);row.pdf.status='held';row.pdf.reasons=['pdf_restrictive_licence'];row.pdf.document_licence=licence;
  row.licence.body_skipped=false;row.responses_path=undefined;row.response_count=0;
  row.recommendations=[{number:1,text:'Fixture HTML advice.',html:'<p>Fixture HTML advice.</p>',source_text:"QAO's text",provenance:'html',addressed_to:null}];
  const seen=[];const page=await auditPage(id,new URL('https://opax.com.au/audit/'+id),async path=>{seen.push(path);return path.includes('reports-')?{records:[row]}:read(path);},block);
  assert.equal(page.status,200);assert.match(page.prerender,/Fixture HTML advice/);assert.match(page.prerender,/Source: html/);
  assert.match(page.prerender,/Source: Queensland Audit Office report page, CC BY 4.0/);
  assert.ok(page.prerender.includes(`Full report (PDF)</a>: ${term}`));assert.match(page.prerender,/PDF body held; its full text is not reproduced here/);
  assert.ok(!seen.some(path=>path.includes('responses-')));assert.equal((page.prerender.match(/class="ui-pop ui-source"/g)||[]).length,1);
 }
});

test('accepted catalogue restores all phase 1 HTML recommendations while preserving every PDF hold',()=>{
 const publicRoot=new URL('../public/audit/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',publicRoot)));
 const rows=manifest.chunks.flatMap(chunk=>JSON.parse(readFileSync(new URL(chunk.path.replace('/audit/',''),publicRoot))).records);
 assert.equal(manifest.count,296);assert.equal(manifest.html_recommendations,647);assert.equal(manifest.recommendations,647);
 assert.equal(rows.reduce((n,row)=>n+row.recommendations.length,0),647);assert.ok(rows.every(row=>row.recommendations.every(rec=>rec.provenance==='html')));
 assert.equal(rows.filter(row=>row.licence.body_skipped).length,2);assert.ok(rows.every(row=>row.pdf.status==='held'));
 assert.equal(manifest.bodies,0);assert.equal(manifest.responses,0);assert.equal(manifest.pdf_recommendations,0);
});

test('publication boundary filters HTML identities while refusing altered PDF source text',async()=>{
 const {readPublicationContext,privacySourceGraphs,privacySourceDonorRecords,sanitiseDonorAsset}=await import('../../scripts/withhold_donor_assets.mjs');
 const {isOrganisationDonor}=await import('../public/donor-entity.js');
 const context=readPublicationContext();
 const candidates=[...privacySourceDonorRecords(),...privacySourceGraphs().flatMap(graph=>graph.nodes)];
 const donor=candidates.find(row=>row.kind==='donor'&&!isOrganisationDonor(row)&&row.label&&!/name withheld/i.test(row.label)
  &&sanitiseDonorAsset({title:`Donation by ${row.label}`},context).title!==`Donation by ${row.label}`);
 assert.ok(Boolean(donor),'Runtime privacy source contains a withheld identity');
 const raw=`A donation by ${donor.label}.`,script=new URL('../../scripts/qao_publication_boundary.mjs',import.meta.url).pathname;
 const run=provenance=>spawnSync(process.execPath,[script],{input:JSON.stringify({'reports-1.json':{records:[{title:'Fixture audit',recommendations:[{number:1,text:raw,html:`<p>${raw}</p>`,provenance}]}]}}),encoding:'utf8'});
 const html=run('html');assert.equal(html.status,0,'HTML follows the shared publication boundary');
 const rec=JSON.parse(html.stdout)['reports-1.json'].records[0].recommendations[0];assert.equal(rec.provenance,'html');assert.equal(rec.privacy_filtered,true);
 assert.ok(!html.stdout.includes(donor.label),'Output contains no withheld identity');
 const pdf=run('pdf p.4');assert.ok(pdf.status!==0,'Changed PDF source text remains held');
 assert.ok(!pdf.stderr.includes(donor.label),'Diagnostics contain no withheld identity');
});
