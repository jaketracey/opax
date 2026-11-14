import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nswHansardCoverageNote} from '../../scripts/nsw_hansard_coverage.mjs';
import {coverageCollections,coverageHTML} from '../../scripts/build_coverage.mjs';

const pub = new URL('../public/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path,pub),'utf8'));
const receipt = read('nsw-hansard-coverage.json');
const fixture = {...receipt,gaps:['nsw_la','nsw_lc'].flatMap(chamber=>[2023,2024].map(year=>({
  chamber,year,expected_days:1,missing_dates:[`${year}-${year===2023?'05-09':'02-06'}`]
})))};

test('NSW coverage line names each empty chamber-year and is shipped in the page',()=>{
  const initial=nswHansardCoverageNote(fixture);
  for (const chamber of ['NSW Assembly','NSW Council']) for (const year of [2023,2024]) {
    assert.ok(initial.includes(`${chamber} ${year}: speeches missing on `));
  }
  const note=nswHansardCoverageNote(receipt);
  assert.doesNotMatch(note,/—/);
  const row=coverageCollections().find(r=>r.name==='NSW Parliament');
  assert.equal(row.note,note);
  assert.ok(coverageHTML([row]).includes(note));
  const html=readFileSync(new URL('index.html',pub),'utf8');
  const start=html.indexOf(`<tr data-coverage="${row.id}"`);
  const shipped=html.slice(start,html.indexOf('</tr>',start));
  assert.ok(start>=0);
  if (note) assert.ok(shipped.includes(note));
  else assert.doesNotMatch(shipped,/NSW (?:Assembly|Council) \d{4}: speeches missing/);
});

test('coverage clears a filled chamber-year automatically and keeps residual gaps',()=>{
  const changed={...fixture,gaps:fixture.gaps.slice(1)};
  const note=nswHansardCoverageNote(changed);
  assert.ok(!note.includes('NSW Assembly 2023:'));
  assert.ok(note.includes('NSW Council 2023:'));
  assert.equal(nswHansardCoverageNote({...receipt,gaps:[]}), '');
  const row=coverageCollections(path=>path==='nsw-hansard-coverage.json'?{...receipt,gaps:[]}:read(path)).find(r=>r.name==='NSW Parliament');
  assert.equal(row.note,'');
  for (let filled=0;filled<=fixture.gaps.length;filled++) {
    const progress={...fixture,gaps:fixture.gaps.slice(filled)};
    const current=coverageCollections(path=>path==='nsw-hansard-coverage.json'?progress:read(path)).find(r=>r.name==='NSW Parliament');
    assert.equal(current.note,nswHansardCoverageNote(progress));
  }
});

test('coverage guard rejects unknown discovery, absent receipts and malformed gaps',()=>{
  for (const invalid of [null,{}, {...receipt,discovery:'failed'}, {...receipt,gaps:null},
      {...receipt,gaps:[{...fixture.gaps[0],missing_dates:[]}]},
      {...receipt,gaps:[{...fixture.gaps[0],missing_dates:['2026-01-01']}]}]) {
    assert.throws(()=>nswHansardCoverageNote(invalid),/coverage guard/);
  }
  assert.throws(()=>coverageCollections(path=>path==='nsw-hansard-coverage.json'?null:read(path)),/coverage guard/);
});


test('occupied days remain incomplete for held identities and failed or pending publication',()=>{
  const incomplete={...fixture,gaps:[{...fixture.gaps[0],missing_dates:[],incomplete_dates:['2023-05-09'],
    held_turns:2,publication_pending:3,publication_failed:1}]};
  const note=nswHansardCoverageNote(incomplete);
  for(const phrase of ['NSW Assembly 2023: 1 sitting day incomplete','2 turns awaiting speaker identification',
      '3 speeches awaiting publication','1 publication failure']) assert.ok(note.includes(phrase),phrase);
  assert.doesNotMatch(note,/being added|being filled/);
});

test('disabled repair describes holes without a fill promise',()=>{
  const disabled={...fixture,acquisition_enabled:false,publication_enabled:false};
  assert.doesNotMatch(nswHansardCoverageNote(disabled),/being added|being filled/);
  assert.ok(receipt.gaps.every(g=>g.status==='known, incomplete'));
  assert.doesNotMatch(nswHansardCoverageNote({...fixture,acquisition_enabled:true,publication_enabled:true}),/being added|being filled/);
});
