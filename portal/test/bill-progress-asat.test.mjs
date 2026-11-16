// How old a bill's recorded progress is (hub ruling (c), 16 Nov 2026). The bills source has been paused since
// 10 Oct, so /bills/ is a snapshot: wherever a bill's status is shown, "Bill progress as at <the export's day>" says
// how old it is, and Ask states a status "as at" that day. The day is the bills export's generated_at as a Sydney
// calendar day (hub ruling, 17 Nov 2026: 2026-10-04T16:27:54Z is 03:27 on 5 Oct AEDT, so 5 Oct), never a date in
// the code: these tests read it from the published export, and a fresher generated_at moves every line on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { BILL_PROGRESS_WORDS, billProgressAsAt, billsAsAtDay, billsAsAtIso } from '../public/bill-titles.js';
import { MONTHS } from '../public/format.js';
import { loadWorker, offline, rendered } from './worker-harness.mjs';

const pub = new URL('../public/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('bills/index.json', pub), 'utf8'));
const EXPORTED = '2026-10-04T16:27:54+00:00', FRESH = '2026-11-20T03:00:00+00:00';
/** The Sydney day of a stamp, worked out here independently of bill-titles.js. */
const sydney = stamp => {
  const part = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
  return `${part.day} ${MONTHS[part.month - 1]} ${part.year}`;
};

// ---------------------------------------------------------------- the words

test('the line is the export\'s day in Sydney, in the site\'s short form; anything that is not a date gives no line', () => {
  assert.equal(BILL_PROGRESS_WORDS, 'Bill progress as at');
  // The ruling's own case: 16:27 UTC on 4 Oct is 03:27 AEDT on 5 Oct.
  assert.equal(billProgressAsAt(EXPORTED), 'Bill progress as at 5 Oct 2026');
  assert.equal(billsAsAtIso(EXPORTED), '2026-10-05');
  assert.equal(billProgressAsAt(FRESH), 'Bill progress as at 20 Nov 2026');
  // Either side of Sydney midnight. AEST (UTC+10) in July: midnight is 14:00 UTC.
  assert.equal(billsAsAtDay('2026-07-14T13:59:59Z'), '14 Jul 2026');
  assert.equal(billsAsAtDay('2026-07-14T14:00:00Z'), '15 Jul 2026');
  // AEDT (UTC+11) in November: midnight is 13:00 UTC.
  assert.equal(billsAsAtDay('2026-11-19T12:59:59Z'), '19 Nov 2026');
  assert.equal(billsAsAtDay('2026-11-19T13:00:00Z'), '20 Nov 2026');
  // The night daylight saving starts (2am AEST on 4 Oct 2026 becomes 3am AEDT) and ends (3am AEDT on 5 Apr 2026).
  assert.equal(billsAsAtDay('2026-10-03T13:59:59Z'), '3 Oct 2026');
  assert.equal(billsAsAtDay('2026-10-03T14:00:00Z'), '4 Oct 2026');
  assert.equal(billsAsAtDay('2026-04-04T12:59:59Z'), '4 Apr 2026');
  assert.equal(billsAsAtDay('2026-04-04T13:00:00Z'), '5 Apr 2026');
  // Other ways of writing a stamp: an offset, no offset (read as UTC), a compact offset, fractions of a second.
  assert.equal(billsAsAtDay('2026-10-05T03:27:54+11:00'), '5 Oct 2026');
  assert.equal(billsAsAtDay('2026-10-04T16:27:54'), '5 Oct 2026');
  assert.equal(billsAsAtDay('2026-10-04 16:27:54+0000'), '5 Oct 2026');
  assert.equal(billsAsAtDay('2026-10-04T16:27:54.123456Z'), '5 Oct 2026');
  // A bare date is its own day.
  assert.equal(billProgressAsAt('2026-10-04'), 'Bill progress as at 4 Oct 2026');
  for (const bad of ['', '2026-02-30', '2026-13-01', '2026-10-04T25:00:00Z', '2026-10-04T16:61:00Z', '2026-10-04Tlate', '04/10/2026', 'Not recorded', null, undefined, 20261004, {}])
    assert.equal(billProgressAsAt(bad), '', String(bad));
  // The published export's own date, worked out independently: the test follows the data.
  assert.ok(billsAsAtDay(index.generated_at));
  assert.equal(billsAsAtDay(index.generated_at), sydney(index.generated_at));
});

test('a bill whose own record is newer than the export gets no line, never an as-at day before its own dates', () => {
  // A draft released after the export, merged in with the index's old generated_at (export_bills.py --merge-drafts).
  assert.equal(billProgressAsAt(EXPORTED, { introduced: '2026-11-20', status_as_of: '2026-11-20' }), '');
  assert.equal(billProgressAsAt(EXPORTED, { introduced: '2026-09-01', status_as_of: '2026-10-06' }), '');
  // The export's own Sydney day, and earlier, are covered by it.
  assert.equal(billProgressAsAt(EXPORTED, { introduced: '2026-10-05', status_as_of: '2026-10-05' }), 'Bill progress as at 5 Oct 2026');
  assert.equal(billProgressAsAt(EXPORTED, { introduced: '2026-03-01', status_as_of: '2026-08-26T00:00:00Z' }), 'Bill progress as at 5 Oct 2026');
  assert.equal(billsAsAtDay(EXPORTED, { introduced: null, status_as_of: 'Not recorded' }), '5 Oct 2026');
  assert.equal(billsAsAtDay(EXPORTED, null), '5 Oct 2026');
  // A fresher export covers the later draft.
  assert.equal(billProgressAsAt(FRESH, { introduced: '2026-11-20' }), 'Bill progress as at 20 Nov 2026');
  // Every bill in the published export is covered by it: no bill page loses its line today.
  assert.deepEqual(index.bills.filter(b => !billProgressAsAt(index.generated_at, b)).map(b => b.key), []);
});

// The functions app.js (a classic script) keeps as copies, and the functions that draw its bill lines, cut from the
// file as they are.
const appSource = readFileSync(new URL('app.js', pub), 'utf8');
const appFile = ts.createSourceFile('app.js', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fromApp = names => {
  const found = appFile.statements.filter(n => ts.isFunctionDeclaration(n) ? names.includes(n.name?.text)
    : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.includes(d.name.getText(appFile))));
  assert.equal(found.length, names.length, `app.js defines ${names.join(', ')}`);
  return found.map(n => n.getText(appFile)).join('\n');
};
const LINE = ['MONTHS', 'fmtDate', 'BILLS_SYDNEY_DAY', 'billsAsAtIso', 'billProgressAsAt'];

test('app.js\'s copy of the line (a classic script cannot import) matches public/bill-titles.js', () => {
  const copy = runInNewContext(`${fromApp(LINE)}\n;({ billsAsAtIso, billProgressAsAt })`, { Date, Number, String, Intl, Object });
  const stamps = [EXPORTED, FRESH, '2026-07-14T13:59:59Z', '2026-07-14T14:00:00Z', '2026-11-19T12:59:59Z', '2026-11-19T13:00:00Z', '2026-10-04T16:27:54',
    '2026-10-04 16:27:54+0000', '2026-10-05T03:27:54+11:00', '2026-10-04', ' 2026-10-04 ', '2026-02-30', '2026-13-01', '2026-10-04T25:00:00Z', '', 'x', null, undefined, 7, index.generated_at];
  const bills = [undefined, null, { introduced: '2026-11-20' }, { status_as_of: '2026-10-05' }, { status_as_of: '2026-10-06' }, { introduced: 'Not recorded' }];
  for (const stamp of stamps) {
    assert.equal(copy.billsAsAtIso(stamp), billsAsAtIso(stamp), String(stamp));
    for (const bill of bills) assert.equal(copy.billProgressAsAt(stamp, bill), billProgressAsAt(stamp, bill), `${stamp} ${JSON.stringify(bill)}`);
  }
});

// ---------------------------------------------------------------- the app's pages

/**
 * App functions in a jsdom page. Everything they call that is not listed or given is a stub that draws nothing, so
 * what they write holds only the bill's status lines and the line under them.
 */
function appPage(html, names, given) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: 'https://opax.com.au/', runScripts: 'outside-only' });
  const { window } = dom;
  const nothing = new Proxy(function () {}, {
    get: (_, key) => key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : key === 'length' ? 0 : nothing,
    apply: () => nothing,
  });
  const own = { $: id => window.document.getElementById(id), ...given };
  window.__scope = new Proxy(own, {
    has: (target, key) => typeof key === 'string' && (key in target || !(key in window)),
    get: (target, key) => key in target ? target[key] : key === Symbol.unscopables ? undefined : nothing,
    set: (target, key, value) => { target[key] = value; return true; },
  });
  window.eval(`with (window.__scope) { ${fromApp(names)}\nwindow.__fns = { ${names.join(', ')} }; }`);
  return { document: window.document, fns: window.__fns };
}

