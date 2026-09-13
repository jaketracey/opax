import test from 'node:test';
import assert from 'node:assert/strict';
import { billTextDefault, billTextPath, billTextSections, billTextVersionLabel } from '../public/bill-text.js';

test('bill reader opens only version JSON belonging to the current bill', () => {
  const key = 'au-federal-r7531';
  assert.equal(billTextPath(key, `/bill-texts/${key}/r7531-first-reps.json`), `/bill-texts/${key}/r7531-first-reps.json`);
  for (const path of ['/bill-texts/other/version.json', `/bill-texts/${key}/../index.json`, `/bill-texts/${key}/%2e%2e/index.json`, 'https://example.org/version.json', `/bill-texts/${key}/version.json?other=1`]) assert.equal(billTextPath(key, path), null);
  assert.equal(billTextPath('../other', '/bill-texts/../other/version.json'), null);
});

test('publisher-selected version and explicit unknown version are not silently substituted', () => {
  const versions = [{id:'first',status:'complete'}, {id:'passed',status:'complete'}, {id:'missing',status:'unavailable'}];
  const manifest = {versions,default_version_id:'passed'};
  assert.equal(billTextDefault(manifest).id, 'passed');
  assert.equal(billTextDefault(manifest,'first').id, 'first');
  assert.equal(billTextDefault(manifest,'missing').id, 'missing');
  assert.equal(billTextDefault(manifest,'not-published'), null);
  assert.equal(billTextDefault({versions:[]}), null);
});

test('full source text keeps every section, schedule and indentation', () => {
  const sections = [{id:'s1',title:'Part 1',text:'1  Short title\n    (1) This Act…'}, {id:'schedule',title:'Schedule 1',text:'Schedule 1—Amendments\n\n  1. Replace subsection (2).\nFinal provision.'}];
  const text = sections.map(section=>section.text).join('\n\n');
  const rendered = billTextSections({text,sections});
  assert.equal(rendered, sections);
  assert.equal(rendered.map(section=>section.text).join('\n\n'), text);
});

test('an incomplete section array falls back to the entire uncut text', () => {
  const text = 'Part 1\nFirst provision\n\nSchedule 9\nFinal provision';
  const rendered = billTextSections({text,sections:[{title:'Part 1',text:'Part 1\nFirst provision'}]});
  assert.equal(rendered.length,1);
  assert.equal(rendered[0].text,text);
  assert.match(rendered[0].text,/Final provision$/);
  assert.deepEqual(billTextSections({text:''}),[]);
});

test('version labels distinguish incomplete and unavailable source versions', () => {
  assert.equal(billTextVersionLabel({stage_label:'As introduced in the House',date:'2026-08-20',status:'complete'}),'As introduced in the House · 2026-08-20');
  assert.match(billTextVersionLabel({stage_label:'As passed',status:'incomplete'}),/incomplete text/);
  assert.match(billTextVersionLabel({source_version:'first_reps',status:'unavailable'}),/text unavailable/);
});
