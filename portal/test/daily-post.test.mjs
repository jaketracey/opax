import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kindFor, seededPick, fit, xLength, prettySponsor, prettyParty, formatDate, joinList,
  composeDailyPost, oauth1Header, runDailyPost, X_LIMIT, clip,
} from '../src/daily-post.ts';

const roster = { people: [
  { name: 'Anthony Albanese', speeches: 5408, current: true, party_now: 'Labor', first: 1998, representation: [{ jurisdiction: 'federal', chamber: 'representatives', electorate: 'Grayndler', state: 'NSW' }] },
  { name: 'Penny Wong', speeches: 4100, current: true, party_now: 'Labor', first: 2002, representation: [{ jurisdiction: 'federal', chamber: 'senate', electorate: null, state: 'SA' }] },
  { name: 'Retired Member', speeches: 900, current: false, party: 'Liberal', first: 1990, representation: [{ jurisdiction: 'federal', chamber: 'representatives', electorate: 'Somewhere' }] },
  { name: 'Quiet Backbencher', speeches: 12, current: true, party_now: 'Nationals', first: 2025, representation: [{ jurisdiction: 'federal', chamber: 'representatives', electorate: 'Elsewhere' }] },
] };
const bills = { bills: [
  { key: 'au-federal-r7537', title: 'AI Kill Switch and Data Centre Control Bill 2026', introduced: '2026-09-07', status: 'before_parliament', sponsor: 'GEE, Andrew, MP', sponsor_party: 'Independent Members', has_summary: true },
  { key: 'au-federal-r1000', title: 'Old Lapsed Bill 2019', introduced: '2019-02-01', status: 'lapsed', has_summary: true },
  { key: 'au-federal-r7400', title: 'Recently Passed Bill 2026', introduced: '2026-03-01', status: 'passed', status_as_of: '2026-08-20', sponsor: '', portfolio: 'Treasury', has_summary: true },
] };
const billFiles = {
  'au-federal-r7537': { summary: { sentences: ['This bill would require providers of covered advanced AI systems to maintain ways to restrict, suspend or shut them down.', 'It would introduce incident reporting and ministerial emergency directions when serious harm is threatened.', 'A third sentence that should not be needed.'] } },
  'au-federal-r7400': { summary: { sentences: ['It changes a tax thing.'] } },
};
const reports = { reports: [{ slug: 'grants-allocation', title: 'Where community funding goes' }, { slug: 'housing', title: 'Housing' }] };
const reportFiles = {
  'grants-allocation': { slug: 'grants-allocation', title: 'Where community funding goes' },
  housing: { slug: 'housing', title: 'Housing', blurb: 'Decades of affordability promises, negative gearing fights and supply debates.', stats: { speech_count: 19369, unique_speakers: 1292 }, voices: { now: [{ speaker: 'Andrew Bragg', party: 'Liberal', count: 164 }, { speaker: 'Harriet Shing', party: null, count: 137 }, { speaker: 'Ben Riley', party: 'Labor', count: 90 }] } },
};
function sources(recent = []) {
  return {
    async asset(path) {
      if (path === '/parliamentarians.json') return roster;
      if (path === '/bills/index.json') return bills;
      if (path === '/reports/index.json') return reports;
      let m = path.match(/^\/bills\/(.+)\.json$/); if (m) return billFiles[decodeURIComponent(m[1])] ?? null;
      m = path.match(/^\/reports\/(.+)\.json$/); if (m) return reportFiles[decodeURIComponent(m[1])] ?? null;
      return null;
    },
    async personTopics() { return [{ slug: 'health', share: 0.2 }, { slug: 'tax-budget', share: 0.16 }, { slug: 'unions-workplace', share: 0.15 }, { slug: 'education', share: 0.1 }]; },
    async recent() { return recent; },
  };
}

test('kinds rotate one per day and the same date always maps to the same kind', () => {
  const kinds = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'].map(kindFor);
  assert.deepEqual(new Set(kinds.slice(0, 3)).size, 3);
  assert.equal(kinds[3], kinds[0]);
  assert.equal(kindFor('2026-09-10'), kindFor('2026-09-10'));
});