const pageBill = { key: 'au-federal-x1', title: 'Example Reporting Amendment Bill 2026', introduced: '2026-09-17', status: 'before_parliament', status_as_of: '2026-09-17', sponsor: null, sources: [], divisions: [] };

/** openBill as app.js has it: the head it writes holds the status row, the line under it and the title. */
const opened = [];
async function appBillHead(exportedAt, bill = pageBill) {
  const fetched = { ...bill };
  opened.push(fetched);
  const { document, fns } = appPage('<div id="bill-body"></div>', ['esc', ...LINE, 'openBill'],
    { fetchBill: async () => fetched, loadBillsDate: async () => exportedAt, billView: null, billTextGeneration: 0, activeDirectory: null });
  await fns.openBill(bill.key, false);
  return document.querySelector('.bill-head');
}

test('the app\'s bill page says "Bill progress as at" the export\'s Sydney day, under the status, and a fresher export moves it', async () => {
  const head = await appBillHead(EXPORTED);
  assert.ok(head, 'openBill drew the head');
  const status = head.querySelector('.bill-status'), line = status.nextElementSibling;
  assert.equal(line.className, 'bill-progress-as-at', 'the line sits directly under the status');
  assert.equal(line.tagName, 'P');
  assert.equal(line.textContent, 'Bill progress as at 5 Oct 2026');
  assert.equal(line.nextElementSibling.id, 'bill-title');
  // The status keeps its own date beside it, as before.
  assert.match(status.textContent, /Status as at 17 Sep 2026/);
  // The page keeps the Sydney day as bill.exportedAt, which its "Updated" source lines also read: one day on the page.
  assert.equal(opened.at(-1).exportedAt, '2026-10-05');
  assert.match(appSource, /bill\.exportedAt = billsAsAtIso\(billsDate\) \|\| billsDate \|\| "";/);
  assert.equal([...appSource.matchAll(/updated: bill\.exportedAt \|\| ""/g)].length, 5);
  assert.equal((await appBillHead(FRESH)).querySelector('.bill-progress-as-at').textContent, 'Bill progress as at 20 Nov 2026');
  assert.equal((await appBillHead(index.generated_at)).querySelector('.bill-progress-as-at').textContent, `Bill progress as at ${sydney(index.generated_at)}`);
  // No export date (the date file and the index both failed), or a bill newer than the export: no line, nothing else changes.
  for (const none of [await appBillHead(''), await appBillHead('2026-09-01T00:00:00Z')]) {
    assert.equal(none.querySelector('.bill-progress-as-at'), null);
    assert.equal(none.querySelector('.bill-status').nextElementSibling.id, 'bill-title');
  }
});

