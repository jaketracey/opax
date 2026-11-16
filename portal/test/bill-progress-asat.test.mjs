// How old a bill's recorded progress is (hub ruling (c), 16 Nov 2026). The bills source has been paused since
// 10 Oct, so /bills/ is a snapshot: a bill page says "Bill progress as at <the export's day>" under the status, and
// Ask states a status "as at" that day. The day is the bills export's generated_at, never a date in the code: these
// tests read it from the published export, and a fresher generated_at moves every line on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { BILL_PROGRESS_WORDS, billProgressAsAt, billsAsAtDay } from '../public/bill-titles.js';
import { shortDate } from '../public/format.js';
import { loadWorker, offline, rendered } from './worker-harness.mjs';

const pub = new URL('../public/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('bills/index.json', pub), 'utf8'));
const FRESH = '2026-11-20T03:00:00+00:00';

// ---------------------------------------------------------------- the words

test('the line is the export\'s day in the site\'s short form, read as written; anything that is not a date gives no line', () => {
  assert.equal(BILL_PROGRESS_WORDS, 'Bill progress as at');
  assert.equal(billProgressAsAt('2026-10-04T16:27:54+00:00'), 'Bill progress as at 4 Oct 2026');
  assert.equal(billProgressAsAt(FRESH), 'Bill progress as at 20 Nov 2026');
  assert.equal(billProgressAsAt('2026-10-04'), 'Bill progress as at 4 Oct 2026');
  // The day as the export wrote it: a late-UTC stamp is not moved to the next Australian day.
  assert.equal(billsAsAtDay('2026-10-04T23:59:00+00:00'), '4 Oct 2026');
  for (const bad of ['', '2026-02-30', '2026-13-01', '04/10/2026', 'Not recorded', null, undefined, 20261004, {}]) assert.equal(billProgressAsAt(bad), '', String(bad));
  // The published export's own date: the test follows the data.
  assert.equal(billProgressAsAt(index.generated_at), `Bill progress as at ${shortDate(index.generated_at)}`);
});

// The functions app.js (a classic script) keeps as copies, and openBill itself, cut from the file as they are.
const appSource = readFileSync(new URL('app.js', pub), 'utf8');
const appFile = ts.createSourceFile('app.js', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fromApp = names => appFile.statements.filter(n => ts.isFunctionDeclaration(n) ? names.includes(n.name?.text)
  : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.includes(d.name.getText(appFile)))).map(n => n.getText(appFile)).join('\n');

test('app.js\'s copy of the line (a classic script cannot import) matches public/bill-titles.js', async () => {
  const { runInNewContext } = await import('node:vm');
  const copy = runInNewContext(`${fromApp(['MONTHS', 'fmtDate', 'billProgressAsAt'])}\n;({ billProgressAsAt })`, { Date, Number, String });
  for (const value of ['2026-10-04T16:27:54+00:00', FRESH, '2026-10-04', ' 2026-10-04 ', '2026-02-30', '2026-13-01', '', 'x', null, undefined, 7, index.generated_at])
    assert.equal(copy.billProgressAsAt(value), billProgressAsAt(value), String(value));
});

// ---------------------------------------------------------------- the bill page in the app

/**
 * openBill as app.js has it, in a jsdom page. Everything it calls other than the line's own functions is a stub that
 * draws nothing, so the head it writes holds the status row, the line under it and the title.
 */
async function appBillHead(exportedAt) {
  const dom = new JSDOM('<!doctype html><body><div id="bill-body"></div></body>', { url: 'https://opax.com.au/bill/au-federal-x1', runScripts: 'outside-only' });
  const { window } = dom;
  const nothing = new Proxy(function () {}, {
    get: (_, key) => key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : key === 'length' ? 0 : nothing,
    apply: () => nothing,
  });
  const bill = { key: 'au-federal-x1', title: 'Example Reporting Amendment Bill 2026', status: 'before_parliament', status_as_of: '2026-09-17', sponsor: null, sources: [], divisions: [] };
  const own = { $: id => window.document.getElementById(id), fetchBill: async () => bill, loadBillsDate: async () => exportedAt, billView: null, billTextGeneration: 0, activeDirectory: null };
  window.__scope = new Proxy(own, {
    has: (target, key) => typeof key === 'string' && (key in target || !(key in window)),
    get: (target, key) => key in target ? target[key] : key === Symbol.unscopables ? undefined : nothing,
    set: (target, key, value) => { target[key] = value; return true; },
  });
  window.eval(`with (window.__scope) { ${fromApp(['esc', 'MONTHS', 'fmtDate', 'billProgressAsAt', 'openBill'])}\nwindow.__openBill = openBill; }`);
  await window.__openBill('au-federal-x1', false);
  return window.document.querySelector('.bill-head');
}

test('the app\'s bill page says "Bill progress as at" the export\'s day, under the status, and a fresher export moves it', async () => {
  const head = await appBillHead(index.generated_at);
  assert.ok(head, 'openBill drew the head');
  const status = head.querySelector('.bill-status'), line = status.nextElementSibling;
  assert.equal(line.className, 'bill-progress-as-at', 'the line sits directly under the status');
  assert.equal(line.tagName, 'P');
  assert.equal(line.textContent, `Bill progress as at ${shortDate(index.generated_at)}`);
  assert.equal(line.nextElementSibling.id, 'bill-title');
  // The status keeps its own date beside it, as before.
  assert.match(status.textContent, /Status as at 17 Sep 2026/);
  const fresh = await appBillHead(FRESH);
  assert.equal(fresh.querySelector('.bill-progress-as-at').textContent, 'Bill progress as at 20 Nov 2026');
  // No export date (the date file and the index both failed): no line, and nothing else changes.
  const none = await appBillHead('');
  assert.equal(none.querySelector('.bill-progress-as-at'), null);
  assert.equal(none.querySelector('.bill-status').nextElementSibling.id, 'bill-title');
});

test('the line is plain fine print: the status line\'s own type and colour, no alarm styling', () => {
  const css = readFileSync(new URL('style.css', pub), 'utf8');
  const rule = /\.bill-progress-as-at\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /font:\s*var\(--type-fine\)/);
  assert.match(rule, /color:\s*var\(--ink-soft\)/);
  assert.doesNotMatch(rule, /background|border|--(?:warn|alert|danger|error|red)|font-weight|text-transform/);
  assert.equal(/\.bill-status-as\s*\{([^}]*)\}/.exec(css)?.[1].match(/var\(--[\w-]+\)/g).join(), 'var(--type-fine),var(--ink-soft)', 'the same tokens as the status date');
});

