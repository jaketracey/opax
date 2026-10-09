import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { joinPerson } from '../src/api/person-identity';
import { buildPortraitIndex } from '../src/api/portrait-index';
import { rosterIdentityFor, searchPersonFor } from '../src/api/selectors';
import { peopleRows } from '../src/features/directories/model';
import { personRowContext } from '../src/features/search/model';
import { PartyChip, PersonRow } from '../src/design/primitives';
import { partyText } from '../src/design/party';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const portraits = buildPortraitIndex({
  ...catalogs,
  photoPeople: catalogs.photoPeople!,
  photoCredits: catalogs.photoCredits!,
});
const directory = peopleRows(
  {
    manifest: record(manifest),
    roster: record(roster),
    people: record(people),
    slugs: record(slugs),
    electorates: record(index),
  },
  catalogs.votes!,
  portraits,
);

test.each([
  ['tony-abbott', 'Tony Abbott', 'former', 'Formerly LIB', 'Formerly Liberal'],
  ['john-howard', 'John Howard', 'former', 'Formerly LIB', 'Formerly Liberal'],
  [
    'julia-gillard',
    'Julia Gillard',
    'former',
    'Formerly ALP',
    'Formerly Labor',
  ],
  [
    'scott-morrison',
    'Scott Morrison',
    'former',
    'Formerly LIB',
    'Formerly Liberal',
  ],
  ['anthony-albanese', 'Anthony Albanese', 'current', 'ALP', 'Labor'],
  ['penny-wong', 'Penny Wong', 'current', 'ALP', 'Labor'],
] as const)(
  '%s carries the same dated party status through directory, rows, header and search',
  (slug, name, status, short, spoken) => {
    const profile = joinPerson(slug, slugs, roster, people, manifest);
    const directoryProfile = directory.find((p) => p.key === slug)!.profile;
    const search = searchPersonFor(slug, catalogs)!;
    const rosterSearch = rosterIdentityFor(profile.rosterRow!, catalogs)!;
    for (const surface of [
      profile,
      directoryProfile,
      search,
      rosterSearch,
      personRowContext(rosterSearch),
    ]) {
      expect(surface.partyStatus).toBe(status);
      expect(
        partyText({ party: surface.party, status: surface.partyStatus }, true)
          .visible,
      ).toBe(short);
    }
    let rendered!: TestRenderer.ReactTestRenderer;
    act(() => {
      rendered = TestRenderer.create(
        <>
          <PartyChip
            party={profile.party}
            status={profile.partyStatus}
            testID="header-party"
          />
          <PersonRow
            name={name}
            party={profile.party}
            partyStatus={profile.partyStatus}
            testID="row"
          />
        </>,
      );
    });
    const host = (id: string) =>
      rendered.root.find(
        (n) => typeof n.type === 'string' && n.props.testID === id,
      );
    expect(host('header-party').props.accessibilityLabel).toContain(spoken);
    expect(host('row').props.accessibilityLabel).toContain(spoken);
    act(() => rendered.unmount());
  },
);

test('Abbott status evidence never changes identity joins or infers former from missing roster fields', () => {
  const profile = joinPerson('tony-abbott', slugs, roster, people, manifest);
  expect(profile.canonicalPersonId).toBeUndefined();
  expect(profile.rosterPersonId).toBe('10001');
  expect(profile.seats).toEqual([]);
  // Without the Warringah term, Abbott is still former: the release holds
  // the complete current federal membership and no sitting member is an
  // Abbott. With no roster row there is no evidence at all, and a current
  // flag without party_now never becomes former.
  for (const [change, status] of [
    [{ name: 'Another Abbott' }, 'unknown'],
    [{ pid: 'different' }, 'former'],
    [{ representation: [] }, 'former'],
    [{ current: true, party_now: undefined }, 'unknown'],
  ] as const) {
    const changedRoster = {
      ...roster,
      people: roster.people.map((r) =>
        r.name === 'Tony Abbott' ? { ...r, ...change } : r,
      ),
    };
    expect(
      joinPerson('tony-abbott', slugs, changedRoster, people, manifest)
        .partyStatus,
    ).toBe(status);
  }
  const noTerm = {
    ...people,
    people: people.people.filter((p) => p.name !== 'Anthony John Abbott'),
  };
  expect(
    joinPerson('tony-abbott', slugs, roster, noTerm, manifest).partyStatus,
  ).toBe('former');
  // A sitting member who shares the surname proves nothing either way.
  const sittingAbbott = {
    ...noTerm,
    people: noTerm.people.map((p) =>
      p.name === 'Anthony Albanese' ? { ...p, name: 'Anthony Abbott' } : p,
    ),
  };
  expect(
    joinPerson('tony-abbott', slugs, roster, sittingAbbott, manifest)
      .partyStatus,
  ).toBe('unknown');
  // Nor does a release whose current seats fall short of its roster count.
  const partial = {
    ...noTerm,
    people: noTerm.people.filter((p) => p.name !== 'Anthony Albanese'),
  };
  expect(
    joinPerson('tony-abbott', slugs, roster, partial, manifest).partyStatus,
  ).toBe('unknown');
});