const peekEntry = { key: 'au-federal-x2', title: 'Example Customs Bill 2026', introduced: '2026-03-01', status: 'passed', status_as_of: '2026-08-26' };
const STATUS_WORDS = ['sentenceCase', 'billStatusWord', 'billStatusLine'];
/** fillBillPeek as app.js has it: the summary-and-status peek on /bills. */
async function appPeek(exportedAt, entry) {
  const { document, fns } = appPage('<details><div class="bill-peek-body"></div></details>', ['esc', ...LINE, ...STATUS_WORDS, 'fillBillPeek'], {
    loadBillsDate: async () => exportedAt, loadBill: async () => ({ summary: {} }),
    growthModules: { approvedBillSummary: () => ({ sentences: ['It would set a levy.'], attribution: 'Written by a model' }), summaryWrittenHTML: () => '' },
  });
  await fns.fillBillPeek(document.querySelector('details'), entry);
  return document.querySelector('.bill-peek-body');
}

test('the /bills peek says "Bill progress as at" after the bill\'s dated status, with or without a summary', async () => {
  const bare = await appPeek(EXPORTED, { ...peekEntry, has_summary: false });
  assert.equal(bare.querySelector('.bill-peek-line').textContent, 'Passed, status as at 26 Aug 2026. Bill progress as at 5 Oct 2026. No summary yet.');
  const summarised = await appPeek(EXPORTED, { ...peekEntry, has_summary: true });
  assert.equal(summarised.querySelector('.fineprint').textContent, 'Passed, status as at 26 Aug 2026. Bill progress as at 5 Oct 2026.');
  assert.equal((await appPeek(FRESH, { ...peekEntry, has_summary: false })).querySelector('.bill-peek-line').textContent,
    'Passed, status as at 26 Aug 2026. Bill progress as at 20 Nov 2026. No summary yet.');
  // No export date, or a record newer than the export: the dated status alone, as before.
  for (const [at, entry] of [['', peekEntry], [EXPORTED, { ...peekEntry, status_as_of: '2026-11-01' }]])
    assert.match((await appPeek(at, { ...entry, has_summary: true })).querySelector('.fineprint').textContent, /^Passed, status as at \d+ \w+ 2026\.$/);
});