// ---------------------------------------------------------------- the server-rendered bill page

const restoreFetch = offline();
test.after(restoreFetch);
const root = fileURLToPath(pub);
const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
// A bill the snapshot records as before parliament: the kind of page this line is for.
const before = index.bills.find(b => b.status === 'before_parliament' && b.key.startsWith('au-federal-'));
const linePattern = day => new RegExp(`<h1>[^<]*</h1><p>[^<]*</p><p class="bill-progress-as-at">Bill progress as at ${day}</p><dl>`);

test('the server-rendered bill page carries the line right under its status sentence, from the export\'s generated_at', async () => {
  assert.ok(before, 'a bill before parliament in the published export');
  const worker = await loadWorker(entry, root);
  const res = await worker.fetch(`/bill/${before.key}`, { headers: { 'x-opax-nocache': '1' } });
  assert.equal(res.status, 200);
  const html = rendered(await res.text());
  assert.match(html, linePattern(shortDate(index.generated_at)));
  assert.equal(html.split('Bill progress as at').length - 1, 1, 'said once');
});

test('a fresher generated_at moves the server-rendered line on its own', async () => {
  const worker = await loadWorker(entry, root);
  const real = worker.env.ASSETS.fetch;
  worker.env.ASSETS.fetch = async req => new URL(req.url).pathname === '/bills/index.json' ? Response.json({ ...index, generated_at: FRESH }) : real(req);
  const html = rendered(await (await worker.fetch(`/bill/${before.key}`, { headers: { 'x-opax-nocache': '1' } })).text());
  assert.match(html, linePattern('20 Nov 2026'));
  assert.ok(!html.includes(`Bill progress as at ${shortDate(index.generated_at)}`) || shortDate(index.generated_at) === '20 Nov 2026');
});

