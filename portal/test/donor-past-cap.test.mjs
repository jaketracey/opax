// A donor that leaves a money map (another donor's gifts push it past the 250 cap) keeps
// its index entry and its page: the weekly disclosure export carries it from last week's
// index (scripts/export_donor_disclosures.py indexed_off_map) and build_donor_index keeps it.
// Its own file: the Worker reads the donor index once and keeps it. Names are invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFetch } from './helpers/worker-fetch.mjs';

const INDEX = '/graph/donor-index.json';
test('a donor ranked just past the money map\'s cap keeps its index entry and its page, which says it is not drawn', async () => {
  const {mkdtempSync, mkdirSync, writeFileSync} = await import('node:fs');
  const {join} = await import('node:path');
  const {tmpdir} = await import('node:os');
  const {donorIndexFile} = await import('../../scripts/build_donor_index.mjs');
  const root = mkdtempSync(join(tmpdir(), 'past-cap-'));
  mkdirSync(join(root, 'graph'));
  // This week's map draws rank 250; rank 251 (invented) left it. The weekly disclosure
  // export carries it from last week's index with its own returns summed.
  const drawn = {id: 'donor:rank 250 example', label: 'Rank 250 Example Pty Ltd', kind: 'donor', total: 672000, count: 3};
  for (const path of ['money.json', 'money.qld.json', 'money.vic.json', 'money.tas.json'])
    writeFileSync(join(root, 'graph', path), JSON.stringify({meta: {}, nodes: path === 'money.json' ? [drawn] : [], edges: []}));
  const pastCap = {id: 'donor:past-cap:federal', label: 'Past Cap Example Pty Ltd', kind: 'donor', jurisdiction: 'federal', total: 671000, count: 2,
    firstYear: 2014, lastYear: 2015, match: {confidence: 0.9, method: 'rule', entity_id: 'past-cap', href: null},
    returnReferences: [{source_name: 'Past Cap Example Pty Ltd', return_type: 'AEC annual return', year: '2014-15', url: 'https://transparency.aec.gov.au/'}]};
  writeFileSync(join(root, 'graph/donor-disclosures.json'), JSON.stringify({version: 1, donors: [pastCap], references: []}));
  const index = donorIndexFile(root);
  assert.deepEqual(index.donors.map(d => d.label), ['Rank 250 Example Pty Ltd', 'Past Cap Example Pty Ltd']);
  assert.equal(index.donors[1].total, 671000);
  const response = await workerFetch('/subject/donor/Past%20Cap%20Example%20Pty%20Ltd', {}, {}, {assets: {[INDEX]: index}});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /No donor by this name/);
  assert.match(html, /Past Cap Example Pty Ltd: disclosed electoral returns\. Receipts disclosed under this exact name\. This donor is not drawn on the money map, which shows a bounded selection of donors\./);
});
