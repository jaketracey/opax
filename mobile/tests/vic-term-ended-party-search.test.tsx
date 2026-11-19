import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Catalogs, joinPerson } from '../src/api/catalogs';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { buildPortraitIndex } from '../src/api/portrait-index';
import { partyMembers, sittingPartyMembers } from '../src/api/party-page';
import { PersonRow } from '../src/design/people';
import {
  matchingPeople,
  partyRows,
  peopleRows,
  sittingGroup,
} from '../src/features/directories/model';
import { decodePartyFile } from '../src/features/directories/party-file';
import { matchItem } from '../src/features/quick-search/items';
import {
  MatchRow,
  placeLine,
  serviceStatus,
} from '../src/features/search/rows';
import { endedParliaments } from '../src/features/your-mp/term-ended';
import {
  catalogs,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/your-mp/useSetAsMyElectorate', () => ({
  useSetAsMyElectorate: () => ({ visible: false, label: '', run: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

// The live index: every Assembly row carries the election day, or null once
// the result is loaded; Council rows carry nothing (s 28(2) covers them).
const indexWith = (value: string | null) => ({
  ...index,
  electorates: index.electorates.map((s) =>
    s.chamber === 'vic_la' ? { ...s, dissolved_for: value } : s,
  ),
});
const ended = endedParliaments(indexWith('2026-11-28').electorates);
const cleared = endedParliaments(indexWith(null).electorates);
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directoryWith = (value: string | null) => ({
  manifest: record(manifest),
  roster: record(roster),
  slugs: record(slugs),
  people: record(people),
  electorates: record(indexWith(value)),
});
const partyFiles = { federal: decodePartyFile(pinned('/graph/money.json')) };
const portraits = buildPortraitIndex({
  manifest,
  roster,
  slugs,
  people,
  photoPeople: catalogs.photoPeople!,
  photoCredits: catalogs.photoCredits!,
});
const members = (label: string, terms?: typeof ended) =>
  partyMembers(label, roster, people, slugs, manifest, terms);

// A page member's canonical person, as the People list's rows carry it.
const idsOf = (list: readonly { slug: string }[]) =>
  [
    ...new Set(
      list.map(
        (m) =>
          joinPerson(m.slug, slugs, roster, people, manifest).canonicalPersonId,
      ),
    ),
  ].sort();

describe('party members while the Victorian Parliament’s term has ended', () => {
  test('the pinned release has the two Legalise Cannabis members sitting', () => {
    const now = members('Legalise Cannabis Victoria');
    expect(now.currentCount).toBe(2);
    expect(now.ended).toEqual([]);
  });

  test('a Victorian-only party has no sitting members; its people are the seats’ last members', () => {
    const now = members('Legalise Cannabis Victoria');
    const then = members('Legalise Cannabis Victoria', ended);
    expect(then.currentCount).toBe(0);
    expect(then.current).toEqual([]);
    // The same people and seats, moved; a Council seat ends with the Assembly.
    expect(then.ended).toEqual(now.current);
    expect(then.ended.every((m) => m.chamber === 'vic_lc')).toBe(true);
    // Their sources still stand behind the list.
    expect(then.sources).toEqual(now.sources);
  });

  test('a national party counts and names no Victorian state seat', () => {
    const now = members('Labor');
    const then = members('Labor', ended);
    const victorian = now.current.filter((m) => m.jurisdiction === 'vic');
    expect(victorian.length).toBeGreaterThan(50);
    expect(then.current.some((m) => m.jurisdiction === 'vic')).toBe(false);
    expect(then.current).toEqual(
      now.current.filter((m) => m.jurisdiction !== 'vic'),
    );
    expect(then.ended).toEqual(victorian);
    expect(then.currentCount).toBe(
      now.currentCount - new Set(victorian.map((m) => m.slug)).size,
    );
    // Federal members and senators for Victoria still sit.
    expect(
      then.current.some(
        (m) => m.jurisdiction === 'federal' && m.place === 'Victoria',
      ),
    ).toBe(true);
  });

  test('sittingPartyMembers leaves out every seat in an ended house', () => {
    const then = sittingPartyMembers(
      roster,
      people,
      slugs,
      manifest,
      undefined,
      ended,
    );
    expect(then.length).toBeGreaterThan(100);
    expect(
      then.some((m) => m.seats.some((s) => s.jurisdiction === 'vic')),
    ).toBe(false);
    expect(then.every((m) => m.seats.length > 0)).toBe(true);
    // The seats carry nothing new once the ended ones are gone.
    expect(then.flatMap((m) => m.seats).some((s) => 'ended' in s)).toBe(false);
  });

  test('every party: the page’s count and names, the party list’s count and the People list’s sitting filter agree', () => {
    const directory = directoryWith('2026-11-28');
    const rows = peopleRows(directory, catalogs.votes!, portraits);
    const parties = partyRows(directory, partyFiles);
    const before = partyRows(directoryWith(null), partyFiles);
    expect(parties.length).toBeGreaterThan(10);
    let fewer = 0;
    for (const party of parties) {
      const page = members(party.name, ended);
      const found = matchingPeople(
        rows,
        { party: party.name, sitting: '1' },
        '',
      );
      expect({ party: party.name, count: party.members }).toEqual({
        party: party.name,
        count: page.currentCount,
      });
      expect({
        party: party.name,
        ids: found.map((p) => p.profile.canonicalPersonId).sort(),
      }).toEqual({
        party: party.name,
        ids: idsOf(page.current),
      });
      expect(found.every((p) => sittingGroup(p) === 'sitting')).toBe(true);
      // The party's last members are in the People list's "Term ended"
      // group (whose party filter also reads parties a person has left).
      const last = new Set(
        matchingPeople(rows, { party: party.name }, '')
          .filter((p) => sittingGroup(p) === 'ended')
          .map((p) => p.profile.canonicalPersonId),
      );
      expect({
        party: party.name,
        missing: idsOf(page.ended).filter((id) => !last.has(id)),
      }).toEqual({ party: party.name, missing: [] });
      if (party.members < before.find((p) => p.name === party.name)!.members)
        fewer++;
    }
    // And the group is exactly the people the sitting list lost.
    const idOf = (m: { profile: (typeof rows)[number]['profile'] }) =>
      m.profile.canonicalPersonId ?? m.profile.rosterPersonId ?? m.profile.name;
    const all = (terms?: typeof ended) =>
      new Set(
        sittingPartyMembers(
          roster,
          people,
          slugs,
          manifest,
          undefined,
          terms,
        ).map(idOf),
      );
    const still = all(ended);
    expect([...all()].filter((id) => !still.has(id)).sort()).toEqual(
      rows
        .filter((p) => sittingGroup(p) === 'ended')
        .map(idOf)
        .sort(),
    );
    // A party whose every seat has ended keeps its row, with no members.
    expect(
      parties.find((p) => p.name === 'Legalise Cannabis Victoria')?.members,
    ).toBe(0);
    expect(parties.map((p) => p.name)).toEqual(before.map((p) => p.name));
    // Labor, Liberal, Nationals, Greens and the Council's small parties.
    expect(fewer).toBeGreaterThan(5);
  });

  test('once the result is loaded (null) every count and name is as before', () => {
    for (const label of ['Labor', 'Legalise Cannabis Victoria', 'Greens'])
      expect(members(label, cleared)).toEqual(members(label));
    expect(partyRows(directoryWith(null), partyFiles)).toEqual(
      partyRows(
        { ...directoryWith(null), electorates: record(index) },
        partyFiles,
      ),
    );
    const rows = peopleRows(directoryWith(null), catalogs.votes!, portraits);
    const was = peopleRows(
      { ...directoryWith(null), electorates: record(index) },
      catalogs.votes!,
      portraits,
    );
    expect(rows.map((p) => p.sittingParties)).toEqual(
      was.map((p) => p.sittingParties),
    );
  });

  describe('the party page’s loader', () => {
    const api = (value: string | null | undefined) =>
      new Catalogs({
        get: async (path, decoder) => {
          const raw = path === '/api/person-slugs' ? slugs : pinned(path);
          const data =
            path === manifest.index_url && value !== undefined
              ? {
                  ...(raw as { electorates: { chamber: string }[] }),
                  electorates: (
                    raw as { electorates: { chamber: string }[] }
                  ).electorates.map((s) =>
                    s.chamber === 'vic_la' ? { ...s, dissolved_for: value } : s,
                  ),
                }
              : raw;
          return {
            data: decoder(data),
            stale: false,
            savedAt: 1000,
            asOf: null,
          };
        },
      });

    test('reads the electorates index, so Members leaves the ended seats out', async () => {
      const view = (await api('2026-11-28').partyPage('Labor')).data!;
      const expected = members('Labor', ended);
      expect(view.members.data!.currentCount).toBe(expected.currentCount);
      expect(view.members.data!.current).toEqual(expected.current);
      expect(view.members.data!.ended).toEqual(expected.ended);
      expect(view.members.data!.currentCount).toBeLessThan(
        members('Labor').currentCount,
      );
    });

    test('with the field null, or absent from the index, every member is sitting', async () => {
      for (const value of [null, undefined]) {
        const view = (await api(value).partyPage('Labor')).data!;
        expect(view.members.data!.currentCount).toBe(
          members('Labor').currentCount,
        );
        expect(view.members.data!.ended).toEqual([]);
      }
    });
  });
});

describe('search rows for a state seat', () => {
  const suggestions = memberSuggestionRoster(roster, {
    roster,
    manifest,
    slugs,
    people,
  });
  const sourcesWith = (
    value: string | null,
    catalogue = people,
    list = suggestions,
  ) => ({
    roster: list,
    people: catalogue,
    electorates: indexWith(value),
  });
  const line = (
    person: (typeof suggestions.people)[number],
    sources: ReturnType<typeof sourcesWith>,
  ) => placeLine(person, serviceStatus(person, sources), sources);
  const stateSeat = (person: (typeof roster.people)[number]) => {
    const seats = person.representation ?? [];
    const federal = seats.find(
      (r) => r.jurisdiction === 'federal' && r.chamber !== 'senate_committee',
    );
    return federal ? null : (seats[0] ?? null);
  };
  // The surname-only Victorian stub the roster merges with a senator: his
  // ID, his "current" flag, and a Burwood seat that was never his.
  const stub = roster.people.find(
    (p) => p.name === 'Watt' && stateSeat(p)?.electorate === 'Burwood',
  )!;
  // A full-name Victorian row, given the ID the dated seats know it by.
  const dated = people.people.find(
    (p) =>
      p.jurisdiction === 'vic' &&
      p.electorates.some((s) => s.current && s.chamber === 'vic_la'),
  )!;
  const held = dated.electorates.find((s) => s.current)!;
  const joined = {
    name: dated.name,
    pid: dated.legacy_person_id!,
    current: true,
    party: held.party ?? 'Labor',
    states: ['vic'],
    chambers: ['vic_la'],
    representation: [
      {
        jurisdiction: 'vic',
        chamber: 'vic_la',
        electorate: held.name,
        state: 'VIC',
        basis: 'Fixture',
      },
    ],
  } as unknown as (typeof suggestions.people)[number];

  test('the stub is flagged current with a federal senator’s ID, and holds no dated Victorian seat', () => {
    expect(stub.current).toBe(true);
    expect(stub.pid).toBeTruthy();
    expect(serviceStatus(stub, { people })).toBe('current');
    const senator = people.people.find((p) => p.legacy_person_id === stub.pid)!;
    expect(senator.electorates.every((s) => s.jurisdiction === 'federal')).toBe(
      true,
    );
  });

  test.each([['2026-11-28'], [null]])(
    'a state seat never takes the row’s federal status (dissolved_for %s)',
    (value) => {
      const sources = sourcesWith(value);
      expect(line(stub, sources)).toBe('Burwood, Victoria');
      // The status alone, as a caller without the sources passes it.
      expect(placeLine(stub, 'current')).toBe('Burwood, Victoria');
      expect(placeLine(stub, 'former')).toBe('Burwood, Victoria');
      // Every pinned row whose line names a Victorian state seat.
      const victorian = roster.people.filter(
        (p) => stateSeat(p)?.jurisdiction === 'vic',
      );
      expect(victorian.length).toBeGreaterThan(150);
      for (const person of victorian)
        expect(line(person, sources) ?? '').not.toMatch(
          /^(Former member|Member|Senator|Former senator) /,
        );
    },
  );

  test('a federal seat keeps its federal claim', () => {
    const sources = sourcesWith('2026-11-28');
    const albanese = roster.people.find((p) => p.name === 'Anthony Albanese')!;
    expect(line(albanese, sources)).toBe(
      'Member for Grayndler, New South Wales',
    );
    const senator = roster.people.find(
      (p) =>
        p.current === true &&
        p.representation?.[0]?.chamber === 'senate' &&
        p.representation[0].state === 'VIC' &&
        p.representation.length === 1,
    );
    if (senator) expect(line(senator, sources)).toBe('Senator for Victoria');
    expect(placeLine(albanese, 'former')).toBe(
      'Former member for Grayndler, New South Wales',
    );
  });

  test('a Victorian seat the dated record says the person holds: last member while the term has ended', () => {
    expect(line(joined, sourcesWith('2026-11-28'))).toBe(
      `Last member for ${held.name}, Victoria`,
    );
    // A Council seat ends with the Assembly (s 28(2)).
    const mlc = people.people.find(
      (p) =>
        p.jurisdiction === 'vic' &&
        !!p.legacy_person_id &&
        p.electorates.some((s) => s.current && s.chamber === 'vic_lc'),
    )!;
    const region = mlc.electorates.find((s) => s.current)!;
    const row = {
      ...joined,
      name: mlc.name,
      pid: mlc.legacy_person_id!,
      chambers: ['vic_lc'],
      representation: [
        {
          ...joined.representation![0]!,
          chamber: 'vic_lc',
          electorate: region.name,
        },
      ],
    } as typeof joined;
    expect(line(row, sourcesWith('2026-11-28'))).toBe(
      `Last member for ${region.name}, Victoria`,
    );
    expect(line(row, sourcesWith(null))).toBe(
      `Member for ${region.name}, Victoria`,
    );
  });

  test('once the result is loaded (null), or from an index without the field, the holder is the member', () => {
    expect(line(joined, sourcesWith(null))).toBe(
      `Member for ${held.name}, Victoria`,
    );
    expect(line(joined, { ...sourcesWith(null), electorates: index })).toBe(
      `Member for ${held.name}, Victoria`,
    );
  });

  test('a dated seat that has ended, or another seat, claims nothing', () => {
    const elsewhere = {
      ...joined,
      representation: [
        { ...joined.representation![0]!, electorate: 'Not Their Seat' },
      ],
    } as typeof joined;
    expect(line(elsewhere, sourcesWith('2026-11-28'))).toBe(
      'Not Their Seat, Victoria',
    );
    const gone = {
      ...people,
      people: people.people.map((p) =>
        p === dated
          ? {
              ...p,
              electorates: p.electorates.map((s) => ({ ...s, current: false })),
            }
          : p,
      ),
    };
    expect(line(joined, sourcesWith('2026-11-28', gone))).toBe(
      `${held.name}, Victoria`,
    );
  });

  describe('as drawn', () => {
    const drawn = (
      person: (typeof suggestions.people)[number],
      sources: ReturnType<typeof sourcesWith>,
    ) => {
      const match = {
        kind: 'people',
        key: person.name,
        tier: 0,
        item: person,
      } as const;
      let view!: TestRenderer.ReactTestRenderer;
      act(() => {
        view = TestRenderer.create(
          <MatchRow match={match} q="x" sources={sources} variant="result" />,
        );
      });
      const place = view.root.findByType(PersonRow).props.place as
        | string
        | null;
      act(() => view.unmount());
      return { place, quick: matchItem(match, sources).secondary };
    };

    test('the Search tab row and the quick search row say the same', () => {
      expect(drawn(stub, sourcesWith('2026-11-28'))).toEqual({
        place: 'Burwood, Victoria',
        quick: 'Burwood, Victoria',
      });
      expect(drawn(joined, sourcesWith('2026-11-28'))).toEqual({
        place: `Last member for ${held.name}, Victoria`,
        quick: `Last member for ${held.name}, Victoria`,
      });
      expect(drawn(joined, sourcesWith(null))).toEqual({
        place: `Member for ${held.name}, Victoria`,
        quick: `Member for ${held.name}, Victoria`,
      });
    });
  });
});
