// A person with no party of their own takes the one a verified seat roster records
// for them, and only when exactly one roster entry is them (public/roster-party.js;
// the Worker's crawlable person answer and the person page). Invented people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rosterSeatParty, rosterListParty} from '../public/roster-party.js';
import {datedAffiliationParty} from '../public/speech-attribution.js';
import {renderPersonAnswer, renderDirectory, partyLine} from '../src/seo-content.ts';

const seat = (over = {}) => ({
  name: 'Fixtureton', jurisdiction: 'vic', chamber: 'vic_la', slug: 'vic-vic-la-vic-fixtureton', url: '/subject/electorate/vic-vic-la-vic-fixtureton',
  representation_status: 'verified', representation_as_of: '2026-09-09',
  representatives: [{party: 'Example Party', person: {name: 'Alex Example', legacy_person_id: 'vic_alex_example', aliases: [], source_url: 'https://www.parliament.vic.gov.au/members/alex-example/'}}],
  ...over,
});
const person = (over = {}) => ({
  name: 'Alex Example', states: ['vic'], chambers: ['vic_la'],
  representation: [{jurisdiction: 'vic', chamber: 'vic_la', electorate: 'Fixtureton'}], ...over,
});
const reader = (electorates) => async (path) => {
  if (path === '/electorates/manifest.json') return {index_url: '/electorates/releases/x/index.json'};
  // null: the release index cannot be read.
  if (path === '/electorates/releases/x/index.json' && electorates) return {electorates};
  throw new Error('missing ' + path);
};
const descriptionOf = async (p, electorates) => (await renderPersonAnswer(p, reader(electorates), new Map())).description;
const partyItemOf = async (p, electorates) => /<h2>Party and representation<\/h2><ul><li>([\s\S]*?)<\/li>/.exec((await renderPersonAnswer(p, reader(electorates), new Map())).html)?.[1];

test('published state affiliation reaches the profile without inventing speech-date party evidence', async () => {
  const roster = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8'));
  const member = roster.people.find(p => p.name === 'Chris Rath');
  assert.equal(partyLine(member), 'Liberal (recorded affiliation)');
  assert.equal(await partyItemOf(member, []), '<a href="/subject/party/liberal">Liberal (recorded affiliation)</a>');
  assert.equal(member.representation[0].as_of, '2026-09-25');
  assert.equal(member.party_now, undefined);
  for (const date of ['2022-05-10', '2026-09-25', '2026-11-12']) {
    assert.equal(datedAffiliationParty({kind:'speech', state:'nsw', chamber:'nsw_lc', date}, member), null);
  }
});

test('a state member with no party takes the verified roster party, dated and linked', async () => {
  assert.deepEqual(rosterSeatParty(person(), [seat()]), {party: 'Example Party', as_of: '2026-09-09', electorate: 'Fixtureton',
    url: '/subject/electorate/vic-vic-la-vic-fixtureton', source_url: 'https://www.parliament.vic.gov.au/members/alex-example/'});
  assert.equal(await descriptionOf(person(), [seat()]), 'Alex Example. Example Party (parliamentary roster as at 9 Sep 2026). Fixtureton, Legislative Assembly (Victoria).');
  assert.equal(await partyItemOf(person(), [seat()]), '<a href="/subject/party/example-party">Example Party (parliamentary roster as at 9 Sep 2026)</a>');
  // Name variants fold: case, spacing and curly apostrophes.
  assert.equal(rosterSeatParty(person({name: 'alex  EXAMPLE'}), [seat()])?.party, 'Example Party');
  // The person ID decides where both carry one.
  assert.equal(rosterSeatParty(person({pid: 'vic_alex_example'}), [seat()])?.party, 'Example Party');
  // A council region: one of several members.
  const region = seat({name: 'Fixture Region', chamber: 'vic_lc', representatives: [
    {party: 'Other Party', person: {name: 'Sam Sample'}}, {party: 'Example Party', person: {name: 'Alex Example'}}]});
  assert.equal(rosterSeatParty(person({representation: [{jurisdiction: 'vic', chamber: 'vic_lc', electorate: 'Fixture Region'}]}), [region])?.party, 'Example Party');
});

