import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
// daily-post.ts imports story.ts without an extension (the Worker is bundled), so the test bundles it the same way.
const built = await build({ entryPoints: [new URL('../src/daily-post.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const dailyPost = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const {
  kindFor, seededPick, fit, xLength, prettySponsor, prettyParty, formatDate, joinList,
  composeDailyPost, oauth1Header, X_LIMIT, clip, grantPostFor, shortMoney, dayWords, creditParagraph,
  WEEK, programEraFor, grantHook, purposePhrase, selectionLine, wholePercents, programUrl, largestUrl, programSplit,
} = dailyPost;
const { validStory, storyFrames } = await import('../src/story.ts');

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
const catalogue = { version: 1, accepted_licences: ['CC0', 'Public domain', 'CC BY', 'CC BY-SA'],
  photos: {
    'roof': { file: '/social/photos/roof.jpg', width: 1200, height: 794, description: 'The roof', source_title: 'File:Roof.jpg', page: 'https://commons.wikimedia.org/wiki/File:Roof.jpg', author: 'Kgbo', licence: 'CC BY-SA 4.0', credit: 'Photo: Kgbo, CC BY-SA 4.0, via Wikimedia Commons' },
    'twilight': { file: '/social/photos/twilight.jpg', width: 1200, height: 900, description: 'Twilight', source_title: 'File:Twilight.jpg', page: 'https://commons.wikimedia.org/wiki/File:Twilight.jpg', author: 'Kgbo', licence: 'CC BY-SA 4.0', credit: 'Photo: Kgbo, CC BY-SA 4.0, via Wikimedia Commons' },
    'aph': { file: '/social/photos/aph.jpg', width: 1200, height: 900, description: 'Parliament House', source_title: 'File:APH.jpg', page: 'https://commons.wikimedia.org/wiki/File:APH.jpg', author: 'Kgbo', licence: 'CC BY-SA 4.0', credit: 'Photo: Kgbo, CC BY-SA 4.0, via Wikimedia Commons' },
    'senate': { file: '/social/photos/senate.jpg', width: 1200, height: 750, description: 'Senate', source_title: 'File:Senate.jpg', page: 'https://commons.wikimedia.org/wiki/File:Senate.jpg', author: 'JJ Harrison', licence: 'CC BY-SA 3.0', credit: 'Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons' },
    'house': { file: '/social/photos/house.jpg', width: 1200, height: 714, description: 'House', source_title: 'File:House.jpg', page: 'https://commons.wikimedia.org/wiki/File:House.jpg', author: 'JJ Harrison', licence: 'CC BY-SA 3.0', credit: 'Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons' },
    'unlicensed': { file: '/social/photos/unlicensed.jpg', width: 1200, height: 800, description: 'Not free', source_title: 'File:X.jpg', page: 'https://example.org', author: 'Someone', licence: 'All rights reserved', credit: 'Photo: Someone' },
  },
  subjects: { 'grant:GA34203': ['roof', 'twilight'], 'topic:housing': ['unlicensed'] },
  kinds: { 'bill:senate': ['senate', 'house'], 'bill:representatives': ['house', 'senate'], bill: ['senate', 'house'], politician: ['aph'], topic: ['aph'], grant: [] },
};
const graph = {
  recipients: [{ id: 'abn:97694995462', n: 'The Trustee for the Qantas Foundation Memorial Trust', t: 11729541, c: 3, sh: 23 }, { id: 'abn:18374210672', n: 'City of Greater Geelong', t: 4000000, c: 1, sh: 7 }],
  programs: [{ id: 'GO3141', n: 'Community Development Grants', t: 1662088122, c: 569, cnc: 1621225888, y0: '2013-14', y1: '2022-23' }],
  electorates: [
    { n: 'Kennedy', st: 'qld', t: 1449579888, c: 104, r: 58, mps: [['Bob Katter', "Katter's Australian Party", '1993-03-13', null]], margin: { 2019: [13.33, 'KAP', 'safe'], 2022: [13.1, 'KAP', 'safe'] } },
    { n: 'Grayndler', st: 'nsw', t: 250000000, c: 40, r: 30, mps: [['Anthony Albanese', 'Labor', '1996-03-02', null]], margin: { 2022: [19.5, 'ALP', 'safe'] } },
  ],
};
const shard23 = { 'abn-97694995462': { n: 'The Trustee for the Qantas Foundation Memorial Trust', t: 11729541, c: 3, abr: { state: 'QLD' }, grants: [
  { id: 'GA34203', v: 11300000, desc: 'Construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld', s: '2019-02-12', guid: 'c0341dc2-c04e-1177-4ab0-99b9ae0d1b26', ag: 'Department of Infrastructure, Transport, Regional Development, Communications and the Arts', pr: 'Community Development Grants', cat: 'Regional Development', fy: '2018-19', sel: 'Closed Non-Competitive', el: 'Kennedy' },
  { id: 'GA567221', v: 351771, n: 'Updated Conservation Management Plan Qantas Hangar, Longreach Queensland', ag: 'Department of Climate Change, Energy, the Environment and Water', cat: 'Heritage', fy: '2025-26', s: '2026-06-25' },
  { id: 'GA37479', v: 77770, n: 'Protecting National Historic Sites', ag: 'Department of Climate Change, Energy, the Environment and Water', fy: '2017-18', s: '2018-06-12' },
] } };
const passedBillFile = { originating_house: 'representatives',
  summary: { sentences: ['It changes how the tax system treats eligible household payments.', 'The Commissioner would administer the change.', 'It would commence on Royal Assent.'], affected: 'The ATO and households receiving eligible payments.', attribution: 'Written by a model from the explanatory memorandum; not the record' },
  key_dates: [{ stage: 'introduced', date: '2026-03-01', house: 'representatives' }, { stage: 'third_reading', date: '2026-05-12', house: 'representatives' }, { stage: 'introduced', date: '2026-06-17', house: 'senate' }, { stage: 'passed', date: '2026-08-20', house: 'senate' }, { stage: 'royal_assent', date: '2026-08-26', house: 'senate' }],
  divisions: [{ key: 'federal-senate-1', date: '2026-08-20', house: 'senate', stage: 'Limitation of debate', ayes: 34, noes: 26, outcome: 'affirmative', party_splits: { Labor: { ayes: 24, noes: 0 }, Greens: { ayes: 9, noes: 0 }, Liberal: { ayes: 0, noes: 19 }, LNP: { ayes: 0, noes: 3 }, 'One Nation': { ayes: 0, noes: 3 }, Nationals: { ayes: 0, noes: 1 }, Independent: { ayes: 1, noes: 0 } } }],
  speeches: [{ slug: 's1', speaker: 'Daniel Mulino', date: '2026-03-01' }, { slug: 's2', speaker: 'Tony Sheldon', date: '2026-03-02' }],
  sources: [{ kind: 'em', licence: 'CC BY-NC-ND 4.0' }, { kind: 'billhome', licence: 'CC BY-NC-ND 4.0' }, { kind: 'frl_act', licence: 'CC BY 4.0' }] };
function sources(recent = [], { photos = true, extras = true } = {}) {
  return {
    async asset(path) {
      if (path === '/parliamentarians.json') return roster;
      if (path === '/bills/index.json') return bills;
      if (path === '/reports/index.json') return reports;
      if (path === '/social/photos.json') return photos ? catalogue : null;
      if (path === '/photos/people.json') return { 'anthony albanese': '10001', 'penny wong': 'wd-Q1' };
      if (path === '/photos/credits.json') return { 'wd-Q1': { artist: 'A Photographer', licence: 'CC BY 4.0' } };
      if (path === '/graph/grants.federal.json') return extras ? graph : null;
      if (path === '/grants/federal/shard-23.json') return extras ? shard23 : null;
      if (path === '/bills/au-federal-r7400.json') return extras ? passedBillFile : billFiles['au-federal-r7400'];
      let m = path.match(/^\/bills\/(.+)\.json$/); if (m) return billFiles[decodeURIComponent(m[1])] ?? null;
      m = path.match(/^\/reports\/(.+)\.json$/); if (m) return reportFiles[decodeURIComponent(m[1])] ?? null;
      return null;
    },
    async personTopics() { return [{ slug: 'health', share: 0.2 }, { slug: 'tax-budget', share: 0.16 }, { slug: 'unions-workplace', share: 0.15 }, { slug: 'education', share: 0.1 }]; },
    async recent() { return recent; },
  };
}

// Two programs as scripts/build_social_catalog.mjs writes them, one per government, with the same shape.
const bbrf = {
  id: 'GO3202', key: 'go3202', n: 'Building Better Regions Fund', ag: 'Department of Infrastructure, Transport, Regional Development and Communications',
  t: 180322835, c: 104, r: 98, y0: '2020-21', y1: '2021-22', sel: [['Open Competitive', 180322835, 104]], selKnown: [180322835, 104],
  mapped: [113600000, 70], groups: { Labor: [11360000, 8], Coalition: [94288000, 56], Crossbench: [7952000, 6] },
  seatShare: { Labor: 0.452, Coalition: 0.508, Crossbench: 0.04 },
  split: [{ group: 'Labor', d: 11360000, c: 8, pct: 10, seatPct: 45 }, { group: 'Coalition', d: 94288000, c: 56, pct: 83, seatPct: 51 }, { group: 'Crossbench', d: 7952000, c: 6, pct: 7, seatPct: 4 }],
  blocSplit: { gov: [94288000, 56], opp: [11360000, 8], cross: [7952000, 6] }, governed: { Coalition: 180322835 }, era: 'Coalition',
  first: '2020-07-30', last: '2022-03-25', seatCount: 23,
  seats: [
    { n: 'New England', st: 'nsw', t: 20000000, c: 6, holders: [['Barnaby Thomas Gerard Joyce', 'Nationals', 20000000]] },
    { n: 'Calare', st: 'nsw', t: 15000000, c: 4, holders: [['Andrew Gee', 'Nationals', 15000000]] },
    { n: 'Kennedy', st: 'qld', t: 7952000, c: 6, holders: [['Bob Katter', "Katter's Australian Party", 7952000]] },
    { n: 'Hunter', st: 'nsw', t: 6000000, c: 3, holders: [['Joel Fitzgibbon', 'Labor', 6000000]] },
    { n: 'Braddon', st: 'tas', t: 5000000, c: 2, holders: [['Gavin Pearce', 'Liberal', 5000000]] },
  ],
  recipients: [['abn:11111111111', 'Armidale Regional Council', 'council', 9000000, 3], ['abn:22222222222', 'Orange City Council', 'council', 8000000, 2], ['abn:33333333333', 'Burdekin Shire Council', 'council', 6000000, 1]],
  timing: { '0_3': [0, 0], '3_6': [10000000, 5], '6_12': [60000000, 30], '12_24': [110322835, 69], over_24: [0, 0], unknown: [0, 0] },
};
const pcip = {
  id: 'GO6047', key: 'go6047', n: 'Priority Community Infrastructure Program', ag: 'Department of Infrastructure, Transport, Regional Development, Communications and the Arts',
  t: 834651285, c: 91, r: 80, y0: '2023-24', y1: '2024-25', sel: [['Closed Non-Competitive', 834651285, 91]], selKnown: [834651285, 91],
  mapped: [792951285, 84], groups: { Labor: [499559310, 57], Coalition: [229955873, 23], Crossbench: [63436102, 4] },
  seatShare: { Labor: 0.51, Coalition: 0.37, Crossbench: 0.12 },
  split: [{ group: 'Labor', d: 499559310, c: 57, pct: 63, seatPct: 51 }, { group: 'Coalition', d: 229955873, c: 23, pct: 29, seatPct: 37 }, { group: 'Crossbench', d: 63436102, c: 4, pct: 8, seatPct: 12 }],
  blocSplit: { gov: [499559310, 57], opp: [229955873, 23], cross: [63436102, 4] }, governed: { Labor: 834651285 }, era: 'Labor',
  first: '2023-07-13', last: '2024-10-17', seatCount: 46,
  seats: [
    { n: 'Lingiari', st: 'nt', t: 58600001, c: 10, holders: [['Marion Scrymgour', 'Labor', 58600001]] },
    { n: 'Braddon', st: 'tas', t: 55125270, c: 5, holders: [['Gavin Pearce', 'Liberal', 55125270]] },
    { n: 'Kennedy', st: 'qld', t: 40313514, c: 2, holders: [['Bob Katter', "Katter's Australian Party", 40313514]] },
    { n: 'Hasluck', st: 'wa', t: 36900000, c: 3, holders: [['Tania Lawrence', 'Labor', 36900000]] },
    { n: 'Moore', st: 'wa', t: 25000000, c: 1, holders: [['Ian Goodenough', 'Liberal', 25000000]] },
  ],
  recipients: [['abn:15292645165', 'Torres Strait Island Regional Council', 'council', 40000000, 1], ['abn:68565723484', 'Department of Planning Lands and Heritage', 'government', 30000000, 1], ['abn:45863481471', 'Alice Springs Town Council', 'council', 29000000, 3]],
  timing: { '0_3': [0, 0], '3_6': [0, 0], '6_12': [415037501, 38], '12_24': [419613784, 53], over_24: [0, 0], unknown: [0, 0] },
};
const largestFile = { asOf: '2026-09-21', latest: '2026-08', months: {
  '2026-08': [
    { id: 'GA576946', recipientId: 'abn:75081455754', recipient: 'Australian Rail Track Corporation', amount: 150000000, start: '2026-08-07', purpose: 'This grant will provide $150 million in Australian Government funding to the Replacement of Sleepers - Maroona to Portland Project.', program: 'Network Investment Program (NIP) Australian Rail Track Corporation', agency: 'Department of Infrastructure', selection: 'Demand Driven', more: 2, sourceUrl: 'https://www.grants.gov.au/Ga/Show/a' },
    { id: 'GA576925', recipientId: 'abn:99695958804', recipient: 'Critical Metals for Critical Industries CRC Limited', amount: 58300000, start: '2026-08-06', purpose: 'CRITICAL METALS FOR CRITICAL INDUSTRIES CRC', program: 'Cooperative Research Centres Programme', agency: 'Department of Industry, Science and Resources', selection: 'Open Competitive', more: 0, sourceUrl: 'https://www.grants.gov.au/Ga/Show/b' },
    { id: 'GA577403', recipientId: 'abn:94641582121', recipient: 'Australian Associated Press Ltd', amount: 40700000, start: '2026-08-14', purpose: 'Support for the Australian Associated Press', program: 'Supporting the Australian Associated Press', agency: 'Department of Infrastructure', selection: 'Closed Non-Competitive', more: 0, sourceUrl: 'https://www.grants.gov.au/Ga/Show/c' },
    { id: 'GA577786', recipientId: 'abn:74410330756', recipient: 'Department of Health & Human Services', amount: 26992417, start: '2026-08-20', purpose: 'Funding agreement', program: 'National Program', agency: 'Organ and Tissue Authority', selection: 'Closed Non-Competitive', more: 0, sourceUrl: 'https://www.grants.gov.au/Ga/Show/d' },
  ],
} };
/** A source set with the program and largest-awards files beside the base records. */
function moneySources(base, { programs = [bbrf, pcip], largest = largestFile } = {}) {
  return { ...base, async asset(path) {
    if (path === '/social/programs.json') return { programs };
    if (path === '/social/grants-largest.json') return largest;
    return base.asset(path);
  } };
}

test('the week is planned by weekday: three days of public money, four of bills, a member and a topic', () => {
  // 4 October 2026 is a Sunday.
  const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map(kindFor);
  assert.deepEqual(week, ['bill', 'program', 'politician', 'grant', 'bill', 'largest', 'topic']);
  assert.deepEqual(week, [...WEEK]);
  assert.equal(kindFor('2026-10-11'), 'bill', 'the next Sunday starts the week again');
  assert.equal(kindFor('2026-10-05'), kindFor('2026-10-05'));
  for (let i = 1; i < week.length; i++) assert.notEqual(week[i], week[i - 1], 'no kind runs two days in a row');
});

test('program editions alternate between the two governments week by week', () => {
  const mondays = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map(programEraFor);
  assert.deepEqual(new Set(mondays), new Set(['Coalition', 'Labor']));
  for (let i = 1; i < mondays.length; i++) assert.notEqual(mondays[i], mondays[i - 1]);
  assert.equal(programEraFor('2026-10-05'), programEraFor('2026-10-11'), 'Monday to Sunday is one week');
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

test('politician publisher keeps a colliding roster row at its distinct canonical slug', async () => {
  const base = sources(['person:Alex Example']);
  const people = [
    { ...roster.people[0], name:'Alex Example', speeches:9000 },
    { ...roster.people[0], name:'Alex-Example', speeches:500 },
  ];
  const src = { ...base, asset:async path=>path==='/parliamentarians.json'?{people}:base.asset(path) };
  const post = await composeDailyPost('2026-09-10',src,'politician');
  assert.equal(post.title,'Alex-Example');
  assert.match(post.url,/^https:\/\/opax\.com\.au\/subject\/person\/alex-example-[a-f0-9]+$/);
  assert.equal(post.slides.find(s=>s.type==='source').path,new URL(post.url).pathname);
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
  assert.match(post.text,/^\$4\.0m grant to redevelop Windsor Park/); assert.match(post.text,/award value, not payments/);
  assert.match(post.text,/Recipient: City of Greater Geelong\. Agreement from 27 Aug 2026/);
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
  assert.equal(post.url, 'https://opax.com.au/money/grants/federal/recipient/abn:97694995462?award=GA34203', 'a clean recipient id in the link, no %3A');
  assert.equal(new URL(post.url).pathname, '/money/grants/federal/recipient/abn:97694995462');
  assert.match(post.text, /^\$11\.3m grant to construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld\./);
  assert.match(post.text, /Recipient: Qantas Foundation Memorial Trust\. Agreement from 12 Feb 2019 \(award value, not payments\)\./);
  assert.ok(xLength(post.text) <= X_LIMIT);
  assert.match(post.caption, /Program: Building Better Regions Fund/);
  assert.equal(await grantPostFor('2026-09-12', src, 'grant:GA1@abn:97694995462'), null, 'no GrantConnect record, no post');
  assert.equal(await grantPostFor('2026-09-12', src, 'grant:GA34203@abn:00000000000'), null, 'unknown recipient');
  assert.equal(await grantPostFor('2026-09-12', src, 'person:someone'), null, 'only the grant form exists');
});

const types = post => post.slides?.map(s => s.type) ?? null;

test('every kind tells a valid story from the same records, and X stays exactly as it was', async () => {
  for (const kind of ['politician', 'bill', 'grant', 'topic', 'program', 'largest']) {
    const date = kind === 'program' || kind === 'largest' ? '2026-10-05' : '2026-09-14';
    const src = kind === 'grant' ? grantSources() : moneySources(sources([], {}));
    const bare = kind === 'grant' ? grantSources({ photos: false, extras: false }) : moneySources(sources([], { photos: false, extras: false }));
    const post = await composeDailyPost(date, src, kind);
    const plain = await composeDailyPost(date, bare, kind);
    assert.equal(post.kind, kind);
    assert.ok(validStory(post.slides), `${kind}: ${JSON.stringify(types(post))}`);
    assert.equal(post.slides[0].type, 'cover');
    assert.equal(post.slides.at(-1).type, 'source');
    assert.ok(post.slides.every(s => s.alt && s.alt.length > 10), 'every slide has alt text');
    // The award's selection process comes from its shard, so a grant edition without one has one line fewer.
    // An award's optional lines (its selection process, its program) depend on the shard; its hook and recipient do not.
    const head = text => kind === 'grant' ? text.split('\n\n').slice(0, 2).join('\n\n') : text;
    assert.equal(head(post.text), head(plain.text), `${kind}: text is unchanged by the story`);
    assert.ok(xLength(post.text) <= X_LIMIT);
  }
});

function grantSources(opts = {}) {
  const grant = { id: 'GA34203', recipientId: 'abn:97694995462', recipient: 'The Trustee for the Qantas Foundation Memorial Trust', amount: 11300000, start: '2026-08-27', purpose: 'Construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld', agency: 'Department of Infrastructure, Transport, Regional Development, Communications and the Arts', program: 'Community Development Grants', category: 'Regional Development', sourceUrl: 'https://www.grants.gov.au/Ga/Show/verified-guid' };
  const base = sources([], opts);
  return { ...base, async asset(path) { return path === '/social/grants.json' ? { grants: [grant] } : base.asset(path); } };
}

test('the grant story carries the selection, the same recipient and the electorate when the shard and graph do', async () => {
  const post = await composeDailyPost('2026-09-14', grantSources(), 'grant');
  assert.deepEqual(types(post), ['cover', 'number', 'picture', 'bars', 'ledger', 'number', 'source']);
  const [cover, number, picture, bars, ledger, electorate, source] = post.slides;
  assert.equal(cover.kicker, 'Grant award · Kennedy, QLD');
  assert.equal(cover.title, '$11.3m for Qantas Foundation Memorial Trust');
  assert.equal(cover.photo, 'roof');
  assert.equal(number.value, '$11.3m');
  assert.match(number.lines[1], /Agreement from 27 Aug 2026 · Award GA34203/);
  assert.equal(picture.photo, 'twilight');
  assert.match(picture.quote, /^“Construct an airpark roof/);
  assert.equal(picture.lines[0], 'Category: Regional Development · Financial year 2018-19');
  assert.equal(bars.title, 'Closed, non-competitive');
  assert.deepEqual(bars.items, [{ label: 'Closed non-competitive', pct: 98 }, { label: 'Everything else', pct: 2 }]);
  assert.match(bars.note, /569 awards from 2013-14 to 2022-23, \$1\.66bn in total/);
  assert.equal(ledger.title, 'Three awards, two departments');
  assert.equal(ledger.rows.length, 3);
  assert.equal(ledger.rows[0].c1, '2017-18');
  assert.equal(ledger.total.amount, '$11,729,541');
  assert.equal(electorate.title, 'Kennedy');
  assert.equal(electorate.value, '$1.45bn');
  assert.match(electorate.lines[0], /Held by Bob Katter, Katter's Australian Party\. Safe seat, margin 13\.1 at the 2022 election\./);
  assert.match(source.path, /ABN 97 694 995 462 → award GA34203/);
  assert.match(post.caption, /\n\nPhotos: Kgbo, CC BY-SA 4\.0, via Wikimedia Commons\.\n\nhttps:\/\/opax\.com\.au\//, 'the credit sits before the URL');
  const thin = await composeDailyPost('2026-09-14', grantSources({ extras: false }), 'grant');
  assert.deepEqual(types(thin), ['cover', 'number', 'picture', 'source'], 'no shard, no selection, siblings or electorate');
  assert.equal(thin.slides[0].kicker, 'Grant award');
});

test('the operator award is told from its shard too', async () => {
  const post = await grantPostFor('2026-09-12', grantSources(), 'grant:GA34203@abn:97694995462');
  assert.deepEqual(types(post), ['cover', 'number', 'picture', 'bars', 'ledger', 'number', 'source']);
  assert.match(post.text, /^\$11\.3m grant to construct an airpark roof/);
  assert.match(post.text, /\n\nNo open round: closed, non-competitive\.\n\n/, 'the shard\'s selection process leads the optional lines');
  assert.match(post.caption, /No open round: closed, non-competitive\./);
});

test('a bill with a division and dates gets a timeline and the division; one without has neither', async () => {
  const passed = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7537', 'bill:au-federal-ed-draft-2026']), 'bill');
  assert.equal(passed.subject, 'bill:au-federal-r7400');
  assert.deepEqual(types(passed), ['cover', 'list', 'timeline', 'division', 'picture', 'source']);
  const [cover, list, timeline, division, touches, source] = passed.slides;
  assert.equal(cover.kicker, 'Bill · Treasury portfolio');
  assert.equal(cover.title, 'Recently Passed', 'the cover headline is the bill\'s own name without its Bill 2026 tail')
  assert.match(cover.line, /^It changes how the tax system treats eligible household payments\. Passed 20 Aug 2026\.$/);
  assert.equal(cover.photo, 'senate', 'the division house chooses the chamber photo');
  assert.equal(list.items.length, 3);
  assert.equal(list.note, 'Written by a model from the explanatory memorandum; not the record.');
  assert.equal(timeline.title, '178 days');
  assert.equal(timeline.events.length, 5);
  assert.deepEqual(timeline.events.map(e => e.date), ['1 Mar 2026', '12 May 2026', '17 Jun 2026', '20 Aug 2026', '26 Aug 2026']);
  assert.equal(division.title, 'Limiting debate, 34 to 26');
  assert.equal(division.kicker, 'The only recorded division');
  assert.deepEqual(division.ayeParties, [['Labor', 24], ['Greens', 9], ['Independent', 1]]);
  assert.deepEqual(division.noParties, [['Liberal', 19], ['LNP', 3], ['One Nation', 3], ['Nationals', 1]]);
  assert.equal(division.line, 'Senate, 20 Aug 2026. Party split from They Vote For You.');
  assert.equal(touches.photo, 'house');
  assert.match(touches.lines[0], /Speeches in the record: 2, beginning with Daniel Mulino on 1 Mar 2026\./);
  assert.deepEqual(source.rows, ['Explanatory memorandum on ParlInfo, CC BY-NC-ND 4.0', 'Bill home page on ParlInfo, CC BY-NC-ND 4.0', 'The Act on the Federal Register of Legislation, CC BY 4.0', 'Division record: theyvoteforyou.org.au']);
  assert.match(passed.caption, /Photos: JJ Harrison, CC BY-SA 3\.0, via Wikimedia Commons\./);
  const fresh = await composeDailyPost('2026-09-10', sources(['bill:au-federal-r7400', 'bill:au-federal-ed-draft-2026']), 'bill');
  assert.equal(fresh.subject, 'bill:au-federal-r7537');
  assert.deepEqual(types(fresh), ['cover', 'list', 'source'], 'no dates, divisions or affected parties: the story is the summary');
  assert.equal(fresh.slides[0].kicker, 'Bill · Andrew Gee (Independent)');
});

test('a member gets the electorate slide and the portrait inset; a senator gets neither', async () => {
  const member = await composeDailyPost('2026-09-10', sources(['person:Penny Wong']), 'politician');
  assert.equal(member.title, 'Anthony Albanese');
  assert.deepEqual(types(member), ['cover', 'number', 'bars', 'number', 'source']);
  assert.equal(member.slides[0].kicker, 'Parliamentarian · Grayndler, NSW');
  assert.equal(member.slides[0].inset, '10001');
  assert.equal(member.slides[0].insetCredit, 'Portrait: Parliament of Australia via OpenAustralia');
  assert.equal(member.slides[0].photo, 'aph');
  assert.equal(member.slides[1].value, '5,408');
  assert.deepEqual(member.slides[2].items, [{ label: 'Health', pct: 20 }, { label: 'Tax & budget', pct: 16 }, { label: 'Unions & workplace', pct: 15 }]);
  assert.equal(member.slides[3].title, 'Grayndler');
  assert.equal(member.slides[3].kicker, "The electorate's grants");
  assert.equal(member.slides[4].path, '/subject/person/anthony-albanese');
  assert.equal(member.url,'https://opax.com.au/subject/person/anthony-albanese');
  assert.equal(member.slides[4].url,'opax.com.au/subject/person/anthony-albanese');
  const senator = await composeDailyPost('2026-09-10', sources(['person:Anthony Albanese']), 'politician');
  assert.equal(senator.title, 'Penny Wong');
  assert.deepEqual(types(senator), ['cover', 'number', 'bars', 'source']);
  assert.equal(senator.slides[0].kicker, 'Parliamentarian · Senator for SA');
  assert.equal(senator.slides[0].inset, 'wd-Q1');
  assert.equal(senator.slides[0].insetCredit, 'Portrait: A Photographer, CC BY 4.0, via Wikimedia Commons');
});

test('without an approved photograph the cover has none and the caption carries no credit', async () => {
  const post = await composeDailyPost('2026-09-10', sources([], { photos: false }), 'politician');
  assert.ok(validStory(post.slides));
  assert.equal(post.slides[0].photo, null);
  assert.ok(!post.caption.includes('Wikimedia Commons'));
  const withPhoto = await composeDailyPost('2026-09-10', sources([]), 'politician');
  assert.match(withPhoto.caption, /\n\nPhoto: Kgbo, CC BY-SA 4\.0, via Wikimedia Commons\.\n\nhttps:\/\/opax\.com\.au\/subject\/person\//);
  const topic = await composeDailyPost('2026-09-10', sources([]), 'topic');
  assert.equal(topic.slides[0].photo, 'aph', 'an unlicensed subject photo is skipped for the kind default');
  assert.deepEqual(types(topic), ['cover', 'number', 'bars', 'number', 'source']);
  assert.equal(topic.slides[2].items[0].pct, 100);
  assert.equal(topic.slides[3].value, '2,843');
});

test('short money, day words and the credit paragraph', () => {
  assert.equal(shortMoney(11300000), '$11.3m');
  assert.equal(shortMoney(1449579888), '$1.45bn');
  assert.equal(shortMoney(4000000), '$4.0m', 'the site\'s one short form keeps its decimal');
  assert.equal(shortMoney(77770), '$77,770');
  assert.equal(dayWords(55), 'Fifty-five');
  assert.equal(dayWords(3), 'Three');
  assert.equal(dayWords(20), 'Twenty');
  assert.equal(dayWords(178), '178');
  const kgbo = { credit: 'Photo: Kgbo, CC BY-SA 4.0, via Wikimedia Commons' };
  assert.equal(creditParagraph([kgbo]), 'Photo: Kgbo, CC BY-SA 4.0, via Wikimedia Commons.');
  assert.equal(creditParagraph([kgbo, kgbo]), 'Photos: Kgbo, CC BY-SA 4.0, via Wikimedia Commons.');
  assert.equal(creditParagraph([kgbo, { credit: 'Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons' }]), 'Photo: Kgbo, CC BY-SA 4.0, via Wikimedia Commons. Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons.');
  assert.equal(creditParagraph([]), '');
});

test('the grant hook is the amount and the record\'s own words, without GrantConnect\'s stock opening', () => {
  assert.equal(grantHook(10000000, 'The project will deliver the redevelopment of the Kogarah War Memorial Pool, commonly known as the Carss Park Pool. Works will include a new ancillary building.'),
    '$10.0m grant for the redevelopment of the Kogarah War Memorial Pool, commonly known as the Carss Park Pool');
  assert.equal(grantHook(11300000, 'Construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld'),
    '$11.3m grant to construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld');
  assert.equal(grantHook(25000000, 'The project is to design and construct the Devonport Indoor Sports Centre.'), '$25.0m grant to design and construct the Devonport Indoor Sports Centre');
  assert.equal(grantHook(6000000, 'The project will deliver upgrades to the Marrickville Golf Club.'), '$6.0m grant for upgrades to the Marrickville Golf Club');
  assert.equal(grantHook(40700000, 'Support for the Australian Associated Press'), '$40.7m grant: Support for the Australian Associated Press', 'a noun "support for" is not a verb');
  assert.equal(grantHook(58300000, 'CRITICAL METALS FOR CRITICAL INDUSTRIES CRC'), '$58.3m grant: CRITICAL METALS FOR CRITICAL INDUSTRIES CRC');
  assert.equal(grantHook(5000, ''), '$5,000 grant');
  assert.equal(purposePhrase('This grant will provide $150 million to the Replacement of Sleepers. It forms part of a program.'), '$150 million to the Replacement of Sleepers');
  assert.equal(selectionLine('Closed Non-Competitive'), 'No open round: closed, non-competitive.');
  assert.equal(selectionLine('Open Competitive'), 'Selection: open competitive.');
  assert.equal(selectionLine(null), '');
});

test('whole percentages always add up to 100', () => {
  assert.deepEqual(wholePercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(wholePercents([63.4, 28.7, 7.9]), [63, 29, 8]);
  assert.deepEqual(wholePercents([0, 0, 0]), [0, 0, 0]);
  for (const v of [[0.1, 0.2, 0.7], [5, 5, 90], [33.33, 33.33, 33.34], [1, 2, 3, 4, 5, 6, 7]]) assert.equal(wholePercents(v).reduce((a, b) => a + b, 0), 100);
});

test('a program edition names all three groups, in the same order, against their share of the seats', async () => {
  const date = ['2026-10-05', '2026-10-12'].find(d => programEraFor(d) === 'Coalition');
  const post = await composeDailyPost(date, moneySources(sources()), 'program');
  assert.equal(post.kind, 'program');
  assert.equal(post.subject, 'program:GO3202');
  assert.equal(post.url, programUrl('go3202'));
  assert.equal(post.url, 'https://opax.com.au/money/grants?jur=federal&program=go3202');
  assert.match(post.text, /^Where did \$180\.3m go\? 104 grants, Building Better Regions Fund, 2020-21 to 2021-22\./);
  assert.match(post.text, /\n\nBy party holding the seat \(63% of dollars mapped\): Labor 10% \(45% of seats\), Coalition 83% \(51%\), crossbench 7% \(4%\)\.\n\n/);
  assert.ok(xLength(post.text) <= X_LIMIT, xLength(post.text));
  assert.ok(post.text.endsWith(post.url));
  assert.doesNotMatch(post.text + post.caption, /pork|rort|corrupt|scandal|rigged/i, 'OPAX never characterises; the reader draws the conclusion');
  assert.match(post.caption, /• Labor-held seats: 10% of the dollars; 45% of House seats at the time\n• Coalition-held seats: 83% of the dollars; 51% of House seats at the time\n• Crossbench-held seats: 7% of the dollars; 4% of House seats at the time/);
  assert.match(post.caption, /Awarded while the Coalition was in government\./);
  assert.match(post.caption, /• New England \(NSW\), Barnaby Joyce \(Nationals\): \$20\.0m/, 'the member\'s party on the grant date, first and last name');
  assert.match(post.caption, /approximate near boundaries/);
  assert.deepEqual(types(post), ['cover', 'number', 'bars', 'bars', 'ledger', 'bars', 'ledger', 'source']);
  const [cover, , seats, chosen, ledger, when, recipients, source] = post.slides;
  assert.equal(cover.kicker, 'Where did the money go?');
  assert.equal(cover.line, '$180.3m in 104 grants, 2020-21 to 2021-22');
  assert.equal(chosen.title, 'Open competitive');
  assert.deepEqual(seats.items, [{ label: 'Labor-held · 45% of seats', pct: 10 }, { label: 'Coalition-held · 51% of seats', pct: 83 }, { label: 'Crossbench-held · 4% of seats', pct: 7 }]);
  assert.equal(ledger.rows[0].c1, 'NSW');
  assert.equal(ledger.rows[0].c2, 'New England · Joyce (Nationals)');
  assert.equal(ledger.total.label, '23 seats in all');
  assert.equal(when.items.reduce((a, i) => a + i.pct, 0), 100);
  assert.equal(recipients.rows[0].c1, '3 awards');
  assert.match(source.path, /program GO3202/);
  assert.deepEqual(storyFrames(post.slides), [1, 2, 3, 5, 8], 'the story tray shows the cover, the total, the seat split, the seats and the source');
});

test('both governments\' programs are told in exactly the same words', async () => {
  const [a, b] = ['2026-10-05', '2026-10-12'];
  const one = await composeDailyPost(a, moneySources(sources()), 'program');
  const two = await composeDailyPost(b, moneySources(sources()), 'program');
  assert.deepEqual(new Set([one.subject, two.subject]), new Set(['program:GO3202', 'program:GO6047']), 'one week each');
  const shape = post => post.text.replace(post.url, 'URL').replace(post.title, 'NAME').replace(/\$[\d.,]+[mbn]*|\d[\d.,-]*( to [\d-]+)?%?/g, '#');
  assert.equal(shape(one).replace(/\n\n(All|#) chosen without an open round\./, ''), shape(two).replace(/\n\n(All|#) chosen without an open round\./, ''));
  const captionShape = post => post.caption.replace(/the Coalition|Labor(?=,| was)/g, 'GOVERNMENT').split('\n\n').map(p => p.split(/[:.(]/)[0]).slice(2, 4);
  assert.deepEqual(captionShape(one), captionShape(two));
  assert.match((one.subject === 'program:GO6047' ? one : two).text, /\n\nAll chosen without an open round\.\n\n/, 'the selection line fits when the program has one');
});

test('an exhausted government hands the day to another kind, never to the other government\'s list', async () => {
  const date = ['2026-10-05', '2026-10-12'].find(d => programEraFor(d) === 'Coalition');
  const src = moneySources({ ...grantSources(), recent: async () => ['program:GO3202'] });
  const post = await composeDailyPost(date, src, 'program');
  assert.notEqual(post.kind, 'program');
  assert.equal(post.kind, 'grant', 'program falls back to an award first');
});

test('a program whose percentages do not add up is not posted', async () => {
  const broken = { ...bbrf, split: bbrf.split.map((s, i) => i ? s : { ...s, pct: s.pct + 1 }) };
  assert.equal(programSplit(broken), null);
  const date = ['2026-10-05', '2026-10-12'].find(d => programEraFor(d) === 'Coalition');
  const post = await composeDailyPost(date, moneySources(grantSources(), { programs: [broken, pcip] }), 'program');
  assert.notEqual(post.kind, 'program');
});

test('the largest-awards edition lists the complete month, one line per recipient, and links to that month', async () => {
  const post = await composeDailyPost('2026-10-09', moneySources(sources()), 'largest');
  assert.equal(post.kind, 'largest');
  assert.equal(post.subject, 'largest:2026-08');
  assert.equal(post.url, largestUrl('2026-08'));
  assert.equal(post.url, 'https://opax.com.au/money/grants?jur=federal&largest=2026-08');
  assert.match(post.text, /^Where did the money go in August 2026\? The largest grant agreements that started that month:\n\n\$150\.0m · Australian Rail Track Corporation\n\$58\.3m · Critical Metals for Critical Industries CRC…\n\$40\.7m · Australian Associated Press Ltd/);
  assert.ok(xLength(post.text) <= X_LIMIT);
  assert.match(post.caption, /1\. \$150,000,000 to Australian Rail Track Corporation \(and 2 more awards that month\)/);
  assert.match(post.caption, /\$150 million in Australian Government funding to the Replacement of Sleepers/);
  assert.match(post.caption, /4\. \$26,992,417 to Department of Health & Human Services\nNational Program/, 'a stock purpose gives way to the program name');
  assert.match(post.caption, /not announcement dates\. Award values, not payments\./);
  assert.doesNotMatch(post.caption, /electorate|seat|Labor|Coalition/i, 'the largest list carries no seats: head offices are not where the money lands');
  assert.deepEqual(types(post), ['cover', 'ledger', 'number', 'number', 'number', 'source']);
  assert.equal(post.slides[1].rows.length, 4);
  assert.match(post.slides[4].lines[1], /No open round/);
  assert.equal(post.slides[2].lines[0], '$150 million in Australian Government funding to the Replacement of Sleepers - Maroona to Portland Project');
  assert.equal(post.slides[2].label, 'Agreement from 7 Aug 2026 · Award GA576946');
  assert.equal((await composeDailyPost('2026-10-09', moneySources({ ...grantSources(), recent: async () => ['largest:2026-08'] }), 'largest')).kind, 'grant', 'a month already posted hands the day to an award');
  assert.notEqual((await composeDailyPost('2026-08-28', moneySources(grantSources()), 'largest')).kind, 'largest', 'a month is never posted before it is over');
  const thin = { ...largestFile, months: { '2026-08': largestFile.months['2026-08'].slice(0, 2) } };
  assert.notEqual((await composeDailyPost('2026-10-09', moneySources(grantSources(), { largest: thin }), 'largest')).kind, 'largest', 'fewer than three is not a list');
});

test('a long purpose gives way so an award chosen without an open round says so on X', async () => {
  const desc = 'The project will deliver the design and construction of four new parks for Fairfield, with inclusive, age-appropriate equipment, informal recreation areas, and public amenities, where applicable.';
  const assets = {
    '/graph/grants.federal.json': { recipients: [{ id: 'abn:83140439239', n: 'Fairfield City Council', t: 9500000, c: 1, sh: 5 }] },
    '/grants/federal/shard-05.json': { 'abn-83140439239': { grants: [{ id: 'GA576235', v: 9500000, desc, s: '2026-07-30', guid: 'g', pr: 'Major and Local Community Infrastructure Program', sel: 'Closed Non-Competitive', el: 'Fowler' }] } },
  };
  const post = await grantPostFor('2026-09-30', { asset: async p => assets[p] ?? null, personTopics: async () => [], recent: async () => [] }, 'grant:GA576235@abn:83140439239');
  assert.match(post.text, /^\$9\.5m grant for the design and construction of four new parks for Fairfield/);
  assert.match(post.text, /\n\nNo open round: closed, non-competitive\.\n\n/);
  assert.ok(xLength(post.text) <= X_LIMIT, xLength(post.text));
});
