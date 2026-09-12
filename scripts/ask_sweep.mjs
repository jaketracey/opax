#!/usr/bin/env node
// Sweep every UI entry point that reaches a generative endpoint and check the
// answers: citations resolve to cited sources, offsets fit the answer, quoted
// text is verbatim in the cited original, sources link, no markup leaks.
//   node scripts/ask_sweep.mjs                       # production, cache bypassed
//   ORIGIN=http://localhost:8868 node scripts/ask_sweep.mjs
// Covers: Ask page (all kinds, speech only, party/state/year/topic filters,
// speaker chip), named-politician questions, then-vs-now eras, the streaming
// path, chat follow-up turns, follow-up chips, search overviews and the money
// map's guided journeys. ~40 paid generations per run (~$0.5 on DeepSeek Pro).
// Writes scripts/ask_sweep-report.json beside the console summary.
import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = process.env.ORIGIN || 'https://opax.com.au';
const NOCACHE = process.env.NOCACHE === '0' ? '' : '&nocache=1';
const PORTAL = process.env.PORTAL || new URL('../portal', import.meta.url).pathname;
const report = [];
const resourceText = new Map();

const fold = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}]/gu, '');
const cp = (s) => Array.from(s).length;

async function post(path, body, extra = '') {
  const t0 = Date.now();
  const res = await fetch(`${ORIGIN}${path}${path.includes('?') ? '' : '?'}${extra}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, ms: Date.now() - t0, json, text, headers: res.headers };
}
async function get(path) {
  const t0 = Date.now();
  const res = await fetch(`${ORIGIN}${path}`, { signal: AbortSignal.timeout(120_000) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, ms: Date.now() - t0, json, text };
}
async function originalText(source) {
  const slug = source.slug || (source.href || '').replace(/^\/doc\//, '');
  if (!slug || !/^speech-\d+$/.test(slug)) return source.snippet || '';
  if (!resourceText.has(slug)) {
    resourceText.set(slug, get(`/api/resource/${slug}`).then((r) => (r.json && typeof r.json.text === 'string') ? r.json.text : '').catch(() => ''));
  }
  return (await resourceText.get(slug)) || source.snippet || '';
}

/** Checks shared by every ask-shaped payload. Returns issue strings. */
async function checkAsk(label, r, { allowEvidenceOnly = false, expectPosition = false } = {}) {
  const issues = [];
  const j = r.json;
  if (r.status !== 200 || !j) return [`HTTP ${r.status}: ${r.text.slice(0, 120)}`];
  if (j.error) return [`error: ${j.error}`];
  const answer = String(j.answer || '');
  const sources = Array.isArray(j.sources) ? j.sources : [];
  const citations = j.citations && typeof j.citations === 'object' ? j.citations : {};
  const cited = sources.filter((s) => s.cited);
  if (!answer.trim()) issues.push('empty answer');
  if (j.answer_status === 'evidence_gap') issues.push('evidence gap (no position established)');
  if (j.answer_status === 'evidence_only' && !allowEvidenceOnly) issues.push('evidence-only fallback (summary not verified)');
  if (/the record retrieved for this question does not discuss|not enough data/i.test(answer)) issues.push('refusal text');
  if (/\[\^\d+\]|block-[A-Z]{2}|USER_CONTEXT_\d|\{context\}|\{question\}/.test(answer)) issues.push('raw citation markup leaked into answer');
  if (/^(based on|according to) the (provided|retrieved) (context|passages|record)/i.test(answer.trim())) issues.push('preamble leaked');
  if (!sources.length) issues.push('no sources');
  if (answer.trim() && j.answer_status !== 'evidence_gap' && !cited.length) issues.push('no cited sources');
  // Citation keys resolve to cited sources; offsets stay inside the answer.
  const byResource = new Map(sources.map((s) => [s.resource, s]));
  for (const [id, ranges] of Object.entries(citations)) {
    const rid = String(id).split('/')[0];
    const src = byResource.get(id) || byResource.get(rid);
    if (!src) { issues.push(`citation ${id.slice(0, 24)} has no source`); continue; }
    if (!src.cited) issues.push(`citation ${id.slice(0, 24)} on an uncited source`);
    if (!Array.isArray(ranges)) { issues.push(`citation ${id.slice(0, 24)} ranges not an array`); continue; }
    for (const range of ranges) {
      const [start, end] = range;
      if (!(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= cp(answer))) issues.push(`citation ${id.slice(0, 24)} offset [${start},${end}] outside answer (${cp(answer)})`);
    }
  }
  for (const s of cited) {
    const hasCitation = Object.keys(citations).some((id) => id === s.resource || id.split('/')[0] === s.resource);
    if (!hasCitation && j.answer_status !== 'evidence_only') issues.push(`source ${(s.title || s.resource || '').slice(0, 30)} flagged cited but never cited`);
  }
  for (const s of sources) {
    if (!s.title && !s.speaker) issues.push(`source ${String(s.resource).slice(0, 20)} has no title`);
    if (!s.href || !/^(\/|https:\/\/)/.test(String(s.href))) issues.push(`source ${(s.title || '').slice(0, 30)} has bad href ${s.href}`);
  }
  // Quotations in the answer must be verbatim in a cited source's original text.
  const quotes = [...answer.matchAll(/["“]([^"”\n]{30,})["”]/g)].map((m) => m[1]).filter((q) => q.trim().split(/\s+/).length >= 6);
  if (quotes.length) {
    const texts = await Promise.all(cited.map((s) => originalText(s)));
    const haystack = texts.map(fold);
    for (const q of quotes) {
      const parts = q.split(/\.{3}|…/).map(fold).filter(Boolean);
      const found = haystack.some((h) => parts.every((p) => h.includes(p)));
      if (!found) issues.push(`quote not verbatim in cited sources: "${q.slice(0, 60)}…"`);
    }
  }
  // Position answers: every bullet cites, dates present.
  if (expectPosition && /^\*\*From their speeches\*\*/.test(answer.trim())) {
    const bullets = answer.split('\n').filter((l) => l.startsWith('- '));
    if (!bullets.length && j.answer_status !== 'evidence_only') issues.push('position answer has no points');
  }
  // A sample of source links resolves.
  for (const s of sources.slice(0, 2)) {
    if (!s.href || !String(s.href).startsWith('/')) continue;
    try { const h = await fetch(`${ORIGIN}${s.href}`, { method: 'GET', signal: AbortSignal.timeout(30_000) }); if (h.status !== 200) issues.push(`source link ${s.href} -> ${h.status}`); } catch (e) { issues.push(`source link ${s.href} failed: ${e.message}`); }
  }
  return issues;
}

function record(section, label, r, issues, extra = {}) {
  const j = r.json || {};
  const row = { section, label, status: r.status, ms: r.ms, answer_status: j.answer_status || (r.status === 200 ? 'ok' : 'fail'), words: String(j.answer || '').split(/\s+/).filter(Boolean).length, sources: (j.sources || []).length, cited: (j.sources || []).filter((s) => s.cited).length, citations: Object.keys(j.citations || {}).length, issues, ...extra, answer: String(j.answer || '').slice(0, 220) };
  report.push(row);
  const flag = issues.length ? 'FAIL' : 'ok  ';
  console.log(`${flag} [${section}] ${label} — ${row.answer_status}, ${row.words}w, ${row.cited}/${row.sources} cited, ${row.citations} citations, ${r.ms}ms${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
  return row;
}

async function ask(section, label, body, opts = {}) {
  const r = await post('/api/ask', body, `nocache=1`);
  const issues = await checkAsk(label, r, opts);
  return { row: record(section, label, r, issues), r };
}

async function askStream(section, label, body, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(`${ORIGIN}/api/ask?stream=1&nocache=1`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body), signal: AbortSignal.timeout(200_000) });
  const text = await res.text();
  const isStream = (res.headers.get('content-type') || '').includes('text/event-stream');
  let json = null; const events = []; let deltaText = '';
  if (isStream) {
    for (const block of text.split('\n\n')) {
      const m = block.match(/^event: (\w+)\ndata: ([\s\S]*)$/); if (!m) continue;
      let d = null; try { d = JSON.parse(m[2]); } catch {}
      events.push({ e: m[1], d });
      if (m[1] === 'delta' && d?.text) deltaText += d.text;
      if (m[1] === 'retry') deltaText = '';
      if (m[1] === 'done') json = d;
    }
  } else { try { json = JSON.parse(text); } catch {} }
  const r = { status: res.status, ms: Date.now() - t0, json, text };
  const issues = await checkAsk(label, r, opts);
  const retries = events.filter((e) => e.e === 'retry').map((e) => e.d?.reason);
  const errors = events.filter((e) => e.e === 'error');
  if (isStream && !json) issues.push('stream ended without a done event');
  if (errors.length) issues.push(`stream error: ${JSON.stringify(errors[0].d).slice(0, 100)}`);
  if (isStream && json && deltaText.trim() && fold(deltaText) !== fold(json.answer)) issues.push('streamed text differs from the done answer');
  return { row: record(section, label, r, issues, { streamed: isStream, retries }), r };
}