// ---------------------------------------------------------------- Ask

const built = await build({ stdin: { contents: "export {billCitations} from './src/tools/record-common'; export {recordAnswerLines, recordEvidenceText} from './src/research-record-answer'; export {proseFallback} from './src/research-writing';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const ask = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const fields = { key: 'au-federal-x1', lifecycle_available: true, introduced: '2026-09-17', originating_house: 'representatives', key_dates: [{ stage: 'introduced', date: '2026-09-17', house: 'representatives', url: null }],
  passed_both_houses: null, passed_both_houses_date: null, royal_assent: null, act_number: null, acts: [], sponsor: null, sponsors: [], sponsor_parties: [], sponsor_party: null, sponsor_person_id: null,
  portfolio: 'Social Services', status: 'before_parliament', status_as_of: '2026-09-17' };
const url = 'https://opax.com.au/bill/au-federal-x1', title = 'Example Reporting Amendment Bill 2026';
const statusOf = exportedAt => ask.billCitations(fields, title, url, 'What is the status of the Example Reporting Amendment Bill 2026?', exportedAt).find(c => /has recorded status/.test(c.text)).text;

test('Ask states a bill\'s status as at the export\'s day, in the record text it reads, and its record answer says it', () => {
  assert.equal(statusOf('2026-10-04T16:27:54+00:00'), `The ${title} has recorded status before parliament as at 4 Oct 2026.`);
  assert.equal(statusOf(FRESH), `The ${title} has recorded status before parliament as at 20 Nov 2026.`);
  // No export date: the status keeps the date it had.
  assert.equal(statusOf(null), `The ${title} has recorded status before parliament as at 17 September 2026.`);
  // The answer to a status question is written from that record text alone (no model): it carries the day.
  const text = statusOf('2026-10-04T16:27:54+00:00');
  const facts = [{ id: 1, text, source: { resource: 'bill', slug: '', title, href: url, url, snippet: text, cited: true, kind: 'record' } }];
  assert.deepEqual(ask.recordAnswerLines({ question: `What is the status of the ${title}?`, period: { kind: 'all', label: '' }, facts }).map(l => l.text), [text]);
  assert.equal(ask.recordEvidenceText(text, url), text);
  // A passed bill reads "passed as at" the day; a dead bill names its ending with it.
  const passed = ask.billCitations({ ...fields, status: 'passed' }, title, url, 'Did it pass?', FRESH).find(c => /has recorded status/.test(c.text)).text;
  assert.match(ask.recordAnswerLines({ question: `Did the ${title} pass?`, period: { kind: 'all', label: '' }, facts: [{ ...facts[0], text: passed, source: { ...facts[0].source, snippet: passed } }] })[0].text, /^The Example Reporting Amendment Bill 2026 passed as at 20 Nov 2026\.$/);
});

test('a status share keeps the export\'s day when the writer words it', () => {
  const src = (resource, snippet) => ({ resource, slug: '', title: 'Bills', href: 'https://opax.com.au/bills', url: 'https://opax.com.au/bills', snippet, cited: true, kind: 'count' });
  const cohort = '3 bill records in the introduction cohort in federal parliament on 2024-02-29; 1 have snapshot status passed (33.33%), as at 4 Oct 2026';
  const passed = '1 passed bill records by introduction date in federal parliament on 2024-02-29';
  const out = ask.proseFallback({ question: 'How many bills introduced on 29 February 2024 have passed?', period: { kind: 'all', label: '' }, facts: [{ id: 1, text: cohort, source: src('a', cohort) }, { id: 2, text: passed, source: src('b', passed) }] });
  assert.match(out.answer, /^The introduction cohort contained 3 bill records in federal parliament on 2024-02-29; 33\.33% had snapshot status passed as at 4 Oct 2026\./);
  // A share given without a day (an older cached fact) is worded as before.
  const old = cohort.replace(', as at 4 Oct 2026', '');
  assert.match(ask.proseFallback({ question: 'How many bills introduced on 29 February 2024 have passed?', period: { kind: 'all', label: '' }, facts: [{ id: 1, text: old, source: src('a', old) }, { id: 2, text: passed, source: src('b', passed) }] }).answer, /had snapshot status passed\./);
});
