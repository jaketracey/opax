import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {workerFetch} from './helpers/worker-fetch.mjs';

const NOTE = 'Receipts disclosed under this exact name. This donor is not drawn on the money map, which shows a bounded selection of donors. Recipient parties are listed in the source returns.';
const FEDERAL_NOTE = NOTE + ' State disclosures are shown separately and are not added to these figures.';
const donors = ['federal','qld'].map(jurisdiction => ({
  id:`donor:copy-example:${jurisdiction}`,kind:'donor',jurisdiction,
  label:`Copy ${jurisdiction} Example Pty Ltd`,total:1200,count:2,firstYear:2024,lastYear:2024,
  returnReferences:[{return_type:'Fixture return',url:'https://example.test/return'}],
}));
const files = {
  '/graph/donor-index.json':{donors},
  '/graph/donor-disclosures.json':{donors,references:[]},
};

function browserPage(kind,path,selector,assets=files) {
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs',import.meta.url),{
      execArgv:['--experimental-vm-modules','--disable-warning=ExperimentalWarning'],
      workerData:{kind,path,selector,files:assets,html:true,settleMs:1000},
    });
    let result;
    worker.once('message',message => {result=message;});
    worker.once('error',reject);
    worker.once('exit',code => {
      if (code || result?.error || !result) reject(Error(result?.error || `Browser render exited ${code}`));
      else resolve(result);
    });
  });
}

for (const donor of donors) test(`off-map ${donor.jurisdiction} server and browser pages render the same note once`,{timeout:120_000},async () => {
  const path='/subject/donor/'+encodeURIComponent(donor.label);
  const response=await workerFetch(path,{},{},{assets:files});
  assert.equal(response.status,200);
  const server=new JSDOM(await response.text());
  const rendered=await browserPage('donor',path,'#donor-record');
  assert.deepEqual(rendered.errors,[]);
  assert.equal(rendered.failed,false);
  const client=new JSDOM(rendered.html);
  const expected=donor.jurisdiction === 'federal' ? FEDERAL_NOTE : NOTE;
  // A state-only donor has no figure block of its own (its figures sit once in the
  // commission row), so its note stands alone; a federal donor's note is in the block.
  const browserNote=[...client.window.document.querySelectorAll(donor.jurisdiction === 'federal' ? '#donor-record p' : 'p.donor-offmap-note')].find(p => p.textContent===expected);
  assert.ok(browserNote,client.window.document.body.textContent);
  const serverNote=[...server.window.document.querySelectorAll('#prerender p')].find(p => p.textContent.endsWith(expected));
  assert.ok(serverNote,server.window.document.querySelector('#prerender').textContent);
  assert.equal(serverNote.textContent,`${donor.label}: disclosed electoral returns. ${browserNote.textContent}`);
  for (const text of [server.window.document.querySelector('#prerender').textContent,(donor.jurisdiction === 'federal' ? client.window.document.querySelector('#donor-record') : browserNote.parentElement).textContent]) {
    assert.equal(text.split('Receipts disclosed under this exact name').length-1,1);
    assert.doesNotMatch(text,/only the largest donors|\u2014/);
  }
  assert.equal(client.window.document.querySelectorAll('#donor-record > .entry-scope').length,donor.jurisdiction === 'federal' ? 1 : 0);
  server.window.close();client.window.close();
});

test('party server and browser scope is one sentence with the map, measure, years and return source once',{timeout:120_000},async () => {
  const path='/subject/party/labor';
  const response=await workerFetch(path);
  assert.equal(response.status,200);
  const server=new JSDOM(await response.text());
  // Both renderers use the published party graph; the donor fixtures only replace the index.
  const rendered=await browserPage('party',path,'#entry-flows',{});
  assert.deepEqual(rendered.errors.filter(error => !/getContext\(\) method/.test(error)),[]);
  const client=new JSDOM(rendered.html);
  const expected='All receipt types from named donors on the map, 1998–99 to 2024–25, as the parties reported them in AEC federal returns.';
  const heading=[...server.window.document.querySelectorAll('h2')].find(h => h.textContent==='Where it came from');
  assert.ok(heading,'the server table has its own section after the summary block');
  assert.equal(heading.nextElementSibling.textContent,expected);
  assert.equal(client.window.document.querySelector('#entry-flows > .entry-scope').textContent,expected);
  server.window.close();client.window.close();
});