// ---------------------------------------------------------------------------
console.log(`Sweep against ${ORIGIN} at ${new Date().toISOString()}`);

const results = {};
// A. Ask page, all record kinds (default): varied question types
const askAll = [
  ['topic over time', 'How have MPs described negative gearing over the years?'],
  ['policy explainer', 'What is the NDIS review?'],
  ['money: donors', 'Who donates to the Liberal Party from the gambling industry?'],
  ['money: grants', 'What grants has the Salvation Army received?'],
  ['money: contracts', 'What contracts has Accenture won from Defence?'],
  ['money: total', 'How much has Woodside donated?'],
  ['integrity', 'What did MPs say about the National Anti-Corruption Commission?'],
  ['event', 'What did MPs say about robodebt?'],
];
// B. Named-politician questions (position path), as typed on the Ask page
const askNamed = [
  ['Hanson immigration', 'what did pauline hanson say about immigration'],
  ['Wong China', 'What did Penny Wong say about China?'],
  ['Katter crocodiles', 'What did Bob Katter say about crocodiles?'],
  ['Ley childcare', 'What did Sussan Ley say about childcare?'],
];
// C. Ask page with the filter drawer: speech-only, party, state, years, topic, speaker chip
const askFiltered = [
  ['speech only', { question: 'What did MPs say about robodebt?', kind: 'speech' }],
  ['party filter', { question: 'What has been said about housing supply?', kind: 'speech', party: 'Labor' }],
  ['state filter', { question: 'What has been said about hospitals?', kind: 'speech', state: 'qld' }],
  ['year range', { question: 'What did MPs say about the carbon tax?', kind: 'speech', from: '2011', to: '2014' }],
  ['topic filter', { question: 'What has been said about rents?', kind: 'speech', topic: 'housing' }],
  ['speaker chip (automatic speaker filter)', { question: 'Jacqui Lambie on veterans', kind: 'speech', speaker: 'Jacqui Lambie' }],
  ['speaker + year range', { question: 'What did Anthony Albanese say about Medicare?', kind: 'speech', speaker: 'Anthony Albanese', from: '2013', to: '2016' }],
];
// D. Then-vs-now eras (thenvsnow.js askEra)
const eras = [
  ['Howard immigration 1996-2003', { question: 'What did John Howard say about immigration?', kind: 'speech', speaker: 'John Howard', topic: 'immigration', from: '1996', to: '2003' }],
  ['Howard immigration 2004-2007', { question: 'What did John Howard say about immigration?', kind: 'speech', speaker: 'John Howard', topic: 'immigration', from: '2004', to: '2007' }],
  ['Gillard climate 2010-2013', { question: 'What did Julia Gillard say about climate?', kind: 'speech', speaker: 'Julia Gillard', topic: 'climate-environment', from: '2010', to: '2013' }],
];

