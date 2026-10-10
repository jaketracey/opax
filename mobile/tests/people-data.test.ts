import { joinPerson, profileFor } from '../src/api/catalogs';
import { chamberName, jurisdictionName } from '../src/design/parliament';
import { formerMember, partyText } from '../src/design/party';
import {
  partyStatusFor,
  partyStatusSeatsFor,
  personPartyFor,
  sittingSurnamesFor,
} from '../src/api/party-transforms';
import type {
  RosterPerson,
  SeatObservation,
} from '../src/api/catalog-decoders';
import { roster, manifest, people, catalogs } from './pinned';

describe('chamber and jurisdiction names cover the pinned data', () => {
  const chambers = new Set<string>();
  const pairs = new Set<string>();
  const jurisdictions = new Set<string>();
  for (const person of roster.people) {
    for (const id of (person as { chambers?: string[] }).chambers ?? [])
      chambers.add(id);
    for (const id of (person as { states?: string[] }).states ?? [])
      jurisdictions.add(id);
    for (const seat of person.representation ?? []) {
      pairs.add(`${seat.jurisdiction}|${seat.chamber}`);
      jurisdictions.add(seat.jurisdiction);
    }
  }
  for (const person of people.people)
    for (const seat of person.electorates) {
      pairs.add(`${seat.jurisdiction}|${seat.chamber}`);
      jurisdictions.add(seat.jurisdiction);
    }
  for (const pair of pairs) chambers.add(pair.split('|')[1]!);

  test('the pinned data has the chambers the review found', () => {
    for (const id of ['representatives', 'senate', 'vic_la', 'vic_lc'])
      expect(chambers).toContain(id);
  });
  test.each([...chambers].sort())(
    'chamber %s has a reader-facing name',
    (id) => {
      const name = chamberName(id);
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/_|^[a-z]/);
    },
  );
  test.each([...pairs].sort())('seat %s names its chamber', (pair) => {
    const [jurisdiction, chamber] = pair.split('|');
    expect(chamberName(chamber, jurisdiction)).toBeTruthy();
  });
  test.each([...jurisdictions].sort())(
    'jurisdiction %s has a reader-facing name',
    (id) => {
      expect(jurisdictionName(id)).toBeTruthy();
    },
  );
  test('names', () => {
    expect(chamberName('representatives', 'federal')).toBe(
      'House of Representatives',
    );
    expect(chamberName('senate', 'federal')).toBe('Senate');
    expect(chamberName('vic_la', 'vic')).toBe('Victorian Legislative Assembly');
    expect(chamberName('vic_lc', 'vic')).toBe('Victorian Legislative Council');
    expect(chamberName('nsw_la')).toBe('New South Wales Legislative Assembly');
    expect(chamberName('sa_ha')).toBe('South Australian House of Assembly');
    expect(chamberName('assembly', 'qld')).toBe(
      'Queensland Legislative Assembly',
    );
    expect(jurisdictionName('federal')).toBe('Federal');
    expect(jurisdictionName('vic')).toBe('Victoria');
  });
  test('unknown IDs are said in words by callers, never printed', () => {
    expect(chamberName('xyz_zz')).toBeNull();
    expect(chamberName('federal_la')).toBeNull();
    expect(chamberName(null)).toBeNull();
    expect(jurisdictionName('mars')).toBeNull();
  });
});

