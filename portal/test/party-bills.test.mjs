// Backlog A4b: a party page lists the bills its members sponsored, as the federal bills register records the
// sponsor's party (scripts/build_party_index.mjs bills, public/party-page.js partyBills and partyBillsHTML).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {sponsoredBills} from '../../scripts/build_party_index.mjs';
import {partyBills, partyBillsHTML, partyMembers, partyMembersHTML, PARTY_NO_MEMBERS} from '../public/party-page.js';
import {billSponsorProjection} from './helpers/bill-sponsor-projection.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const h = {esc, sourceLineHTML: ({source, notes}) => `<p class="source-line">${esc(source)} ${notes.map(esc).join(' ')}</p>`};

test('the index keeps accepted sponsor parties only, newest first, with the fields the page shows', () => {
  const bills = [
    {key: 'b1', title: 'Old Bill 2014', short_title: 'Old Bill 2014', introduced: '2014-03-17', status: 'lapsed', sponsor_party: 'Fixture Team', portfolio: 'x'},
    {key: 'b2', title: 'Long title', short_title: 'New Bill 2015', introduced: '2015-06-01', status: 'passed', sponsor_party: 'Fixture Team'},
    {key: 'b3', title: 'Unaccepted Bill', introduced: '2016-01-01', sponsor_party: 'Somebody'},
    {key: 'b4', title: 'Government Bill', introduced: '2016-01-01', sponsor_party: null},
  ];
  assert.deepEqual(sponsoredBills(bills, ['Fixture Team']), {'Fixture Team': [
    {key: 'b2', title: 'New Bill 2015', introduced: '2015-06-01', status: 'passed'},
    {key: 'b1', title: 'Old Bill 2014', introduced: '2014-03-17', status: 'lapsed'},
  ]});
});

test('"Bills sponsored" links each bill, says when it was introduced and its status, and names its source', () => {
  const bills = Array.from({length: 14}, (_, i) => ({key: `au-federal-s${100 + i}`, title: `Fixture Bill ${2000 + i}`, introduced: `${2000 + i}-02-03`, status: i ? 'lapsed' : 'before_parliament'}));
  const doc = new JSDOM(partyBillsHTML('Fixture Team', bills, h)).window.document;
  assert.equal(doc.querySelector('h3').textContent, 'Bills sponsored (14)');
  const links = [...doc.querySelectorAll('a.source-title')];
  assert.equal(links.length, 14);
  assert.equal(links[0].getAttribute('href'), '/bill/au-federal-s100');
  assert.equal(doc.querySelector('.result-meta').textContent, 'Introduced 3 Feb 2000 · Before parliament');
  assert.equal(doc.querySelector('details summary').textContent, '2 more bills');
  assert.match(doc.querySelector('.source-line').textContent, /Federal bills register.*a member of Fixture Team when the bill was introduced/);
  assert.equal(partyBillsHTML('Fixture Team', [], h), '');
  assert.doesNotMatch(partyBillsHTML('Fixture Team', bills, h), /—/);
});

test('the next dated export: the three sponsor-only parties and their newest bills', () => {
  const published = read('/graph/party-members.json');
  const accepted = read('/facts/sponsor-parties.json');
  const current = {bills:sponsoredBills(read('/bills/index.json').bills, accepted)};
  const divisions = {...published, bills:sponsoredBills(billSponsorProjection().bills, accepted)};
  const expected = {
    // 7 + 15 dated corrections - s1127's reviewed Centre Alliance rename.
    'Nick Xenophon Team': [21, 'Banking Amendment (Rural Finance Reform) Bill 2018'],
    'Palmer United Party': [3, 'Commonwealth Grants Commission Amendment (GST Distribution) Bill 2015'],
    'Rex Patrick Team': [4, 'Australian Federal Integrity Commission Bill 2021'],
  };
  for (const [label, [count, title]] of Object.entries(expected)) {
    assert.deepEqual(partyBills(label, published), partyBills(label, current), label);
    const bills = partyBills(label, divisions);
    assert.equal(bills.length, count, label);
    assert.equal(bills[0].title, title, label);
    const members = partyMembers(label, {roster:read('/parliamentarians.json'), divisions});
    assert.equal(members.current.length + members.former.length, 0, label);
    assert.ok(partyMembersHTML(label, members, h).includes(esc(PARTY_NO_MEMBERS)), label);
  }
  // Every listed bill has its own page file.
  const index = new Set(read('/bills/index.json').bills.map(b => b.key));
  for (const bills of Object.values(divisions.bills)) for (const b of bills) assert.ok(index.has(b.key), b.key);
});

test('server: sponsor-only parties disclose the missing roster alongside their bills', async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
    for (const slug of ['nick-xenophon-team', 'palmer-united-party', 'rex-patrick-team']) {
      const response = await worker.fetch('/subject/party/' + slug);
      assert.equal(response.status, 200);
      const core = new JSDOM(await response.text()).window.document.querySelector('#prerender');
      assert.ok(core.textContent.includes(PARTY_NO_MEMBERS), slug);
      assert.ok(core.querySelector('a[href^="/bill/"]'), slug);
    }
  } finally { restore(); }
});