test('seeded picks are deterministic and step past recently featured subjects', () => {
  const items = ['a', 'b', 'c', 'd'];
  const first = seededPick(items, 'k', x => x);
  assert.equal(seededPick(items, 'k', x => x), first);
  const next = seededPick(items, 'k', x => x, [first]);
  assert.notEqual(next, first);
  assert.equal(seededPick(items, 'k', x => x, items), first, 'everything excluded falls back to the seeded pick');
  assert.equal(seededPick([], 'k', x => x), null);
});

test('fit keeps posts within the X limit, counting URLs as 23 characters', () => {
  const url = 'https://opax.com.au/subject/person/Anthony%20Albanese';
  assert.equal(xLength(url), 23);
  const text = fit(['Head line.'], ['x'.repeat(200), 'y'.repeat(100), 'short tail line.'], url);
  assert.ok(xLength(text) <= X_LIMIT);
  assert.ok(text.includes('x'.repeat(200)) && !text.includes('y'.repeat(100)) && text.includes('short tail line.'));
  assert.ok(text.endsWith(url));
  const long = fit(['z'.repeat(400)], [], url);
  assert.ok(xLength(long) <= X_LIMIT && long.includes('…') && long.endsWith(url));
});

test('sponsor, party, date and list formatting', () => {
  assert.equal(prettySponsor('GEE, Andrew, MP'), 'Andrew Gee');
  assert.equal(prettySponsor('PAYMAN, Sen Fatima'), 'Fatima Payman');
  assert.equal(prettySponsor('KATTER, Bob, Jnr, MP'), 'Bob Katter');
  assert.equal(prettySponsor('NAMPIJINPA PRICE, Sen Jacinta'), 'Jacinta Nampijinpa Price');
  assert.equal(prettySponsor(''), '');
  assert.equal(prettyParty('Australia&#39;s Voice'), "Australia's Voice");
  assert.equal(prettyParty('Independent Members'), 'Independent');
  assert.equal(formatDate('2026-09-07'), '7 Sep 2026');
  assert.equal(joinList(['health', 'tax & budget', 'unions & workplace']), 'health, tax & budget and unions & workplace');
});

test('politician post names the member, seat, count and top topics', async () => {
  const post = await composeDailyPost('2026-09-10', sources(), 'politician');
  assert.equal(post.kind, 'politician');
  assert.ok(['Anthony Albanese', 'Penny Wong'].includes(post.title), 'only current members with enough speeches');
  assert.ok(post.text.includes('Talks most about health, tax & budget and unions & workplace.'));
  assert.ok(post.text.includes('speeches in federal parliament since'));
  assert.ok(post.text.endsWith(post.url) && post.url.startsWith('https://opax.com.au/subject/person/'));
  assert.ok(xLength(post.text) <= X_LIMIT);
  const other = await composeDailyPost('2026-09-10', sources([post.subject]), 'politician');
  assert.notEqual(other.subject, post.subject, 'a recently featured member is skipped');
});

test('bill post uses the summary sentences and a readable sponsor', async () => {
  const post = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7400']), 'bill');
  assert.equal(post.kind, 'bill');
  assert.equal(post.subject, 'bill:au-federal-r7537');
  assert.ok(post.text.startsWith('AI Kill Switch and Data Centre Control Bill 2026\n\nIntroduced 7 Sep 2026 by Andrew Gee (Independent). Still before parliament.'));
  assert.ok(post.text.includes('This bill would require providers'));
  assert.ok(!post.text.includes('A third sentence'));
  assert.ok(post.text.endsWith('https://opax.com.au/bill/au-federal-r7537'));
  assert.ok(xLength(post.text) <= X_LIMIT);
  const passed = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7537']), 'bill');
  assert.equal(passed.subject, 'bill:au-federal-r7400', 'lapsed bills are never featured; a recent passed bill is');
  assert.ok(passed.text.includes('Passed 20 Aug 2026. Introduced 1 Mar 2026 (Treasury portfolio).'));
});

