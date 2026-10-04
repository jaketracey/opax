import {
  decodeChoice,
  votingMetaFor,
  hasParliamentaryMembership,
  matchingSeats,
  representativeProfile,
  uncoveredProfile,
  replaceStateSeat,
  seatContext,
  registerCategoryLabel,
  registerChangeLabel,
  type Directory,
} from '../src/features/your-mp/model';
import {
  catalogs,
  index,
  manifest,
  people,
  roster,
  servedFiles,
  slugs,
} from './pinned';
import { joinPerson, profileFor } from '../src/api/catalogs';
const result = <T>(data: T) => ({ data, stale: false, savedAt: 1, asOf: null });
export const directory: Directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
test('search is local by seat or observed member, with no automatic choice', () => {
  expect(
    matchingSeats(index.electorates, 'Albanese').map((s) => s.name),
  ).toEqual(['Grayndler']);
  expect(
    matchingSeats(index.electorates, 'grayndler').map((s) => s.name),
  ).toEqual(['Grayndler']);
  expect(matchingSeats(index.electorates, '')).toEqual([]);
  expect(matchingSeats(index.electorates, 'no such member')).toEqual([]);
});
test('device choice validates schema and stores only explicit identifiers', () => {
  const seatId = index.electorates[0]!.electorate_id;
  expect(
    decodeChoice({
      version: 1,
      seatId,
      stateSeatIds: [seatId, seatId],
      name: 'discarded',
    }),
  ).toEqual({ version: 1, seatId, stateSeatIds: [seatId] });
  for (const value of [
    null,
    {},
    { version: 2, seatId, stateSeatIds: [] },
    { version: 1, seatId: 'Grayndler', stateSeatIds: [] },
    { version: 1, seatId, stateSeatIds: ['private'] },
  ])
    expect(decodeChoice(value)).toBeNull();
});
test('only release/roster identities receive a native profile', () => {
  const p = people.people.find((p) => p.name === 'Anthony Albanese')!;
  expect(representativeProfile(p.person_id, directory)?.slug).toBe(
    'anthony-albanese',
  );
  expect(representativeProfile('private-person', directory)).toBeNull();
});
test('roster-only former profiles retain Formerly and explicit unlinked blocks', () => {
  const p = joinPerson('tony-abbott', slugs, roster, people, manifest);
  expect(p.partyCurrent).toBe(false);
  const view = uncoveredProfile(p);
  expect(view.blocks.identity.data).toBe(p);
  expect(view.blocks.pay.status).toBe('unlinked');
  expect(view.blocks.votes.asAt).toBeNull();
});
test('abolished seats never appear in the normal picker, including ambiguous Fraser', () => {
  expect(matchingSeats(index.electorates, 'Higgins')).toEqual([]);
  const fraser = matchingSeats(index.electorates, 'Fraser');
  expect(fraser).toHaveLength(1);
  expect(fraser[0]?.status).toBe('current');
  expect(fraser[0]?.state_code).toBe('vic');
});
test('correcting a state district replaces that chamber while retaining the council region', () => {
  const find = (name: string) =>
    index.electorates.find((s) => s.name === name)!;
  const federal = find('Ballarat'),
    wendouree = find('Wendouree'),
    eureka = find('Eureka'),
    region = find('Northern Metropolitan');
  const corrected = replaceStateSeat(
    {
      version: 1,
      seatId: federal.electorate_id,
      stateSeatIds: [wendouree.electorate_id, region.electorate_id],
    },
    eureka,
    index.electorates,
  );
  expect(corrected.stateSeatIds).toEqual([
    region.electorate_id,
    eureka.electorate_id,
  ]);
  expect(corrected.seatId).toBe(federal.electorate_id);
});
test('duplicate seat names have distinct chamber and jurisdiction hints', () => {
  const seats = matchingSeats(index.electorates, 'Melbourne').filter(
    (s) => s.name === 'Melbourne',
  );
  expect(seats).toHaveLength(2);
  expect(seats.map(seatContext)).toEqual(
    expect.arrayContaining([
      'House of Representatives · Victoria',
      'Victorian Legislative Assembly · Victoria',
    ]),
  );
});
test('former chamber-only roster members are admitted while committee-only witnesses are refused', () => {
  for (const slug of [
    'antony-windsor',
    'christopher-pearce',
    'stephen-martin',
    'david-tollner',
  ]) {
    const member = joinPerson(slug, slugs, roster, people, manifest);
    expect(member.canonicalPersonId).toBeUndefined();
    expect(hasParliamentaryMembership(member, directory)).toBe(true);
  }
  const member = joinPerson('antony-windsor', slugs, roster, people, manifest);
  expect(
    hasParliamentaryMembership(
      { ...member, name: 'Synthetic witness', rosterPersonId: undefined },
      {
        ...directory,
        roster: result({
          ...roster,
          people: [
            { name: 'Synthetic witness', chambers: ['senate_committee'] },
          ],
        }),
      },
    ),
  ).toBe(false);
});
test('register category and alteration keys have plain labels', () => {
  expect(registerCategoryLabel('real_estate')).toBe('Real estate');
  expect(registerChangeLabel('addition')).toBe('added');
  expect(registerChangeLabel('deletion')).toBe('deleted');
  expect(registerChangeLabel('amendment')).toBe('changed');
});

