// Division pages and parties (portal audit F08). Rows the division source lists
// without a party may carry one from a dated roster (scripts/vote_parties.py);
// the page says so, and rows that still have none are counted in words, never
// as an "Unknown" party line. Invented members only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDivisionAnswer } from '../src/seo-content.ts';

const roster = { basis: 'official-list', url: 'https://example.test/lc-list.pdf' };
const division = (members, over = {}) => ({
  key: 'nsw-lc-2026-09-25-1', slug: 'division-nsw-lc-2026-09-25-1', house: 'nsw_lc', jurisdiction: 'nsw', date: '2026-09-25',
  name: 'Fixture motion', question: 'That the fixture be agreed to.', result: 'affirmative',
  ayes: members.filter((m) => m.vote === 'aye').length, noes: members.filter((m) => m.vote === 'no').length,
  members, bills: [], ...over,
});
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** The party lines: list items between the party heading and the next heading. */
const partyLines = (html) => {
  const section = /<h3>How each party voted<\/h3>([\s\S]*?)(?=<h3>|$)/.exec(html)?.[1] || '';
  return [...section.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]).replace(' : ', ': '));
};

test('roster-sourced labels are named as such, and unknown rows are counted in words', () => {
  const { html } = renderDivisionAnswer(division([
    { name: 'Morgan Fixture', vote: 'aye', party: 'Example Party', party_source: roster },
    { name: 'Riley Sample', vote: 'aye', party: 'Example Party' },
    { name: 'Jordan Placeholder', vote: 'no' },
    { name: 'Casey Instance', vote: 'no' },
  ]), [], new Map());
  assert.deepEqual(partyLines(html), ['Example Party: aye 2']);
  assert.match(text(html), /Party labels are those recorded for this division, except for 1 member the division record lists without a party: their labels are the ones a dated parliamentary roster records for them on this date\./);
  assert.match(text(html), /No party is recorded for 2 members on this date; they are not counted in any party line above\./);
  assert.doesNotMatch(html, /Unknown/);
});

test('a division with no party for anyone says so plainly, with no party lines', () => {
  const { html } = renderDivisionAnswer(division([
    { name: 'Jordan Placeholder', vote: 'aye' }, { name: 'Casey Instance', vote: 'no' },
  ]), [], new Map());
  assert.deepEqual(partyLines(html), []);
  assert.match(text(html), /No party is recorded for any of the 2 members on this date\./);
  assert.doesNotMatch(html, /dated parliamentary roster/);
  assert.doesNotMatch(html, /Unknown/);
});

test('an index tally with an unknown count never becomes a party line', () => {
  const { html } = renderDivisionAnswer(division([{ name: 'Riley Sample', vote: 'aye', party: 'Example Party' }, { name: 'Jordan Placeholder', vote: 'no' }], {
    party_tallies: [{ party: 'Example Party', votes: { aye: 1 } }], recorded_ayes: 1, recorded_noes: 1, unknown_party_count: 1,
  }), [], new Map());
  assert.deepEqual(partyLines(html), ['Example Party: aye 1']);
  assert.match(text(html), /No party is recorded for 1 member on this date/);
});

test('a source label from another period is replaced, said so, and only the dated party has a line', () => {
  const corrected = { basis: 'release-term', url: null, source_party: 'Later Party' };
  const { html } = renderDivisionAnswer(division([
    { name: 'Morgan Fixture', vote: 'aye', party: 'Example Party', party_source: corrected },
    { name: 'Riley Sample', vote: 'aye', party: 'Example Party' },
    { name: 'Jordan Placeholder', vote: 'no', party: 'Other Party' },
  ], { house: 'representatives', jurisdiction: 'federal' }), [], new Map());
  assert.deepEqual(partyLines(html), ['Example Party: aye 2', 'Other Party: no 1']);
  assert.match(text(html), /For 1 member, the division record gives a party not held on this date; the label shown is the party dated service records give for this date\./);
  // A correction is not a gap fill.
  assert.doesNotMatch(html, /dated parliamentary roster/);
  assert.doesNotMatch(html, /Later Party/);
});

test('a held-back label is counted with the unknown rows and never shown', () => {
  const { html } = renderDivisionAnswer(division([
    { name: 'Riley Sample', vote: 'aye', party: 'Example Party' },
    { name: 'Casey Instance', vote: 'no', party_withheld: { source_party: 'Later Party', reason: 'conflicting' } },
  ]), [], new Map());
  assert.deepEqual(partyLines(html), ['Example Party: aye 1']);
  assert.match(text(html), /No party is recorded for 1 member on this date; they are not counted in any party line above\. For 1 of them, the division record gives a party that dated records leave unclear for this date, so it is not shown\./);
  assert.doesNotMatch(html, /Later Party/);
  assert.doesNotMatch(html, /Unknown/);
});

test('when every label came from a roster the page says so, not that the division recorded them', () => {
  const { html } = renderDivisionAnswer(division([
    { name: 'Morgan Fixture', vote: 'aye', party: 'Example Party', party_source: roster },
    { name: 'Riley Sample', vote: 'no', party: 'Other Party', party_source: roster },
  ]), [], new Map());
  assert.doesNotMatch(html, /Party labels are those recorded for this division/);
  assert.match(text(html), /The division record gives no parties\. Each label here is the one a dated parliamentary roster records for that member on this date\./);
});

test('party lines covering under half the members say so before the lines', () => {
  const unknown = Array.from({ length: 5 }, (_, i) => ({ name: `Placeholder Member${i}`, vote: i % 2 ? 'no' : 'aye' }));
  const { html } = renderDivisionAnswer(division([
    { name: 'Morgan Fixture', vote: 'aye', party: 'Example Party', party_source: roster }, ...unknown,
  ]), [], new Map());
  const note = html.indexOf('These party lines cover only 1 of the 6 members listed. No party is recorded for the other 5 on this date.');
  assert.ok(note > 0, 'the coverage note is on the page');
  assert.ok(note < html.indexOf('<li>'), 'and comes before the party lines');
  // Said once, not repeated after the lines.
  assert.doesNotMatch(html, /not counted in any party line above/);
  assert.doesNotMatch(html, /Unknown/);
});