test('a long first summary sentence is clipped to fit rather than dropped', async () => {
  const long = { ...billFiles, 'au-federal-r7537': { summary: { sentences: ['This bill changes the Customs Tariff Act 1995 to remove customs duties on goods brought in under the Geelong Treaty, a nuclear submarine partnership agreement with the United Kingdom signed on 26 July 2025, and it goes on and on well past the character budget.'] } } };
  const src = { ...sources(['bill:au-federal-r7400']), async asset(path) { const m = path.match(/^\/bills\/(.+)\.json$/); return m && m[1] !== 'index' ? long[decodeURIComponent(m[1])] : sources().asset(path); } };
  const post = await composeDailyPost('2026-09-10', src, 'bill');
  assert.ok(post.text.includes('This bill changes the Customs Tariff Act 1995'), post.text);
  assert.ok(post.text.includes('…'));
  assert.ok(xLength(post.text) <= X_LIMIT);
  assert.equal(clip('short', 10), 'short');
  assert.equal(clip('the quick brown fox jumps', 16), 'the quick brown…');
});

test('topic post skips reports without speech stats and names the loudest voices', async () => {
  const post = await composeDailyPost('2026-09-10', sources(), 'topic');
  assert.equal(post.kind, 'topic');
  assert.equal(post.subject, 'topic:housing');
  assert.ok(post.text.startsWith("Housing in Australia's parliaments: 19,369 speeches from 1,292 speakers."));
  assert.ok(post.text.includes('Most vocal lately: Andrew Bragg (Liberal), Harriet Shing and Ben Riley (Labor).'));
  assert.ok(post.text.endsWith('https://opax.com.au/reports/housing'));
  assert.ok(xLength(post.text) <= X_LIMIT);
});

test('a kind with nothing to say falls through to the next kind', async () => {
  const empty = { ...sources(), async asset(path) { return path === '/bills/index.json' ? { bills: [] } : sources().asset(path); } };
  const post = await composeDailyPost('2026-09-10', empty, 'bill');
  assert.notEqual(post.kind, 'bill');
});

test('OAuth 1.0a signature matches the reference vector from the X docs', async () => {
  const header = await oauth1Header(
    'POST', 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    { apiKey: 'xvz1evFS4wEEPTGEFPHBog', apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' },
    { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', 1318622958,
  );
  assert.ok(header.startsWith('OAuth '));
  assert.ok(header.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"'), header);
});

test('runDailyPost posts once per Melbourne day, records the subject, and dry-runs without secrets', async () => {
  const kv = new Map();
  const env = {
    ASSETS: { fetch: async req => { const data = await sources().asset(new URL(req.url).pathname); return data ? Response.json(data) : new Response('', { status: 404 }); } },
    GENERATION_CACHE: { async get(k, o) { const v = kv.get(k); return v == null ? null : (o?.type === 'json' ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } },
    DAILY_POST_ENABLED: 'true',
  };
  const personTopics = async () => Response.json({ profiles: { all: { topics: [{ slug: 'health', share: 1 }] } } });
  const now = Date.UTC(2026, 8, 9, 22, 0, 0); // 08:00 on 10 Sep in Melbourne
  const dry = await runDailyPost(env, { personTopics, now });
  assert.equal(dry.status, 'dry-run');
  assert.equal(dry.post.date, '2026-09-10');

  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ data: { id: '123' } }), { status: 201 }); };
  const creds = { ...env, X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_TOKEN_SECRET: 'ts' };
  const posted = await runDailyPost(creds, { personTopics, now, fetchImpl });
  assert.equal(posted.status, 'posted');
  assert.equal(posted.id, '123');
  assert.equal(calls[0].url, 'https://api.x.com/2/tweets');
  assert.ok(calls[0].init.headers.authorization.startsWith('OAuth '));
  assert.equal(JSON.parse(calls[0].init.body).text, posted.post.text);
  assert.deepEqual(JSON.parse(kv.get('daily-post:recent')), [posted.post.subject]);

  const again = await runDailyPost(creds, { personTopics, now, fetchImpl });
  assert.equal(again.status, 'skipped');
  assert.equal(calls.length, 1, 'no second post for the same day');

  const staging = await runDailyPost({ ...creds, STAGING_API: {} }, { personTopics, now, fetchImpl });
  assert.equal(staging.status, 'skipped');
  const disabled = await runDailyPost({ ...creds, DAILY_POST_ENABLED: 'false' }, { personTopics, now: now + 86400000, fetchImpl });
  assert.equal(disabled.status, 'skipped');
  assert.equal(calls.length, 1);
});
