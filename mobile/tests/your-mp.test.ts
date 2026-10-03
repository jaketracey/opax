import {
  decodeChoice,
  votingMetaFor,
  hasParliamentaryMembership,
  matchingSeats,
  representativeProfile,
  uncoveredProfile,
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
test('roster-only former profiles retain Formerly and explicit missing blocks', () => {
  const p = joinPerson('tony-abbott', slugs, roster, people, manifest);
  expect(p.partyCurrent).toBe(false);
  const view = uncoveredProfile(p);
  expect(view.blocks.identity.data).toBe(p);
  expect(view.blocks.pay.status).toBe('missing');
  expect(view.blocks.votes.asAt).toBeNull();
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