test('an unverified, ambiguous or unmatched roster gives no party', async () => {
  const none = 'Alex Example. Party not recorded. Fixtureton, Legislative Assembly (Victoria).';
  for (const status of ['unknown', 'partial', undefined]) {
    assert.equal(rosterSeatParty(person(), [seat({representation_status: status})]), null, String(status));
    assert.equal(await descriptionOf(person(), [seat({representation_status: status})]), none);
  }
  assert.equal(await partyItemOf(person(), [seat({representation_status: 'unknown'})]), 'Party not recorded');
  // No valid roster date.
  assert.equal(rosterSeatParty(person(), [seat({representation_as_of: '2026-02-30'})]), null);
  assert.equal(rosterSeatParty(person(), [seat({representation_as_of: null})]), null);
  // Two release entries for the one recorded seat.
  assert.equal(rosterSeatParty(person(), [seat(), seat({slug: 'dup'})]), null);
  assert.equal(await descriptionOf(person(), [seat(), seat({slug: 'dup'})]), none);
  // Two representatives of the same name in the seat.
  const twice = seat({representatives: [{party: 'Example Party', person: {name: 'Alex Example'}}, {party: 'Other Party', person: {name: 'Alex Example'}}]});
  assert.equal(rosterSeatParty(person(), [twice]), null);
  // Two recorded seats each holding the name.
  const other = seat({name: 'Samplevale', slug: 'samplevale', url: '/subject/electorate/samplevale'});
  assert.equal(rosterSeatParty(person({representation: [...person().representation, {jurisdiction: 'vic', chamber: 'vic_la', electorate: 'Samplevale'}]}), [seat(), other]), null);
  // The seat named in another chamber or parliament does not count.
  assert.equal(rosterSeatParty(person(), [seat({chamber: 'vic_lc'})]), null);
  assert.equal(rosterSeatParty(person(), [seat({jurisdiction: 'nsw'})]), null);
  // Someone else holds the seat (a former member), or a surname print.
  assert.equal(rosterSeatParty(person({name: 'Jo Former'}), [seat()]), null);
  assert.equal(rosterSeatParty(person({name: 'Example'}), [seat({representatives: [{party: 'Example Party', person: {name: 'Example'}}]})]), null);
  // An ID that names someone else, even under the same name.
  assert.equal(rosterSeatParty(person({pid: 'vic_alex_example_2'}), [seat()]), null);
  // A roster entry with no party.
  assert.equal(rosterSeatParty(person(), [seat({representatives: [{party: '', person: {name: 'Alex Example'}}]})]), null);
  // No electorate data at all.
  assert.equal(rosterSeatParty(person(), null), null);
  assert.equal(await descriptionOf(person(), null), none);
  assert.equal(partyLine(person()), 'Party not recorded');
});

test('a party the person record already carries is unchanged by the roster', async () => {
  const roster = [seat({representatives: [{party: 'Other Party', person: {name: 'Alex Example'}}]})];
  assert.equal(await descriptionOf(person({party: 'Example Party'}), roster), 'Alex Example. Example Party (recorded affiliation). Fixtureton, Legislative Assembly (Victoria).');
  assert.equal(await partyItemOf(person({party: 'Example Party'}), roster), '<a href="/subject/party/example-party">Example Party (recorded affiliation)</a>');
  assert.equal(partyLine(person({party: 'Example Party', current: false}), roster), 'Formerly Example Party');
  assert.equal(partyLine(person({party: 'Example Party', party_now: 'Third Party', current: true}), roster), 'Third Party; formerly Example Party');
});

test('the person directory uses the same fallback', async () => {
  const url = new URL('https://opax.com.au/subject/person');
  const {html} = await renderDirectory('person', url, reader([seat()]), [person(), person({name: 'Jo Former'})], new Map(), {});
  assert.match(html, /Alex Example<\/a>: Example Party \(parliamentary roster as at 9 Sep 2026\)/);
  assert.match(html, /Jo Former<\/a>: Party not recorded/);
});

test('the person page reads the same fallback, only for a record with no party of its own', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const rosterFallback = !partyNow && !roster\?\.party && Boolean\(roster\?\.representation\?\.length\);/);
  assert.match(app, /electorateReference\.module\.rosterSeatParty\?\.\(roster, electorateReference\.data\.electorates\)/);
  assert.match(app, /if \(seatParty\) party = seatParty\.party;/);
  const electorates = readFileSync(new URL('../public/electorates.js', import.meta.url), 'utf8');
  assert.match(electorates, /export \{ rosterSeatParty, rosterListParty \} from '\.\/roster-party\.js/);
  // The dated official-list fallback: a full name only, never a single-name print, dated on the page.
  assert.match(app, /const listFallback = !partyNow && !roster\?\.party && \/\\S\\s\+\\S\/\.test\(String\(roster\?\.name \|\| ""\)\);/);
  assert.match(app, /electorateReference\.module\.rosterListParty\?\.\(roster, rosterLists\.observations\)/);
  // The chip in the meta line is dated too, not only the source-details panel.
  assert.match(app, /seatParty \? `<span>parliamentary roster as at \$\{esc\(fmtDate\(seatParty\.as_of\)\)\}<\/span>` : "",/);
  assert.match(app, /\["Party", esc\(`\$\{seatParty\.party\} \(parliamentary roster as at \$\{fmtDate\(seatParty\.as_of\)\}\)`\)\]/);
});


test('earlier NSW speeches cannot inherit snapshot parties through the profile fallback',()=>{
 const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
 // Mirror sponsors.ts recorded ?? profile.party and the web profile fallback.
 for(const [name,date,oldParty] of [['Tania Mihailuk','2017-01-01','Labor'],['Jeremy Buckingham','2016-01-01','Greens'],['Rod Roberts','2019-06-01','One Nation'],['Taylor Martin','2018-01-01','Liberal']]) {
  const profile=roster.people.find(p=>p.name===name);
  assert.ok(profile,name);
  assert.equal(null ?? profile.party,undefined,name+' '+date);
  assert.equal(oldParty ?? profile.party,oldParty);
  assert.equal(datedAffiliationParty({kind:'speech',state:'nsw',chamber:'nsw_lc',date},profile),null);
 }
 const rath=roster.people.find(p=>p.name==='Chris Rath');
 assert.equal(null ?? rath.party,'Liberal');
});

