import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Catalogs, joinPerson } from '../src/api/catalogs';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { buildPortraitIndex } from '../src/api/portrait-index';
import { partyMembers, sittingPartyMembers } from '../src/api/party-page';
import { PersonRow } from '../src/design/people';
import { Text } from '../src/design/text';
import type { Electorate } from '../src/api/catalog-decoders';
import {
  ElectorateDirectoryRow,
  EndedTermsContext,
  electorateLines,
  partyRowDetail,
} from '../src/features/directories/DirectoryRows';
import {
  placeLine as askPlace,
  rosterProfiles,
} from '../src/features/ask/people';
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
  seatMembersLine,
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

// A last member's row without its term: the seat as the sitting list had it.
const seatOnly = <T extends { term: unknown }>({ term: _term, ...seat }: T) =>
  seat;
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
    expect(then.ended.map(seatOnly)).toEqual(now.current);
    expect(then.ended.every((m) => m.term.electionDay === '2026-11-28')).toBe(
      true,
    );
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
    expect(then.ended.map(seatOnly)).toEqual(victorian);
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

    describe('a seat’s own row', () => {
      const seatsOf = (value: string | null) => {
        const all = indexWith(value).electorates;
        return {
          district: all.find(
            (s) =>
              s.chamber === 'vic_la' &&
              s.status !== 'historical' &&
              s.representatives.length === 1,
          )!,
          region: all.find(
            (s) => s.chamber === 'vic_lc' && s.representatives.length > 1,
          )!,
          federal: all.find((s) => s.name === 'Grayndler')!,
        };
      };
      const drawnSeat = (
        seat: Electorate,
        sources: ReturnType<typeof sourcesWith>,
      ) => {
        const match = {
          kind: 'electorates',
          key: seat.electorate_id,
          tier: 0,
          item: seat,
        } as const;
        const row = (variant: 'result' | 'suggestion') => {
          let view!: TestRenderer.ReactTestRenderer;
          act(() => {
            view = TestRenderer.create(
              <MatchRow
                match={match}
                q="x"
                sources={sources}
                variant={variant}
                testID="seat-row"
              />,
            );
          });
          const host = view.root.find(
            (n) => typeof n.type === 'string' && n.props.testID === 'seat-row',
          );
          const text = view.root
            .findAllByType(Text)
            .map((n) => [n.props.children].flat(Infinity).join(''))
            .join(' | ');
          const spoken = String(host.props.accessibilityLabel ?? '');
          act(() => view.unmount());
          return { text, spoken };
        };
        return {
          result: row('result'),
          suggestion: row('suggestion'),
          quick: matchItem(match, sources).secondary,
        };
      };
      const names = (seat: Electorate) =>
        seat.representatives.map((r) => r.person.name).join(', ');

      test('says "Last member:" or "Last members:" while the term has ended, drawn and spoken, in Search and quick search', () => {
        const sources = sourcesWith('2026-11-28');
        const { district, region, federal } = seatsOf('2026-11-28');
        const one = drawnSeat(district, sources);
        const line = `Last member: ${names(district)}`;
        expect(one.quick).toBe(line);
        for (const row of [one.result, one.suggestion]) {
          expect(row.text).toContain(`Victoria · ${line}`);
          expect(row.spoken).toContain(line);
        }
        expect(region.representatives.length).toBe(5);
        const five = drawnSeat(region, sources);
        const lines = `Last members: ${names(region)}`;
        expect(five.quick).toBe(lines);
        for (const row of [five.result, five.suggestion]) {
          expect(row.text).toContain(`Victoria · ${lines}`);
          expect(row.spoken).toContain(lines);
        }
        // A district answers by its own row with no index at hand; a
        // region cannot.
        expect(seatMembersLine(district)).toBe(line);
        expect(seatMembersLine(region)).toBe(names(region));
        // A federal seat in Victoria or anywhere keeps its member.
        const fed = drawnSeat(federal, sources);
        expect(fed.quick).toBe('Anthony Albanese');
        expect(fed.result.text).toContain('New South Wales · Anthony Albanese');
        expect(fed.result.text).not.toContain('Last member');
      });

      test('once the result is loaded (null) the rows name members again', () => {
        const sources = sourcesWith(null);
        const { district, region } = seatsOf(null);
        for (const seat of [district, region]) {
          const row = drawnSeat(seat, sources);
          expect(row.quick).toBe(names(seat));
          for (const drawnRow of [row.result, row.suggestion]) {
            expect(drawnRow.text).toContain(`Victoria · ${names(seat)}`);
            expect(drawnRow.text).not.toContain('Last member');
            expect(drawnRow.spoken).not.toContain('Last member');
          }
        }
      });
    });
  });
});

