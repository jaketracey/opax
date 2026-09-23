import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkBlock, blockedAsns, generationBlockedAsns, DEFAULT_BLOCKED_ASNS, DEFAULT_GENERATION_BLOCKED_ASNS, GENERATION_PATHS, CRAWLER_UA } from '../src/network-block.ts';

function req(path, asn) {
  const r = new Request(`https://opax.com.au${path}`);
  if (asn !== undefined) Object.defineProperty(r, 'cf', { value: { asn } });
  return r;
}

test('the default list covers the Alibaba fleet and parses from the var', () => {
  assert.ok(blockedAsns({}).has(45102));
  assert.deepEqual([...blockedAsns({ BLOCKED_ASNS: ' 1, 2 ,x,0,-3 ' })], [1, 2]);
  assert.equal(DEFAULT_BLOCKED_ASNS.split(',').length, 3);
});

test('blocked network gets 403 on paid routes only', async () => {
  const blocked = networkBlock(req('/api/ask', 45102), {}, '/api/ask');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await blocked.json(), { error: 'forbidden', reason: 'network' });
  assert.equal(networkBlock(req('/og/money.png', 45102), {}, '/og/money.png')?.status, 403);
  assert.equal(networkBlock(req('/bill-texts/au-federal-r7542/index.json', 45102), {}, '/bill-texts/au-federal-r7542/index.json')?.status, 403);
  assert.equal(networkBlock(req('/', 45102), {}, '/'), null, 'pages stay open');
  assert.equal(networkBlock(req('/bills/index.json', 45102), {}, '/bills/index.json'), null, 'static data stays open');
  assert.equal(networkBlock(req('/ingest/e/', 45102), {}, '/ingest/e/'), null);
});

test('other networks and requests without cf data pass through', () => {
  assert.equal(networkBlock(req('/api/ask', 1221), {}, '/api/ask'), null, 'Telstra');
  assert.equal(networkBlock(req('/api/ask'), {}, '/api/ask'), null, 'no cf object');
  assert.equal(networkBlock(req('/api/ask', 45102), { BLOCKED_ASNS: '' }, '/api/ask'), null, 'empty list disables the block');
});

test('the generation list covers Meta and names only the model-backed routes', () => {
  assert.ok(generationBlockedAsns({}).has(32934));
  assert.equal(DEFAULT_GENERATION_BLOCKED_ASNS, '32934');
  assert.deepEqual([...generationBlockedAsns({ GENERATION_BLOCKED_ASNS: '7,x, 9 ' })], [7, 9]);
  for (const p of ['/api/ask', '/api/search-summary', '/api/followups', '/api/journey-story']) assert.ok(GENERATION_PATHS.test(p), p);
  for (const p of ['/api/search', '/api/search-all', '/api/brief', '/api/stats', '/api/askew', '/og/ask.png']) assert.ok(!GENERATION_PATHS.test(p), p);
});

test('a generation-blocked network loses the model routes but keeps retrieval and share images', async () => {
  const meta = 32934;
  const refused = networkBlock(req('/api/search-summary', meta), {}, '/api/search-summary');
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: 'forbidden', reason: 'network' });
  assert.equal(networkBlock(req('/api/ask', meta), {}, '/api/ask')?.status, 403);
  assert.equal(networkBlock(req('/api/followups', meta), {}, '/api/followups')?.status, 403);
  assert.equal(networkBlock(req('/api/journey-story', meta), {}, '/api/journey-story')?.status, 403);
  assert.equal(networkBlock(req('/api/search', meta), {}, '/api/search'), null, 'retrieval stays open');
  assert.equal(networkBlock(req('/api/brief', meta), {}, '/api/brief'), null);
  assert.equal(networkBlock(req('/og/subject/person/Helen%20Haines.png', meta), {}, '/og/subject/person/Helen%20Haines.png'), null, 'share images stay open for link previews');
  assert.equal(networkBlock(req('/search', meta), {}, '/search'), null, 'pages stay open');
  assert.equal(networkBlock(req('/api/ask', meta), { GENERATION_BLOCKED_ASNS: '' }, '/api/ask'), null, 'empty list disables the block');
  assert.equal(networkBlock(req('/api/ask', 1221), {}, '/api/ask'), null, 'Telstra');
});

test('a self-declared crawler loses the model routes on any network, readers do not', async () => {
  const ua = ua => { const r = new Request('https://opax.com.au/api/ask', { headers: { 'user-agent': ua } }); Object.defineProperty(r, 'cf', { value: { asn: 4837 } }); return r; };
  const baidu = 'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)';
  const refused = networkBlock(ua(baidu), {}, '/api/ask');
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: 'forbidden', reason: 'network' });
  assert.equal(networkBlock(ua(baidu), {}, '/api/search-summary')?.status, 403);
  assert.equal(networkBlock(ua(baidu), {}, '/api/search'), null, 'retrieval stays open for indexing');
  assert.equal(networkBlock(ua(baidu), {}, '/og/money.png'), null);
  for (const b of ['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Mozilla/5.0 HeadlessChrome/120', 'facebookexternalhit/1.1', 'GPTBot/1.0', 'ClaudeBot/1.0']) assert.ok(CRAWLER_UA.test(b), b);
  for (const h of ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128.0 Mobile Safari/537.36', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36 Edg/120', '']) assert.ok(!CRAWLER_UA.test(h), h);
  assert.equal(networkBlock(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'), {}, '/api/ask'), null, 'a China Unicom reader can still ask');
});
