// A state division's page names its chamber and keeps one heading (Jake, 16 Oct: the title on
// /doc/division-vic-la-2026-09-10-3 read "vic_la division"). The heading is the division's title
// or motion; the chamber is in the meta line by name; no reader-facing text carries a raw code.
// Divisions here are fixtures; the motion is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CHAMBER_LABELS, chamberLabel } from '../public/labels.js';
import { divisionPlain } from '../public/division-markdown.js';
import { renderDivisionAnswer } from '../src/seo-content.ts';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const CODES = ['vic_la', 'vic_lc', 'nsw_la', 'nsw_lc', 'qld', 'qld_la', 'sa_ha', 'sa_lc', 'wa_la', 'wa_lc',
  'tas_ha', 'tas_lc', 'act', 'act_la', 'nt', 'nt_la', 'representatives', 'senate'];
const RAW = new RegExp(`\\b(?:${CODES.filter((c) => c.includes('_')).join('|')})\\b`);
const MOTION = 'That the following words be added to the end of the motion: ‘and notes the report’. The words were not added.';

/** A top-level function's source, by brace matching from its declaration. */
function fn(name) {
  const start = app.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `app.js declares ${name}`);
  let depth = 0;
  for (let i = app.indexOf('{', app.indexOf(')', start)); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
const constLine = (name) => app.match(new RegExp(`\\nconst ${name} = [^\\n]+`))[0];

test('every chamber code has a reader name, and an unknown code is never shown', () => {
  for (const code of CODES) {
    const label = chamberLabel(code);
    assert.ok(label, code);
    assert.doesNotMatch(label, /_/, code);
  }
  assert.equal(chamberLabel('vic_la'), 'Legislative Assembly (Victoria)');
  assert.equal(chamberLabel('VIC_LC'), 'Legislative Council (Victoria)');
  assert.equal(chamberLabel('sa_ha'), 'House of Assembly (South Australia)');
  assert.equal(chamberLabel('act'), chamberLabel('act_la'));
  assert.equal(chamberLabel('senate'), 'Senate');
  assert.equal(chamberLabel('xx_zz'), '');
  assert.equal(chamberLabel(null), '');
});

// The chamber is the record's own house, never read off its key: a federal day They Vote For You
// has not published yet is keyed from OpenAustralia's XML (division-federal-senate-oa-2026-10-15-3,
// 17 Oct) and is still the Senate. One division is one page: the XML key is used only where
// They Vote For You has no division with that house, date and number.
test('every published division names its chamber, and one federal division has one page', () => {
  const dir = new URL('../public/divisions/', import.meta.url);
  const pages = new Map();
  for (const file of readdirSync(dir).filter((f) => f.startsWith('division-'))) {
    const d = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    assert.ok(CHAMBER_LABELS[d.house], `${file}: house ${d.house}`);
    if (d.jurisdiction !== 'federal') continue;
    const number = /-oa-\d{4}-\d{2}-\d{2}-(\d+)$/.exec(d.key)?.[1] ?? /\/divisions\/[a-z]+\/\d{4}-\d{2}-\d{2}\/(\d+)$/.exec(d.source_url || '')?.[1];
    if (!number) continue;
    const id = `${d.house} ${d.date} ${Number(number)}`;
    assert.ok(!pages.has(id), `${file} and ${pages.get(id)} are one division (${id})`);
    pages.set(id, file);
  }
});

/** app.js's division heading and page renderer, with the page's DOM and helpers stubbed. */
function divisionPage() {
  const nodes = new Map();
  const node = () => ({ textContent: '', innerHTML: '', hidden: true, focus() {}, querySelector: () => null });
  const context = {
    uiLabels: { chamberLabel, sourceLineHTML: (o) => `<p class="source">${o.source}: ${o.originals.map((x) => x.label).join(', ')}</p>` },
    divisionMarkdown: { divisionPlain },
    $: (id) => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    esc: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    setStatus() {}, setCrumbs() {}, crumbsFor: () => [], billOutcomeLabelHTML: (r) => r || '', fmtDate: (d) => d,
    askHash: (q) => `/ask?q=${encodeURIComponent(q)}`, safeUrl: (u) => u, billSplitParts: () => null, BILL_SPLIT_LEGEND: '',
    moreMenuHTML: (items) => items.filter(Boolean).map((i) => `<a href="${i.href || '#'}">${i.label}</a>`).join(''),
    billNoteHTML: (t) => `<p>${t}</p>`, entityHrefAttr: () => '', billHash: () => '', pageMenusReady: new Promise(() => {}),
    loadDivisionNames: () => new Promise(() => {}), sentenceCase: (s) => String(s || ''),
  };
  runInNewContext(`${fn('chamberLabel')}\n${fn('sourceLineHTML')}\n${constLine('billHouse')}\n${fn('billStage')}\n${fn('billQuestion')}
    ${fn('divisionHeading')}\n${fn('renderDivisionDoc')}
    Object.assign(globalThis, { billHouse, divisionHeading, renderDivisionDoc });`, context);
  return { ...context, nodes };
}

test('a state division is headed by its motion, with its chamber by name in the meta line', () => {
  const ctx = divisionPage();
  for (const code of CODES) {
    const d = { house: code, jurisdiction: code === 'senate' || code === 'representatives' ? 'federal' : code.split('_')[0],
      date: '2026-09-10', ayes: 27, noes: 52, result: 'negative', name: MOTION, question: MOTION, members: [],
      source_url: 'https://example.test/hansard.pdf' };
    const { title, house } = ctx.divisionHeading(d, null);
    assert.equal(title, 'That the following words be added to the end of the motion: ‘and notes the report’.', code);
    assert.equal(house, chamberLabel(code), code);
    ctx.renderDivisionDoc({ d, entry: null, bills: [] }, `division-${code}-2026-09-10-1`, false);
    const heading = ctx.$('doc-title').textContent, meta = ctx.$('doc-meta').innerHTML;
    assert.equal(heading, title, code);
    assert.doesNotMatch(heading, /division$/, code);
    assert.ok(meta.includes(ctx.esc(chamberLabel(code))), `${code}: the meta line names the chamber`);
    for (const id of ['doc-title', 'doc-meta', 'doc-bill', 'doc-text']) {
      assert.doesNotMatch(ctx.$(id).innerHTML + ctx.$(id).textContent, RAW, `${code} ${id}`);
      assert.doesNotMatch(ctx.$(id).innerHTML, /<h1\b/, `${code} ${id}: the page keeps one h1`);
    }
    const federal = d.jurisdiction === 'federal';
    assert.equal(ctx.$('doc-text').innerHTML.includes('They Vote For You'), federal, `${code}: the count's source`);
  }
  // A division read from OpenAustralia's XML names its chamber and its source, never the key's "oa".
  for (const [house, name] of [['senate', 'Senate'], ['representatives', 'House of Representatives']]) {
    const d = { key: `federal-${house}-oa-2026-10-15-3`, house, jurisdiction: 'federal', date: '2026-10-15', ayes: 25, noes: 32,
      result: 'negative', name: MOTION, question: MOTION, members: [],
      source_url: `https://data.openaustralia.org.au/scrapedxml/${house}_debates/2026-10-15.xml` };
    assert.equal(ctx.divisionHeading(d, null).house, name);
    ctx.renderDivisionDoc({ d, entry: null, bills: [] }, `division-${d.key}`, false);
    const text = ['doc-title', 'doc-meta', 'doc-bill', 'doc-text'].map((id) => ctx.$(id).innerHTML + ctx.$(id).textContent).join(' ');
    assert.ok(ctx.$('doc-meta').innerHTML.includes(name), `${house}: the meta line names the chamber`);
    assert.doesNotMatch(text, /\b(?:representatives|senate)[_-]oa\b|They Vote For You/, house);
    assert.match(ctx.$('doc-text').innerHTML, /OpenAustralia/, `${house}: the count's source`);
  }
  // A recorded title still leads; with neither title nor motion the heading is plain "Division".
  assert.equal(ctx.divisionHeading({ house: 'vic_la', name: MOTION }, { title: 'Second reading' }).title, 'Second reading');
  assert.deepEqual({ ...ctx.divisionHeading({ house: 'xx_zz' }, null) }, { title: 'Division', house: 'Parliament' });
  assert.equal(ctx.billHouse('Assent'), 'Assent', 'a stage house the record writes out stays as written');
});

test("the Worker's division page has one h1, the motion, and names the chamber", () => {
  for (const code of CODES) {
    const { html, description } = renderDivisionAnswer({ key: `${code}-2026-09-10-1`, house: code, date: '2026-09-10',
      result: 'negative', ayes: 27, noes: 52, name: MOTION, question: MOTION, members: [], bills: [] }, [], new Map());
    assert.equal((html.match(/<h1\b/g) || []).length, 1, code);
    assert.match(html, /<h1>That the following words be added to the end of the motion: ‘and notes the report’\.<\/h1>/, code);
    assert.ok(description.startsWith(`${chamberLabel(code)}, 2026-09-10.`), code);
    assert.doesNotMatch(html, RAW, code);
  }
  for (const [house, name] of [['senate', 'Senate'], ['representatives', 'House of Representatives']]) {
    const { html, description } = renderDivisionAnswer({ key: `federal-${house}-oa-2026-10-15-3`, house, jurisdiction: 'federal',
      date: '2026-10-15', result: 'negative', ayes: 25, noes: 32, name: MOTION, question: MOTION, members: [], bills: [] }, [], new Map());
    assert.ok(description.startsWith(`${name}, 2026-10-15.`), house);
    assert.doesNotMatch(html, /[_-]oa\b/, house);
  }
});
