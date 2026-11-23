import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {RECENT_VOTES, RECENT_DIVISIONS_PATH, readingVoteRow, recentDivisionsFile, recentVotes, voteRowHTML, votesSourceHTML, VOTES_RULE,
  FEATURED_PEOPLE, featuredGroup, featuredPeople, featuredRowHTML, featuredSourceHTML, FEATURED_RULE, seatWords, sydneyDay, portraitHTML} from '../public/home-data.js';

// The home page's two blocks from the app's Today screen: Votes in parliament (How parliament voted) and
// Featured parliamentarians. Both are federal records, drawn by rule from published files. These tests check
// the rules; they pin no count or name from the live data files, which the nightly changes.
const publicFile = path => new URL(`../public/${path}`, import.meta.url);
const json = path => JSON.parse(readFileSync(publicFile(path), 'utf8'));

const division = over => ({jurisdiction: 'federal', house: 'senate', key: 'federal-senate-oa-2026-11-18-7', slug: 'division-federal-senate-oa-2026-11-18-7',
  date: '2026-11-18', name: 'BILLS - Example <Measures> Bill 2026; Second Reading', question: 'The question is that the bill be read a second time.',
  result: 'affirmative', ayes: 27, noes: 10, members: [], ...over});

test('votes: a row is a division that decided a bill\'s second or third reading, federal only', () => {
  assert.deepEqual(readingVoteRow(division()), {slug: 'division-federal-senate-oa-2026-11-18-7', date: '2026-11-18', house: 'senate',
    bill: 'Example <Measures> Bill 2026', reading: 'second', outcome: 'Agreed', ayes: 27, noes: 10});
  assert.equal(readingVoteRow(division({name: 'BILLS - Example Bill 2026; Third Reading', question: 'The question is that this bill be read a third time.'})).outcome, 'Passed');
  assert.equal(readingVoteRow(division({result: 'negative', ayes: 23, noes: 29, question: 'The question is that this bill be now read a second time.'})).outcome, 'Not agreed');
  // Amendments and procedure are left out, whatever stage the record files them under.
  assert.equal(readingVoteRow(division({question: 'The question is that the second reading amendment moved by Senator Example be agreed to.'})), null);
  assert.equal(readingVoteRow(division({question: 'The question is that the question be now put on the second reading of the bills.'})), null);
  assert.equal(readingVoteRow(division({name: 'BUSINESS - Rearrangement', question: 'The question is that the motion be agreed to.'})), null);
  assert.equal(readingVoteRow(division({name: 'MOTIONS - Housing', question: 'The question is that the bill be read a second time.'})), null, 'a bill names the row');
  // A state division is never a row, and nor is one with no recorded count.
  for (const [jurisdiction, house] of [['vic', 'vic-la'], ['vic', 'vic-lc'], ['nsw', 'nsw-lc'], ['federal', 'vic-la']])
    assert.equal(readingVoteRow(division({jurisdiction, house})), null, `${jurisdiction} ${house}`);
  assert.equal(readingVoteRow(division({ayes: undefined})), null);
  assert.equal(readingVoteRow(null), null);
});

test('votes: the release file holds the newest federal reading votes and the dates of the export', async () => {
  const files = {
    'division-federal-senate-oa-2026-11-19-2': division({key: 'federal-senate-oa-2026-11-19-2', slug: 'division-federal-senate-oa-2026-11-19-2', date: '2026-11-19', name: 'BUSINESS - Rearrangement', question: 'The question is that the motion be agreed to.'}),
    'division-federal-senate-oa-2026-11-19-10': division({key: 'federal-senate-oa-2026-11-19-10', slug: 'division-federal-senate-oa-2026-11-19-10', date: '2026-11-19', name: 'BILLS - Later Bill 2026; Third Reading', question: 'The question is that this bill be read a third time.'}),
    'division-federal-senate-oa-2026-11-18-7': division(),
    'division-vic-lc-2026-11-20-1': division({jurisdiction: 'vic', house: 'vic-lc', key: 'vic-lc-2026-11-20-1', slug: 'division-vic-lc-2026-11-20-1', date: '2026-11-20'}),
  };
  const asked = [];
  const index = {divisions: Object.values(files).map(({key, slug, date}) => ({key, slug, date}))};
  const file = await recentDivisionsFile(index, {content_changed_at: '2026-11-22T23:13:37Z'}, async slug => { asked.push(slug); return files[slug]; });
  assert.equal(RECENT_DIVISIONS_PATH, '/growth/recent-divisions.json');
  assert.equal(file.generated_at, '2026-11-22T23:13:37Z');
  assert.equal(file.latest, '2026-11-19', 'the newest federal division, not the newest of any parliament');
  assert.deepEqual(file.divisions.map(d => d.slug), ['division-federal-senate-oa-2026-11-19-10', 'division-federal-senate-oa-2026-11-18-7']);
  assert.ok(!asked.some(slug => /-(vic|nsw|qld)-/.test(slug)), 'no state division file is read');
  assert.deepEqual(asked.slice(0, 2), ['division-federal-senate-oa-2026-11-19-10', 'division-federal-senate-oa-2026-11-19-2'], 'newest first, by number within a day');
  await assert.rejects(recentDivisionsFile({}, null, async () => null));
  assert.deepEqual((await recentDivisionsFile({divisions: []}, null, async () => null)), {generated_at: null, latest: null, divisions: []});
});

