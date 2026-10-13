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
  assert.equal(donor.label,donor.source_name);
  assert.ok(donor.returnReferences.length);
  assert.ok(index.has(foldDonorName(donor.label)));
  const view=donorDisclosure(donor);
  if(donor.match.confidence!==1 || !['exact','curated'].includes(donor.match.method))assert.equal(view.href,null);
 }
});
