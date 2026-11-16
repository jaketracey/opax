// The Federal Register's dated CC BY 4.0 attribution (public/frl-attribution.js): the wording, the day it is dated by,
// and where the bill page uses it. Policy: parli/ingest/source_policy.json, frl_acts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frlFullDate, frlAttribution, frlRetrieved, billHasFrlDates, billFrlAttribution, isFrlStage } from '../public/frl-attribution.js';
import * as labels from '../public/labels.js';

const policy = JSON.parse(readFileSync(new URL('../../parli/ingest/source_policy.json', import.meta.url))).frl_acts;

test('the attribution is the register\'s wording, dated by a full date, and nothing without a real day', () => {
  assert.equal(frlAttribution('2026-11-17'), policy.attribution.replace('{full date of download}', '17 November 2026'));
  assert.equal(frlFullDate('2026-11-03T16:20:00Z'), '3 November 2026');
  for (const bad of ['', null, '2026-02-30', '17 Nov 2026', undefined]) assert.equal(frlAttribution(bad), '');
});

test('a bill is dated by its newest download day, else by the export day it was read in', () => {
  const held = { acts: [{ assent_date: '2026-11-12', retrieved: '2026-11-17' }],
    key_dates: [{ stage: 'royal_assent', date: '2026-11-12', source: 'frl', retrieved: '2026-11-18' }, { stage: 'second_reading', date: '2026-10-28', source: 'hansard' }] };
  assert.equal(frlRetrieved(held, '2026-10-04T16:27:54+00:00'), '2026-11-18');
  const legacy = { acts: [{ assent_date: '2026-09-18' }], key_dates: [{ stage: 'royal_assent', date: '2026-09-18', house: 'senate' }] };
  assert.equal(frlRetrieved(legacy, '2026-10-04T16:27:54+00:00'), '2026-10-04');
  assert.equal(frlRetrieved(legacy), '');
  assert.ok(billHasFrlDates(legacy) && billHasFrlDates(held));
  assert.ok(!billHasFrlDates({ acts: [], key_dates: [{ stage: 'royal_assent', date: '2026-09-18', house: 'senate' }] }), 'ParlInfo\'s own assent row is not the register\'s');
  assert.equal(billFrlAttribution({ acts: [] }, '2026-10-04'), '');
  assert.ok(isFrlStage({ source: 'frl' }) && !isFrlStage({ source: 'hansard' }));
});

test('the bill page reads the helpers through labels.js in the timeline and the Acts blocks', () => {
  assert.equal(labels.billFrlAttribution, billFrlAttribution);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const timeline = app.slice(app.indexOf('function billTimelineHTML('), app.indexOf('function billActsHTML('));
  const acts = app.slice(app.indexOf('function billActsHTML('), app.indexOf('function billActsHTML(') + 2000);
  for (const block of [timeline, acts]) assert.match(block, /esc\(uiLabels\.billFrlAttribution\(bill, bill\.exportedAt\)\)/);
  assert.match(timeline, /d\.source === "hansard"/);
});