describe('party status from the real adapter', () => {
  const profile = (slug: string, name: string) =>
    joinPerson(
      slug,
      { generated: '2026-10-03', slugs: { [slug]: name } },
      roster,
      people,
      manifest,
    );
  const label = (slug: string, name: string, dense = false) => {
    const p = profile(slug, name);
    return partyText(
      { party: p.party, status: p.partyStatus, formerly: p.formerly },
      dense,
    );
  };
  test('a former affiliation needs the named roster observation', () => {
    const person = people.people.find((p) => p.name === 'Matthew Canavan')!;
    const row = roster.people.find((r) => r.name === person.name)!;
    expect(row.party_now).toBeTruthy();
    expect(personPartyFor(person.electorates, row).formerly).toBeNull();
  });
  test('the full profile selector uses the same party status as the directory', () => {
    for (const [slug, name] of [
      ['anthony-albanese', 'Anthony Albanese'],
      ['barnaby-joyce', 'Barnaby Joyce'],
      ['julia-gillard', 'Julia Gillard'],
      ['linda-burney', 'Linda Burney'],
    ]) {
      const directory = profile(slug!, name!);
      expect(directory.canonicalPersonId).toBeDefined();
      const identity = profileFor(directory.canonicalPersonId!, catalogs).blocks
        .identity.data;
      expect(identity).toMatchObject({
        party: directory.party,
        partyStatus: directory.partyStatus,
        rosterParty: directory.rosterParty,
        formerly: directory.formerly,
      });
    }
  });
  // Current: a current dated seat or a current APH roster row.
  test('Anthony Albanese, sitting, reads "Labor"', () => {
    expect(profile('anthony-albanese', 'Anthony Albanese').partyStatus).toBe(
      'current',
    );
    expect(label('anthony-albanese', 'Anthony Albanese')).toEqual({
      visible: 'Labor',
      previous: null,
      spoken: 'Labor',
    });
  });
  test('Barnaby Joyce, sitting after a party change, reads "One Nation", formerly Nationals', () => {
    expect(profile('barnaby-joyce', 'Barnaby Joyce').partyStatus).toBe(
      'current',
    );
    expect(label('barnaby-joyce', 'Barnaby Joyce')).toEqual({
      visible: 'One Nation',
      previous: 'formerly Nationals',
      spoken: 'One Nation, formerly Nationals',
    });
    expect(label('barnaby-joyce', 'Barnaby Joyce', true)).toEqual({
      visible: 'ONP',
      previous: 'formerly NAT',
      spoken: 'One Nation, formerly Nationals',
    });
  });
  // Former, known: the dated release says the last seat ended.
  // TestFlight build 32: "Formerly" is reserved for a change of party; a
  // former member's label is the party they sat for, and the row says
  // "Former member".
  test('Julia Gillard, whose Lalor seat ended in 2013, reads "Labor" and "Former member"', () => {
    const p = profile('julia-gillard', 'Julia Gillard');
    expect(p.seats).toHaveLength(0);
    expect(p.partyStatus).toBe('former');
    expect(label('julia-gillard', 'Julia Gillard')).toEqual({
      visible: 'Labor',
      previous: null,
      spoken: 'Labor',
    });
    expect(label('julia-gillard', 'Julia Gillard', true)).toEqual({
      visible: 'ALP',
      previous: null,
      spoken: 'Labor',
    });
    expect(formerMember(p.partyStatus)).toBe('Former member');
  });
  // Unknown: no dated seat and no roster status. Drawn plainly, as on the web.
  test.each([
    ['yasmin-catley', 'Yasmin Catley', 'Labor', 'ALP'], // NSW Assembly
    ['sm-fentiman', 'SM Fentiman', 'Labor', 'ALP'], // Queensland Assembly
    ['aj-stoker', 'Aj Stoker', 'LNP', 'LNP'], // Queensland Assembly
  ])(
    '%s, a state member the data does not date, reads "%s" plainly',
    (slug, name, visible, dense) => {
      const row = roster.people.find((r) => r.name === name)!;
      expect(row.current).toBeUndefined();
      expect(row.states?.includes('federal')).toBe(false);
      const p = profile(slug, name);
      expect(p.seats).toHaveLength(0);
      expect(p.partyStatus).toBe('unknown');
      expect(label(slug, name)).toEqual({
        visible,
        previous: null,
        spoken: visible,
      });
      expect(label(slug, name, true)).toEqual({
        visible: dense,
        previous: null,
        spoken: visible,
      });
    },
  );
  test('an ended federal seat does not make a state member former', () => {
    // Page ended in 2013; the roster also records Lismore, which no dated
    // release covers, so the data cannot say she no longer sits.
    const p = profile('janelle-saffin', 'Janelle Saffin');
    expect(p.partyStatus).toBe('unknown');
    expect(label('janelle-saffin', 'Janelle Saffin').visible).toBe('Labor');
    // The same rule leaves Linda Burney (Barton ended 2025; the roster also
    // records Canterbury) plain rather than claiming either way.
    expect(profile('linda-burney', 'Linda Burney').partyStatus).toBe('unknown');
  });
  test('every pinned profile follows the three-state rule', () => {
    const sitting = sittingSurnamesFor(people, manifest.coverage);
    for (const row of roster.people) {
      if (!row.party && !row.party_now) continue;
      let p;
      try {
        p = profile('probe', row.name);
      } catch {
        continue; // identity needing review is refused upstream
      }
      const visible = label('probe', row.name).visible;
      const person = people.people.find(
        (x) => x.person_id === p.canonicalPersonId,
      );
      const seats = partyStatusSeatsFor(
        person?.electorates ?? [],
        p.rosterRow,
        people,
      );
      if (p.partyStatus === 'current')
        expect(
          p.seats.length > 0 || (row.current === true && !!row.party_now),
        ).toBe(true);
      else if (p.partyStatus === 'former') {
        // Dated ended seats, or no sitting member of a parliament whose
        // complete current membership the release holds shares the surname
        // (the pinned roster never says current: false).
        expect(seats.some((s) => s.current)).toBe(false);
        const surname = (n: string) => n.toLowerCase().split(/\s+/).at(-1)!;
        const recorded = [
          ...(p.rosterRow?.states ?? []),
          ...(p.rosterRow?.representation ?? []).map((r) => r.jurisdiction),
        ];
        if (!seats.length) {
          expect(recorded.length).toBeGreaterThan(0);
          for (const j of recorded) {
            expect(sitting.has(j)).toBe(true);
            expect(sitting.get(j)!.has(surname(row.name))).toBe(false);
          }
        }
        // The status is the row's quiet line, never the label.
        expect(visible).not.toMatch(/formerly/i);
        expect(formerMember(p.partyStatus)).toBe('Former member');
      } else {
        expect(visible).not.toMatch(/formerly/i);
        expect(formerMember(p.partyStatus)).toBeNull();
      }
    }
  });
});

