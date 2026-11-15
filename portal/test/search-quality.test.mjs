// Search results for a speaker's committee evidence (15 Nov 2026):
// (a) the passage shown is one with words in it, not the transcript's speaker
//     label, when the query is just the speaker's name;
// (b) the turns of one hearing are one card, counted, before paging;
// (c) a committee title says the committee once.
// Fixtures only: the Worker's choices are pure functions (src/search-passages.ts)
// and the card is drawn by the page's own renderResults.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

// OPAX_PORTAL_DIR points at another copy of portal/ (a revert check).
const root = process.env.OPAX_PORTAL_DIR ? pathToFileURL(process.env.OPAX_PORTAL_DIR.replace(/\/?$/, '/')) : new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const worker = read('src/index.ts');
const appText = read('public/app.js');
const passages = await import(new URL('src/search-passages.ts', root).href).catch(() => ({}));

const SPEAKER = 'Ada Quill';
const COMMITTEE = 'Finance and Public Administration Legislation Committee';
const STORED = `${COMMITTEE} - ${COMMITTEE} 27/05/2026 Estimates PRIME MINISTER AND CABINET PORTFOLIO Australian Public Service Commission`;
const LABEL = 'Senator ADA QUILL:';
const SPOKEN = 'How many agencies met the reporting target last year, and what will the commission do about those that did not?';

test('a speaker search scores passages on no words, and a quoted or worded query keeps its terms', () => {
  const { passageTerms } = passages;
  assert.deepEqual(passageTerms(SPEAKER, SPEAKER), [], 'the speaker\'s own name is not a scoring term');
  assert.deepEqual(passageTerms(' ada  QUILL ', SPEAKER), []);
  assert.deepEqual(passageTerms(`"${SPEAKER}"`, SPEAKER), [], 'nor when the person page quotes it');
  assert.deepEqual(passageTerms('housing supply', SPEAKER), ['housing', 'supply'], 'a real query is untouched');
  assert.deepEqual(passageTerms('Ada Quill housing', SPEAKER), ['ada', 'quill', 'housing'], 'the name with more words is a real query');
  assert.deepEqual(passageTerms(SPEAKER, null), ['ada', 'quill'], 'no speaker filter, no change');
  assert.deepEqual(passageTerms('"reporting target" of agencies', null), ['reporting target']);
});

test('the passage shown is never the speaker label while the record has words', () => {
  const { isSpeakerLabel, pickPassage, passageTerms } = passages;
  for (const label of [LABEL, 'CHAIR:', 'Ms Barrett (Fremantle):', 'The Hon. Jo Example MP:', 'ACTING CHAIR (Senator Example):']) assert.equal(isSpeakerLabel(label), true, label);
  // A sentence ending in a colon is the record's words, on the server as on the page.
  for (const text of [SPOKEN, `${LABEL} ${SPOKEN}`, 'I have three questions for the department:', 'I have three questions: first, the target.', 'Senator Quill asked the following question:', 'Thank you.']) assert.equal(isSpeakerLabel(text), false, text);
  // The record as retrieval returns it: the label paragraph ranks first.
  const paragraphs = [{ text: LABEL, score: 0.91 }, { text: SPOKEN, score: 0.42 }, { text: 'Thank you.', score: 0.2 }];
  assert.equal(pickPassage(paragraphs, passageTerms(SPEAKER, SPEAKER)).text, SPOKEN, 'a speaker search shows the best paragraph with words');
  // Even scored on the name (an unfiltered search for it), the label is passed over.
  assert.equal(pickPassage(paragraphs, ['ada', 'quill']).text, SPOKEN);
  // A real query still finds its words and where they start.
  const hit = pickPassage(paragraphs, ['reporting target']);
  assert.equal(hit.text, SPOKEN);
  assert.equal(hit.at, SPOKEN.toLowerCase().indexOf('reporting target'));
  assert.equal(hit.score, 0.42);
  assert.equal(pickPassage([{ text: LABEL, score: 0.91 }, { text: 'I have three questions for the department:', score: 0.3 }], []).text, 'I have three questions for the department:');
  // Only labels were matched: no passage (apps and MCP get an empty snippet), and the
  // label's score keeps the record's rank.
  assert.deepEqual(pickPassage([{ text: LABEL, score: 0.9 }, { text: 'CHAIR:', score: 0.4 }], ['ada', 'quill']), { text: '', score: 0.9, at: -1 });
  assert.deepEqual(pickPassage([], ['x']), { text: '', score: 0, at: -1 });
  // The Worker uses both, and old cached windows are retired.
  assert.match(worker, /const queryTerms = passageTerms\(q, url\.searchParams\.get\('speaker'\)\)/);
  assert.match(worker, /pickPassage\(passages, queryTerms\)/);
  assert.equal(worker.split('passage-v5-no-label').length - 1, 2, 'the page key and the window key both moved on');
  assert.doesNotMatch(worker, /split-speakers-passage-v[34]-/);
});

