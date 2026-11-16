// How many subrequests one run of the daily social publisher makes (src/social-publication.ts), counted
// through the Worker's own scheduled handler (src/index.ts) so the preflight's in-process routes (the
// page's card, every story slide) are counted with the provider calls. Every binding is counted: fetch,
// D1, KV, the static assets, the Cache API, the rate limiter and R2. Only the rasteriser is stubbed.
// The static assets are the real files under public/, so each edition is composed as production would.
//
// Cloudflare Workers Paid: 10,000 subrequests per invocation by default, KV, D1 and R2 calls included
// (Workers limits page; changelog 11 Feb 2026). A Cron Trigger has no separate figure. Cache API calls
// share that quota and are capped at 1,000 a request. Whether a static assets fetch or a rate limiter
// call counts is not documented; both are counted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const LIMIT = 10_000, CACHE_LIMIT = 1_000;
// The budget a run must stay inside: a tenth of each limit, so growth shows long before the limit does.
const BUDGET = LIMIT / 10, CACHE_BUDGET = CACHE_LIMIT / 10;

const portal = new URL('../', import.meta.url);
const compiled = await build({ entryPoints: [new URL('src/index.ts', portal).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], logLevel: 'silent', plugins: [{ name: 'stub-renderer', setup(b) {
  b.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'og-render', namespace: 'subrequest-test' }));
  b.onLoad({ filter: /.*/, namespace: 'subrequest-test' }, () => ({ contents: 'export async function renderOgPng(){return new Uint8Array([137,80,78,71])}; export async function renderOgJpeg(){return new Uint8Array([255,216,255,224])}; export async function renderStoryJpeg(){return new Uint8Array([255,216,255,224,0,1])}', loader: 'js' }));
} }] });
const source = compiled.outputFiles[0].text;
const social = await build({ entryPoints: [new URL('src/social-publication.ts', portal).pathname], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { CONTAINER_WAITS } = await import('data:text/javascript;base64,' + Buffer.from(social.outputFiles[0].text).toString('base64'));
const migrations = readdirSync(new URL('migrations/', portal)).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(`migrations/${f}`, portal), 'utf8'));
const KINDS = ['fetch', 'd1', 'kv', 'assets', 'cache', 'ratelimit', 'r2'];

let instances = 0;
/**
 * A fresh Worker module (a cold isolate: nothing memoised from an earlier run) over fresh bindings.
 * `status(container, n)` answers a container's nth status read; every container is FINISHED by default.
 */
