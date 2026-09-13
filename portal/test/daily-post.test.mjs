import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kindFor, seededPick, fit, xLength, prettySponsor, prettyParty, formatDate, joinList,
  composeDailyPost, oauth1Header, X_LIMIT, clip,
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
  { key: 'au-federal-ed-draft-2026', title: 'Draft Bill 2026', introduced: '2026-09-08', status: 'exposure_draft', status_as_of: '2026-09-08', sponsor: null, portfolio: 'Communications', has_summary: true },
] };
const billFiles = {
  'au-federal-r7537': { summary: { sentences: ['This bill would require providers of covered advanced AI systems to maintain ways to restrict, suspend or shut them down.', 'It would introduce incident reporting and ministerial emergency directions when serious harm is threatened.', 'A third sentence that should not be needed.'] } },
  'au-federal-r7400': { summary: { sentences: ['It changes how the tax system treats eligible household payments.'] } },
  'au-federal-ed-draft-2026': { summary: { sentences: ['It would impose a duty of care on covered digital platforms.'] } },
};
const reports = { reports: [{ slug: 'grants-allocation', title: 'Where community funding goes' }, { slug: 'housing', title: 'Housing' }] };
const reportFiles = {
  'grants-allocation': { slug: 'grants-allocation', title: 'Where community funding goes' },
  housing: { slug: 'housing', title: 'Housing', blurb: 'Decades of affordability promises, negative gearing fights and supply debates.', stats: { speech_count: 19369, unique_speakers: 1292, timeline: [['2024',1627],['2025',2843],['2026',5000]], top_speakers: [['Andrew Bragg',164],['Harriet Shing',137]] }, voices: { now: [{ speaker: 'Andrew Bragg', party: 'Liberal', count: 164 }, { speaker: 'Harriet Shing', party: null, count: 137 }, { speaker: 'Ben Riley', party: 'Labor', count: 90 }] } },
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
  const kinds = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'].map(kindFor);
  assert.deepEqual(new Set(kinds.slice(0, 4)).size, 4);
  assert.equal(kinds[4], kinds[0]);
  assert.equal(kindFor('2026-09-10'), kindFor('2026-09-10'));
});

test('seeded picks are deterministic and step past recently featured subjects', () => {
  const items = ['a', 'b', 'c', 'd'];
  const first = seededPick(items, 'k', x => x);
  assert.equal(seededPick(items, 'k', x => x), first);
  const next = seededPick(items, 'k', x => x, [first]);
  assert.notEqual(next, first);
  assert.equal(seededPick(items, 'k', x => x, items), null, 'everything excluded skips publication');
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
  assert.ok(post.text.includes('Health 20%; Tax & budget 16%'));
  assert.ok(post.text.includes('Shares of labelled speeches; labels overlap.'));
  assert.ok(post.text.endsWith(post.url) && post.url.startsWith('https://opax.com.au/subject/person/'));
  assert.ok(xLength(post.text) <= X_LIMIT);
  const other = await composeDailyPost('2026-09-10', sources([post.subject]), 'politician');
  assert.notEqual(other.subject, post.subject, 'a recently featured member is skipped');
});

test('bill post uses the summary sentences and a readable sponsor', async () => {
  const post = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7400', 'bill:au-federal-ed-draft-2026']), 'bill');
  assert.equal(post.kind, 'bill');
  assert.equal(post.subject, 'bill:au-federal-r7537');
  assert.ok(post.text.startsWith('This bill would require providers'));
  assert.ok(post.text.includes('before parliament.'));
  assert.ok(post.caption.includes('Introduced 7 Sep 2026 by Andrew Gee (Independent).'));
  assert.ok(post.caption.includes('Machine-written summary;'));
  assert.ok(post.text.includes('This bill would require providers'));
  assert.ok(!post.text.includes('A third sentence'));
  assert.ok(post.text.endsWith('https://opax.com.au/bill/au-federal-r7537'));
  assert.ok(xLength(post.text) <= X_LIMIT);
  const passed = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7537', 'bill:au-federal-ed-draft-2026']), 'bill');
  assert.equal(passed.subject, 'bill:au-federal-r7400', 'lapsed bills are never featured; a recent passed bill is');
  assert.ok(passed.caption.includes('Passed 20 Aug 2026. Introduced 1 Mar 2026 (Treasury portfolio).'));
});

test('an exposure draft is a bill candidate and says it is a draft', async () => {
  const post = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7400', 'bill:au-federal-r7537']), 'bill');
  assert.equal(post.subject, 'bill:au-federal-ed-draft-2026');
  assert.ok(post.caption.includes('Exposure draft released 8 Sep 2026 (Communications portfolio). Not yet introduced to parliament.'), post.text);
  assert.ok(post.text.includes('It would impose a duty of care on covered digital platforms.'));
  assert.ok(post.text.endsWith('https://opax.com.au/bill/au-federal-ed-draft-2026'));
});

