// A dead bill's exact ending (scripts/export_bills.py `ended_label`) is the status word the app shows on the
// bill page, list rows and status lines; a file without it keeps the status word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const cut = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
const code = cut('const sentenceCase = ', '/** A stage as the register wrote it')
  + cut('const billStatusWord = ', 'const BILL_SOURCE_NAMES');
const { billStatusWord, billStatusLine } = runInNewContext(`${code};({billStatusWord, billStatusLine})`, { fmtDate: d => `on ${d}` });

test('the bill status word is the exact ending when the export names one', () => {
  const removed = { status: 'lapsed', status_as_of: '2018-06-26', ended: 'removed', ended_label: 'Removed from the Notice Paper' };
  assert.equal(billStatusWord(removed), 'Removed from the Notice Paper');
  assert.equal(billStatusLine(removed), 'Removed from the Notice Paper, status as at on 2018-06-26');
  assert.equal(billStatusWord({ status: 'lapsed' }), 'Lapsed');
  assert.equal(billStatusWord({ status: 'before_parliament', ended_label: '  ' }), 'Before parliament');
  assert.equal(billStatusLine({}), 'Status not recorded');
});

test('every bill status the page and rows show reads through the helper', () => {
  assert.match(app, /const statusWord = billStatusWord\(bill\) \|\| "Status not recorded";/);
  assert.match(app, /statusLabelHTML\(billStatusWord\(b\), billStatusTone\(b\.status\)\)/);
  assert.doesNotMatch(app, /statusLabelHTML\(sentenceCase\(b\.status\)/);
});
