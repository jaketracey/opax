// A person with no party of their own takes the one a verified seat roster records
// for them, and only when exactly one roster entry is them (public/roster-party.js;
// the Worker's crawlable person answer and the person page). Invented people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rosterSeatParty} from '../public/roster-party.js';
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
  assert.match(html, /Alex Example<\/a> — Example Party \(parliamentary roster as at 9 Sep 2026\)/);
  assert.match(html, /Jo Former<\/a> — Party not recorded/);
});

test('the person page reads the same fallback, only for a record with no party of its own', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const rosterFallback = !partyNow && !roster\?\.party && Boolean\(roster\?\.representation\?\.length\);/);
  assert.match(app, /electorateReference\.module\.rosterSeatParty\?\.\(roster, electorateReference\.data\.electorates\)/);
  assert.match(app, /if \(seatParty\) party = seatParty\.party;/);
  const electorates = readFileSync(new URL('../public/electorates.js', import.meta.url), 'utf8');
  assert.match(electorates, /export \{ rosterSeatParty \} from '\.\/roster-party\.js/);
});