test.each(['brown', 'james', 'cook'])(
  'surname-only roster stub %s cannot establish parliamentary membership',
  (slug) => {
    const identity = joinPerson(slug, slugs, roster, people, manifest);
    expect(identity.canonicalPersonId).toBeUndefined();
    expect(identity.name.trim()).not.toContain(' ');
    expect(hasParliamentaryMembership(identity, directory)).toBe(false);
  },
);

test('a full name mixed with committee appearances needs a person ID', () => {
  const identity = joinPerson(
    'antony-windsor',
    slugs,
    roster,
    people,
    manifest,
  );
  const row = roster.people.find((p) => p.name === identity.name)!;
  expect(row.pid).toBeTruthy();
  const mixed = { ...row, chambers: ['representatives', 'senate_committee'] };
  const pinnedMember = {
    ...directory,
    roster: result({ ...roster, people: [mixed] }),
  };
  expect(hasParliamentaryMembership(identity, pinnedMember)).toBe(true);
  expect(
    hasParliamentaryMembership(
      { ...identity, rosterPersonId: undefined },
      {
        ...directory,
        roster: result({ ...roster, people: [{ ...mixed, pid: undefined }] }),
      },
    ),
  ).toBe(false);
});

test('committee/witness identity without a membership observation never becomes a page', () => {
  const member = joinPerson('tony-abbott', slugs, roster, people, manifest);
  expect(hasParliamentaryMembership(member, directory)).toBe(true);
  expect(
    hasParliamentaryMembership(
      { ...member, name: 'Synthetic witness', rosterPersonId: undefined },
      directory,
    ),
  ).toBe(false);
});

test('voting metadata never borrows the global division date for a missing jurisdiction', () => {
  const id = people.people.find(
    (p) => p.name === 'Anthony Albanese',
  )!.person_id;
  const block = profileFor(id, catalogs).blocks.votes;
  const meta = votingMetaFor({
    ...block,
    data: {
      ...block.data!,
      latestDivisionDate: '2026-09-25',
      latestDivisionDateByJurisdiction: { federal: '2026-09-25', vic: null },
    },
  });
  expect(meta.latest_division_date).toBeNull();
  expect(meta.latest_division_date_by_jurisdiction).toEqual({
    federal: '2026-09-25',
  });
});

test('the profile journeys and state-seat member use pinned register bytes', () => {
  for (const slug of [
    'anthony-albanese',
    'penny-wong',
    'sheena-watt',
    'julia-gillard',
    'catherine-king',
  ]) {
    const identity = joinPerson(slug, slugs, roster, people, manifest);
    const { interestKey } = profileFor(identity.canonicalPersonId!, catalogs);
    if (interestKey)
      expect(servedFiles).toContain(`/interests/${interestKey}.json`);
  }
});
