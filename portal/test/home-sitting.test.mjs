import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sittingLine, sydneyToday, hydrateSitting} from '../public/home-data.js';

// The published calendar as shipped (docs/DATA-SITTING-DAYS.md), read on pinned dates.
const calendar = JSON.parse(readFileSync(new URL('../public/parliament/sitting-days.json', import.meta.url), 'utf8'));
const listed = new Map(calendar.days.map(d => [d.date, d]));
const sample = (pred) => calendar.days.find(pred)?.date;

test('a sitting day of both houses says parliament is sitting, and links the sitting weeks', () => {
  const both = sample(d => d.house && d.senate);
  assert.deepEqual(sittingLine(calendar, both), {href: '/sitting', text: 'Parliament is sitting today'});
});

test('one house sitting names that house', () => {
  const senate = sample(d => d.senate && !d.house);
  const house = sample(d => d.house && !d.senate);
  if (senate) assert.equal(sittingLine(calendar, senate).text, 'The Senate is sitting today');
  if (house) assert.equal(sittingLine(calendar, house).text, 'The House of Representatives is sitting today');
  const fixture = {...calendar, days: [{date: '2026-06-01', house: false, senate: true}, {date: '2026-06-02', house: true, senate: false}]};
  assert.equal(sittingLine(fixture, '2026-06-01').text, 'The Senate is sitting today');
  assert.equal(sittingLine(fixture, '2026-06-02').text, 'The House of Representatives is sitting today');
});

test('a non-sitting day names the next sitting day from the calendar, in words', () => {
  const today = '2026-11-14'; // a Saturday
  assert.ok(!listed.has(today));
  const next = calendar.days.map(d => d.date).filter(d => d > today).sort()[0];
  const line = sittingLine(calendar, today);
  const [y, m, d] = next.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {weekday: 'long', timeZone: 'UTC'});
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {month: 'long', timeZone: 'UTC'});
  assert.equal(line.text, `Next sitting day: ${weekday} ${d} ${month}`);
  assert.doesNotMatch(line.text, /—/);
});

test('no line when the calendar is missing, stale, out of range or has no next sitting', () => {
  assert.equal(sittingLine(null, '2026-11-14'), null);
  assert.equal(sittingLine({...calendar, schema_version: 2}, '2026-11-14'), null);
  assert.equal(sittingLine(calendar, '2027-01-04'), null, 'after coverage and expiry');
  assert.equal(sittingLine({...calendar, expires: '2026-11-01'}, '2026-11-14'), null, 'expired');
  assert.equal(sittingLine(calendar, '2025-12-31'), null, 'before coverage');
  const lastSitting = calendar.days.map(d => d.date).sort().at(-1);
  const after = '2026-12-30';
  assert.ok(after > lastSitting);
  assert.equal(sittingLine(calendar, after), null, 'no sitting left in coverage: unknown, not guessed');
  assert.equal(sittingLine({...calendar, days: 'x'}, '2026-11-14'), null);
});

test('Sydney decides the date, not the reader’s clock', () => {
  // 13 Nov 2026 14:30 UTC is already 14 Nov in Sydney (AEDT, UTC+11).
  assert.equal(sydneyToday(new Date('2026-11-13T14:30:00Z')), '2026-11-14');
});

test('the slot stays hidden when the file cannot be read, and fills when it can', async () => {
  const prior = globalThis.fetch;
  const slot = {hidden: true, innerHTML: ''};
  try {
    globalThis.fetch = async () => ({ok: false});
    await hydrateSitting(slot, '2026-11-14');
    assert.equal(slot.hidden, true);
    assert.equal(slot.innerHTML, '');
    globalThis.fetch = async () => ({ok: true, json: async () => calendar});
    await hydrateSitting(slot, sample(d => d.house && d.senate));
    assert.equal(slot.hidden, false);
    assert.equal(slot.innerHTML, '<a href="/sitting">Parliament is sitting today</a>');
    globalThis.fetch = async () => ({ok: false});
    await hydrateSitting(slot, '2026-11-14');
    assert.equal(slot.hidden, true);
    assert.equal(slot.innerHTML, '', 'a line that can no longer be said is cleared, not just hidden');
  } finally { globalThis.fetch = prior; }
});

test('the home page carries the slot above its title, hidden until the calendar answers', () => {
  const html = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
  assert.match(html, /<p id="hp-sitting" class="hp-sitting" hidden><\/p>\s*<h1 id="hp-title">/);
});
