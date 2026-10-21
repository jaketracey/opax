import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import release from '../../data/promoted/act-invoices/release.json' with {type:'json'};
import {actMetadata,actRow} from './act-invoices-fixture.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {actInvoicesPage} from '../src/act-invoices.ts';
import {actInvoicesPublicCopy} from '../src/act-invoices-metadata.ts';
import {tableApi} from '../src/table-api.ts';
import {actInvoicePublicCopyNote} from '../public/act-invoices-context.js';
import {csvRecords,readServerCSV} from '../public/server-csv.js';
import {toCSV} from '../public/datatable.js';
import {actInvoicesConfig} from '../public/act-invoices-table.js';

// Synthetic suppliers only; the real manifest contributes snapshot coordinates.
const metadata={...actMetadata,snapshot:release.snapshot,snapshot_sha256:release.snapshot_sha256,promotion:{reviewed_commit:release.review.reviewed_commit}};
const row={...actRow(),snapshot:metadata.snapshot,snapshot_sha256:metadata.snapshot_sha256};
const local=await tableDatabase({memorySQL:true,datasets:{'act-invoices':[{row}]},metadata:{'act-invoices':metadata}});
test.after(()=>local.close());
const env={TABLE_DB:local.db};

test('round 3: page source receipt and CSV disclose the pinned public copy and its gzip hash',async()=>{
 const copy=actInvoicesPublicCopy(metadata),note=actInvoicePublicCopyNote(copy);
 assert.equal(copy.url,'https://github.com/jaketracey/opax/releases/tag/'+release.release_tag);
 assert.equal(copy.sha256,release.sha256);
 const page=await actInvoicesPage(new URL('https://opax.test/register/act-invoices'),env,(t,d)=>`<h1>${t}</h1><p>${d}</p>`);
 assert.equal(page.status,200);
 const d=new JSDOM(page.prerender).window.document,receipt=d.querySelector('details.act-invoices-receipt');
 const disclosure=receipt.querySelector('[data-act-public-copy]');
 assert.match(disclosure.textContent,/OPAX keeps a verbatim public copy of the published file for its table load/);
 assert.equal(disclosure.querySelector('a').getAttribute('href'),copy.url);
 assert.ok(disclosure.textContent.includes(release.sha256));
 assert.equal(d.querySelectorAll('[data-act-public-copy]').length,1);
 const response=await tableApi(new Request('https://opax.test/api/table/act-invoices?format=csv'),env);
 const notes=JSON.parse(decodeURIComponent(response.headers.get('x-table-csv-notes')));
 assert.equal(notes.filter(x=>x===note).length,1);
 const result=await readServerCSV('https://opax.test/api/table/act-invoices?format=csv',url=>tableApi(new Request(url),env));
 const records=csvRecords(result.csv);
 assert.equal(records.filter(x=>x.startsWith('# '+note+',')).length,1);
 assert.deepEqual(records.slice(0,2),csvRecords(toCSV([row],actInvoicesConfig())));
 assert.ok(!records[0].includes('public_copy'));
 assert.equal((await tableApi(new Request('https://opax.test/api/table/act-invoices'),env)).status,200);
});

test('round 3: a public-copy receipt cannot be attached to another snapshot or unapproved manifest',()=>{
 assert.equal(actInvoicesPublicCopy({...metadata,snapshot_sha256:'0'.repeat(64)}),undefined);
 assert.equal(actInvoicesPublicCopy({...metadata,snapshot:'2026-10-20T00:00:00Z'}),undefined);
 assert.equal(actInvoicesPublicCopy({...metadata,promotion:{reviewed_commit:'0'.repeat(40)}}),undefined);
 assert.equal(actInvoicesPublicCopy(metadata,{...release,review:{...release.review,status:'pending'}}),undefined);
 assert.equal(actInvoicesPublicCopy(metadata,{...release,repository:'example/other'}),undefined);
});
