import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nswHansardCoverageNote} from '../../scripts/nsw_hansard_coverage.mjs';
import {coverageCollections,coverageHTML} from '../../scripts/build_coverage.mjs';

const pub = new URL('../public/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path,pub),'utf8'));
const receipt = read('nsw-hansard-coverage.json');

test('NSW coverage line names each empty chamber-year and is shipped in the page',()=>{
  const note=nswHansardCoverageNote(receipt);
  for (const chamber of ['NSW Assembly','NSW Council']) for (const year of [2023,2024]) {
    assert.ok(note.includes(`${chamber} ${year}: speeches missing on `));
  }
  assert.doesNotMatch(note,/—/);
  const row=coverageCollections().find(r=>r.name==='NSW Parliament');
  assert.equal(row.note,note);
  assert.ok(coverageHTML([row]).includes(note));
  assert.ok(readFileSync(new URL('index.html',pub),'utf8').includes(note));
});

test('coverage clears a filled chamber-year automatically and keeps residual gaps',()=>{
  const changed={...receipt,gaps:receipt.gaps.slice(1)};
  const note=nswHansardCoverageNote(changed);
  assert.ok(!note.includes(`${receipt.gaps[0].chamber==='nsw_la'?'NSW Assembly':'NSW Council'} ${receipt.gaps[0].year}:`));
  assert.ok(note.includes('NSW Council 2023:'));
  assert.equal(nswHansardCoverageNote({...receipt,gaps:[]}), '');
  const row=coverageCollections(path=>path==='nsw-hansard-coverage.json'?{...receipt,gaps:[]}:read(path)).find(r=>r.name==='NSW Parliament');
  assert.equal(row.note,'');
});

test('coverage guard rejects unknown discovery, absent receipts and malformed gaps',()=>{
  for (const invalid of [null,{}, {...receipt,discovery:'failed'}, {...receipt,gaps:null},
      {...receipt,gaps:[{...receipt.gaps[0],missing_dates:[]}]},
      {...receipt,gaps:[{...receipt.gaps[0],missing_dates:['2026-01-01']}]}]) {
    assert.throws(()=>nswHansardCoverageNote(invalid),/coverage guard/);
  }
  assert.throws(()=>coverageCollections(path=>path==='nsw-hansard-coverage.json'?null:read(path)),/coverage guard/);
});