test('votes: the block draws three, newest first, one a bill a day', () => {
  const row = (n, date, bill, reading = 'second') => ({slug: `division-federal-senate-oa-${date}-${n}`, date, house: 'senate', bill, reading, outcome: 'Agreed', ayes: 30, noes: 9});
  const file = {divisions: [row(3, '2026-11-18', 'B Bill'), row(14, '2026-10-29', 'A Bill'), row(18, '2026-10-29', 'A Bill', 'third'), row(2, '2026-11-19', 'C Bill'), row(1, '2026-10-28', 'D Bill'),
    {slug: 'x', date: '2026-11-20', house: 'vic-lc', bill: 'State Bill', reading: 'second'}, {date: '2026-11-21'}, null]};
  const rows = recentVotes(file);
  assert.equal(rows.length, RECENT_VOTES);
  assert.deepEqual(rows.map(r => [r.bill, r.reading]), [['C Bill', 'second'], ['B Bill', 'second'], ['A Bill', 'third']]);
  assert.deepEqual(recentVotes(null), []);
  assert.deepEqual(recentVotes({divisions: 'x'}), []);
});

test('votes: a row leads with the outcome, names the bill and carries the count; its line is dated and sourced', () => {
  const html = voteRowHTML(readingVoteRow(division()));
  assert.match(html, /<span class="ui-status" data-tone="done">Agreed<\/span> <span>Second reading · Senate · <time datetime="2026-11-18">18 Nov 2026<\/time><\/span>/);
  assert.match(html, /<h3 class="hp-row-title"><a href="\/doc\/division-federal-senate-oa-2026-11-18-7">Example &lt;Measures&gt; Bill 2026<\/a><\/h3>/);
  assert.match(html, /<p class="hp-row-detail">Ayes 27 <span>· Noes 10<\/span><\/p>/);
  assert.match(voteRowHTML({...readingVoteRow(division()), house: 'representatives', outcome: 'Not agreed'}), /data-tone="ended">Not agreed<\/span> <span>Second reading · House · /);
  assert.doesNotMatch(html, /[→↗—]/);
  const line = votesSourceHTML({generated_at: '2026-11-22T23:13:37Z', latest: '2026-11-19', divisions: []}, {checked_at: '2026-11-23T04:04:56+00:00', source_access: {}});
  assert.match(line, /<details class="ui-pop ui-source"/);
  assert.match(line, /Updated 22 Nov 2026 · <span class="ui-source-name">Federal Hansard divisions<\/span>/);
  assert.match(line, /Divisions recorded to 19 Nov 2026\./);
  assert.ok(line.includes(VOTES_RULE));
  assert.match(line, /<dt>Site refreshed<\/dt><dd>23 Nov 2026<\/dd>/);
  assert.doesNotMatch(line, /Last changed|Last checked/);
});

const person = over => ({name: 'Jordan Avery', party: 'Liberal', party_now: 'Liberal', current: true, speeches: 768,
  representation: [{jurisdiction: 'federal', chamber: 'representatives', electorate: 'Wattle', state: 'NSW'}], ...over});
const stateMember = over => person({name: 'State Member', party: 'Labor', party_now: 'Labor',
  representation: [{jurisdiction: 'vic', chamber: 'vic_la', electorate: 'Northcote', state: 'VIC'}], ...over});

