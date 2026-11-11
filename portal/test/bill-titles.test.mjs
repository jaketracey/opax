import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {personIndex} from '../src/person-slug.ts';
import {BILL_TITLES_PATH, billTitlesFile} from '../public/bill-titles.js';

// A server-rendered profile parsed /bills/index.json (1.8 MB) for four fields: each bill's key,
// title, aliases and jurisdiction (12 Nov 2026). The release build keeps them in
// /growth/bill-titles.json; with or without it, a profile renders the same.
const pub = new URL('../public/', import.meta.url);
const parsed = new Map();
const readFile = path => { if (!parsed.has(path)) parsed.set(path, JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8'))); return parsed.get(path); };

test('bill titles: the four fields in index order, nothing else', () => {
  const index = {generated_at: '2026-11-11', bills: [{key: 'au-federal-r1', title: 'A Bill', short_title: 'A', status: 'passed', jurisdiction: 'federal'}, {key: 'au-nsw-2', title: null, aliases: ['Other Bill'], jurisdiction: 'nsw', sponsor: 'X'}]};
  assert.deepEqual(billTitlesFile(index), {generated_at: '2026-11-11', bills: [{key: 'au-federal-r1', title: 'A Bill', jurisdiction: 'federal'}, {key: 'au-nsw-2', title: null, aliases: ['Other Bill'], jurisdiction: 'nsw'}]});
  assert.throws(() => billTitlesFile({}));
});

test('bill titles: profiles render the same from the titles file as from the whole index', {skip: !existsSync(new URL(BILL_TITLES_PATH.slice(1), pub))}, async () => {
  const people = readFile('/parliamentarians.json').people;
  const {slugOf} = personIndex(people);
  const sample = people.filter((p, i) => p.current || i % 25 === 0).slice(0, 60);
  assert.ok(sample.length >= 30);
  for (const p of sample) {
    const reads = [];
    const withTitles = path => { reads.push(path); return Promise.resolve().then(() => readFile(path)); };
    const withoutTitles = path => path === BILL_TITLES_PATH ? Promise.reject(new Error('missing')) : Promise.resolve().then(() => readFile(path));
    const a = (await renderPersonAnswer(p, withTitles, slugOf)).html;
    const b = (await renderPersonAnswer(p, withoutTitles, slugOf)).html;
    assert.equal(a, b, p.name);
    assert.ok(reads.includes(BILL_TITLES_PATH));
    assert.ok(!reads.includes('/bills/index.json'), p.name);
  }
});
