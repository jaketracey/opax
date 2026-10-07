import * as d from '../src/api/catalogs';
import { buildPortraitIndex } from '../src/api/portrait-index';
import { assertAllowedPath } from '../src/api/policy';
import {
  bills,
  catalogs,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';
import { fixtureBytes } from './fixture-bytes';
import directorySnapshot from '../scripts/fixtures/directory-snapshot.json';
import { decodePartyFile } from '../src/features/directories/party-file';
import {
  divisionRows,
  electorateFacets,
  matchingElectorates,
  matchingParties,
  matchingPeople,
  partyRows,
  peopleRows,
  representationAt,
  validDate,
} from '../src/features/directories/model';
import { canonicalUrl } from '../src/navigation/external';
import { fromWebPath } from '../src/navigation/routes';
import {
  billFilterStore,
  appliedFilters,
  withoutFilter,
} from '../src/features/bills/filters';
import { readDivisionHistory } from '../src/features/directories/division-data';
import { billFoldText, billName } from '../src/api/bill-transforms';
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
const record = <T>(data: T) => ({ data, stale: false, savedAt: 1, asOf: null });
const directory = {
  manifest: record(manifest),
  roster: record(roster),
  slugs: record(slugs),
  people: record(people),
  electorates: record(index),
};
const portraits = buildPortraitIndex({
  manifest,
  roster,
  slugs,
  people,
  photoPeople: catalogs.photoPeople!,
  photoCredits: catalogs.photoCredits!,
});
const persons = peopleRows(directory, catalogs.votes!, portraits);
const bytes = fixtureBytes(directorySnapshot);
const partyFiles = {
  federal: decodePartyFile(pinned('/graph/money.json')),
  qld: decodePartyFile(JSON.parse(bytes('/graph/money.qld.json').toString())),
  vic: decodePartyFile(JSON.parse(bytes('/graph/money.vic.json').toString())),
};
const parties = partyRows(roster, partyFiles);
const grayndler = index.electorates.find((e) => e.name === 'Grayndler')!;
const seat = d.decodeElectorate(pinned(grayndler.detail_url));
const bill = d.decodeBill(pinned('/bills/au-federal-r7534.json'));

describe('static directory transforms', () => {
  test('only guarded parliamentary identities enter the people list, with unique keys', () => {
    expect(persons.length).toBeGreaterThan(1200);
    expect(persons.length).toBeLessThanOrEqual(Object.keys(slugs.slugs).length);
    expect(new Set(persons.map((p) => p.key)).size).toBe(persons.length);
    expect(
      persons
        .filter((p) => !p.profile.canonicalPersonId && p.chambers.length === 0)
        .map((p) => p.name),
    ).toEqual([]);
    expect(persons.some((p) => p.name === 'Anthony Albanese')).toBe(true);
  });
  test('party and chamber and parliament filters compose; no committee-only profiles', () => {
    const found = matchingPeople(
      persons,
      { party: 'Labor', chamber: 'representatives', state: 'federal' },
      '',
    );
    expect(found.length).toBeGreaterThan(0);
    expect(
      found.every(
        (p) =>
          p.parties.includes('Labor') &&
          p.chambers.includes('representatives') &&
          p.states.includes('federal'),
      ),
    ).toBe(true);
    expect(
      matchingPeople(persons, { chamber: 'senate_committee' }, ''),
    ).toEqual([]);
  });
  test('vote and portrait checks use guarded index results', () => {
    expect(
      matchingPeople(persons, { votes: '1', photo: '1' }, '').every(
        (p) => p.divisions > 0 && p.portrait,
      ),
    ).toBe(true);
    const unrelated = peopleRows(
      directory,
      {
        ...catalogs.votes!,
        records: Object.fromEntries(
          Object.entries(catalogs.votes!.records).map(([key, v]) => [
            key,
            { ...v, name: 'Unrelated Name' },
          ]),
        ),
      },
      portraits,
    );
    expect(unrelated.every((p) => p.divisions === 0)).toBe(true);
  });
  test('the party-status trap retains a former party label and the roster basis', () => {
    const abbott = persons.find((p) => p.name === 'Tony Abbott')!;
    expect(abbott.profile.partyStatus).toBe('unknown');
    expect(abbott.parties).toContain('Liberal');
    const current = persons.find((p) => p.name === 'Anthony Albanese')!;
    expect(current.profile.partyStatus).toBe('current');
    const gillard = persons.find((p) => p.name === 'Julia Gillard')!;
    expect(gillard.profile.partyStatus).toBe('former');
    const joyce = persons.find((p) => p.name === 'Barnaby Joyce')!;
    expect(joyce.profile.formerly).toContain('Nationals');
  });
  test.each(['speeches', 'name', 'recent', 'divisions'])(
    'people sort %s keeps every identity',
    (sort) => {
      const sorted = matchingPeople(persons, { sort }, '');
      expect(new Set(sorted.map((p) => p.key))).toEqual(
        new Set(persons.map((p) => p.key)),
      );
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1]!,
          b = sorted[i]!;
        if (sort === 'name')
          expect(a.sortName.localeCompare(b.sortName)).toBeLessThanOrEqual(0);
        else if (sort === 'recent')
          expect(a.row?.last ?? 0).toBeGreaterThanOrEqual(b.row?.last ?? 0);
        else if (sort === 'divisions')
          expect(a.divisions).toBeGreaterThanOrEqual(b.divisions);
        else
          expect(a.row?.speeches ?? 0).toBeGreaterThanOrEqual(
            b.row?.speeches ?? 0,
          );
      }
    },
  );
  test('parties contain party nodes and roster labels; no donors; commission receipts are never summed', () => {
    expect(parties.length).toBe(19);
    expect(
      parties.every(
        (p) =>
          roster.people.some((r) => r.party === p.name) ||
          Object.values(partyFiles).some((f) =>
            f.parties.some((n) => n.label === p.name),
          ),
      ),
    ).toBe(true);
    const labor = parties.find((p) => p.name === 'Labor')!;
    expect(labor.total).toBe(labor.money.federal!.total);
    expect(
      matchingParties(parties, { jur: 'qld', sort: 'donations' }, '').every(
        (p) => !!p.money.qld,
      ),
    ).toBe(true);
  });
  test.each(['speeches', 'members', 'money'])(
    'party Show %s uses its stated basis',
    (show) => {
      const found = matchingParties(parties, { show }, '');
      expect(found.length).toBeGreaterThan(0);
      expect(
        found.every((p) =>
          show === 'speeches'
            ? p.speeches > 0
            : show === 'members'
              ? p.members > 0
              : Object.keys(p.money).length > 0,
        ),
      ).toBe(true);
    },
  );
  test('party receipts sorting uses the selected commission, not AEC totals', () => {
    const rows = matchingParties(
      parties,
      { jur: 'vic', sort: 'donations' },
      '',
    );
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1]!.money.vic!.total).toBeGreaterThanOrEqual(
        rows[i]!.money.vic!.total,
      );
  });
  test('committee-only names do not count as parliamentary party members', () => {
    const rows = partyRows(
      {
        ...roster,
        people: [
          {
            name: 'A Committee Witness',
            party: 'Labor',
            chambers: ['senate_committee'],
            speeches: 100,
          },
        ],
      },
      partyFiles,
    );
    expect(rows.find((p) => p.name === 'Labor')?.members).toBe(0);
    expect(rows.find((p) => p.name === 'Labor')?.speeches).toBe(0);
  });
  test('all six electorate filters are available and compose with search', () => {
    expect(index.electorates.length).toBe(625);
    expect(electorateFacets(index.electorates).map((f) => f.key)).toEqual([
      'jur',
      'chamber',
      'state',
      'status',
      'party',
      'results',
    ]);
    const found = matchingElectorates(
      index.electorates,
      {
        jur: 'federal',
        chamber: 'representatives',
        state: 'nsw',
        status: 'current',
        party: 'Labor',
        results: '1',
      },
      'Grayndler',
    );
    expect(found.map((e) => e.electorate_id)).toEqual([
      grayndler.electorate_id,
    ]);
  });
});
describe('decoders and representation on a date', () => {
  test('party files preserve decimal amounts and discard private donor nodes', () => {
    const result = decodePartyFile({
      meta: { generated: '2026-10-01', source: 'Public register' },
      nodes: [
        { kind: 'party', label: 'Example', total: 1.25 },
        { kind: 'donor', label: 'A private person', total: 10 },
      ],
    });
    expect(result.parties).toEqual([{ label: 'Example', total: 1.25 }]);
    expect(() =>
      decodePartyFile({
        meta: { generated: '2026-02-30', source: 'Register' },
        nodes: [],
      }),
    ).toThrow();
    expect(() =>
      decodePartyFile({
        meta: { generated: '2026-10-01', source: 'Register' },
        nodes: [{ kind: 'party', label: 'Example', total: -1 }],
      }),
    ).toThrow();
  });
  test('roster party history, roster-only labels and seat priority are decoded', () => {
    const raw = pinned('/parliamentarians.json') as {
      people: Record<string, unknown>[];
    };
    const decoded = d.decodeRoster(raw);
    expect(
      decoded.people.find((p) => p.name === 'Bob Katter')?.parties,
    ).toEqual(raw.people.find((p) => p.name === 'Bob Katter')?.parties);
    const s = d.decodeElectorate({
      ...seat,
      rosters: seat.rosters.map((r) => ({ ...r, priority: 2 })),
    });
    expect(s.rosters[0]?.priority).toBe(2);
  });
  test.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-1-01', ''])(
    'date %s is invalid',
    (date) => expect(validDate(date)).toBe(false),
  );
  test('exact complete roster is authoritative; partial and vacant observations stay explicit', () => {
    const date = seat.rosters[0]!.as_of;
    const selected = representationAt(seat, date);
    expect(selected.status).toBe(
      seat.rosters[0]!.complete ? 'verified' : 'partial',
    );
    expect(selected.members).toEqual(seat.rosters[0]!.members);
    const vacant = {
      ...seat,
      rosters: [{ ...seat.rosters[0]!, members: [], complete: true }],
    };
    expect(representationAt(vacant, date)).toMatchObject({
      status: 'verified',
      members: [],
    });
    expect(
      representationAt(
        { ...vacant, rosters: [{ ...vacant.rosters[0]!, complete: false }] },
        date,
      ).status,
    ).toBe('partial');
  });
  test('service end is exclusive; open term is bounded by observed_through; unknown precision cannot establish tenure', () => {
    const term = seat.terms.find(
      (t) => t.start_precision === 'day' && t.start,
    )!;
    const detail = {
      ...seat,
      rosters: [],
      terms: [
        {
          ...term,
          start: '2000-01-01',
          end: '2001-01-01',
          end_precision: 'day',
          party_periods: [
            { start: '2000-01-01', end: '2000-07-01', party: 'First' },
            { start: '2000-07-01', end: null, party: 'Second' },
          ],
        },
      ],
    };
    expect(representationAt(detail, '2000-06-30').members[0]?.party).toBe(
      'First',
    );
    expect(representationAt(detail, '2000-07-01').members[0]?.party).toBe(
      'Second',
    );
    expect(representationAt(detail, '2001-01-01').members).toEqual([]);
    const open = {
      ...detail,
      terms: [
        {
          ...detail.terms[0]!,
          end: null,
          end_precision: 'open',
          observed_through: '2001-01-01',
        },
      ],
    };
    expect(representationAt(open, '2001-01-01').members.length).toBe(1);
    expect(representationAt(open, '2001-01-02').status).toBe('unknown');
    expect(
      representationAt(
        { ...open, terms: [{ ...open.terms[0]!, start_precision: 'year' }] },
        '2000-06-01',
      ).members,
    ).toEqual([]);
  });
  test('conflicting records are labelled and not silently picked', () => {
    const term = seat.terms[0]!;
    const detail = {
      ...seat,
      capacity: 1,
      rosters: [],
      terms: [term, term].map((t) => ({
        ...t,
        start: '2000-01-01',
        start_precision: 'day',
        end: null,
        end_precision: 'open',
        observed_through: '2002-01-01',
      })),
    };
    expect(representationAt(detail, '2001-01-01').status).toBe('conflicting');
  });
  test('dated share links and native path mapping retain one valid date', () => {
    const path = grayndler.url + '?asof=2024-01-01';
    expect(canonicalUrl(path)).toContain('?asof=2024-01-01');
    expect(fromWebPath(path)).toMatchObject({
      pathname: '/electorate/[id]',
      params: { id: grayndler.slug, asof: '2024-01-01' },
    });
    expect(() => canonicalUrl(grayndler.url + '?asof=2026-02-30')).toThrow();
    expect(() => canonicalUrl(path + '&asof=2025-01-01')).toThrow();
    expect(fromWebPath(grayndler.url + '?asof=2026-02-30')).toBeNull();
    for (const kind of ['person', 'party', 'electorate'])
      expect(fromWebPath(`/subject/${kind}`)).toMatchObject({
        pathname: '/directory',
        params: { kind },
      });
  });
  test('division history shares its native resolver path', () => {
    expect(canonicalUrl('/bills?view=divisions')).toContain(
      '/bills?view=divisions',
    );
    expect(fromWebPath('/bills?view=divisions')).toEqual({
      pathname: '/division-history',
    });
  });
});
describe('bills and division history use static files only', () => {
  test.each(['newest', 'oldest', 'title', 'divisions'] as const)(
    'bill sort %s and the new filters match the web comparator',
    (sort) => {
      const rows = d.billsFor(bills, {
        parliament: 48,
        divided: true,
        sort,
      }).data!;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((b) => b.parliament === 48 && b.divisions > 0)).toBe(
        true,
      );
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1]!,
          b = rows[i]!;
        if (sort === 'newest')
          expect(a.introduced! >= b.introduced!).toBe(true);
        if (sort === 'oldest')
          expect(a.introduced! <= b.introduced!).toBe(true);
        if (sort === 'divisions') expect(a.divisions >= b.divisions).toBe(true);
        if (sort === 'title') expect(billFoldText(billName(a)).localeCompare(billFoldText(billName(b)))).toBeLessThanOrEqual(0);
      }
      expect(
        d.billFacetsFor(bills).data!.parliaments.find((p) => p.value === 48)!
          .count,
      ).toBe(bills.bills.filter((b) => b.parliament === 48).length);
    },
  );
  test('the filter store and removal retain parliament, toggle and sort', () => {
    billFilterStore.setFilters({
      parliament: 48,
      divided: true,
      sort: 'title',
    });
    expect(billFilterStore.get().filters).toEqual({
      parliament: 48,
      divided: true,
      sort: 'title',
    });
    expect(
      appliedFilters(billFilterStore.get().filters).map((c) => c.key),
    ).toEqual(['parliament', 'divided']);
    expect(withoutFilter(billFilterStore.get().filters, 'parliament')).toEqual({
      divided: true,
      sort: 'title',
    });
    billFilterStore.reset();
  });
  test('static projections are chronological and route directly to native bill divisions', () => {
    const rows = divisionRows([bill]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.billKey === bill.key)).toBe(true);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1]!.date >= rows[i]!.date).toBe(true);
  });
  test('history scans only explicitly divided bills, no paid calls, and reports failed files', async () => {
    const keys = bills.bills.filter((b) => b.divisions > 0).slice(0, 3);
    let calls = 0;
    const source = {
      bills: jest.fn(async () => record({ ...bills, bills: keys })),
      bill: jest.fn(async (key: string) => {
        calls++;
        if (calls === 2) throw new Error('offline');
        return record({ ...bill, key: d.billKey(key) });
      }),
    };
    const result = await readDivisionHistory(source);
    expect(result.loaded).toBe(2);
    expect(result.failed).toBe(1);
    expect(source.bill.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(keys.map((b) => b.key)),
    );
    expect(source.bills).toHaveBeenCalledTimes(1);
  });
  test('only the two exact added static exports are allowed; paid and variant paths remain blocked', () => {
    for (const path of ['/graph/money.qld.json', '/graph/money.vic.json'])
      expect(() => assertAllowedPath(path)).not.toThrow();
    for (const path of [
      '/api/parties',
      '/api/resource/division-test',
      '/api/search',
      '/graph/money.nsw.json',
      '/graph/money.qld.json?x=1',
      '/graph/money.vic.json/extra',
    ])
      expect(() => assertAllowedPath(path)).toThrow();
  });
});