const row = (n, extra = {}) => ({ kind: 'speech', chamber: 'senate_committee', title: `${SPEAKER} — ${STORED} — 2026-05-27`, date: '2026-05-27', slug: `speech-${n}`, score: 1 / (10 + n), ...extra });

test('the turns of one hearing collapse into its best-ranked card, with a count', () => {
  const { collapseHearings } = passages;
  const other = row(3, { title: `${SPEAKER} — Environment and Communications Legislation Committee - Estimates — 2026-05-27` });
  const nextDay = row(4, { date: '2026-05-28' });
  const chamberSpeech = row(5, { chamber: 'senate' }), chamberSpeechAgain = row(6, { chamber: 'senate' });
  const division = { kind: 'division', chamber: 'senate_committee', title: row(0).title, date: '2026-05-27', slug: 'division-1' };
  const stub = { kind: 'donor', id: 7, score: 0.05 };
  const first = row(0), rows = [first, row(1), stub, row(2), other, nextDay, chamberSpeech, chamberSpeechAgain, division, division];
  const out = collapseHearings(rows);
  assert.deepEqual(out.map((r) => r.slug || r.kind), ['speech-0', 'donor', 'speech-3', 'speech-4', 'speech-5', 'speech-6', 'division-1', 'division-1']);
  assert.equal(out[0], first, 'the kept row is the same object: paged catalogue rows are held by identity');
  assert.equal(out[0].hearing_passages, 3, 'three turns, one card');
  assert.equal(out[1], stub);
  for (const r of out.slice(1)) assert.equal(r.hearing_passages, undefined, `${r.slug || r.kind}: a card for one record carries no count`);
  // In the Worker: after the relevance sort, before the window is cut and
  // before totals, years and pages are counted; never for suggestions.
  const fn = worker.slice(worker.indexOf('async function apiUnifiedSearch('), worker.indexOf('\n}\n', worker.indexOf('async function apiUnifiedSearch(')));
  const sorted = fn.indexOf("combined.sort((a, b) => compareSearchResults(a, b, 'relevance'))");
  const collapsed = fn.indexOf('const cards = options.suggest ? combined : collapseHearings(combined)');
  const cut = fn.indexOf('diverse.slice(0, options.suggest ? 9 : 200)');
  assert.ok(sorted > 0 && collapsed > sorted && cut > collapsed, 'sort, then collapse, then the 200-row window');
  assert.match(fn, /\}\) : cards\n/, 'the window is cut from the collapsed list');
  assert.ok(fn.indexOf('total: rows.length') > cut && fn.indexOf('const pageCount = Math.max(1, Math.ceil(rows.length / per))') > cut, 'totals and pages count cards');
});

