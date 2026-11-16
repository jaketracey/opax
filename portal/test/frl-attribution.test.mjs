// The Federal Register's dated CC BY 4.0 attribution (public/frl-attribution.js): the wording, the day it is dated by,
// and where the bill page uses it. Policy: parli/ingest/source_policy.json, frl_acts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frlFullDate, frlAttribution, frlRetrieved, billHasFrlDates, billFrlAttribution, isFrlStage, sydneyDay, HELD_READINGS_NOTE, HELD_ASSENT_NOTE } from '../public/frl-attribution.js';
import * as labels from '../public/labels.js';
import { renderBillAnswer } from '../src/seo-content.ts';

const policy = JSON.parse(readFileSync(new URL('../../parli/ingest/source_policy.json', import.meta.url))).frl_acts;

test('the attribution is the register\'s wording, dated by a full date, and nothing without a real day', () => {
  assert.equal(frlAttribution('2026-11-17'), policy.attribution.replace('{full date of download}', '17 November 2026'));
  assert.equal(frlFullDate('2026-11-03T16:20:00Z'), '3 November 2026');
  for (const bad of ['', null, '2026-02-30', '17 Nov 2026', undefined]) assert.equal(frlAttribution(bad), '');
});

test('a bill is dated by its newest download day, else by the export day it was read in (its Sydney day)', () => {
  const held = { acts: [{ assent_date: '2026-11-12', retrieved: '2026-11-17' }],
    key_dates: [{ stage: 'royal_assent', date: '2026-11-12', source: 'frl', retrieved: '2026-11-18' }, { stage: 'second_reading', date: '2026-10-28', source: 'hansard' }] };
  assert.equal(frlRetrieved(held, '2026-10-04T16:27:54+00:00'), '2026-11-18');
  const legacy = { acts: [{ assent_date: '2026-09-18' }], key_dates: [{ stage: 'royal_assent', date: '2026-09-18', house: 'senate' }] };
  // 2026-10-04T16:27:54Z is 03:27 on 5 Oct in Sydney: the day the site's "as at" line shows for the export.
  assert.equal(frlRetrieved(legacy, '2026-10-04T16:27:54+00:00'), '2026-10-05');
  assert.equal(frlRetrieved(legacy, '2026-10-04'), '2026-10-04');
  assert.equal(sydneyDay('2026-07-04T15:00:00Z'), '2026-07-05');
  assert.equal(sydneyDay('2026-02-30'), '');
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
  assert.match(timeline, /esc\(uiLabels\.HELD_READINGS_NOTE\)/);
  assert.match(timeline, /esc\(uiLabels\.HELD_ASSENT_NOTE\)/);
});

test('each note names its own source: ParlInfo, Hansard and the Federal Register, never "the register" twice', () => {
  assert.match(HELD_READINGS_NOTE, /^Readings dated after ParlInfo, the Parliament's bills database, was last read come from Hansard/);
  assert.match(HELD_ASSENT_NOTE, /^Royal Assent dated after ParlInfo was last read is the Act's making date on the Federal Register of Legislation\.$/);
  for (const note of [HELD_READINGS_NOTE, HELD_ASSENT_NOTE]) assert.doesNotMatch(note, /the register|\u2014/);
});

// Review P1-1: the server-rendered bill page (/bill/<key>, what crawlers index) shows the same dated wording.
const HELD_BILL = {
  key: 'au-federal-r7549', title: 'Fixture Amendment Bill 2026', status: 'passed', status_as_of: '2026-10-16',
  key_dates: [
    { stage: 'introduced', date: '2026-09-17', house: 'representatives', url: 'https://example.test/parlinfo' },
    { stage: 'second_reading', date: '2026-10-13', house: 'senate', url: 'https://data.openaustralia.org.au/scrapedxml/senate_debates/2026-10-13.xml', source: 'hansard' },
    { stage: 'royal_assent', date: '2026-10-16', house: null, url: 'https://www.legislation.gov.au/C2026A00092', source: 'frl', retrieved: '2026-11-17' },
  ],
  acts: [{ title: 'Fixture Amendment Act 2026', frl_uri: 'https://www.legislation.gov.au/C2026A00092', assent_date: '2026-10-16', retrieved: '2026-11-17' }],
  sources: [{ kind: 'frl_act', url: 'https://www.legislation.gov.au/C2026A00092', retrieved: '2026-11-17' }],
  exported_at: '2026-10-04T16:27:54+00:00',
};
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('the server bill page carries the dated register wording and both notes where held-source dates appear', () => {
  const text = plain(renderBillAnswer(HELD_BILL, [], new Map()).html);
  const credit = frlAttribution('2026-11-17');
  assert.ok(credit.startsWith('Based on content from the Federal Register of Legislation at 17 November 2026.'));
  assert.equal(text.split(credit).length - 1, 2, 'under Recorded stages and under Sources');
  assert.ok(text.includes(HELD_READINGS_NOTE) && text.includes(HELD_ASSENT_NOTE));
  // A bill whose Act was read before the overlay is dated by the export's Sydney day.
  const legacy = { ...HELD_BILL, key_dates: HELD_BILL.key_dates.slice(0, 1), acts: [{ ...HELD_BILL.acts[0], retrieved: undefined }],
    sources: [{ kind: 'frl_act', url: HELD_BILL.sources[0].url }] };
  const old = plain(renderBillAnswer(legacy, [], new Map()).html);
  assert.ok(old.includes(frlAttribution('2026-10-05')));
  assert.ok(!old.includes(HELD_READINGS_NOTE) && !old.includes(HELD_ASSENT_NOTE));
  // No register date, no wording.
  const none = plain(renderBillAnswer({ ...legacy, acts: [], sources: [] }, [], new Map()).html);
  assert.ok(!none.includes('Federal Register of Legislation at'));
});

test('the bill route hands the export day to the server page', () => {
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(index, /renderBillAnswer\(\{\.\.\.bill,division_titles:titles,exported_at:related\.generated_at\}/);
});
