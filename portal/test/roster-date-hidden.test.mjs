// The date a seat roster was last reconciled is data, not a label: it is never rendered on a member
// page, in that page's sources sheet, or on an electorate page. Each place still names its source.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {shortDate} from '../public/format.js';
import {personRepresentationRows, profileHTML} from '../public/electorates.js';
import {personSlug} from '../src/person-slug.ts';
import {loadWorker, offline} from './worker-harness.mjs';

const read = path => JSON.parse(readFileSync(new URL('../public' + path.split('?')[0], import.meta.url), 'utf8'));
const manifest = read('/electorates/manifest.json');
const servicePeople = read(manifest.people_url).people;
const index = read(manifest.index_url);
const roster = read('/parliamentarians.json').people;

// A date said of the roster, however it is worded: "as at 4 Sep 2026", "Verified 2026-09-04", "Checked 4 September 2026".
const DAY = String.raw`(?:\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}|\d{4}-\d{2}-\d{2})`;
const ROSTER_DATE = new RegExp(String.raw`(?:roster|verified|checked|as at|as of)\b[^.<>]{0,40}?${DAY}`, 'i');
const seatOf = name => servicePeople.find(p => p.name === name).electorates.find(e => e.current);
const noRosterDate = (text, seat, where) => {
  assert.doesNotMatch(text, ROSTER_DATE, where);
  for (const form of [seat.as_of, shortDate(seat.as_of)]) assert.ok(!text.includes(form), `${where}: shows the roster date ${form}`);
};

// A federal member with their own party, and a state member whose party comes from the seat roster.
const own = roster.find(p => p.name === 'Anthony Albanese');
const fallback = roster.find(p => !p.party && !p.party_now && p.current !== false && /\s/.test(p.name)
  && servicePeople.some(s => s.name === p.name && s.electorates.some(e => e.current && e.party)));
const members = [own, fallback];

test('the rule itself catches the wordings that were on the page', () => {
  for (const text of ['As at 4 Sep 2026 · Parliamentary roster', 'Checked 4 Sep 2026.', 'Verified 4 Sep 2026',
    'Labor (parliamentary roster as at 9 Sep 2026)', 'Verified 2026-09-04.', 'Parliamentary roster, as of 4 September 2026']) {
    assert.match(text, ROSTER_DATE, text);
  }
  for (const text of ['Parliamentary roster', 'Verified seat roster', 'Labor (parliamentary roster)',
    'Speeches in the record 6 May 1996 – 17 Sep 2026', 'Status as at 12 Feb 2022'.replace('Status as at', 'Passed on')]) {
    assert.doesNotMatch(text, ROSTER_DATE, text);
  }
  assert.ok(own && fallback, 'both kinds of member are in the roster');
  assert.ok(seatOf(own.name).as_of && seatOf(fallback.name).as_of, 'each has a dated current seat, so there is a date to hide');
});

function shell(path) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
      workerData: {kind: 'person', path, html: true, selector: '.subject-head .ui-source', settleMs: 400},
    });
    const timer = setTimeout(() => { worker.terminate(); reject(Error(`${path}: shell exceeded 20 seconds`)); }, 20000);
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0 || !result) reject(Error(`${path}: shell exited with ${code}`));
      else if (result.error) reject(Error(result.error));
      else resolve(result);
    });
  });
}

for (const person of members) {
  test(`${person.name}: the browser's member page and its sources sheet show no roster date`, {timeout: 30000}, async () => {
    const seat = seatOf(person.name);
    const result = await shell(`/subject/person/${personSlug(person.name)}`);
    const doc = new JSDOM(result.html).window.document;
    const head = doc.querySelector('.subject-head');
    assert.ok(head, 'the member header rendered');
    const line = [...head.querySelectorAll('details.ui-source')].find(d => /Parliamentary roster/.test(d.querySelector('summary').textContent));
    assert.ok(line, 'the roster source line is in the header');
    // The line names its source and nothing else; the sheet keeps its facts.
    assert.equal(line.querySelector('summary').textContent.trim(), 'Parliamentary roster');
    const sheet = line.querySelector('.ui-sheet');
    assert.match(sheet.textContent, /Status/);
    assert.match(sheet.textContent, new RegExp(seat.name));
    noRosterDate(head.querySelector('.subject-tag').textContent, seat, 'header meta line');
    noRosterDate(line.querySelector('summary').textContent, seat, 'source line');
    for (const row of sheet.querySelectorAll('.ui-sheet-facts > div, .ui-sheet-notes > p, .ui-sheet-asat')) {
      // A fact that is itself a span of dates (service, speeches) is not a roster date.
      if (/^(Parliamentary service|Speeches in the record)/.test(row.textContent)) continue;
      noRosterDate(row.textContent, seat, `sheet: ${row.textContent.slice(0, 40)}`);
    }
    if (person === fallback) assert.match(head.querySelector('.subject-tag').textContent, /parliamentary roster/);
  });
}