/** renderDocBillPanel as app.js has it: "The bill" panel on a speech page whose debate is a bill. */
async function appDocPanel(exportedAt, entry) {
  const { document, fns } = appPage('<section id="doc-bill" hidden></section>', ['esc', ...LINE, ...STATUS_WORDS, 'titleKey', 'billName', 'renderDocBillPanel'], {
    loadBillsDate: async () => exportedAt, billForTitle: async () => entry, currentDocSlug: 'speech-1', titleSubject: () => entry.title,
  });
  await fns.renderDocBillPanel({ metadata: { bill_ref: entry.title } }, 'speech-1');
  return document.getElementById('doc-bill');
}

test('a speech page\'s "The bill" panel says "Bill progress as at" under the bill\'s dated status', async () => {
  const panel = await appDocPanel(EXPORTED, { ...peekEntry, has_summary: false });
  assert.equal(panel.hidden, false);
  const status = panel.querySelector('.doc-bill-status');
  assert.equal(status.textContent, 'Passed, status as at 26 Aug 2026');
  assert.equal(status.nextElementSibling.className, 'bill-progress-as-at');
  assert.equal(status.nextElementSibling.textContent, 'Bill progress as at 5 Oct 2026');
  assert.equal((await appDocPanel(FRESH, { ...peekEntry, has_summary: false })).querySelector('.bill-progress-as-at').textContent, 'Bill progress as at 20 Nov 2026');
  assert.equal((await appDocPanel('', { ...peekEntry, has_summary: false })).querySelector('.bill-progress-as-at'), null);
  assert.equal((await appDocPanel(EXPORTED, { ...peekEntry, status_as_of: '2026-11-01', has_summary: false })).querySelector('.bill-progress-as-at'), null);
});

test('the line is plain fine print: the status line\'s own type and colour, no alarm styling', () => {
  const css = readFileSync(new URL('style.css', pub), 'utf8');
  const rule = /\.bill-progress-as-at\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /font:\s*var\(--type-fine\)/);
  assert.match(rule, /color:\s*var\(--ink-soft\)/);
  for (const r of [...css.matchAll(/[^{}]*\.bill-progress-as-at\s*\{([^}]*)\}/g)].map(m => m[1]))
    assert.doesNotMatch(r, /background|border|--(?:warn|alert|danger|error|red)|font-weight|text-transform/);
  assert.equal(/\.bill-status-as\s*\{([^}]*)\}/.exec(css)?.[1].match(/var\(--[\w-]+\)/g).join(), 'var(--type-fine),var(--ink-soft)', 'the same tokens as the status date');
  // On a speech page it takes the status line's spacing and nothing else.
  assert.match(css, /\.doc-bill \.bill-progress-as-at\s*\{\s*margin:[^;}]+;\s*\}/);
});

// ---------------------------------------------------------------- the server-rendered bill page

const restoreFetch = offline();
test.after(restoreFetch);
const root = fileURLToPath(pub);
const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
// A bill the snapshot records as before parliament: the kind of page this line is for.
const before = index.bills.find(b => b.status === 'before_parliament' && b.key.startsWith('au-federal-'));
const linePattern = day => new RegExp(`<h1>[^<]*</h1><p>[^<]*</p><p class="bill-progress-as-at">Bill progress as at ${day}</p><dl>`);
async function ssrBill(generatedAt) {
  const worker = await loadWorker(entry, root);
  if (generatedAt !== undefined) {
    const real = worker.env.ASSETS.fetch;
    worker.env.ASSETS.fetch = async req => new URL(req.url).pathname === '/bills/index.json' ? Response.json({ ...index, generated_at: generatedAt }) : real(req);
  }
  const res = await worker.fetch(`/bill/${before.key}`);
  assert.equal(res.status, 200);
  return rendered(await res.text());
}

test('the server-rendered bill page carries the line right under its status sentence, from the export\'s generated_at', async () => {
  assert.ok(before, 'a bill before parliament in the published export');
  const html = await ssrBill();
  assert.match(html, linePattern(sydney(index.generated_at)));
  assert.equal(html.split('Bill progress as at').length - 1, 1, 'said once');
});

test('a fresher generated_at moves the server-rendered line on its own; an export older than the bill gives none', async () => {
  assert.match(await ssrBill(FRESH), linePattern('20 Nov 2026'));
  assert.match(await ssrBill(EXPORTED), linePattern('5 Oct 2026'));
  assert.ok(before.introduced > '2025-01-01');
  assert.ok(!(await ssrBill('2025-01-01T00:00:00Z')).includes('Bill progress as at'));
});