test('featured: current federal members only, one a political group, turning by the Sydney date', () => {
  const roster = {meta: {generated: '2026-11-23'}, people: [
    person(), person({name: 'Alex Byrne', party: 'Nationals', party_now: 'Nationals'}), person({name: 'Casey Dunn', party: 'LNP', party_now: 'LNP'}),
    person({name: 'Sam Lee', party: 'Labor', party_now: 'Labor'}), person({name: 'Kim Moss', party: 'Labor', party_now: 'Labor', representation: [{jurisdiction: 'federal', chamber: 'senate', electorate: 'Victoria', state: 'VICTORIA'}]}),
    person({name: 'Pat Green', party: 'Greens', party_now: 'Greens'}), person({name: 'Ind One', party: 'Independent', party_now: 'Independent'}),
    person({name: 'One Voice', party: "Australia's Voice", party_now: "Australia's Voice"}),
    // Never featured: a state member (Victoria's parliament included), a former member, a member with no party
    // or no seat on record, and a person the roster records in both a state house and a federal one.
    stateMember(), stateMember({name: 'Upper House', representation: [{jurisdiction: 'vic', chamber: 'vic_lc', electorate: 'Northern Metropolitan', state: 'VIC'}]}),
    stateMember({name: 'Both Houses', representation: [{jurisdiction: 'federal', chamber: 'senate', state: 'VIC'}, {jurisdiction: 'vic', chamber: 'vic_lc', state: 'VIC'}]}),
    person({name: 'Former Member', current: false}), person({name: 'No Party', party: '', party_now: ''}), person({name: 'No Seat', representation: []}),
    person({name: 'Not Marked', current: undefined}),
  ]};
  const allowed = new Set(['Jordan Avery', 'Alex Byrne', 'Casey Dunn', 'Sam Lee', 'Kim Moss', 'Pat Green', 'Ind One', 'One Voice']);
  const seen = new Set();
  for (let d = 1; d <= 28; d++) {
    const day = `2026-11-${String(d).padStart(2, '0')}`, rows = featuredPeople(roster, day);
    assert.equal(rows.length, FEATURED_PEOPLE, day);
    for (const row of rows) { assert.ok(allowed.has(row.name), `${row.name} on ${day}`); seen.add(row.name); }
    const groups = rows.map(row => featuredGroup(row.party));
    assert.equal(new Set(groups).size, groups.length, `one member a group on ${day}`);
    assert.deepEqual(featuredPeople(roster, day), rows, 'the same day draws the same members');
  }
  assert.deepEqual([...seen].sort(), [...allowed].sort(), 'every eligible member has a turn');
  assert.notDeepEqual(featuredPeople(roster, '2026-11-23'), featuredPeople(roster, '2026-11-24'));
  for (const party of ['Liberal', 'Nationals', 'LNP', 'Country Liberal Party']) assert.equal(featuredGroup(party), 'coalition');
  assert.equal(featuredGroup('Labor'), 'labor');
  assert.notEqual(featuredGroup('Greens'), featuredGroup('Independent'));
  assert.deepEqual(featuredPeople(null, '2026-11-23'), []);
  assert.deepEqual(featuredPeople(roster, 'today'), []);
  assert.equal(sydneyDay(new Date('2026-11-22T13:30:00Z')), '2026-11-23', 'the day turns at midnight in Sydney');
});

test('featured: a row is a portrait or a blank circle, never initials, with the party beside the name', () => {
  const [mp] = featuredPeople({people: [person()]}, '2026-11-23');
  const drawn = featuredRowHTML(mp, {photos: {'jordan avery': '10001'}});
  assert.match(drawn, /^<li class="hp-row hp-person-row"><img class="hp-portrait" src="\/photos\/10001\.webp" alt="" width="44" height="44"/);
  assert.match(drawn, /<h3 class="hp-row-name"><a href="[^"]+">Jordan Avery<\/a><\/h3><span class="ui-party party party-lib"/);
  assert.match(drawn, /<p class="hp-row-detail">Member for Wattle, New South Wales <span>· 768 speeches<\/span><\/p>/);
  // No portrait on file, or one that is not the official portrait: the circle is blank.
  for (const photos of [{}, {'jordan avery': 'wd-Q1'}, undefined]) {
    const blank = featuredRowHTML(mp, {photos});
    assert.match(blank, /<span class="hp-portrait" aria-hidden="true"><\/span><div class="hp-row-body">/);
    assert.doesNotMatch(blank, /<img|>JA<|initial/i);
  }
  assert.equal(portraitHTML('Jordan Avery', {}), '<span class="hp-portrait" aria-hidden="true"></span>');
  assert.equal(seatWords({chamber: 'senate', state: 'VICTORIA', electorate: 'Victoria'}), 'Senator for Victoria');
  assert.equal(seatWords({chamber: 'senate', state: 'ACT'}), 'Senator for the Australian Capital Territory');
  assert.equal(seatWords({chamber: 'representatives', electorate: 'Solomon', state: 'NT'}), 'Member for Solomon, Northern Territory');
  assert.doesNotMatch(featuredRowHTML({...mp, speeches: 0}, {}), /speech/);
  assert.match(featuredRowHTML({...mp, speeches: 1}, {}), /· 1 speech</);
  const line = featuredSourceHTML({generated: '2026-11-23'}, {checked_at: '2026-11-23T04:04:56+00:00', source_access: {}});
  assert.match(line, /Updated 23 Nov 2026 · <span class="ui-source-name">OPAX parliamentary roster<\/span>/);
  assert.ok(line.includes(FEATURED_RULE));
});