describe('party status rule', () => {
  const ended = {
    electorate_id: 'el_000000000000000000000000',
    name: 'Seat',
    current: false,
    as_of: '2026-09-04',
    party: null,
    jurisdiction: 'federal',
    chamber: 'representatives',
    url: '/subject/electorate/seat',
    periods: [{ start: '2010-08-21', end: '2013-09-07' }],
  } as unknown as SeatObservation;
  const sitting = { ...ended, current: true, party: 'Labor' };
  const row = (extra: object) =>
    ({ name: 'A Member', party: 'Labor', ...extra }) as RosterPerson;
  test.each([
    ['a current dated seat', 'current', [sitting], undefined],
    [
      'a current roster row with its party',
      'current',
      [],
      row({ current: true, party_now: 'Labor' }),
    ],
    [
      'a current roster row without party_now',
      'unknown',
      [],
      row({ current: true }),
    ],
    [
      'a roster row that says it is not current',
      'former',
      [],
      row({ current: false }),
    ],
    ['an ended dated seat with no roster row', 'former', [ended], undefined],
    [
      'an ended dated seat the roster agrees covers it',
      'former',
      [ended],
      row({ states: ['federal'] }),
    ],
    [
      'an ended federal seat beside a recorded state seat',
      'unknown',
      [ended],
      row({
        states: ['federal'],
        representation: [
          { jurisdiction: 'nsw', chamber: 'nsw_la', electorate: 'Lismore' },
        ],
      }),
    ],
    [
      'no dated seat and no roster status',
      'unknown',
      [],
      row({ states: ['qld'] }),
    ],
    ['nothing at all', 'unknown', [], undefined],
  ] as const)('%s is %s', (_, status, seats, rosterRow) => {
    expect(partyStatusFor([...seats], rosterRow)).toBe(status);
    expect(personPartyFor([...seats], rosterRow).partyStatus).toBe(status);
  });
  test('an ended seat never overrules a current roster row without party_now', () => {
    expect(
      partyStatusFor([ended], row({ current: true, states: ['federal'] })),
    ).toBe('unknown');
  });
  test('no current roster row can ever produce former', () => {
    const otherState = { ...ended, jurisdiction: 'nsw', chamber: 'nsw_la' };
    const seatSets = [[], [ended], [otherState], [ended, otherState]];
    const extras = [
      {},
      { party_now: 'Labor' },
      { states: ['federal'] },
      { states: ['federal', 'nsw'] },
      {
        representation: [
          { jurisdiction: 'federal', chamber: 'senate', electorate: 'NSW' },
        ],
      },
    ];
    for (const seats of seatSets)
      for (const extra of extras)
        expect(
          partyStatusFor(seats, row({ ...extra, current: true })),
        ).not.toBe('former');
    // Every pinned current row, stripped of party_now, against every pinned
    // person's observations with each seat marked ended.
    const currentRows = roster.people
      .filter((r) => r.current === true)
      .map(({ party_now: _, ...r }) => r as RosterPerson);
    expect(currentRows.length).toBeGreaterThan(300);
    const outcomes = new Set<string>();
    for (const person of people.people) {
      const endedSeats = person.electorates.map((s) => ({
        ...s,
        current: false,
      }));
      for (const r of currentRows) outcomes.add(partyStatusFor(endedSeats, r));
    }
    expect([...outcomes]).toEqual(['unknown']);
  });
  test("Deborah O'Neill's ended Robertson record stays current-or-plain beside her current roster row", () => {
    // The release has a historical canonical record holding only Robertson
    // (ended) beside her current Senate record.
    const historical = people.people.find(
      (p) =>
        p.name === "Deborah O'Neill" && p.electorates.every((s) => !s.current),
    )!;
    expect(historical.electorates.map((s) => s.name)).toEqual(['Robertson']);
    const identity = (r: typeof roster) =>
      profileFor(historical.person_id, { ...catalogs, roster: r }).blocks
        .identity.data!;
    const asPinned = identity(roster);
    expect(asPinned.partyStatus).toBe('current');
    expect(
      partyText({
        party: asPinned.party,
        status: asPinned.partyStatus,
        formerly: asPinned.formerly,
      }),
    ).toEqual({ visible: 'Labor', previous: null, spoken: 'Labor' });
    // The same row without its optional party_now: still never "Formerly".
    const withoutPartyNow = identity({
      ...roster,
      people: roster.people.map((r) => {
        if (r.current !== true) return r;
        const { party_now: _, ...rest } = r;
        return rest as RosterPerson;
      }),
    });
    expect(withoutPartyNow.partyStatus).toBe('unknown');
    expect(
      partyText({
        party: withoutPartyNow.party,
        status: withoutPartyNow.partyStatus,
        formerly: withoutPartyNow.formerly,
      }),
    ).toEqual({ visible: 'Labor', previous: null, spoken: 'Labor' });
  });
  test('a sitting member keeps a dated seat party over the roster', () => {
    expect(
      personPartyFor([ended, sitting], row({ party: 'Greens' })).party,
    ).toBe('Labor');
  });
});