const runAll = async (section, list, opts, fn = ask) => Promise.all(list.map(([label, q]) => fn(section, label, typeof q === 'string' ? { question: q, kind: 'all' } : q, opts)));

const [a, b, c, d] = await Promise.all([
  runAll('ask/all', askAll, {}),
  runAll('ask/named', askNamed, { expectPosition: true, allowEvidenceOnly: false }),
  runAll('ask/filters', askFiltered, {}),
  runAll('then-vs-now', eras, { expectPosition: true }),
]);
results.a = a;

// E. Streaming path (what the browser actually uses) for three of the above
const streamed = await Promise.all([
  askStream('ask/stream', 'topic over time (stream)', { question: 'How have MPs described negative gearing over the years?', kind: 'all' }),
  askStream('ask/stream', 'money: donors (stream)', { question: 'Who donates to the Liberal Party from the gambling industry?', kind: 'all' }),
  askStream('ask/stream', 'speech only (stream)', { question: 'What did MPs say about robodebt?', kind: 'speech' }),
]);

// F. Chat follow-up turns, built from a finished answer, plus follow-up chips
const seed = a[0].r.json;
if (seed && seed.answer) {
  const context = [{ author: 'user', text: 'How have MPs described negative gearing over the years?' }, { author: 'answer', text: seed.answer }];
  await Promise.all([
    ask('chat', 'follow-up: and Labor?', { question: 'And what did Labor say?', kind: 'all', context }),
    ask('chat', 'follow-up: when', { question: 'When did the Coalition first oppose changes?', kind: 'all', context }),
    (async () => {
      const passages = (seed.sources || []).filter((s) => s.snippet).slice(0, 12).map((s) => ({ title: s.title, text: s.snippet }));
      const r = await post('/api/followups', { question: 'How have MPs described negative gearing over the years?', answer: seed.answer, passages }, 'nocache=1');
      const issues = [];
      const qs = r.json?.questions || [];
      if (r.status !== 200) issues.push(`HTTP ${r.status}`);
      if (!qs.length) issues.push('no follow-up questions');
      for (const q of qs) {
        if (!q.question || !/\?$/.test(q.question.trim())) issues.push(`malformed question: ${String(q.question).slice(0, 50)}`);
        if (!q.evidence || !passages.some((p) => fold(p.text).includes(fold(q.evidence)))) issues.push(`follow-up evidence not in passages: ${String(q.evidence).slice(0, 50)}`);
        if (!q.source) issues.push('follow-up missing source');
      }
      report.push({ section: 'followups', label: 'ask next chips', status: r.status, ms: r.ms, answer_status: r.status === 200 ? 'ok' : 'fail', words: qs.length, sources: passages.length, cited: qs.length, citations: 0, issues, answer: qs.map((q) => q.question).join(' | ').slice(0, 220) });
      console.log(`${issues.length ? 'FAIL' : 'ok  '} [followups] ${qs.length} questions, ${r.ms}ms${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
    })(),
  ]);
}

// G. Search overview (search page, "Find records" tab)
const summaries = [
  ['plain', 'q=negative+gearing&kind=all'],
  ['speech + party', 'q=housing&kind=speech&party=Labor'],
  ['years', 'q=carbon+tax&kind=all&from=2011&to=2014'],
  ['money kind', 'q=Woodside&kind=receipt'],
];
await Promise.all(summaries.map(async ([label, qs]) => {
  const r = await get(`/api/search-summary?${qs}&page=1&per=20&sort=relevance`);
  const issues = [];
  const j = r.json || {};
  if (r.status !== 200) issues.push(`HTTP ${r.status}: ${r.text.slice(0, 100)}`);
  else if (j.status === 'empty') issues.push('no matching records');
  else {
    if (j.status !== 'ready' || !Array.isArray(j.points) || !j.points.length) issues.push('no summary points');
    const ids = new Set((j.sources || []).map((s) => s.id));
    for (const p of j.points || []) {
      if (!p.text) issues.push('empty point');
      if (!Array.isArray(p.source_ids) || !p.source_ids.length) issues.push(`uncited point: ${String(p.text).slice(0, 40)}`);
      for (const id of p.source_ids || []) if (!ids.has(id)) issues.push(`point cites unknown source ${id}`);
    }
    for (const s of j.sources || []) { if (!s.href) issues.push('summary source missing href'); if (!Array.isArray(s.evidence) || !s.evidence.length) issues.push(`summary source ${s.id} has no evidence excerpt`); }
  }
  report.push({ section: 'search-summary', label, status: r.status, ms: r.ms, answer_status: j.status || 'fail', words: (j.points || []).length, sources: (j.sources || []).length, cited: (j.sources || []).length, citations: 0, issues, answer: (j.points || []).map((p) => p.text).join(' ').slice(0, 220) });
  console.log(`${issues.length ? 'FAIL' : 'ok  '} [search-summary] ${label} — ${(j.points || []).length} points over ${(j.sources || []).length} sources, ${r.ms}ms${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
}));

// H. Money map guided journeys (journey-story), with the page's default focus per lens
try {
  const mod = await import(`${PORTAL}/public/money-journeys-data.js`);
  const graph = JSON.parse(await readFile(`${PORTAL}/public/graph/money.json`, 'utf8'));
  const journeys = mod.buildMoneyJourneys(graph, {});
  await Promise.all(journeys.map(async (jn) => {
    const focus = jn.selection || jn.choices?.[0]?.value || '';
    const r = await post('/api/journey-story', { jurisdiction: 'federal', lens: jn.id, focus }, 'nocache=1');
    const issues = [];
    const j = r.json || {};
    if (r.status !== 200) issues.push(`HTTP ${r.status}: ${r.text.slice(0, 120)}`);
    else {
      const steps = Array.isArray(j.steps) ? j.steps : (j.title || j.body ? [j] : []);
      if (!steps.length) issues.push(`no story steps (keys: ${Object.keys(j).join(',')})`);
      for (const s of steps) { if (!s.title || !s.body) issues.push('step missing title/body'); if (/block-[A-Z]{2}|\[\^\d/.test(String(s.body))) issues.push('markup leaked into story'); }
    }
    report.push({ section: 'journey-story', label: `${jn.id} (${focus})`, status: r.status, ms: r.ms, answer_status: r.status === 200 ? 'ok' : 'fail', words: 0, sources: 0, cited: 0, citations: 0, issues, answer: JSON.stringify(j).slice(0, 220) });
    console.log(`${issues.length ? 'FAIL' : 'ok  '} [journey-story] ${jn.id} focus=${focus} — ${r.ms}ms${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
  }));
} catch (e) { console.log('journey-story sweep skipped:', e.message); }

// ---------------------------------------------------------------------------
const failed = report.filter((r) => r.issues.length);
console.log(`\n${report.length} entry-point checks, ${failed.length} with issues.`);
await writeFile(new URL('./ask_sweep-report.json', import.meta.url), JSON.stringify(report, null, 1));