test('a long first summary sentence is clipped to fit rather than dropped', async () => {
  const long = { ...billFiles, 'au-federal-r7537': { summary: { sentences: ['This bill changes the Customs Tariff Act 1995 to remove customs duties on goods brought in under the Geelong Treaty, a nuclear submarine partnership agreement with the United Kingdom signed on 26 July 2025, and it goes on and on well past the character budget.'] } } };
  const src = { ...sources(['bill:au-federal-r7400', 'bill:au-federal-ed-draft-2026']), async asset(path) { const m = path.match(/^\/bills\/(.+)\.json$/); return m && m[1] !== 'index' ? long[decodeURIComponent(m[1])] : sources().asset(path); } };
  const post = await composeDailyPost('2026-09-10', src, 'bill');
  assert.ok(post.text.includes('This bill changes the Customs Tariff Act 1995'), post.text);
  assert.ok(post.text.includes('…'));
  assert.ok(xLength(post.text) <= X_LIMIT);
  assert.equal(clip('short', 10), 'short');
  assert.equal(clip('the quick brown fox jumps', 16), 'the quick brown…');
});

test('topic post skips reports without speech stats and uses completed-year statistics and labels collection coverage', async () => {
  const post = await composeDailyPost('2026-09-10', sources(), 'topic');
  assert.equal(post.kind, 'topic');
  assert.equal(post.subject, 'topic:housing');
  assert.ok(post.text.startsWith('Housing: 19,369 collected speeches from 1,292 speakers.'));
  assert.ok(post.text.includes('2,843 in 2025. Coverage varies.'));
  assert.ok(post.text.endsWith('https://opax.com.au/reports/housing'));
  assert.ok(xLength(post.text) <= X_LIMIT);
});

test('a kind with nothing to say falls through to the next kind', async () => {
  const empty = { ...sources(), async asset(path) { return path === '/bills/index.json' ? { bills: [] } : sources().asset(path); } };
  const post = await composeDailyPost('2026-09-10', empty, 'bill');
  assert.notEqual(post.kind, 'bill');
});

test('grant editions keep the award amount, purpose, start date and exact recipient together', async () => {
  const grant = { id:'GA123', recipientId:'abn:18374210672', recipient:'City of Greater Geelong', amount:4000000, start:'2026-08-27', purpose:'The project will redevelop Windsor Park with new netball courts, cricket nets and improvements to the main pavilion.', agency:'Infrastructure', sourceUrl:'https://www.grants.gov.au/Ga/Show/verified-guid' };
  const src = { ...sources(), async asset(path) { return path === '/social/grants.json' ? {grants:[{...grant,id:'GA999',start:'2026-12-01'},grant]} : null; } };
  const post = await composeDailyPost('2026-09-14',src,'grant');
  assert.equal(post.subject,'grant:GA123');
  assert.equal(new URL(post.url).searchParams.get('award'),'GA123');
  assert.match(post.text,/\$4,000,000/); assert.match(post.text,/Award value, not payments/);
  assert.match(post.caption,/City of Greater Geelong/); assert.match(post.caption,/27 Aug 2026/);
  assert.match(post.caption,/netball courts/); assert.ok(xLength(post.text)<=280);
  assert.equal(await composeDailyPost('2027-09-14',src,'grant'),null,'stale start dates are not offered as recent grants');
  assert.equal(await composeDailyPost('2026-09-14',{...src,recent:async()=>['grant:GA123']},'grant'),null,'already featured recipient is skipped');
});

test('bill publication skips future dates and missing summaries', async () => {
  const src = { ...sources(), async asset(path) {
    if(path==='/bills/index.json')return {bills:[
      {key:'future',title:'Future Bill',introduced:'2027-01-01',status:'before_parliament',has_summary:true},
      {key:'empty',title:'Empty Bill',introduced:'2026-09-01',status:'before_parliament',has_summary:true},
      bills.bills[0],
    ]};
    return sources().asset(path);
  } };
  const post=await composeDailyPost('2026-09-14',src,'bill');
  assert.equal(post.subject,'bill:au-federal-r7537');
  assert.ok(post.text.startsWith('This bill would require'));
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

test('an operator can name one award and it is composed from the source shard', async () => {
  const { grantPostFor } = await import('../src/daily-post.ts');
  const assets = {
    '/graph/grants.federal.json': { recipients: [{ id: 'abn:97694995462', n: 'The Trustee for the Qantas Foundation Memorial Trust', t: 1, c: 1, sh: 23 }] },
    '/grants/federal/shard-23.json': { 'abn-97694995462': { grants: [
      { id: 'GA34203', v: 11300000, desc: 'Construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld', s: '2019-02-12', guid: 'c0341dc2-c04e-1177-4ab0-99b9ae0d1b26', ag: 'Department of Infrastructure', pr: 'Building Better Regions Fund' },
      { id: 'GA1', v: 5, desc: 'No source record', s: '2019-02-12' },
    ] } },
  };
  const src = { asset: async p => assets[p] ?? null, personTopics: async () => [], recent: async () => [] };
  const post = await grantPostFor('2026-09-12', src, 'grant:GA34203@abn:97694995462');
  assert.equal(post.subject, 'grant:GA34203');
  assert.equal(post.url, 'https://opax.com.au/money/grants/federal/recipient/abn%3A97694995462?award=GA34203');
  assert.match(post.text, /^\$11,300,000 grant award: Construct an airpark roof/);
  assert.ok(xLength(post.text) <= X_LIMIT);
  assert.match(post.caption, /Program: Building Better Regions Fund/);
  assert.equal(await grantPostFor('2026-09-12', src, 'grant:GA1@abn:97694995462'), null, 'no GrantConnect record, no post');
  assert.equal(await grantPostFor('2026-09-12', src, 'grant:GA34203@abn:00000000000'), null, 'unknown recipient');
  assert.equal(await grantPostFor('2026-09-12', src, 'person:someone'), null, 'only the grant form exists');
});