test('Moira Deeming retains the date on the pinned Victorian roster affiliation',async()=>{
 const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../public/electorates/manifest.json',import.meta.url),'utf8'));
 const index=JSON.parse(readFileSync(new URL('../public'+manifest.index_url,import.meta.url),'utf8'));
 const member=roster.people.find(p=>p.name==='Moira Deeming');
 assert.equal(member.party,undefined);
 assert.equal(partyLine(member,index.electorates),'Independent (parliamentary roster as at 9 Sep 2026)');
 assert.match(await partyItemOf(member,index.electorates),/Independent \(parliamentary roster as at 9 Sep 2026\)/);
});

// Dated official chamber lists (public/data/roster-list-parties.json) for full-name
// profiles with no party and no verified seat party. Invented people only.
const listed = (over = {}) => ({name: 'Morgan Fixture', aliases: ['Morgan Alexandra Fixture'], jurisdiction: 'nsw', chamber: 'nsw_lc',
  electorate: 'New South Wales', party: 'Example Party', as_of: '2026-09-25', source_url: 'https://example.test/lc-list.pdf', ...over});
const councillor = (over = {}) => ({name: 'Morgan Fixture', states: ['nsw'], chambers: ['nsw_lc'], ...over});
const listReader = (observations) => async (path) => {
  if (path === '/data/roster-list-parties.json') return {observations};
  throw new Error('missing ' + path);
};

test('a full-name profile matched in a dated official list gets that party, dated', async () => {
  assert.deepEqual(rosterListParty(councillor(), [listed()]), {party: 'Example Party', as_of: '2026-09-25',
    electorate: 'New South Wales', url: null, source_url: 'https://example.test/lc-list.pdf'});
  // A listed alias is the same person; folding as for seats.
  assert.equal(rosterListParty(councillor({name: 'morgan alexandra FIXTURE'}), [listed()])?.party, 'Example Party');
  // The latest dated observation decides: a later list after a change of party.
  assert.equal(rosterListParty(councillor(), [listed({party: 'Earlier Party', as_of: '2023-04-01'}), listed()])?.party, 'Example Party');
  const {html, description} = await renderPersonAnswer(councillor(), listReader([listed()]), new Map());
  assert.equal(description, 'Morgan Fixture. Example Party (parliamentary roster as at 25 Sep 2026). Legislative Council (New South Wales).');
  assert.match(html, /<li><a href="\/subject\/party\/example-party">Example Party \(parliamentary roster as at 25 Sep 2026\)<\/a><\/li>/);
  const directory = await renderDirectory('person', new URL('https://opax.com.au/subject/person'), listReader([listed()]), [councillor()], new Map(), {});
  assert.match(directory.html, /Morgan Fixture<\/a>: Example Party \(parliamentary roster as at 25 Sep 2026\)/);
  // A verified seat party still comes first; the person's own party before both.
  assert.equal(partyLine(councillor({party: 'Own Party'}), null, [listed()]), 'Own Party (recorded affiliation)');
});

test('a single-name profile, another chamber or a split latest list gives no party', async () => {
  // A surname print never matches, even when the list holds that word as a name.
  assert.equal(rosterListParty(councillor({name: 'Fixture'}), [listed({name: 'Fixture', aliases: []})]), null);
  assert.equal(rosterListParty({name: 'Fixture', full: 'Morgan Fixture', chambers: ['nsw_lc']}, [listed()]), null);
  const {description} = await renderPersonAnswer(councillor({name: 'Fixture'}), listReader([listed()]), new Map());
  assert.equal(description, 'Fixture. Party not recorded. Legislative Council (New South Wales).');
  // Only in a chamber the profile sat in.
  assert.equal(rosterListParty(councillor({chambers: ['nsw_la']}), [listed()]), null);
  // Two parties, or two seats, on the latest date.
  assert.equal(rosterListParty(councillor(), [listed(), listed({party: 'Other Party'})]), null);
  assert.equal(rosterListParty(councillor(), [listed(), listed({electorate: 'Elsewhere'})]), null);
  // No valid date, no party, or no list.
  assert.equal(rosterListParty(councillor(), [listed({as_of: '2026-02-30'})]), null);
  assert.equal(rosterListParty(councillor(), [listed({party: ' '})]), null);
  assert.equal(rosterListParty(councillor(), null), null);
});

test('the committed official-list file holds dated, full-name observations only', () => {
  const doc = JSON.parse(readFileSync(new URL('../public/data/roster-list-parties.json', import.meta.url), 'utf8'));
  assert.ok(doc.observations.length > 0);
  for (const o of doc.observations) {
    assert.match(o.as_of, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(o.name, /\S\s+\S/);
    assert.ok(o.party && o.chamber);
  }
});
