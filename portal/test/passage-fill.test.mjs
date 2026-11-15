// A speaker search card whose record matched only on its speaker label takes
// its passage from the record's own text (src/passage-fill.ts, wired in
// src/index.ts fillSearchPassages). The real Worker runs here, offline: the
// knowledge box is a stub that counts every query, the Cache API is a Map and
// the daily allowance is a fake community_limits. Nothing leaves the machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { offline, loadWorker } from './worker-harness.mjs';

// OPAX_PORTAL_DIR points at another copy of portal/src (a revert check); assets stay this checkout's.
const root = process.env.OPAX_PORTAL_DIR ? pathToFileURL(process.env.OPAX_PORTAL_DIR.replace(/\/?$/, '/')) : new URL('../', import.meta.url);
const fill = await build({ entryPoints: [new URL('src/passage-fill.ts', root).pathname], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
  .then((out) => import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')), () => ({}));

offline();
const cache = new Map();
globalThis.caches.default = {
  async match(request) { return cache.get(request.url)?.clone(); },
  async put(request, response) { cache.set(request.url, response.clone()); },
};
const { env, fetch: worker } = await loadWorker(new URL('src/index.ts', root).pathname, new URL('../public', import.meta.url).pathname);

const SPEAKER = 'Ada Quill';
const HEADER = '[Finance and Public Administration Legislation Committee 27/05/2026 Estimates PRIME MINISTER AND CABINET PORTFOLIO Australian Public Service Commission]';
const LABEL = 'Senator ADA QUILL:';
const words = (n) => `Fixture words for record ${n}. How many agencies met the reporting target last year, and what will the commission do about those that did not?`;

// The knowledge box: one /find, and one /slug per record read.
const kb = { find: 0, reads: [], records: new Map(), failing: new Set(), hanging: new Set(), resources: {} };
const resource = (n, paragraphs) => ({
  slug: `speech-${n}`, title: `${SPEAKER} — Fixture debate ${n} — 2026-05-27`, origin: { collaborators: [SPEAKER] },
  usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'chamber', label: 'senate' }, { labelset: 'state', label: 'federal' }] },
  extra: { metadata: { date: '2026-05-27' } },
  fields: { '/t/body': { paragraphs: Object.fromEntries(paragraphs.map((text, i) => [`p${i}`, { text, score: 1 - i / 10, score_type: 'BM25' }])) } },
});
/** Records n..m, each matched only on its header and label; `spoken` ones matched on words too. */
function corpus(from, to, spoken = []) {
  kb.find = 0; kb.reads = []; kb.resources = {}; kb.failing.clear(); kb.hanging.clear();
  // A new corpus is a new search: only the kept passages outlive it.
  for (const key of [...cache.keys()]) if (!key.includes('/passage-fill-v1/')) cache.delete(key);
  for (let n = from; n <= to; n++) {
    kb.resources[`r${n}`] = resource(n, spoken.includes(n) ? [LABEL, `Matched words of record ${n}, as retrieval returned them.`] : [LABEL]);
    kb.records.set(`speech-${n}`, `${HEADER}\n\n${LABEL} ${words(n)}\n\nSenator OTHER: A later turn that is not this speaker's.`);
  }
}
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.equal(url.hostname, 'offline.rag.progress.cloud', `only the stub knowledge box is called: ${url}`);
  if (url.pathname.endsWith('/find')) { kb.find++; return Response.json({ resources: kb.resources, best_matches: [] }); }
  const slug = /\/slug\/(speech-\d+)$/.exec(url.pathname)?.[1];
  assert.ok(slug, `an unexpected knowledge-box path: ${url.pathname}`);
  kb.reads.push(slug);
  if (kb.hanging.has(slug)) return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal.reason)));
  if (kb.failing.has(slug)) return new Response('unavailable', { status: 502 });
  return Response.json({ slug, data: { texts: { body: { value: { body: kb.records.get(slug) } } } } });
};

