// Senate estimates: the index of rounds, a round's transcripts by committee and
// day (read from a stubbed knowledge box shaped like the real rows), and the
// Parliament menu's permanent link. Needs `npm run build:hubs` (public/hubs/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { workerFetch } from './helpers/worker-fetch.mjs';

// src/*.ts imports without extensions, so the module is bundled as the Worker is.
const bundled = await build({ entryPoints: [new URL('../src/estimates.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false });
const { transcriptFrom, readEstimatesRecord, transcriptQuery, committeeSearchHref } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

await import('../public/navigation.js');
const nav = globalThis.OpaxNavigation;
const read = p => JSON.parse(readFileSync(new URL('../public/' + p, import.meta.url), 'utf8'));
const calendar = read('hubs/estimates-rounds.json');
const committee = id => calendar.committees.find(c => c.id === id);
const hubs = read('hubs/index.json');

// The 26–29 Oct 2026 round as the local-PDF import wrote it (data/staged/committee-pdf/2026-10-supp-estimates):
// 14 hearings, Proof revision, a ParlInfo display URL each; Economics and Community Affairs on 29 Oct still pending.
const manifest = JSON.parse(readFileSync(new URL('../../data/staged/committee-pdf/2026-10-supp-estimates/manifest.json', import.meta.url), 'utf8'));
const OCT = manifest.hearings.map(h => ({ full: h.committee_name, day: h.date, source_url: h.source_url, format: 'pdf' }));
// Two days of the May–June 2026 round as the ParlInfo fragment ingest wrote them (no source_url).
const MAY = [
  { full: 'Economics Legislation Committee', day: '2026-06-04', format: 'html' },
  { full: 'Community Affairs Legislation Committee', day: '2026-06-03', format: 'html' },
  { full: 'Economics Legislation Committee', day: '2026-06-05', format: 'html' },
];
const HEARINGS = [...OCT, ...MAY];
const ddmmyyyy = day => day.split('-').reverse().join('/');
// Invented people only: these pages must never print a speaker's name.
const SPEAKER = 'Avery Quill';
function resourceFor(h, i) {
  const topic = h.format === 'pdf'
    ? `${h.full} - Estimates - TREASURY PORTFOLIO - Department of the Treasury`
    : `${h.full} - ${h.full} ${ddmmyyyy(h.day)} Estimates TREASURY PORTFOLIO Department of the Treasury`;
  return [`rid${i}`, { slug: `speech-${9000 + i}`, title: `${SPEAKER} — ${topic} — ${h.day}`,
    extra: { metadata: { date: h.day, ...(h.source_url ? { source_url: h.source_url,
      source_attribution: `Proof Committee Hansard, Senate ${h.full}, ${h.day} (committees/estimate/x). Origin local_pdf: test.` } : {}) } } }];
}
const calls = [];
/** The knowledge box's /search for one committee and day: the committee's turns that day, or a decoy turn
 *  from another hearing that only mentions the committee by name. */
function stubKb({ fail = () => false } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.includes('.rag.progress.cloud/')) return real(input, init);
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    assert.ok(url.endsWith('/search'), url);
    const full = body.query.replace(/^"|"$/g, '');
    const day = body.filter_expression.field.and.find(c => c.prop === 'created').since.slice(0, 10);
    if (fail(full, day)) return new Response('{"detail":"busy"}', { status: 503 });
    const own = HEARINGS.map((h, i) => [h, i]).filter(([h]) => h.full === full && h.day === day).map(([h, i]) => resourceFor(h, i));
    // A Community Affairs mention inside the Foreign Affairs hearing on 29 Oct: never a hearing of its own.
    const decoy = full === 'Community Affairs Legislation Committee' && day === '2026-10-29'
      ? [resourceFor({ full: 'Foreign Affairs, Defence and Trade Legislation Committee', day, format: 'pdf' }, 99)] : [];
    const resources = Object.fromEntries([...own, ...decoy]);
    return Response.json({ resources, fulltext: { total: Object.keys(resources).length * 700, results: Object.keys(resources).map(rid => ({ rid })) } });
  };
  return () => { globalThis.fetch = real; };
}
const KB = { ARAG_ZONE: 'test', ARAG_KB_ID: 'kb', ARAG_KB_TOKEN: 'token' };
const page = async (path, env = KB) => { const r = await workerFetch(path, env); return { status: r.status, html: await r.text() }; };
const main = html => html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';

test('the transcript check takes a committee\'s own estimates turns, in both title formats, and nothing else', () => {
  const economics = committee('economics');
  const as = (h, i = 0) => ({ resources: Object.fromEntries([resourceFor(h, i)]), fulltext: { total: 1 } });
  assert.deepEqual(transcriptFrom(economics, '2026-06-04', as(MAY[0])), { committee: 'economics', day: '2026-06-04' });
  const oct = OCT.find(h => h.full === economics.full);
  assert.deepEqual(transcriptFrom(economics, oct.day, as(oct)), { committee: 'economics', day: oct.day, source_url: oct.source_url, revision: 'Proof' });
  // Another committee's turn, another day's turn, or an inquiry hearing is not this committee's estimates hearing.
  assert.equal(transcriptFrom(economics, '2026-06-04', as({ ...MAY[1], day: '2026-06-04' })), null);
  assert.equal(transcriptFrom(economics, '2026-06-05', as(MAY[0])), null);
  const inquiry = { resources: { r: { title: `${SPEAKER} — Economics Legislation Committee - Treasury Laws Amendment Bill 2026 — 2026-06-04`, extra: { metadata: { date: '2026-06-04' } } } }, fulltext: { total: 1 } };
  assert.equal(transcriptFrom(economics, '2026-06-04', inquiry), null);
  // A "References" committee shares the words but not the name.
  const refs = { resources: { r: { title: `${SPEAKER} — Economics References Committee - Estimates — 2026-06-04`, extra: { metadata: { date: '2026-06-04' } } } }, fulltext: { total: 1 } };
  assert.equal(transcriptFrom(economics, '2026-06-04', refs), null);
  // Only a ParlInfo address is offered as the original, and always over https.
  const odd = { ...oct, source_url: 'http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22committees%2Festimate%2F30031%2F0011%22' };
  assert.match(transcriptFrom(economics, oct.day, as(odd)).source_url, /^https:\/\/parlinfo\.aph\.gov\.au\//);
  assert.equal(transcriptFrom(economics, oct.day, as({ ...oct, source_url: 'https://example.com/x' })).source_url, undefined);
});

test('the read is one bounded body search per committee and day, and a failed read marks the record incomplete', async () => {
  const round = calendar.rounds.find(r => r.id === '2026-10');
  const q = transcriptQuery(committee('economics'), '2026-10-28');
  assert.deepEqual(q.features, ['fulltext']);
  assert.equal(q.query, '"Economics Legislation Committee"');
  assert.deepEqual(q.filter_expression.field.and, [{ prop: 'label', labelset: 'chamber', label: 'senate_committee' },
    { prop: 'created', since: '2026-10-28T00:00:00Z', until: '2026-10-28T23:59:59Z' }, { prop: 'field', type: 'text', name: 'body' }]);
  let n = 0;
  const record = await readEstimatesRecord(round, calendar.committees, async () => { if (++n === 3) throw new Error('busy'); return { fulltext: { total: 0 } }; }, new Date('2026-11-04T00:00:00Z'));
  assert.equal(n, round.days.length * calendar.committees.length);
  assert.equal(record.incomplete, true);
  // Days still ahead are not read.
  let future = 0;
  await readEstimatesRecord(round, calendar.committees, async () => { future++; return {}; }, new Date('2026-10-27T03:00:00Z'));
  assert.equal(future, 2 * calendar.committees.length);
  await assert.rejects(readEstimatesRecord(round, calendar.committees, async () => { throw new Error('down'); }, new Date('2026-11-04T00:00:00Z')));
});

test('/estimates is the index of rounds, newest first, back to the first round in the record', async () => {
  const { status, html } = await page('/estimates', {});
  assert.equal(status, 200);
  const body = main(html);
  assert.match(html, /<title>Senate estimates · OPAX<\/title>/);
  const ids = [...body.matchAll(/href="\/estimates\/(\d{4}-\d{2})"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['2026-10', '2026-05', '2026-02', '2025-10', '2025-03', '2025-02']);
  for (const name of ['Supplementary Budget estimates 2026–27', 'Budget estimates 2026–27', 'Additional estimates 2025–26', 'Additional estimates 2024–25']) assert.ok(body.includes(name), name);
  assert.match(body, /Budget estimates \(May–June\), Supplementary Budget estimates \(October–November\) and Additional estimates \(February–March\)/);
  assert.match(body, /<nav class="crumbs prerender-crumbs"[\s\S]*?<li class="crumb-here" aria-current="page">[\s\S]*?Senate estimates<\/span><\/li><\/ol><\/nav>/);
  assert.match(body, /7 Oct 2025 – 10 Oct 2025 and 1 Dec 2025 – 4 Dec 2025/);
  assert.doesNotMatch(body, /Program to be finalised|data-gate-slot/);
  assert.equal((await page('/estimates/', {})).status, 301);
});

test('/estimates/2026-10 lists its transcripts by committee and day from the record, with the agencies block kept', async () => {
  const restore = stubKb();
  try {
    calls.length = 0;
    const { status, html } = await page('/estimates/2026-10');
    assert.equal(status, 200);
    const body = main(html);
    assert.match(html, /<title>Senate Supplementary Budget estimates 2026–27: 26 Oct 2026 – 29 Oct 2026 · OPAX<\/title>/);
    assert.match(body, /<p class="ui-page-meta">14 transcripts from 8 committees<\/p>/);
    assert.doesNotMatch(body, /Program to be finalised|program not yet published/);
    // Every hearing, under its committee, by day; the pending ones (and the decoy) are not there.
    for (const h of OCT) {
      const c = calendar.committees.find(x => x.full === h.full);
      const section = body.match(new RegExp(`<li id="committee-${c.id}">[\\s\\S]*?</p></li>`))[0];
      assert.ok(section.includes(committeeSearchHref(c, h.day, h.day).replaceAll('&', '&amp;')), `${c.id} ${h.day}`);
      assert.ok(section.includes(new URL(h.source_url).pathname), `${c.id} ${h.day} ParlInfo`);
    }
    const community = body.match(/<li id="committee-community-affairs">[\s\S]*?<\/p><\/li>/)[0];
    assert.equal((community.match(/<li>/g) || []).length, 1, 'Community Affairs sat once on the record: 28 Oct');
    assert.match(body, /Proof transcript on ParlInfo ↗︎/);
    assert.match(body, /Proof transcripts can be corrected before the official version is published\./);
    // Each committee's search covers its own days in the round.
    assert.ok(body.includes(committeeSearchHref(committee('finance-and-public-administration'), '2026-10-26', '2026-10-27').replaceAll('&', '&amp;')));
    assert.match(body, /Search this committee&#39;s records, 26 Oct 2026 – 27 Oct 2026|Search this committee's records, 26 Oct 2026 – 27 Oct 2026/);
    // The agencies, contracts and grants stay, with their wording.
    assert.equal((body.match(/Contract and grant figures are recorded award values, not payments\./g) || []).length, 1);
    assert.match(body, /id="group-A"[\s\S]*id="group-B"/);
    assert.match(body, /href="\/subject\/agency\//);
    assert.match(body, /<nav class="hub-toc"[\s\S]*href="#transcripts"[\s\S]*href="#group-A"/);
    // Officials and senators are named only in their own hearing records.
    assert.ok(!html.includes(SPEAKER));
    assert.doesNotMatch(body, /\/subject\/(person|donor)\//);
    assert.match(html, /"@type":"Event"/);
    assert.equal(calls.length, 5 * 8, 'one read per committee for each of the five scheduled days');
  } finally { restore(); }
});

test('an older round reads the same way; an unknown round is not found; a knowledge box outage says so', async () => {
  const restore = stubKb();
  try {
    const may = await page('/estimates/2026-05');
    assert.equal(may.status, 200);
    const body = main(may.html);
    assert.match(body, /3 transcripts from 2 committees/);
    assert.match(body, /<li id="committee-community-affairs">[\s\S]*Wednesday 3 Jun 2026/);
    assert.match(body, /<li id="committee-economics">[\s\S]*Thursday 4 Jun 2026[\s\S]*Friday 5 Jun 2026/);
    assert.doesNotMatch(body, /ParlInfo|not payments|id="group-A"/, 'no original link the record lacks, no agencies block it has no data for');
    assert.ok(!may.html.includes(SPEAKER));
    for (const path of ['/estimates/1999-01', '/estimates/unknown', '/estimates/2026-10/extra', '/estimates/2026-1']) assert.equal((await page(path)).status, 404, path);
  } finally { restore(); }
  const down = stubKb({ fail: () => true });
  try {
    const out = await page('/estimates/2026-10');
    assert.equal(out.status, 200);
    assert.match(main(out.html), /Transcripts could not be loaded\./);
    assert.match(main(out.html), /not payments/);
  } finally { down(); }
  // No knowledge box at all (a local Worker): the calendar still renders.
  const none = await page('/estimates/2025-03', {});
  assert.equal(none.status, 200);
  assert.match(main(none.html), /One day of hearings was held/);
});

test('Senate estimates is a permanent menu link: no gate, in the menus, the sheet, the footer and the trails', async () => {
  const parliament = nav.groups.find(g => g.id === 'parliament');
  const link = parliament.columns.find(c => c.heading === 'In the chamber').links.find(l => l.href === '/estimates');
  assert.ok(link && !link.gate, 'no gate on the entry');
  assert.equal(nav.published('estimates'), false, 'there is no estimates gate to open');
  const footer = nav.footerHTML(() => true, { slot: false });
  assert.match(footer, /<a class="footer-link" href="\/estimates">Senate estimates<\/a>/);
  assert.doesNotMatch(nav.footerHTML(), /data-gate-slot="estimates"/);
  assert.deepEqual(nav.trail('/estimates').map(s => s.label), ['Senate estimates']);
  assert.deepEqual(nav.trail('/estimates/2026-10', 'Supplementary Budget estimates 2026–27'), [{ label: 'Senate estimates', href: '/estimates' }, { label: 'Supplementary Budget estimates 2026–27' }]);
  assert.equal(nav.active('/estimates'), 'parliament');
  // The static footer index the build stamps into every page carries the link with no sitting week in sight.
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /<a class="footer-link" href="\/estimates">Senate estimates<\/a>/);
  // The menu link the Worker serves.
  assert.equal((await workerFetch('/estimates', {})).status, 200);
});

test('the index and every round are in the sitemap and the IndexNow journal', () => {
  const paths = hubs.pages.map(p => p.path);
  assert.ok(paths.includes('/estimates'));
  for (const r of calendar.rounds) assert.ok(paths.includes(`/estimates/${r.id}`), r.id);
  for (const p of hubs.pages.filter(p => p.path.startsWith('/estimates'))) assert.match(p.lastmod, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(calendar.note, undefined, 'the build note stays out of the published calendar');
});
