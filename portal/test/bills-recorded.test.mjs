import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {billRowHTML, billsSourceHTML, recordedBillsNote, newestBillsFile, RECORDED_BILL_NOTE} from '../public/home-data.js';

// Bills written from Hansard and division records while the Parliament's bill page is not loaded
// (scripts/derive_bills_hansard.py). Wherever one is shown it says where it came from, and it never
// borrows the register's statuses or its source line.
const pub = new URL('../public/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, pub), 'utf8'));
const LABEL = "Recorded from Hansard and divisions. The Parliament's bill page is not yet loaded.";
const recorded = {key: 'au-federal-r7601', title: 'New Things Bill 2026', status: 'recorded_in_parliament',
  introduced: '2026-10-27', jurisdiction: 'federal', portfolio: null, record_source: 'hansard_divisions'};

test('recorded bills: a home row carries its own status word and where it came from', () => {
  const row = billRowHTML(recorded);
  assert.match(row, /data-tone="active">Recorded in parliament</);
  assert.ok(row.includes(`<p class="hp-row-detail">${RECORDED_BILL_NOTE}</p>`));
  assert.ok(!billRowHTML({...recorded, record_source: undefined, status: 'before_parliament'}).includes(RECORDED_BILL_NOTE));
});

test('recorded bills: the list note counts them, dates them and says what they lack', () => {
  assert.equal(recordedBillsNote(null), '');
  assert.equal(recordedBillsNote({count: 0}), '');
  assert.equal(recordedBillsNote({count: 32, current_to: '2026-11-23'}),
    "32 bills marked Recorded in parliament are written from Hansard and division records, current to 23 Nov 2026. The Parliament's bill page is not yet loaded for them, so they have no sponsor, portfolio, bill text or summary.");
  assert.match(recordedBillsNote({count: 1}), /^1 bill marked Recorded in parliament is written .* for it, so it has no sponsor/);
  for (const text of [recordedBillsNote({count: 2, current_to: '2026-11-23'}), RECORDED_BILL_NOTE, LABEL]) assert.doesNotMatch(text, /[–—]/);
});

test('recorded bills: the home source line keeps the note through the small newest-bills file', () => {
  const index = {generated_at: '2026-11-24T00:00:00+00:00', meta: {hansard_recorded: {count: 2, current_to: '2026-11-23'}},
    bills: [recorded, {...recorded, key: 'au-federal-r1', status: 'passed', record_source: undefined, introduced: '2026-01-01'}]};
  const file = newestBillsFile(index);
  assert.equal(file.bills[0].record_source, 'hansard_divisions');
  assert.ok(!('record_source' in file.bills[1]));
  assert.deepEqual(file.hansard_recorded, {count: 2, current_to: '2026-11-23'});
  for (const source of [billsSourceHTML(file, null), billsSourceHTML(index, null)]) assert.match(source, /2 bills marked Recorded in parliament/);
  assert.doesNotMatch(billsSourceHTML({generated_at: '2026-11-24', bills: []}, null), /Recorded in parliament/);
});

test('recorded bills: the bill page and the list say it in the export\'s words', () => {
  const app = readFileSync(new URL('app.js', pub), 'utf8');
  assert.ok(app.includes('const RECORDED_BILL_NOTE = "Recorded from Hansard and divisions";'));
  assert.ok(app.includes('class="ui-page-meta bill-recorded" data-record-source='), 'the bill page head carries the label');
  assert.ok(app.includes('dateLabel: "Recorded to", source: "Hansard and division records"'), 'How it moved names its real source');
  assert.ok(app.includes('billRecorded(b) ? RECORDED_BILL_NOTE : ""'), 'a list row carries the note');
  assert.ok(app.includes('billsRecordedNote(idx.meta?.hansard_recorded)'), 'the list fineprint carries the count');
  assert.match(app, /if \(\/before\|introduced\|current\|recorded\/\.test\(s\)\) return "active";/);
});

test('recorded bills: the published ones are labelled, dated and link nowhere they were not read from', () => {
  const index = read('bills/index.json');
  const rows = index.bills.filter(row => row.record_source);
  assert.equal(index.meta.hansard_recorded?.count ?? 0, rows.length);
  if (rows.length) assert.equal(index.meta.hansard_recorded.label, LABEL);
  const registry = new Set(index.bills.filter(row => !row.record_source).map(row => row.title.toLowerCase()));
  assert.deepEqual(rows.filter(row => registry.has(row.title.toLowerCase())).map(row => row.key), [], 'a title the index holds is never recorded again');
  assert.equal(new Set(rows.map(row => row.title)).size, rows.length);
  for (const row of rows) {
    assert.equal(row.status, 'recorded_in_parliament', row.key);
    assert.match(row.key, /^au-federal-[rs]\d+$/, 'a key every shipped app accepts');
    const bill = read(`bills/${row.key}.json`);
    assert.equal(bill.record_source, 'hansard_divisions');
    assert.equal(bill.provenance.label, LABEL);
    assert.ok(bill.status_as_of >= bill.provenance.first_recorded);
    for (const field of ['sponsor', 'sponsor_party', 'portfolio', 'summary']) assert.equal(bill[field], null, `${row.key} ${field}`);
    const urls = [...bill.sources, ...bill.key_dates, ...bill.divisions].map(item => item.url);
    assert.ok(urls.length && urls.every(url => /^https:\/\/(data\.openaustralia\.org\.au\/scrapedxml|theyvoteforyou\.org\.au\/divisions)\//.test(url)), row.key);
  }
  for (const row of index.bills) if (!row.record_source) assert.notEqual(row.status, 'recorded_in_parliament', row.key);
});
