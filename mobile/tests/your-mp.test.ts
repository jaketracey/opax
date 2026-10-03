import {
  decodeChoice,
  hasParliamentaryMembership,
  matchingSeats,
  representativeProfile,
  uncoveredProfile,
  type Directory,
} from '../src/features/your-mp/model';
import { index, manifest, people, roster, slugs } from './pinned';
import { joinPerson } from '../src/api/catalogs';
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