// community_limits, as the daily allowance uses it: one counter per key.
const limits = { hits: new Map(), calls: [] };
env.COMMUNITY_DB = { prepare(sql) {
  assert.match(sql, /^INSERT INTO community_limits\(key,hits,expires_at\) VALUES \(\?,\?,\?\) ON CONFLICT\(key\) DO UPDATE SET hits=hits\+excluded\.hits RETURNING hits$/);
  return { bind(key, n, expires) { return { async first() {
    assert.match(key, /^passage-fill-day:\d+$/);
    assert.ok(expires > Date.now() / 1000, 'the counter expires after today');
    limits.calls.push(n);
    limits.hits.set(key, (limits.hits.get(key) || 0) + n);
    return { hits: limits.hits.get(key) };
  } }; } };
} };
const fresh = () => { limits.hits.clear(); limits.calls = []; };
const settle = () => new Promise((ok) => setTimeout(ok, 20)); // cache writes go through waitUntil

const search = async (path) => {
  const response = await worker(path);
  assert.equal(response.status, 200, path);
  return (await response.json()).results;
};
const page = (extra = '') => `/api/search-all?q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech${extra}`;
const bySlug = (rows) => Object.fromEntries(rows.map((r) => [r.slug, r.snippet]));

test('the speaker\'s own words, without the header and the label', () => {
  const { ownWords } = fill;
  assert.equal(ownWords(`${HEADER}\n\n${LABEL} ${words(1)}`), words(1));
  assert.equal(ownWords(`${LABEL}\n${words(1)}`), words(1));
  assert.equal(ownWords(`Australian Public Service Commission\n\n${LABEL} ${words(1)}`), words(1), 'a heading line above the label goes too');
  assert.equal(ownWords(`Ms BARRETT (Fremantle): ${words(1)}`), words(1), 'a label with an electorate');
  assert.equal(ownWords(`${LABEL} ${words(1)}\n\nSenator OTHER: A later turn.`), words(1), 'only the first turn');
  assert.equal(ownWords(words(1)), words(1), 'text with no label is used as it stands');
  assert.equal(ownWords('I have three questions for the department: first, the target.'), 'I have three questions for the department: first, the target.', 'a sentence with a colon is words');
  for (const empty of ['', LABEL, `${HEADER}\n\n${LABEL}`, `${HEADER}`, 'CHAIR:']) assert.equal(ownWords(empty), '', JSON.stringify(empty));
  const long = ownWords(`${LABEL} ${'A long answer about the reporting target. '.repeat(60)}`);
  assert.ok(long.length <= 600 && long.endsWith('…'), 'windowed like every other passage');
});

test('a label-only card is filled from the record text; a card with a passage is left alone', async () => {
  fresh(); corpus(101, 103, [102]);
  const rows = bySlug(await search(page()));
  assert.equal(rows['speech-101'], words(101), 'filled with the speaker\'s words, no header, no label, no later turn');
  assert.equal(rows['speech-103'], words(103));
  assert.equal(rows['speech-102'], 'Matched words of record 102, as retrieval returned them.', 'the retrieved passage stands');
  assert.deepEqual(kb.reads.sort(), ['speech-101', 'speech-103'], 'one read per label-only card, none for the card that had a passage');
  assert.equal(kb.find, 1);
  assert.deepEqual(limits.calls, [2], 'the two reads were taken from today\'s allowance, once, before they were made');
});

test('a second identical page makes no new reads', async () => {
  fresh(); corpus(201, 204);
  const first = bySlug(await search(page()));
  assert.equal(kb.reads.length, 4);
  await settle();
  kb.reads = []; limits.calls = [];
  const again = bySlug(await search(page()));
  assert.deepEqual(again, first, 'the same passages');
  assert.deepEqual(kb.reads, [], 'no record is read again');
  assert.deepEqual(limits.calls, [], 'and the allowance is not touched');
  // Kept per record, so another page holding one of them reads only the rest.
  corpus(204, 205);
  const mixed = bySlug(await search(page('&sort=newest')));
  assert.equal(mixed['speech-204'], words(204));
  assert.deepEqual(kb.reads, ['speech-205']);
});

test('more than twenty label-only cards cause at most twenty reads', async () => {
  fresh(); corpus(301, 326);
  const rows = await search(page('&per=30'));
  assert.equal(rows.length, 26);
  assert.equal(kb.reads.length, fill.FILL_MAX);
  assert.equal(fill.FILL_MAX, 20);
  assert.equal(rows.filter((r) => r.snippet).length, 20, 'twenty cards filled');
  assert.equal(rows.filter((r) => r.snippet === '').length, 6, 'the rest keep the fallback');
  assert.deepEqual(limits.calls, [20]);
});

