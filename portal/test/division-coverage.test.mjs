import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { divisionComplete, divisionCoverageNote } from '../public/division-markdown.js';
import { renderDivisionAnswer } from '../src/seo-content.ts';

const read = key => JSON.parse(readFileSync(new URL(`../public/divisions/division-${key}.json`, import.meta.url)));

test('each sourced teller convention is complete and explains both held and source counts', () => {
  for (const key of ['federal-senate-1583', 'federal-senate-2858', 'federal-representatives-831', 'federal-representatives-396', 'federal-representatives-807']) {
    const d = read(key);
    assert.equal(divisionComplete(d), true, key);
    const note = divisionCoverageNote(d);
    assert.doesNotMatch(note, /official/i);
    assert.match(note, /named ayes and \d+ named noes/);
    assert.match(note, /They Vote For You tally of \d+ ayes and \d+ noes excludes those tellers/);
    const html = renderDivisionAnswer(d, [], new Map()).html;
    assert.match(html, /excludes those tellers/);
    assert.doesNotMatch(html, /member list is partial/);
  }
});

test('partial lists quantify both sides against source counts, including mixed large gaps', () => {
  for (const key of ['federal-representatives-7575', 'federal-senate-5323', 'federal-representatives-2496', 'nsw-lc-2026-10-22-4']) {
    const d = read(key);
    assert.equal(divisionComplete(d), false, key);
    const note = divisionCoverageNote(d);
    assert.doesNotMatch(note, /official/i);
    assert.match(note, /member list is partial: \d+ named ayes and \d+ named noes are held/);
    assert.ok(note.includes(`source tally of ${d.ayes} ayes and ${d.noes} noes`));
    assert.match(renderDivisionAnswer(d, [], new Map()).html, /compared with the source tally/);
  }
});

test('a label or arithmetic offset does not prove a teller convention; stale proof is rejected', () => {
  const d = read('federal-senate-2858');
  for (const mutate of [
    row => { delete row._meta.member_reconciliation; },
    row => { row._meta.member_reconciliation.source_url = 'https://example.test/'; },
    row => { row._meta.member_reconciliation.tellers = [2, 2]; },
    row => { row.ayes++; },
    row => { row.date = '2006-09-07'; },
    row => { row.members = row.members.slice(1); },
  ]) {
    const changed = structuredClone(d);
    mutate(changed);
    assert.equal(divisionComplete(changed), false);
    assert.match(divisionCoverageNote(changed), /member list is partial/);
  }
});

test('recovered NSW votes retain individually sourced dated identities', () => {
  for (const key of ['nsw-lc-2025-11-27-2', 'nsw-lc-2025-12-23-19', 'nsw-lc-2025-12-23-20', 'nsw-lc-2026-09-24-13']) {
    const d = read(key);
    const m = d.members.find(m => m.name === 'Ben Franklin');
    assert.equal(m.vote, key === 'nsw-lc-2026-09-24-13' ? 'aye' : 'no');
    assert.equal(m.member_source.url, d.source_url);
    assert.equal(m.member_source.seat, 'New South Wales');
    assert.equal(m.member_source.chamber, 'nsw_lc');
    assert.equal(divisionComplete(d), true);
  }
});