// The page's own functions, run on fixture rows.
const source = ts.createSourceFile('app.js', appText, ts.ScriptTarget.Latest, true);
const wanted = ['renderResults', 'cleanPassage', 'committeeShortTitle', 'committeeResultTitle', 'committeeHouse'];
const declarations = source.statements.filter((n) => ts.isFunctionDeclaration(n) && wanted.includes(n.name?.text)).map((n) => n.getText(source)).join('\n');
function page(rows) {
  const document = new JSDOM('<ul id="search-results"></ul>').window.document;
  const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const titleSubject = (r) => String(r.title).split(' — ').slice(1, -1).join(' — ');
  const ctx = { document, esc, $: (id) => document.getElementById(id), entityHrefAttr: (href) => `href="${href}"`,
    isCommitteeChamber: (chamber) => /committee/.test(String(chamber || '').toLowerCase()),
    subjectHash: (_kind, name) => '/subject/' + name, STATE_NAMES: { federal: 'Federal' }, TOPICS: {},
    titleSubject, displayTitle: (r) => titleSubject(r) || r.title, isMultiSpeaker: () => false, isUnattributed: () => false,
    speechIdentityHTML: (r) => esc(r.speaker), partyChipHTML: (s) => esc(s), machineLabelHTML: () => '', excerptNoticeHTML: () => '',
    recordTypeLink: () => '<a href="/ask?view=search&kind=speech">Speech</a>', highlightHTML: (s) => esc(s), fmtDate: (s) => s, billNoteHTML: (s) => esc(s),
    searchReadMode: 'passages', lastSearch: { briefs: {}, query: '', filters: { speaker: SPEAKER } },
    requestAnimationFrame: () => {}, refreshSearchPassageFolds: () => {}, searchResultHref: (r) => r.href, loadPhotoMap: async () => {}, decorateMetaPortraits: () => {} };
  const api = runInNewContext(`${declarations};({${wanted.filter((name) => declarations.includes(`function ${name}(`)).join(',')}})`, ctx);
  api.renderResults(rows);
  return { document, api };
}
const card = (extra = {}) => ({ kind: 'speech', chamber: 'senate_committee', state: 'federal', speaker: SPEAKER, slug: 'speech-1', resource: 'r1', title: `${SPEAKER} — ${STORED} — 2026-05-27`, date: '2026-05-27', snippet: SPOKEN, topics: [], ...extra });

test('a committee card names the committee once, says how many passages it stands for, and draws no bare label', () => {
  const { document, api } = page([
    card({ hearing_passages: 3 }),
    card({ slug: 'speech-2', title: `${SPEAKER} — Economics References Committee - Economics References Committee 12/03/2026 Inquiry into supermarket prices — 2026-03-12`, date: '2026-03-12', snippet: LABEL }),
    card({ slug: 'speech-3', chamber: 'senate', title: `${SPEAKER} — Matters of Public Importance - Housing — 2026-02-04`, date: '2026-02-04', hearing_passages: 1 }),
  ]);
  const [estimates, inquiry, chamber] = [...document.querySelectorAll('#search-results > li')];
  const title = (li) => li.querySelector('a.result-title').textContent;
  // (c) Estimates: the existing short form. No committee said twice.
  assert.equal(title(estimates), 'Estimates · Finance and Public Administration Committee · Australian Public Service Commission');
  assert.equal(title(inquiry), 'Economics References Committee - 12/03/2026 Inquiry into supermarket prices', 'an inquiry keeps its name, with the committee once');
  for (const li of [estimates, inquiry]) assert.equal(title(li).split('Committee').length - 1, 1, title(li));
  assert.equal(title(chamber), 'Matters of Public Importance - Housing', 'a chamber speech title is untouched');
  assert.equal(estimates.querySelector('a.result-title').getAttribute('href'), '/doc/speech-1', 'the card still opens its record');
  // (b) The count, in plain words, in the quiet meta line; absent for one passage.
  assert.match(estimates.querySelector('.ui-row-meta').textContent, /Senate committee evidence · Federal · 3 passages from this hearing$/);
  for (const li of [inquiry, chamber]) assert.doesNotMatch(li.textContent, /passages? from this hearing/);
  // (a) A passage with words is shown whole; a bare label is not shown at all.
  assert.equal(estimates.querySelector('.search-result-text').textContent, SPOKEN);
  assert.equal(inquiry.querySelector('.search-result-text').textContent, 'Open the speech to read the passage.', 'no empty paragraph: the card says where the words are');
  // The mentions list on person and donor pages draws the same line in place
  // of an empty paragraph.
  const mentions = appText.slice(appText.indexOf('async function subjectMentions('), appText.indexOf('\n}', appText.indexOf('async function subjectMentions(')));
  const paragraph = /<p class="snippet">\$\{esc\((.+?)\)\}<\/p>/.exec(mentions)?.[1] || '';
  const drawn = (r) => runInNewContext(`(${paragraph})`, { r, String });
  assert.equal(drawn({ kind: 'speech', snippet: '' }), 'Open the speech to read the passage.', 'a mention with no passage is not an empty paragraph');
  assert.equal(drawn({ kind: 'speech', snippet: '  ' }), 'Open the speech to read the passage.');
  assert.equal(drawn({ kind: 'press_release', snippet: '' }), 'Open the record to read the passage.');
  assert.equal(drawn({ kind: 'speech', snippet: SPOKEN }), SPOKEN, 'a mention with a passage is unchanged');
  assert.equal(drawn({ kind: 'speech', snippet: 'x'.repeat(300) }).length, 220);
  // One definition of a label, on the page and in the Worker.
  for (const label of [LABEL, 'CHAIR:', 'Senator Quill:', 'The Hon. Jo Example MP:', 'ACTING CHAIR:', 'ACTING CHAIR (Senator Example):', 'Ms Barrett (Fremantle):']) { assert.equal(api.cleanPassage(label), '', label); assert.equal(passages.isSpeakerLabel(label), true, label); }
  for (const words of ['I have three questions for the department:', 'Senator Quill asked the following question:']) { assert.equal(api.cleanPassage(words), words); assert.equal(passages.isSpeakerLabel(words), false, words); }
  assert.equal(api.cleanPassage(`${LABEL} ${SPOKEN}`), SPOKEN, 'a label with words after it still gives the words');
  assert.equal(api.cleanPassage('Chair of the committee said: yes.'), 'Chair of the committee said: yes.');
  assert.equal(api.cleanPassage('Senator Quill asked the following question:'), 'Senator Quill asked the following question:', 'a sentence that ends in a colon is not a label');
});
