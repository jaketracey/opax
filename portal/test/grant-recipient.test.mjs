import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grantRecipientUrl, fileKey } from '../public/grants.js';
import { awardMoney, recipientProgramMatches, recipientSourceUrl } from '../public/grant-recipient.js';

test('recipient links preserve jurisdiction and round-trip normalized names safely', () => {
  for (const id of ['abn:64062160614', "name:smith & sons (wa)", "person:anne o'brien"]) {
    const url = new URL(grantRecipientUrl('qld', id), 'https://opax.test');
    assert.equal(url.pathname.split('/')[3], 'qld');
    assert.equal(decodeURIComponent(url.pathname.split('/')[5]), id);
    assert.equal(url.search, '');
  }
});
test('program references preserve ambiguous catalog labels and ignore unexported programs', () => {
  const programs = [{id:'GO1',n:'Shared label',key:'go1'}, {id:'GO2',n:'Shared label',key:'go2'}, {id:'GO3',n:'Shared label'}];
  assert.deepEqual(recipientProgramMatches(programs, 'Shared label').map(p => p.id), ['GO1','GO2']);
  assert.deepEqual(recipientProgramMatches(programs, 'GO2').map(p => p.id), ['GO2']);
  assert.deepEqual(recipientProgramMatches(programs, 'Absent label'), []);
});
test('original award links and source dataset/search links remain distinct', () => {
  assert.equal(recipientSourceUrl('federal', {id:'GA1',guid:'guid-1'}), 'https://www.grants.gov.au/Ga/Show/guid-1');
  assert.equal(new URL(recipientSourceUrl('federal', {id:'GA1'})).searchParams.get('GaId'), 'GA1');
  assert.equal(recipientSourceUrl('qld', {id:'qld-1',guid:'ignored'}), 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964');
});
test('a $0.00 award reads as published; a missing value is never shown as $0 (search-hubs-008)', () => {
  assert.equal(awardMoney(0), '$0 (as published)');
  assert.equal(awardMoney(undefined), 'Value not recorded');
  assert.equal(awardMoney(null), 'Value not recorded');
  assert.match(awardMoney(201261003), /^\$201,261,003/);
  assert.match(awardMoney(0.4), /^\$0\.40?$/);
});

test('a missing or failed recipient shows the error state, not a script error', async () => {
  const {JSDOM} = await import('jsdom');
  const {mountGrantRecipient} = await import('../public/grant-recipient.js');
  const dom = new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>', {url: 'https://opax.test/money/grants/recipient/federal/abn:1'});
  const saved = {window: globalThis.window, document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch, requestAnimationFrame: globalThis.requestAnimationFrame};
  Object.assign(globalThis, {window: dom.window, document: dom.window.document, location: dom.window.location, requestAnimationFrame: fn => setTimeout(fn, 0)});
  try {
    for (const [status, heading, retry] of [[404, 'Recipient not found', 0], [503, 'Recipient records could not load', 1]]) {
      globalThis.fetch = async () => new Response('{}', {status});
      const root = dom.window.document.getElementById('root');
      const view = mountGrantRecipient(root, {jurisdiction: 'federal', id: 'abn:1'});
      await view.ready;
      const article = root.querySelector('.grant-recipient-page');
      assert.equal(article.getAttribute('aria-busy'), null);
      assert.equal(article.querySelector('h1').textContent, heading);
      assert.equal(article.querySelectorAll('[role="alert"]').length, 1);
      assert.equal([...article.querySelectorAll('button')].filter(b => b.textContent === 'Try again').length, retry);
      view.destroy();
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});
