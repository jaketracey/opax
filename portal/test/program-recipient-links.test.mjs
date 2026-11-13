import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {grantCoreBody} from '../public/record-core-content.js';
import {hydrateRecordCore} from '../public/record-core.js';

test('program recipient links stay within the catalogue after filtering and paging', () => {
  for (const jurisdiction of ['federal','qld']) {
    const listed = 'name:example listed ltd';
    const recipientIds = new Set([listed]);
    const grants = Array.from({length:22}, (_,i) => ({id:`GA${i+1}`,rn:i===0 ? 'Example Listed Ltd' : 'Example Outside Catalogue Ltd',rid:i===0 ? listed : 'name:example outside catalogue ltd',k:'company',v:1}));
    grants.push({id:'GA23',rid:'person:alex-fixture',rn:'Alex Fixture',k:'individual',v:1});
    const data = {id:'fixture',n:'Fixture program',t:23,c:23,grants};
    const dom = new JSDOM(`<section id="prerender" data-record-core>${grantCoreBody(data,jurisdiction,'/money/grants',true,undefined,recipientIds)}</section>`);
    const doc = dom.window.document, oldDocument = globalThis.document;
    globalThis.document = doc;
    try {
      assert.equal(hydrateRecordCore('program',data,{jurisdiction,recipientIds}),true);
      const links = () => [...doc.querySelectorAll('tbody a[href*="/recipient/"]')];
      assert.deepEqual(links().map(a=>a.textContent),['Example Listed Ltd']);
      doc.querySelector('[data-record-next]').click();
      assert.equal(links().length,0);
      assert.doesNotMatch(doc.querySelector('tbody').textContent,/Alex Fixture/);
      assert.match(doc.querySelector('tbody').textContent,/Recipient not publicly named/);
      const input = doc.querySelector('input');
      input.value = 'Outside Catalogue';
      input.dispatchEvent(new dom.window.Event('input'));
      assert.equal(links().length,0);
      assert.match(doc.querySelector('tbody').textContent,/Example Outside Catalogue Ltd/);
      input.value = 'Listed Ltd';
      input.dispatchEvent(new dom.window.Event('input'));
      assert.deepEqual(links().map(a=>a.textContent),['Example Listed Ltd']);
    } finally {globalThis.document=oldDocument;dom.window.close();}
  }
});