describe('the Parties and Electorates lists while the term has ended', () => {
  const directory = directoryWith('2026-11-28');
  const parties = partyRows(directory, partyFiles);
  const rows = peopleRows(directory, catalogs.votes!, portraits);

  test('a party’s line counts sitting members without the ended ones, or says its last members', () => {
    const labor = parties.find((p) => p.name === 'Labor')!;
    expect(labor.members).toBe(members('Labor', ended).currentCount);
    expect(labor.last).toBeGreaterThan(50);
    expect(partyRowDetail(labor)).toBe(`${labor.members} sitting members`);
    // Nobody sitting, some last members: never "0 sitting members".
    const cannabis = parties.find(
      (p) => p.name === 'Legalise Cannabis Victoria',
    )!;
    expect(cannabis).toMatchObject({ members: 0, last: 2 });
    expect(partyRowDetail(cannabis)).toBe('2 last members');
    const justice = parties.find((p) => p.name === 'Animal Justice Party')!;
    expect(partyRowDetail(justice)).toBe('1 last member');
    expect(partyRowDetail({ members: 0, last: 0 })).toBe('0 sitting members');
    // Every party's last count is the list behind its page's row: the party
    // filter with the sitting filter off, under "Term ended for an election".
    for (const party of parties) {
      const page = members(party.name, ended);
      expect({ party: party.name, last: party.last }).toEqual({
        party: party.name,
        last: new Set(idsOf(page.ended)).size,
      });
      const listed = new Set(
        matchingPeople(rows, { party: party.name }, '')
          .filter((p) => sittingGroup(p) === 'ended')
          .map((p) => p.profile.canonicalPersonId),
      );
      expect(idsOf(page.ended).every((id) => listed.has(id))).toBe(true);
    }
  });

  test('once the result is loaded (null) no party has last members', () => {
    const then = partyRows(directoryWith(null), partyFiles);
    expect(then.every((p) => p.last === 0)).toBe(true);
    expect(
      partyRowDetail(
        then.find((p) => p.name === 'Legalise Cannabis Victoria')!,
      ),
    ).toBe('2 sitting members');
  });

  describe('electorate rows', () => {
    const seats = (value: string | null) => indexWith(value).electorates;
    const district = (value: string | null) =>
      seats(value).find(
        (s) =>
          s.chamber === 'vic_la' &&
          s.status !== 'historical' &&
          s.representation_status === 'verified' &&
          s.representatives.length === 1 &&
          !!s.representatives[0]!.party,
      )!;
    const region = (value: string | null) =>
      seats(value).find(
        (s) => s.chamber === 'vic_lc' && s.representatives.length > 1,
      )!;
    const draw = (seat: Electorate, terms: typeof ended) => {
      let view!: TestRenderer.ReactTestRenderer;
      act(() => {
        view = TestRenderer.create(
          <EndedTermsContext.Provider value={terms}>
            <ElectorateDirectoryRow item={seat} />
          </EndedTermsContext.Provider>,
        );
      });
      const row = view.root.find(
        (n) =>
          typeof n.type === 'string' &&
          n.props.testID === `directory-electorate-${seat.slug}`,
      );
      const text = view.root
        .findAllByType(Text)
        .map((n) => [n.props.children].flat(Infinity).join(''))
        .join(' | ');
      const label = row.props.accessibilityLabel as string;
      act(() => view.unmount());
      return { text, label };
    };

    test('a Victorian district reads "Last member: Name · Party", drawn and spoken', () => {
      const seat = district('2026-11-28');
      const { name } = seat.representatives[0]!.person;
      const party = seat.representatives[0]!.party!;
      expect(electorateLines(seat, ended)).toEqual({
        house: 'Victorian Legislative Assembly',
        member: `Last member: ${name}`,
        party,
      });
      // The row's own field decides, with no index at hand.
      expect(electorateLines(seat).member).toBe(`Last member: ${name}`);
      const drawn = draw(seat, ended);
      expect(drawn.text).toContain(`Last member: ${name} · `);
      expect(drawn.label).toBe(
        `${seat.name}, Victorian Legislative Assembly, Last member: ${name}, ${party}`,
      );
    });

    test('a Council region reads "Last members: 5", from the Assembly’s answer', () => {
      const seat = region('2026-11-28');
      const count = seat.representatives.length;
      expect(electorateLines(seat, ended)).toEqual({
        house: 'Victorian Legislative Council',
        member: `Last members: ${count}`,
        party: null,
      });
      const drawn = draw(seat, ended);
      expect(drawn.text).toContain(`Last members: ${count}`);
      expect(drawn.label).toBe(
        `${seat.name}, Victorian Legislative Council, Last members: ${count}`,
      );
      // Without the index a region's row cannot know.
      expect(electorateLines(seat).member).toBe(`${count} members`);
    });

    test('federal seats and other states are untouched, and every Victorian row says "Last"', () => {
      for (const seat of seats('2026-11-28')) {
        const line = electorateLines(seat, ended).member;
        if (!line || line === 'No longer used') continue;
        expect({
          seat: seat.name,
          last: /^Last members?: /.test(line),
        }).toEqual({ seat: seat.name, last: seat.jurisdiction === 'vic' });
      }
      const grayndler = seats('2026-11-28').find(
        (s) => s.name === 'Grayndler',
      )!;
      expect(electorateLines(grayndler, ended).member).toBe('Anthony Albanese');
    });

    test('once the result is loaded (null) the rows name members again', () => {
      const seat = district(null);
      const name = seat.representatives[0]!.person.name;
      expect(electorateLines(seat, cleared).member).toBe(name);
      expect(draw(seat, cleared).label).not.toContain('Last member');
      const council = region(null);
      expect(electorateLines(council, cleared).member).toBe(
        `${council.representatives.length} members`,
      );
      for (const s of seats(null))
        expect(electorateLines(s, cleared).member).toBe(
          electorateLines(index.electorates.find((e) => e.slug === s.slug)!)
            .member,
        );
    });

    test('a district whose own row has cleared names its member while the rest say "Last member"', () => {
      const first = district('2026-11-28');
      const mixed = seats('2026-11-28').map((s) =>
        s.electorate_id === first.electorate_id
          ? { ...s, dissolved_for: null }
          : s,
      );
      const terms = endedParliaments(mixed);
      const lines = mixed
        .filter((s) => s.chamber === 'vic_la')
        .map((s) => [s.electorate_id, electorateLines(s, terms).member]);
      for (const [id, line] of lines)
        if (line && line !== 'No longer used')
          expect({ id, last: line.startsWith('Last member') }).toEqual({
            id,
            last: id !== first.electorate_id,
          });
    });
  });
});

