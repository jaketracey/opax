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
  for (const key of [...cache.keys()]) if (!key.includes('/passage-fill-v')) cache.delete(key);
  for (let n = from; n <= to; n++) {
    kb.resources[`r${n}`] = resource(n, spoken.includes(n) ? [LABEL, `Matched words of record ${n}, as retrieval returned them.`] : [LABEL]);
    kb.records.set(`speech-${n}`, `${HEADER} ${LABEL}\n\n ${words(n)}\n\nCHAIR: Thank you, Senator. The commissioner will take that on notice.`);
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

// community_limits, as the daily allowance uses it: one counter row a day.
const limits = { hits: new Map(), expires: new Map(), calls: [], delay: 0 };
const today = () => Math.floor(Date.now() / 86_400_000);
env.COMMUNITY_DB = { prepare(sql) {
  assert.equal(sql, 'INSERT INTO community_limits(key,hits,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=hits+excluded.hits RETURNING hits');
  return { bind(key, n, expires) { return { async first() {
    assert.match(key, /^passage-fill-day:\d+$/, 'counts only: a kind and a day, never an address or a query');
    if (limits.delay) await new Promise((ok) => setTimeout(ok, limits.delay));
    limits.calls.push(n);
    limits.hits.set(key, (limits.hits.get(key) || 0) + n);
    limits.expires.set(key, expires);
    return { hits: limits.hits.get(key) };
  } }; } };
} };
const fresh = () => { limits.hits.clear(); limits.expires.clear(); limits.calls = []; };
const settle = () => new Promise((ok) => setTimeout(ok, 20)); // cache writes go through waitUntil

const search = async (path, init) => {
  const response = await worker(path, init);
  assert.equal(response.status, 200, path);
  return (await response.json()).results;
};
// The search view's own request: a speaker filter, and fill=1.
const page = (extra = '') => `/api/search-all?q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech&fill=1${extra}`;
const bySlug = (rows) => Object.fromEntries(rows.map((r) => [r.slug, r.snippet]));

test('the speaker\'s own words: no header, no label, no one else\'s turn', () => {
  const { ownWords } = fill;
  assert.equal(ownWords(`${HEADER}\n\n${LABEL} ${words(1)}`, SPEAKER), words(1));
  assert.equal(ownWords(`${HEADER} ${LABEL}\n\n ${words(1)}`, SPEAKER), words(1), 'the shape real committee text has');
  assert.equal(ownWords(`${LABEL}\n${words(1)}`, SPEAKER), words(1));
  assert.equal(ownWords(`Australian Public Service Commission\n\n${LABEL} ${words(1)}`, SPEAKER), words(1), 'a heading line above the label goes too');
  assert.equal(ownWords(`Senator QUILL (Tasmania) (10:02): ${words(1)}`, SPEAKER), words(1), 'a label with parentheticals, by surname');
  assert.equal(ownWords(words(1), SPEAKER), words(1), 'a record with no label anywhere is the speaker\'s own text');
  assert.equal(ownWords(`${LABEL} I have three questions for the department: first, the target.`, SPEAKER), 'I have three questions for the department: first, the target.', 'a sentence with a colon is words');
  // The turn stops at the next label at the start of a line, whoever it names.
  for (const reply of ['CHAIR: Thank you, Senator.', 'ACTING CHAIR (Senator Example): Order.', 'The DEPUTY PRESIDENT: The time has expired.', 'Mr Example: We will take that on notice.', 'Commissioner Example: Yes.', 'Dr de Example: No.'])
    assert.equal(ownWords(`${HEADER} ${LABEL}\n\n ${words(1)}\n\n${reply}`, SPEAKER), words(1), `a reply is never included: ${reply}`);
  // The record must open with this speaker's own label.
  assert.equal(ownWords(`${HEADER} CHAIR:\n\n Welcome back.\n\n${LABEL} ${words(1)}`, SPEAKER), '', 'a record that opens with someone else\'s label is not filled');
  assert.equal(ownWords(`${HEADER} Senator OTHER:\n\n ${words(1)}`, SPEAKER), '');
  assert.equal(ownWords(`Mr QUILLEN (Example): ${words(1)}`, SPEAKER), '', 'a longer surname is someone else');
  assert.equal(ownWords(`Mr SMITH (Quill): ${words(1)}`, SPEAKER), '', 'an electorate that shares the name is not the speaker');
  assert.equal(ownWords(`Some opening words nobody is named for.\n\n${LABEL} ${words(1)}`, SPEAKER), '', 'unlabelled words before a label are nobody\'s to quote');
  assert.equal(ownWords(`${LABEL} ${words(1)}`, ''), '', 'no named speaker, no fill');
  for (const empty of ['', LABEL, `${HEADER}\n\n${LABEL}`, `${HEADER}`, `${LABEL}\n\nCHAIR: Order.`]) assert.equal(ownWords(empty, SPEAKER), '', JSON.stringify(empty));
  const long = ownWords(`${LABEL} ${'A long answer about the reporting target. '.repeat(60)}`, SPEAKER);
  assert.ok(long.length <= 600 && long.endsWith('…'), 'windowed like every other passage');
});

test('the allowance is 200 reads a day unless the Worker is told otherwise', async () => {
  const worker = (await import('node:fs')).readFileSync(new URL('src/index.ts', root), 'utf8');
  assert.match(worker, /\nconst PASSAGE_FILL_DAILY_READS = 200\n/);
  const config = (await import('node:fs')).readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal(config.split('"PASSAGE_FILL_DAILY_READS"').length - 1, 2, 'set once for production and once for staging');
  assert.match(config, /\n    "PASSAGE_FILL_DAILY_READS": "200",\n/);
  assert.match(config, /"vars": \{ "PASSAGE_FILL_DAILY_READS":"40", "SA_HANSARD_FULL_TEXT"/, 'staging has its own, smaller pool');
});

test('a label-only card is filled from the record text; a card with a passage is left alone', async () => {
  fresh(); corpus(101, 103, [102]);
  const rows = bySlug(await search(page()));
  assert.equal(rows['speech-101'], words(101), 'filled with the speaker\'s words: no header, no label, no chair\'s reply');
  assert.equal(rows['speech-103'], words(103));
  assert.equal(rows['speech-102'], 'Matched words of record 102, as retrieval returned them.', 'the retrieved passage stands');
  assert.deepEqual(kb.reads.sort(), ['speech-101', 'speech-103'], 'one read per label-only card, none for the card that had a passage');
  assert.equal(kb.find, 1);
  assert.deepEqual(limits.calls, [2], 'the two reads were taken from today\'s allowance, once, before they were made');
  assert.deepEqual([...limits.hits.keys()], [`passage-fill-day:${today()}`], 'one counter row a day');
  assert.equal(limits.expires.get(`passage-fill-day:${today()}`), (today() + 120) * 86400, 'kept 120 days, past the cleanup of expired counters');
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
  // The nightly cache epoch retires searches, not kept passages: a record's slug is its row id and does not move.
  const epoch = env.CACHE_EPOCH;
  env.CACHE_EPOCH = 'the-next-night';
  try {
    assert.deepEqual(bySlug(await search(page())), first);
    assert.equal(kb.find, 2, 'the search itself ran again under the new epoch');
    assert.deepEqual(kb.reads, [], 'and no record was read again');
  } finally { env.CACHE_EPOCH = epoch; }
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
    // The one row counts every read asked for: past the allowance, hits minus the allowance is the reads refused.
    const dayRow = `passage-fill-day:${today()}`;
    assert.equal(limits.hits.get(dayRow), 5, 'five asked for, three allowed: two refused');
    assert.deepEqual([...limits.hits.keys()], [dayRow], 'no second row');
    await settle();
    kb.reads = []; limits.calls = [];
    const later = await search(page());
    assert.deepEqual(kb.reads, [], 'the allowance is spent: no read');
    assert.deepEqual(limits.calls, [], 'and this isolate does not ask the counter again today');
    assert.equal(limits.hits.get(dayRow), 5);
    assert.equal(later.filter((r) => r.snippet).length, 3, 'kept passages are still served');
    assert.equal(later.filter((r) => r.snippet === '').length, 2, 'the others keep the fallback');
    // Turned off outright, or with no counter to take from, nothing is read.
    // Turned off outright: "0", and anything that is not a whole number of reads.
    for (const [n, off] of [[511, '0'], [513, 'off'], [515, ''], [517, '-1'], [519, '2.5']]) {
      corpus(n, n + 1); limits.calls = [];
      env.PASSAGE_FILL_DAILY_READS = off;
      assert.equal((await search(page())).filter((r) => r.snippet).length, 0, JSON.stringify(off));
      assert.deepEqual(kb.reads, [], `${JSON.stringify(off)} reads nothing`);
      assert.deepEqual(limits.calls, [], `${JSON.stringify(off)} asks the counter nothing`);
    }
  } finally { delete env.PASSAGE_FILL_DAILY_READS; }
  const db = env.COMMUNITY_DB;
  env.COMMUNITY_DB = undefined;
  try { corpus(521, 522); await search(page()); assert.deepEqual(kb.reads, [], 'no counter, no reads'); } finally { env.COMMUNITY_DB = db; }
  env.COMMUNITY_DB = { prepare() { throw new Error('counter unavailable'); } };
  try { corpus(531, 532); await search(page()); assert.deepEqual(kb.reads, [], 'a failing counter, no reads'); } finally { env.COMMUNITY_DB = db; }
});

test('only the search view\'s own request fills: not a person page, an app, a crawler or the 200-row window', async () => {
  fresh(); corpus(601, 603);
  const q = `q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech`;
  const unfilled = async (path, init, why) => {
    const rows = await search(path, init);
    assert.ok(rows.length && rows.every((r) => r.snippet === ''), `${why}: the cards keep their fallback`);
    assert.deepEqual(kb.reads, [], `${why}: no record is read`);
    assert.deepEqual(limits.calls, [], `${why}: the allowance is not touched`);
  };
  await unfilled(`/api/search-all?q=${encodeURIComponent(SPEAKER)}&kind=speech&fill=1`, undefined, 'no speaker filter');
  await unfilled(`/api/search-all?${q}`, undefined, 'search-all without fill=1 (the apps, MCP, any other caller)');
  // The person page's own requests (public/app.js: per=8 newest, and top_k=20), and the apps' page of 20.
  await unfilled(`/api/search?${q}&page=1&per=8&sort=newest`, undefined, 'a person page');
  await unfilled(`/api/search?${q}&top_k=20`, undefined, 'a person page, unpaged');
  await unfilled(`/api/search?${q}&page=1&per=20`, undefined, 'an app');
  await unfilled(`/api/search?${q}&fill=1&page=1&per=200`, undefined, 'the 200-row window, even asked to fill');
  for (const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Mozilla/5.0 HeadlessChrome/120.0', 'SomeSpider/1.0'])
    await unfilled(page(), { headers: { 'user-agent': agent } }, `a crawler (${agent.slice(0, 40)})`);
  const worker = (await import('node:fs')).readFileSync(new URL('src/index.ts', root), 'utf8');
  assert.match(worker, /cf\?\.botManagement\?\.verifiedBot \|\| cf\?\.verifiedBotCategory \|\| CRAWLER_UA\.test\(/, 'Cloudflare\'s verified-bot signal is checked before the user agent');
  // The page sends fill=1 from the search view, and from nowhere else.
  const app = (await import('node:fs')).readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(app.split('fill=1').length - 1, 2, 'one request and its comment');
  assert.match(app, /await api\(`\/api\/search-all\?\$\{searchQueryParams\(q, f, page, sort\)\}&fill=1`\)/);
  // A reader with an ordinary browser is filled.
  const rows = bySlug(await search(page(), { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' } }));
  assert.equal(rows['speech-601'], words(601));
  assert.equal(kb.reads.length, 3);
});

test('a metered request reads nothing new and is served kept passages', async () => {
  fresh(); corpus(651, 652);
  await search(page());
  await settle();
  corpus(652, 654);
  const metered = [];
  env.KB_METER = async (path) => { metered.push(path); };
  try {
    const rows = bySlug(await search(page()));
    assert.equal(rows['speech-652'], words(652), 'a kept passage is served');
    assert.equal(rows['speech-653'], '', 'an unkept one is not read');
    assert.deepEqual(kb.reads, []);
    assert.deepEqual(metered, ['/find'], 'the meter saw the search and nothing else');
  } finally { delete env.KB_METER; }
});

test('a request that would read passes the search limiter first, even over a cached window', async () => {
  fresh(); corpus(671, 673);
  const q = `q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech&fill=1`;
  const limiter = { asked: 0, allow: true };
  env.SEARCH_LIMITER = { async limit() { limiter.asked++; return { success: limiter.allow }; } };
  try {
    // Warm the window without filling (no fill flag), so the next pages are served from it.
    await search(`/api/search?q=${encodeURIComponent(SPEAKER)}&speaker=${encodeURIComponent(SPEAKER)}&kind=speech&page=1&per=20`);
    assert.equal(kb.find, 1);
    limiter.asked = 0; limiter.allow = false;
    // A new sort over the cached window makes no retrieval call, so nothing limited it before.
    const refused = await search(`/api/search?${q}&page=1&per=20&sort=newest`);
    assert.equal(kb.find, 1, 'the window was cached');
    assert.equal(limiter.asked, 1, 'the fill asked the limiter');
    assert.deepEqual(kb.reads, [], 'refused by the limiter: no reads');
    assert.deepEqual(limits.calls, [], 'and nothing taken from the allowance');
    assert.ok(refused.every((r) => r.snippet === ''));
    limiter.asked = 0; limiter.allow = true;
    const allowed = await search(`/api/search?${q}&page=1&per=20&sort=oldest`);
    assert.equal(limiter.asked, 1);
    assert.equal(kb.reads.length, 3);
    assert.ok(allowed.every((r) => r.snippet));
    await settle();
    // A kept page reads nothing, so it asks the limiter nothing.
    limiter.asked = 0; kb.reads = [];
    await search(`/api/search?${q}&page=1&per=20&sort=title_asc`);
    assert.equal(limiter.asked, 0);
    assert.deepEqual(kb.reads, []);
  } finally { delete env.SEARCH_LIMITER; }
});

test('a record of someone else\'s words is never shown as the speaker\'s', async () => {
  fresh(); corpus(681, 684);
  kb.records.set('speech-681', `${HEADER} CHAIR:\n\n Welcome back, everyone.\n\n${LABEL} ${words(681)}`);
  kb.records.set('speech-682', `${HEADER} Senator OTHER:\n\n ${words(682)}`);
  kb.resources.r683.usermetadata.classifications.push({ labelset: 'speaker_type', label: 'multi_speaker' });
  const rows = bySlug(await search(page()));
  assert.equal(rows['speech-681'], '', 'the record opens with the chair: not filled');
  assert.equal(rows['speech-682'], '', 'the record opens with another senator: not filled');
  assert.equal(rows['speech-683'], '', 'a record of several speakers: not filled');
  assert.equal(rows['speech-684'], words(684), 'the speaker\'s own record is filled, without the chair\'s reply');
  assert.ok(!kb.reads.includes('speech-683'), 'a multi-speaker record is not even read');
  // The rule itself, without the Worker's own handling of mixed records around it.
  const read = [];
  const rowsOf = () => [{ kind: 'speech', slug: 'speech-1', speaker: SPEAKER, snippet: '', speaker_type: 'multi_speaker' }, { kind: 'speech', slug: 'speech-2', speaker: '', snippet: '' }, { kind: 'speech', slug: 'speech-3', speaker: SPEAKER, snippet: '' }];
  const direct = rowsOf();
  await fill.fillPassages(direct, { cached: async () => undefined, keep() {}, reserve: async (n) => n, read: async (slug) => { read.push(slug); return `${LABEL} ${words(3)}`; } });
  assert.deepEqual(read, ['speech-3'], 'neither a multi-speaker row nor a row with no named speaker is read');
  assert.deepEqual(direct.map((r) => r.snippet), ['', '', words(3)]);
  assert.deepEqual(limits.calls, [3]);
});

test('the four seconds cover the cache lookups and the allowance, not only the reads', async () => {
  fresh(); corpus(691, 692);
  // A slow allowance: no answer in time is no reads.
  limits.delay = 6000;
  let started = Date.now();
  try {
    const rows = await search(page());
    const took = Date.now() - started;
    assert.ok(took < fill.FILL_TOTAL_MS + 800, `a 6 s allowance did not hold the page (${took} ms)`);
    assert.ok(rows.every((r) => r.snippet === ''));
    assert.deepEqual(kb.reads, [], 'no reads were granted');
  } finally { limits.delay = 0; }
  // A slow cache lookup: the page goes out at the deadline with the fallback.
  corpus(693, 694);
  const cacheApi = globalThis.caches.default, match = cacheApi.match;
  cacheApi.match = async (request) => { if (request.url.includes('/passage-fill-')) await new Promise((ok) => setTimeout(ok, 5000)); return match(request); };
  started = Date.now();
  try {
    const rows = await search(page());
    const took = Date.now() - started;
    assert.ok(took < fill.FILL_TOTAL_MS + 800, `a 5 s cache lookup did not hold the page (${took} ms)`);
    assert.ok(rows.every((r) => r.snippet === ''));
    assert.deepEqual(kb.reads, []);
  } finally { cacheApi.match = match; }
});

test('a read that hangs is abandoned: the page goes out with the fallback', async () => {
  fresh(); corpus(701, 702);
  kb.hanging.add('speech-701');
  const started = Date.now();
  const rows = bySlug(await search(page()));
  const took = Date.now() - started;
  assert.equal(rows['speech-701'], '');
  assert.equal(rows['speech-702'], words(702));
  assert.ok(took < fill.FILL_TOTAL_MS + 800, `the page was not held (${took} ms)`);
  assert.ok(fill.FILL_READ_MS <= 2500 && fill.FILL_TOTAL_MS <= 4000 && fill.FILL_CONCURRENCY <= 5, 'short timeouts and a small concurrency cap');
});
