// The server's donor page decision (src/index.ts moneySubjectMeta), with fixture
// donor indexes. Fixture names are invented. Order matters: the index is read once
// per Worker and kept, unless the read fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import { workerFetch } from './helpers/worker-fetch.mjs';

const INDEX = '/graph/donor-index.json';
const donor = label => ({ id: `donor:${label.toLowerCase()}`, label, kind: 'donor', jurisdiction: 'federal', returnReferences: [{ return_type: 'Donor', year: '2023-24', return_id: 'fixture-1' }] });

test('a donor index that cannot be read is a 503, never a missing-donor page', async () => {
  const response = await workerFetch('/subject/donor/Invented%20Holdings%20Pty%20Ltd', {}, {}, { assets: { [INDEX]: 'not json' } });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /This donor (?:isn&#39;t|isn't) in OPAX/);
});

test('a name the index holds is found by the index\'s own fold, accents and curly apostrophes included', async () => {
  const assets = { [INDEX]: { version: 2, donors: [donor('Crème O’Brien Example Pty Ltd')] } };
  // Composed or decomposed accent, straight or curly apostrophe: the same record.
  for (const name of ['Crème O’Brien Example Pty Ltd', 'Crème O\'Brien Example Pty Ltd', 'crème o’brien example pty ltd']) {
    const response = await workerFetch(`/subject/donor/${encodeURIComponent(name)}`, {}, {}, { assets });
    assert.equal(response.status, 200, name);
    assert.doesNotMatch(await response.text(), /data-not-found/, name);
  }
  const missing = await workerFetch('/subject/donor/Nobody%20Invented%20Ltd', {}, {}, { assets });
  assert.equal(missing.status, 404);
  const html = await missing.text();
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.title, "This donor isn't in OPAX · OPAX", 'the tab says what the heading says');
  assert.equal(doc.querySelector('#not-found-title').textContent, "This donor isn't in OPAX");
});