test('the seat rows a member sheet draws name the roster and carry no date', () => {
  for (const person of members) {
    const service = servicePeople.find(p => p.name === person.name);
    const rows = personRepresentationRows(service, person.representation || [], index.electorates);
    assert.match(rows[0][1], /Verified seat roster/);
    noRosterDate(rows.map(r => r[1]).join(' ').replace(/<[^>]+>/g, ' '), seatOf(person.name), 'representation rows');
  }
});

test('an electorate page names its records without the roster date, in the page and the directory row', () => {
  const entry = index.electorates.find(e => e.jurisdiction === 'federal' && e.name === 'Grayndler');
  assert.ok(entry.representation_as_of);
  const held = new JSDOM(profileHTML(read(entry.detail_url))).window.document.querySelector('#el-held');
  assert.equal(held.querySelector('details.ui-source summary').textContent.trim(), 'Electoral and parliamentary records');
  // The roster is still cited, by name, with its link.
  const cited = [...held.querySelectorAll('.ui-sheet-originals a')].find(link => /roster/i.test(link.textContent));
  assert.equal(cited?.textContent.replace(/\s*↗︎$/, '').trim(), 'OPAX federal roster reconciled against APH');
  assert.ok(cited.getAttribute('href'));
  noRosterDate(held.textContent, {as_of: entry.representation_as_of}, 'current member block');
  const source = readFileSync(new URL('../public/electorates.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Verified \$\{/);
  assert.doesNotMatch(source, /updated: selected\.as_of/);
});

const restore = offline();
after(restore);
test('the Worker\'s member and electorate pages show no roster date in the page, its description or its metadata', async () => {
  const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
  for (const person of members) {
    const seat = seatOf(person.name);
    const response = await worker.fetch(`/subject/person/${personSlug(person.name)}`);
    assert.equal(response.status, 200);
    const doc = new JSDOM(await response.text()).window.document;
    // The header, its summary and the party and representation list: the rest of the page is other records
    // (votes, a register of interests) with dates of their own.
    const pre = doc.querySelector('#prerender');
    const identity = [pre.querySelector('.subject-head'), pre.querySelector('.subject-head + p'),
      ...[...pre.querySelectorAll('h2')].filter(h => /Party and representation/.test(h.textContent)).map(h => h.nextElementSibling)];
    assert.ok(identity.length >= 3 && identity.every(Boolean), 'the server page has its header, summary and party list');
    noRosterDate(identity.map(node => node.textContent).join(' | '), seat, `${person.name}: server page`);
    noRosterDate(doc.querySelector('meta[name="description"]').content, seat, `${person.name}: description`);
    noRosterDate(doc.querySelector('#ld-page')?.textContent || '', seat, `${person.name}: JSON-LD`);
    if (person === fallback) assert.match(doc.querySelector('#prerender').textContent, /\(parliamentary roster\)/);
  }
  const entry = index.electorates.find(e => e.jurisdiction === 'federal' && e.name === 'Grayndler');
  const page = await worker.fetch(entry.url);
  assert.equal(page.status, 200);
  const doc = new JSDOM(await page.text()).window.document;
  const seat = {as_of: entry.representation_as_of};
  noRosterDate(doc.querySelector('meta[name="description"]').content, seat, 'electorate description');
  noRosterDate(doc.querySelector('#prerender')?.textContent || '', seat, 'electorate server page');
  assert.match(doc.querySelector('meta[name="description"]').content, /Anthony Albanese/);
});
