import {foldDonorName} from '../public/donor-entity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {donorIndexFile} from '../../scripts/build_donor_index.mjs';
import {donorLookup,donorDisclosure} from '../public/donor-disclosure.js';
test('the published donor index carries source names, return references and match evidence',()=>{
 const expected=donorIndexFile();
 const published=JSON.parse(readFileSync(new URL('../public/graph/donor-index.json',import.meta.url)));
 assert.deepEqual(published,expected);
 assert.ok(expected.donors.length>1000);
 assert.equal(Object.hasOwn(published,'withheld'),false);
 const index=donorLookup(expected.donors);
 for(const donor of expected.donors){
  // Since d786784a2 a rolled-up entity is labelled by its canonical name; source_name keeps the disclosure spelling.
  assert.ok(donor.label&&donor.source_name,donor.id);
  assert.ok(index.has(foldDonorName(donor.source_name)),donor.source_name);
  assert.ok(donor.returnReferences.length);
  assert.ok(index.has(foldDonorName(donor.label)));
  const view=donorDisclosure(donor);
  // Every published name links: a confident match to its entity's page, any other to its own spelling's page.
  if(donor.match.confidence!==1 || !['exact','curated'].includes(donor.match.method))assert.equal(view.href,'/subject/donor/'+encodeURIComponent(donor.source_name));
 }
});

// A donor that leaves a money map keeps its index entry, its page and its search result
// (export_donor_disclosures.indexed_off_map carries it into donor-disclosures.json).
test('every donor on main\'s published index is still reachable by its name', () => {
  const pinned = JSON.parse(readFileSync(new URL('./fixtures/donor-index-main.json', import.meta.url))).donors;
  const index = donorLookup(JSON.parse(readFileSync(new URL('../public/graph/donor-index.json', import.meta.url))).donors);
  const lost = pinned.filter(row => !index.has(foldDonorName(row.split('\t')[1])));
  assert.deepEqual(lost, []);
  assert.ok(pinned.includes('federal\tLinc Energy'), 'Linc Energy, rank 251 since the Libertarian Party\'s donors were counted');
  const linc = index.get(foldDonorName('Linc Energy'));
  assert.deepEqual([linc.jurisdiction, linc.total, linc.count], ['federal', 671498, 18], 'its own returns, summed from the database');
});