// ---------------------------------------------------------------- Ask

const built = await build({ stdin: { contents: "export {billCitations} from './src/tools/record-common'; export {recordAnswerLines, recordEvidenceText} from './src/research-record-answer'; export {proseFallback} from './src/research-writing';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const ask = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const fields = { key: 'au-federal-x1', lifecycle_available: true, introduced: '2026-09-17', originating_house: 'representatives', key_dates: [{ stage: 'introduced', date: '2026-09-17', house: 'representatives', url: null }],
  passed_both_houses: null, passed_both_houses_date: null, royal_assent: null, act_number: null, acts: [], sponsor: null, sponsors: [], sponsor_parties: [], sponsor_party: null, sponsor_person_id: null,
  portfolio: 'Social Services', status: 'before_parliament', status_as_of: '2026-09-17' };
const url = 'https://opax.com.au/bill/au-federal-x1', title = 'Example Reporting Amendment Bill 2026';
const statusOf = (exportedAt, bill = fields) => ask.billCitations(bill, title, url, `What is the status of the ${title}?`, exportedAt).find(c => /has recorded status/.test(c.text)).text;
const answer = (question, text) => ask.recordAnswerLines({ question, period: { kind: 'all', label: '' },
  facts: [{ id: 1, text, source: { resource: 'bill', slug: '', title, href: url, url, snippet: text, cited: true, kind: 'record' } }] }).map(l => l.text);

test('Ask states a bill\'s status as at the export\'s Sydney day, in the record text it reads, and its record answer says it', () => {
  assert.equal(statusOf(EXPORTED), `The ${title} has recorded status before parliament as at 5 Oct 2026.`);
  assert.equal(statusOf(FRESH), `The ${title} has recorded status before parliament as at 20 Nov 2026.`);
  // No export date, or a record newer than the export: the status keeps the date it had.
  assert.equal(statusOf(null), `The ${title} has recorded status before parliament as at 17 September 2026.`);
  assert.equal(statusOf('2026-09-01T00:00:00Z'), `The ${title} has recorded status before parliament as at 17 September 2026.`);
  // The answer to a status question is written from that record text alone (no model): it carries the day.
  const text = statusOf(EXPORTED);
  assert.deepEqual(answer(`What is the status of the ${title}?`, text), [text]);
  assert.equal(ask.recordEvidenceText(text, url), text);
});

test('Ask\'s answer to "did it pass" sets the as-at day off from the verb, so it does not read as the day it passed', () => {
  const passed = statusOf(FRESH, { ...fields, status: 'passed' });
  assert.equal(passed, `The ${title} has recorded status passed as at 20 Nov 2026.`);
  assert.deepEqual(answer(`Did the ${title} pass?`, passed), [`The ${title} had passed, as at 20 Nov 2026.`]);
  assert.match(ask.recordEvidenceText(passed, url), /\nThe Example Reporting Amendment Bill 2026 had passed, as at 20 Nov 2026\.$/);
  // A dead bill names its ending, as before.
  const lapsed = statusOf(FRESH, { ...fields, status: 'lapsed' });
  assert.deepEqual(answer(`Did the ${title} pass?`, lapsed), [`The ${title} did not pass; it lapsed as at 20 Nov 2026.`]);
});

test('a status share keeps the export\'s day when the writer words it', () => {
  const src = (resource, snippet) => ({ resource, slug: '', title: 'Bills', href: 'https://opax.com.au/bills', url: 'https://opax.com.au/bills', snippet, cited: true, kind: 'count' });
  const cohort = '3 bill records in the introduction cohort in federal parliament on 2024-02-29; 1 have snapshot status passed (33.33%), as at 5 Oct 2026';
  const passed = '1 passed bill records by introduction date in federal parliament on 2024-02-29';
  const q = 'How many bills introduced on 29 February 2024 have passed?';
  const out = ask.proseFallback({ question: q, period: { kind: 'all', label: '' }, facts: [{ id: 1, text: cohort, source: src('a', cohort) }, { id: 2, text: passed, source: src('b', passed) }] });
  assert.match(out.answer, /^The introduction cohort contained 3 bill records in federal parliament on 2024-02-29; 33\.33% had snapshot status passed as at 5 Oct 2026\./);
  // A share given without a day (MCP's citation, or an older cached fact) is worded as before.
  const old = cohort.replace(', as at 5 Oct 2026', '');
  assert.match(ask.proseFallback({ question: q, period: { kind: 'all', label: '' }, facts: [{ id: 1, text: old, source: src('a', old) }, { id: 2, text: passed, source: src('b', passed) }] }).answer, /had snapshot status passed\./);
});