test('the published roster: nobody featured on any day sits in a state parliament, and none is from Victoria\'s', () => {
  const roster = json('parliamentarians.json'), photos = json('photos/people.json');
  const byName = new Map(roster.people.map(p => [p.name, p]));
  for (let d = 0; d < 60; d++) {
    const day = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
    for (const row of featuredPeople(roster, day)) {
      const source = byName.get(row.name);
      assert.equal(source.current, true, row.name);
      assert.ok(source.representation.every(seat => seat.jurisdiction === 'federal'), `${row.name} is a federal member only`);
      assert.ok(!source.representation.some(seat => /^vic/.test(String(seat.jurisdiction)) || /^vic_/.test(String(seat.chamber))), row.name);
      assert.match(row.chamber, /^(senate|representatives)$/);
      const html = featuredRowHTML(row, {photos});
      assert.match(html, /<img class="hp-portrait" src="\/photos\/\d+\.webp"|<span class="hp-portrait" aria-hidden="true"><\/span>/);
      assert.match(html, /class="ui-party party /, `${row.name} has a party label`);
      assert.doesNotMatch(html, /RCIMCP|Big Build/i);
    }
  }
});

test('the published divisions: the block\'s rows are federal reading votes, each with a division page file', async () => {
  const index = json('divisions/index.json'), votes = json('votes.json');
  const file = await recentDivisionsFile(index, votes._meta, async slug => json(`divisions/${slug}.json`));
  const rows = recentVotes(file);
  assert.ok(rows.length > 0 && rows.length <= RECENT_VOTES);
  for (const row of rows) {
    assert.match(row.slug, /^division-federal-(senate|representatives)-/);
    assert.ok(existsSync(publicFile(`divisions/${row.slug}.json`)));
    assert.ok(row.date <= file.latest);
    assert.doesNotMatch(voteRowHTML(row), /RCIMCP|Big Build|Victoria(?!n)/i);
  }
  assert.match(votesSourceHTML(file), /Updated \d{1,2} [A-Z][a-z]{2} \d{4} · <span class="ui-source-name">Federal Hansard divisions/);
});

test('the page: both blocks sit above the paused lists, shipped with dated source lines and no extra copy', () => {
  const home = readFileSync(publicFile('home.html'), 'utf8');
  const main = home.slice(home.indexOf('<main'), home.indexOf('</main>'));
  const today = main.slice(main.indexOf('class="hp-section hp-today"'), main.indexOf('class="hp-section hp-latest"'));
  assert.ok(today.length > 0, 'the block is ahead of New bills and Just declared');
  assert.match(today, /<h2 id="hp-votes-title">Votes in parliament<\/h2><a href="\/sitting">Sitting weeks<\/a>/);
  assert.match(today, /<h2 id="hp-featured-title">Featured parliamentarians<\/h2><a href="\/subject\/person">All parliamentarians<\/a>/);
  // The votes rows ship in the shape the script redraws; the featured rows turn daily, so only their place ships.
  const shipped = [...today.matchAll(/<li class="hp-row">.*?<\/li>/g)].map(m => m[0]);
  assert.ok(shipped.length > 0 && shipped.length <= RECENT_VOTES);
  for (const row of shipped) assert.match(row, /^<li class="hp-row"><p class="hp-row-meta"><span class="ui-status" data-tone="(done|ended)">(Passed|Agreed|Not agreed)<\/span> <span>(Second|Third) reading · (Senate|House) · <time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time><\/span><\/p><h3 class="hp-row-title"><a href="\/doc\/division-federal-[a-z0-9-]+">[^<]+<\/a><\/h3><p class="hp-row-detail">Ayes [\d,]+ <span>· Noes [\d,]+<\/span><\/p><\/li>$/);
  assert.match(today, /<ol class="hp-rows hp-rows-held" id="hp-featured"><\/ol>/);
  assert.doesNotMatch(today, /hp-person-row/, 'no member is published as featured for a day that has passed');
  for (const id of ['hp-votes-source', 'hp-featured-source']) assert.match(today, new RegExp(`id="${id}"><details class="ui-pop ui-source"[^]*?Updated \\d{1,2} [A-Z][a-z]{2} \\d{4} · <span class="ui-source-name">`));
  assert.doesNotMatch(today, /[—→]|RCIMCP|Big Build/);
  const script = readFileSync(publicFile('home.js'), 'utf8');
  assert.match(script, /nearScreen\("\.hp-today", hydrateToday\)/);
  const css = readFileSync(publicFile('home.css'), 'utf8');
  assert.match(css, /\.hp-latest, \.hp-today \{ display: grid;/);
  assert.match(css, /\.hp-rows-held \{ min-height:/);
});
