// A party page never lists a member as sitting once their house has ended, even before its election is
// held. The Victorian Legislative Assembly expired on 3 November 2026 and the Legislative Council ended
// with it; the election is on 28 November. From 3 November a Victorian member is on the roster of its
// date, neither sitting nor former (party-page.js partyMembers, scripts/build_party_index.mjs ENDED_HOUSES).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {partyMembers, partyMembersHTML, canonicalPartyPages, PARTY_MONEY_PATHS} from '../public/party-page.js';
import {withEndedHouses, ENDED_HOUSES, partyIndexFile} from '../../scripts/build_party_index.mjs';

const publicJson = async path => JSON.parse(await readFile(new URL(`../public/${path.replace(/^\//, '')}`, import.meta.url), 'utf8'));
const h = {esc: s => String(s ?? ''), photoUrlFor: () => '', personUrl: () => '/subject/person', partyChipHTML: () => '', yearSpan: () => '', stateName: s => s, sourceLineHTML: () => '', same: (a, b) => a === b};
const member = (name, jurisdiction, chamber, as_of, next_election) => ({name, pid: null, jurisdiction, chamber, electorate: 'Fixture', as_of, next_election});

test('the reviewed table names the Victorian Assembly and Council, ended 3 November 2026', () => {
  assert.deepEqual(ENDED_HOUSES, [{jurisdiction: 'vic', chambers: ['vic_la', 'vic_lc'], ended: '2026-11-03'}]);
});

test('a seat-roster entry gains house_ended only for a house that ended after the roster\'s date', () => {
  const out = withEndedHouses({Fixture: [member('Ada Vale', 'vic', 'vic_la', '2026-09-09', '2026-11-28'), member('Bo Reed', 'vic', 'vic_lc', '2026-09-09', '2026-11-28'),
    member('Cy Nash', 'sa', 'sa_lc', '2026-11-13', '2030-03-16'), member('Di Moss', 'vic', 'vic_la', '2026-12-15', null)]});
  assert.deepEqual(out.Fixture.map(m => m.house_ended ?? null), ['2026-11-03', '2026-11-03', null, null]);
});

test('a member of an ended house sits until the day it ended, then is on the roster of its date: not sitting, not former', () => {
  const roster = {people: [{name: 'Ada Vale', states: ['vic'], chambers: ['vic_la']}, {name: 'Cy Nash', states: ['sa'], chambers: ['sa_lc']}]};
  const divisions = {seat_rosters: withEndedHouses({Fixture: [member('Ada Vale', 'vic', 'vic_la', '2026-09-09', '2026-11-28'), member('Cy Nash', 'sa', 'sa_lc', '2026-11-13', '2030-03-16')]})};
  const on = today => partyMembers('Fixture', {roster, divisions, today, same: (a, b) => a === b});
  assert.deepEqual(on('2026-11-02').current.map(m => m.name).sort(), ['Ada Vale', 'Cy Nash']);
  for (const today of ['2026-11-03', '2026-11-16', '2026-11-28', '2026-12-20']) {
    const members = on(today);
    assert.deepEqual(members.current.map(m => m.name), ['Cy Nash'], today);
    const ada = members.former.find(m => m.name === 'Ada Vale');
    assert.equal(ada.seat_roster.stale, true, today);
    assert.equal(ada.seat_roster.house_ended, '2026-11-03');
    const html = partyMembersHTML('Fixture', members, h);
    const sitting = html.slice(html.indexOf('Sitting members across all parliaments'), html.indexOf('On the parliamentary roster as at'));
    assert.ok(sitting.includes('Cy Nash') && !sitting.includes('Ada Vale'), today);
    assert.ok(html.slice(html.indexOf('On the parliamentary roster as at 9 Sep 2026')).includes('Ada Vale'), today);
    assert.doesNotMatch(html, /Former members/, today);
  }
});

test('every party page on the published data: no Victorian member is listed as sitting after 3 November 2026', async () => {
  const roster = await publicJson('parliamentarians.json'), divisions = await publicJson('graph/party-members.json');
  assert.deepEqual(divisions.seat_rosters, partyIndexFile().seat_rosters, 'the committed index carries what the build writes');
  const victorian = Object.values(divisions.seat_rosters).flat().filter(m => m.jurisdiction === 'vic');
  assert.ok(victorian.length > 100 && victorian.every(m => m.house_ended === '2026-11-03'));
  const names = new Set(victorian.map(m => m.name));
  const pages = canonicalPartyPages({money: await Promise.all(PARTY_MONEY_PATHS.map(path => publicJson(path).catch(() => null))), roster, divisions});
  let before = 0, moved = 0;
  for (const page of pages) {
    const was = partyMembers(page.label, {roster, divisions, today: '2026-11-02'}), now = partyMembers(page.label, {roster, divisions, today: '2026-11-16'});
    before += was.current.filter(m => m.seat_roster?.house_ended).length;
    for (const m of now.current) assert.ok(!m.seat_roster?.house_ended && !(names.has(m.name) && (m.roster?.states || []).every(s => s === 'vic')), `${m.name} is listed as sitting for ${page.label}`);
    moved += now.former.filter(m => m.seat_roster?.house_ended && m.seat_roster.stale).length;
  }
  assert.ok(before > 100, 'they were listed as sitting until the houses ended');
  assert.equal(moved, before);
});