async function harness({ status = () => 'FINISHED' } = {}) {
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(`${source}\n// instance ${++instances}\n`).toString('base64'));
  const log = [];
  const count = (kind, what) => log.push({ kind, what });
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of migrations) sqlite.exec(sql);
  const d1 = (name, db) => ({
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first(col) { count(name, sql); const row = db?.prepare(sql).get(...args) ?? null; return row && col ? row[col] : row; },
        async all() { count(name, sql); return { results: db ? db.prepare(sql).all(...args) : [], meta: {} }; },
        async raw() { count(name, sql); return db ? db.prepare(sql).all(...args).map(r => Object.values(r)) : []; },
        async run() { count(name, sql); return { meta: { changes: db ? Number(db.prepare(sql).run(...args).changes) : 0 } }; },
      };
      return stmt;
    },
    async batch(stmts) { count(name, 'batch'); const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    async exec(sql) { count(name, 'exec'); db?.exec(sql); },
  });
  const kv = new Map();
  const asJson = opts => opts === 'json' || opts?.type === 'json';
  const GENERATION_CACHE = {
    async get(key, opts) { count('kv', `get ${key}`); const v = kv.get(key); return v == null ? null : asJson(opts) ? JSON.parse(v) : v; },
    async getWithMetadata(key, opts) { count('kv', `get ${key}`); const v = kv.get(key); return { value: v == null ? null : asJson(opts) ? JSON.parse(v) : v, metadata: null }; },
    async put(key, value) { count('kv', `put ${key}`); kv.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
    async delete(key) { count('kv', `delete ${key}`); kv.delete(key); },
    async list() { count('kv', 'list'); return { keys: [], list_complete: true }; },
  };
  const ASSETS = { async fetch(req) {
    const url = new URL(typeof req === 'string' ? req : req.url);
    count('assets', url.pathname);
    const file = new URL(`public${decodeURIComponent(url.pathname)}`, portal);
    if (!existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 });
    return new Response(readFileSync(file), { headers: { 'content-type': url.pathname.endsWith('.json') ? 'application/json' : url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' } });
  } };
  const store = new Map();
  const key = req => typeof req === 'string' ? req : req.url;
  const caches = { default: {
    async match(req) { count('cache', `match ${key(req)}`); return store.get(key(req))?.clone(); },
    async put(req, res) { count('cache', `put ${key(req)}`); store.set(key(req), res.clone()); },
    async delete(req) { count('cache', `delete ${key(req)}`); return store.delete(key(req)); },
  } };
  const limiter = { async limit() { count('ratelimit', 'limit'); return { success: true }; } };
  const env = {
    COMMUNITY_DB: d1('d1', sqlite), TABLE_DB: d1('d1', null), GENERATION_CACHE, ASSETS, OG_LIMITER: limiter, SEARCH_LIMITER: limiter,
    MEDIA: { async get(k) { count('r2', `get ${k}`); return null; }, async head(k) { count('r2', `head ${k}`); return null; } },
    CACHE_EPOCH: 'test', COMMUNITY_ORIGIN: 'https://opax.com.au', REPORTS_ENABLED: 'false', VIC_ELECTION_HUB_ENABLED: 'true', ARAG_KB_ID: 'kb', ARAG_KB_TOKEN: 'kb-token', ARAG_ZONE: 'aws-ap-southeast-2-1',
    DAILY_POST_ENABLED: 'true', X_API_KEY: 'key', X_API_SECRET: 'secret', X_ACCESS_TOKEN: 'token', X_ACCESS_TOKEN_SECRET: 'token-secret', X_ACCOUNT_ID: '123', X_USERNAME: 'OpaxAustralia',
    BLUESKY_POST_ENABLED: 'true', BSKY_HANDLE: 'opax.bsky.social', BSKY_APP_PASSWORD: 'app-pass',
    FACEBOOK_POST_ENABLED: 'true', FACEBOOK_STORY_ENABLED: 'true', FACEBOOK_PAGE_ID: '456', FACEBOOK_PAGE_TOKEN: 'page-token',
    INSTAGRAM_POST_ENABLED: 'true', INSTAGRAM_STORY_ENABLED: 'true', INSTAGRAM_ACCOUNT_ID: '789', INSTAGRAM_USERNAME: 'opaxaustralia', INSTAGRAM_ACCESS_TOKEN: 'ig-token', META_API_VERSION: 'v25.0',
  };
  let photos = 0, children = 0, stories = 0;
  const reads = new Map();
  const fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    count('fetch', `${init.method ?? (typeof input === 'string' ? 'GET' : input.method)} ${url}`);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (url.endsWith('/xrpc/com.atproto.server.createSession')) return Response.json({ accessJwt: 'jwt', did: 'did:plc:test', handle: 'opax.bsky.social' });
    if (url.endsWith('/xrpc/com.atproto.repo.uploadBlob')) return Response.json({ blob: { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/jpeg', size: 6 } });
    if (url.endsWith('/xrpc/com.atproto.repo.createRecord')) return Response.json({ uri: 'at://did:plc:test/app.bsky.feed.post/3kabc', cid: 'bafycid' });
    if (url.endsWith('/2/users/me')) return Response.json({ data: { id: '123', username: 'OpaxAustralia' } });
    if (url.endsWith('/2/tweets')) return Response.json({ data: { id: '1001' } });
    if (url.endsWith('/me?fields=id')) return Response.json({ id: '456' });
    if (url.endsWith('/789?fields=id,username')) return Response.json({ id: '789', username: 'opaxaustralia' });
    const read = /\/(\d+)\?fields=status_code$/.exec(url);
    if (read) { const n = (reads.get(read[1]) ?? 0) + 1; reads.set(read[1], n); return Response.json({ status_code: status(read[1], n) }); }
    if (url.endsWith('/456/feed')) return Response.json({ id: '456_1002' });
    if (url.endsWith('/456/photos')) return Response.json({ id: String(700 + ++photos) });
    if (url.endsWith('/456/photo_stories')) return Response.json({ success: true, post_id: '456_' + body.photo_id });
    if (url.endsWith('/789/media')) return Response.json({ id: body.is_carousel_item ? String(900 + ++children) : body.media_type === 'STORIES' ? String(800 + ++stories) : '999' });
    if (url.endsWith('/789/media_publish')) return Response.json({ id: '1' + body.creation_id });
    // The knowledge box and anything else: answered, and counted.
    return Response.json({}, { status: 404 });
  };
  const pending = [];
  const ctx = { waitUntil(p) { pending.push(p); }, passThroughOnException() {} };
  let waits = 0;
  /** One cron invocation at `scheduledTime`; its subrequests, and its cache.put calls made through waitUntil. */
  const tick = async scheduledTime => {
    const from = log.length;
    const saved = { fetch: globalThis.fetch, caches: globalThis.caches, setTimeout: globalThis.setTimeout };
    globalThis.fetch = fetch; globalThis.caches = caches;
    // The publisher's waits between container status reads pass at once; every other timer keeps its delay.
    globalThis.setTimeout = (fn, ms, ...args) => CONTAINER_WAITS.includes(ms) ? (waits++, saved.setTimeout(fn, 0, ...args)) : saved.setTimeout(fn, ms, ...args);
    try {
      await worker.scheduled({ cron: '0,5,10 22 * * *', scheduledTime }, env, ctx);
      await Promise.all(pending.splice(0));
    } finally { Object.assign(globalThis, saved); }
    const calls = log.slice(from);
    return { total: calls.length, ...Object.fromEntries(KINDS.map(k => [k, calls.filter(c => c.kind === k).length])), calls };
  };
  const rows = () => Object.fromEntries(sqlite.prepare('SELECT channel,status FROM social_deliveries').all().map(r => [r.channel, r.status]));
  const edition = () => { const row = sqlite.prepare('SELECT post_json FROM social_editions').get(); return row ? JSON.parse(row.post_json) : null; };
  return { tick, rows, edition, sqlite, waits: () => waits };
}
const line = c => `${c.total} (${KINDS.map(k => `${k} ${c[k]}`).join(', ')})`;
const everyChannel = { x: 'posted', bluesky: 'posted', facebook: 'posted', instagram: 'posted', instagram_story: 'posted', facebook_story: 'posted' };
/** The subrequests that composed the edition: everything up to and including its insert and the read that follows it. */
const composition = c => c.calls.findIndex(e => e.kind === 'd1' && e.what.startsWith('INSERT OR IGNORE INTO social_editions')) + 2;

// 22:00 UTC the evening before each Melbourne date. 3 Nov and 17 Oct are the two stuck story deliveries
// (17 Oct is a topic day: with the reports off it falls through to the next kind).
const DAYS = [
  ['politician', Date.UTC(2026, 10, 2, 22)], ['topic (falls through)', Date.UTC(2026, 9, 16, 22)], ['grant', Date.UTC(2026, 10, 3, 22)],
  ['program', Date.UTC(2026, 10, 15, 22)], ['bill', Date.UTC(2026, 10, 14, 22)], ['largest', Date.UTC(2026, 10, 12, 22)],
];

test('one 22:00 run of each edition kind, every channel on, stays inside a tenth of the subrequest limit', async t => {
  for (const [kind, at] of DAYS) {
    const h = await harness();
    const first = await h.tick(at);
    const post = h.edition();
    assert.ok(post, `${kind}: an edition was composed`);
    assert.deepEqual(h.rows(), everyChannel, `${kind}: every channel posted, so every call a run makes was counted`);
    const resume = [await h.tick(at + 5 * 60000), await h.tick(at + 10 * 60000)];
    t.diagnostic(`${kind} ${post.date} ${post.subject}, ${post.slides?.length ?? 0} slides: 22:00 ${line(first)}; composing ${composition(first)}; 22:05 ${resume[0].total}; 22:10 ${resume[1].total}`);
    for (const c of [first, ...resume]) {
      assert.ok(c.total <= BUDGET, `${kind}: ${c.total} subrequests, over the budget of ${BUDGET}`);
      assert.ok(c.cache <= CACHE_BUDGET, `${kind}: ${c.cache} Cache API calls, over the budget of ${CACHE_BUDGET}`);
    }
  }
});

test('the longest story Instagram allows stays inside the budget on each tick, published at once or with every container still processing', async t => {
  // The politician edition, the heaviest page to preflight, stretched to ten slides (five story frames).
  const composed = await harness();
  const first = await composed.tick(DAYS[0][1]);
  const base = composed.edition();
  // Eight middle slides of the types story frames are chosen from, a photograph among them, so a story posts its five frames.
  const middle = base.slides.slice(1, -1);
  const types = ['number', 'picture', 'ledger', 'number', 'division', 'bars', 'timeline', 'list'];
  const slides = [base.slides[0], ...types.map((type, i) => ({ ...middle[i % middle.length], type, ...(type === 'picture' ? { photo: 'senate-chamber' } : {}) })), base.slides.at(-1)];
  // Every container answers IN_PROGRESS through a whole run's reads (the first and one after each wait), then FINISHED.
  const h = await harness({ status: (_, n) => n <= 1 + CONTAINER_WAITS.length ? 'IN_PROGRESS' : 'FINISHED' });
  h.sqlite.prepare('INSERT INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').run(base.date, base.subject, JSON.stringify({ ...base, slides }), new Date(DAYS[0][1]).toISOString());
  const ticks = [];
  for (const m of [0, 5, 10]) ticks.push(await h.tick(DAYS[0][1] + m * 60000));
  assert.ok(h.waits() > 0, 'the run waited between status reads');
  // Each tick publishes what finished and leaves the next frame processing: the carousel posts at 22:05,
  // the Instagram story is still going after 22:10 (Facebook's photos need no status read).
  assert.deepEqual(h.rows(), { ...everyChannel, instagram_story: 'preparing' });
  // The same edition with every container finished at its first read: the most a single run publishes.
  const all = await harness();
  all.sqlite.prepare('INSERT INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').run(base.date, base.subject, JSON.stringify({ ...base, slides }), new Date(DAYS[0][1]).toISOString());
  const whole = await all.tick(DAYS[0][1]);
  assert.deepEqual(all.rows(), everyChannel);
  assert.equal(all.sqlite.prepare("SELECT post_id FROM social_deliveries WHERE channel='instagram_story'").get().post_id.split(',').length, 5, 'five story frames');
  t.diagnostic(`10 slides, 5 frames, every container processing: 22:00 ${line(ticks[0])}; 22:05 ${line(ticks[1])}; 22:10 ${line(ticks[2])}`);
  t.diagnostic(`10 slides, 5 frames, everything published at 22:00: ${line(whole)}; composing the edition at 22:00 adds ${composition(first)}`);
  ticks[0].total += composition(first);
  whole.total += composition(first);
  for (const [i, c] of [...ticks, whole].entries()) {
    assert.ok(c.total <= BUDGET, `tick ${i}: ${c.total} subrequests, over the budget of ${BUDGET}`);
    assert.ok(c.cache <= CACHE_BUDGET, `tick ${i}: ${c.cache} Cache API calls, over the budget of ${CACHE_BUDGET}`);
  }
});