test('a read that fails keeps the fallback, is not kept, and never fails the page', async () => {
  fresh(); corpus(401, 403);
  kb.failing.add('speech-402');
  const rows = bySlug(await search(page()));
  assert.equal(rows['speech-402'], '', 'the failed card has no passage: the page draws its fallback line');
  assert.equal(rows['speech-401'], words(401));
  assert.equal(rows['speech-403'], words(403));
  await settle();
  // Nothing was kept for the failure, so a later page tries that record again, and only that one.
  kb.reads = []; kb.failing.clear();
  assert.equal(bySlug(await search(page()))['speech-402'], words(402));
  assert.deepEqual(kb.reads, ['speech-402']);
});

test('a spent daily allowance makes no reads; a part-spent one makes only what is left', async () => {
  fresh(); corpus(501, 505);
  env.PASSAGE_FILL_DAILY_READS = '3';
  try {
    const rows = await search(page());
    assert.equal(kb.reads.length, 3, 'three reads left today, three made');
    assert.equal(rows.filter((r) => r.snippet).length, 3);
    await settle();
    kb.reads = [];
    const later = await search(page());
    assert.deepEqual(kb.reads, [], 'the allowance is spent: no read');
    assert.equal(later.filter((r) => r.snippet).length, 3, 'kept passages are still served');
    assert.equal(later.filter((r) => r.snippet === '').length, 2, 'the others keep the fallback');
    // Turned off outright, or with no counter to take from, nothing is read.
    corpus(511, 512);
    env.PASSAGE_FILL_DAILY_READS = '0';
    assert.equal((await search(page())).filter((r) => r.snippet).length, 0);
    assert.deepEqual(kb.reads, []);
  } finally { delete env.PASSAGE_FILL_DAILY_READS; }
  const db = env.COMMUNITY_DB;
  env.COMMUNITY_DB = undefined;
  try { corpus(521, 522); await search(page()); assert.deepEqual(kb.reads, [], 'no counter, no reads'); } finally { env.COMMUNITY_DB = db; }
  env.COMMUNITY_DB = { prepare() { throw new Error('counter unavailable'); } };
  try { corpus(531, 532); await search(page()); assert.deepEqual(kb.reads, [], 'a failing counter, no reads'); } finally { env.COMMUNITY_DB = db; }
});

test('only a search by speaker fills, a metered request reads nothing new, and the 200-row window is never filled', async () => {
  fresh(); corpus(601, 603);
  const plain = await search(`/api/search-all?q=${encodeURIComponent(SPEAKER)}&kind=speech`);
  assert.deepEqual(kb.reads, [], 'no speaker filter, no reads');
  assert.ok(plain.every((r) => r.snippet === ''));
  // /api/search fills a reader's page, never the window /api/search-all takes from it.
  await search(`/api/search?q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech&page=1&per=200`);
  assert.deepEqual(kb.reads, [], 'per=200: the window, not a page');
  const direct = bySlug(await search(`/api/search?q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech&page=1&per=20`));
  assert.equal(direct['speech-601'], words(601), 'the apps\' own page is filled too');
  assert.equal(kb.reads.length, 3);
  await settle();
  // An MCP request carries a Progress meter: it is served kept passages and makes no read of its own.
  corpus(603, 605);
  const metered = [];
  env.KB_METER = async (path) => { metered.push(path); };
  try {
    const rows = bySlug(await search(page()));
    assert.equal(rows['speech-603'], words(603), 'a kept passage is served');
    assert.equal(rows['speech-604'], '', 'an unkept one is not read');
    assert.deepEqual(kb.reads, []);
    assert.deepEqual(metered, ['/find'], 'the meter saw the search and nothing else');
  } finally { delete env.KB_METER; }
});

test('a read that hangs is abandoned: the page goes out with the fallback', async () => {
  fresh(); corpus(701, 702);
  kb.hanging.add('speech-701');
  const started = Date.now();
  const rows = bySlug(await search(page()));
  const took = Date.now() - started;
  assert.equal(rows['speech-701'], '');
  assert.equal(rows['speech-702'], words(702));
  assert.ok(took < fill.FILL_TOTAL_MS + 1500, `the page was not held (${took} ms)`);
  assert.ok(fill.FILL_READ_MS <= 2500 && fill.FILL_TOTAL_MS <= 4000 && fill.FILL_CONCURRENCY <= 5, 'short timeouts and a small concurrency cap');
});