describe('Ask people rows', () => {
  test('name federal seats only: no Victorian state seat is ever claimed or named', () => {
    const profiles = rosterProfiles(roster, slugs, people);
    const victorian = new Set(
      index.electorates
        .filter((s) => s.jurisdiction === 'vic')
        .map((s) => s.name),
    );
    const federal = new Set(
      index.electorates
        .filter((s) => s.jurisdiction === 'federal')
        .map((s) => s.name),
    );
    let stateOnly = 0;
    for (const person of roster.people) {
      const seats = person.representation ?? [];
      const place = profiles.get(person.name)?.place ?? null;
      if (seats.length && seats.every((r) => r.jurisdiction === 'vic')) {
        stateOnly++;
        // A row recorded only in the Victorian Parliament has no place line.
        if (profiles.get(person.name)?.name === person.name)
          expect({ name: person.name, place: askPlace(person) }).toEqual({
            name: person.name,
            place: null,
          });
      }
      const claimed = /^(?:Former member|Member) for ([^,]+)/.exec(
        place ?? '',
      )?.[1];
      if (claimed && victorian.has(claimed))
        expect({ name: person.name, federal: federal.has(claimed) }).toEqual({
          name: person.name,
          federal: true,
        });
    }
    expect(stateOnly).toBeGreaterThan(100);
  });
});
