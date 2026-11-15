// Ask's people rows read the dated federal seats, as Search does. At
// 2610901d1 Ask held only the roster, so a sitting federal member the roster
// also records in a state parliament read the seat alone. The people
// catalogue comes by the cached read Search already makes; without it Ask
// is exactly as it was. Every name here is invented.
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { Catalogs } from '../src/api/catalogs';
import type { Roster } from '../src/api/catalog-decoders';
import { ApiClient } from '../src/api/client';
import {
  datedPeopleByRosterId,
  federalServiceStatus,
} from '../src/api/party-transforms';
import { askPeopleCatalog, rosterProfiles } from '../src/features/ask/people';
import { people, pinned, pinnedBytes, slugs } from './pinned';

type Row = Roster['people'][number];
const template = people.people.find((p) =>
  p.electorates.some((e) => e.jurisdiction === 'federal'),
)!;
type Seat = (typeof template.electorates)[number];
const seatLike = template.electorates.find(
  (e) => e.jurisdiction === 'federal',
)!;
const seat = (over: Partial<Seat>): Seat => ({ ...seatLike, ...over });

/** A roster row flagged current and also recorded in a state parliament. */
const row = (
  name: string,
  chamber: 'representatives' | 'senate',
  electorate: string,
  over: Partial<Row> = {},
): Row =>
  ({
    name,
    pid: `pid-${name}`,
    party: 'Invented Party',
    party_now: 'Invented Party',
    speeches: 1,
    current: true,
    states: ['federal', 'nsw'],
    chambers: [chamber, 'nsw_lc'],
    representation: [
      { jurisdiction: 'federal', chamber, electorate, state: 'NSW' },
    ],
    ...over,
  }) as unknown as Row;
const dated = (name: string, seats: Seat[]) => ({
  ...template,
  person_id: `person_${name.replace(/\W/g, '')}`,
  name,
  aliases: [],
  legacy_person_id: `pid-${name}`,
  electorates: seats,
});

// Shaped as the three the roster also records in the New South Wales
// parliament: a House member and two senators, all sitting federally now.
const house = row('Invented Member', 'representatives', 'Calare');
const senatorA = row('Invented Senator One', 'senate', 'New South Wales');
const senatorB = row('Invented Senator Two', 'senate', 'New South Wales');
// A former federal member who now sits in the state parliament.
const moved = row('Invented Mover', 'representatives', 'Werriwa');
// Federal only, and unflagged with an ended seat.
const plain = row('Invented Sitting', 'representatives', 'Watson', {
  states: ['federal'],
});
const left = row('Invented Left', 'representatives', 'Watson', {
  current: undefined,
  states: ['federal'],
});
const roster = {
  meta: { generated: '2026-11-16' },
  people: [house, senatorA, senatorB, moved, plain, left],
} as unknown as Roster;
const stateSeat = seat({
  name: 'New South Wales',
  jurisdiction: 'nsw',
  chamber: 'nsw_lc',
  current: true,
});
const catalogue = {
  ...people,
  people: [
    dated(house.name, [
      seat({ name: 'Calare', chamber: 'representatives', current: true }),
      seat({ ...stateSeat, current: false }),
    ]),
    dated(senatorA.name, [
      seat({ name: 'New South Wales', chamber: 'senate', current: true }),
    ]),
    dated(senatorB.name, [
      seat({ name: 'New South Wales', chamber: 'senate', current: true }),
      seat({ ...stateSeat, current: false }),
    ]),
    dated(moved.name, [
      seat({ name: 'Werriwa', chamber: 'representatives', current: false }),
      stateSeat,
    ]),
    dated(left.name, [
      seat({ name: 'Watson', chamber: 'representatives', current: false }),
    ]),
  ],
} as unknown as typeof people;
const noSlugs = { slugs: {} } as never;
const places = (from?: typeof people | null) =>
  Object.fromEntries(
    [...rosterProfiles(roster, noSlugs, from)].map(([name, p]) => [
      name,
      p.place,
    ]),
  );

const asBefore = {
  'Invented Member': 'Calare, New South Wales',
  'Invented Senator One': 'Senate, New South Wales',
  'Invented Senator Two': 'Senate, New South Wales',
  'Invented Mover': 'Werriwa, New South Wales',
  'Invented Sitting': 'Member for Watson, New South Wales',
  'Invented Left': 'Watson, New South Wales',
};

describe('Ask’s people rows with the people catalogue', () => {
  test('sitting federal members the roster also records in a state parliament read as sitting', () => {
    const lines = places(catalogue);
    expect(lines['Invented Member']).toBe('Member for Calare, New South Wales');
    expect(lines['Invented Senator One']).toBe('Senator for New South Wales');
    expect(lines['Invented Senator Two']).toBe('Senator for New South Wales');
  });

  test('the false claim stays out: a former federal member now in a state parliament is a former member', () => {
    const lines = places(catalogue);
    expect(lines['Invented Mover']).toBe(
      'Former member for Werriwa, New South Wales',
    );
    // And the rest say what Search says of them.
    expect(lines['Invented Sitting']).toBe(
      'Member for Watson, New South Wales',
    );
    expect(lines['Invented Left']).toBe(
      'Former member for Watson, New South Wales',
    );
  });

  test('the rule is the one Search uses, joined by a map built once', () => {
    const byId = datedPeopleByRosterId(catalogue);
    expect(byId.size).toBe(catalogue.people.length);
    expect(datedPeopleByRosterId(null).size).toBe(0);
    expect(federalServiceStatus(house, byId.get(house.pid!), catalogue)).toBe(
      'current',
    );
    expect(federalServiceStatus(moved, byId.get(moved.pid!), catalogue)).toBe(
      'former',
    );
    expect(federalServiceStatus(house, undefined, catalogue)).toBe('unknown');
  });
});

describe('without the people catalogue Ask is as it was', () => {
  test('no catalogue, a null one and an empty one all give the roster’s own lines', () => {
    expect(places()).toEqual(asBefore);
    expect(places(null)).toEqual(asBefore);
  });

  test.each([
    [
      'the manifest read fails',
      {
        manifest: () => Promise.reject(new Error('offline')),
        people: jest.fn(),
      },
    ],
    [
      'the people read fails',
      {
        manifest: () => Promise.resolve({ data: { people_url: '/x.json' } }),
        people: () => Promise.reject(new Error('offline')),
      },
    ],
    ['the reads are not there at all', {}],
  ])('%s: no catalogue, no error, the same rows', async (_name, source) => {
    const read = await askPeopleCatalog(source as never);
    expect(read).toBeNull();
    expect(places(read)).toEqual(asBefore);
  });
});

describe('the read is the one Search makes', () => {
  class MemoryStore implements CacheStore {
    entries: CacheEntry[] = [];
    index: CacheIndexEntry[] = [];
    async readIndex() {
      return this.index;
    }
    async writeIndex(entries: CacheIndexEntry[]) {
      this.index = entries;
    }
    async read(url: string) {
      return this.entries.find((entry) => entry.url === url);
    }
    async write(entry: CacheEntry) {
      this.entries = [
        entry,
        ...this.entries.filter((e) => e.url !== entry.url),
      ];
    }
    async remove(url: string) {
      this.entries = this.entries.filter((entry) => entry.url !== url);
    }
  }
  const origin = 'https://example.test';
  function world() {
    const requested: string[] = [];
    const transport = jest.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      requested.push(path);
      return new Response(
        path === '/api/person-slugs'
          ? JSON.stringify(slugs)
          : Buffer.from(pinnedBytes(path)),
        { status: 200 },
      );
    });
    const client = new ApiClient({
      origin,
      version: '1.0.0',
      build: '1',
      cache: new CatalogCache(new MemoryStore()),
      transport: transport as never,
      now: () => 1000,
      retries: 0,
    });
    return { catalogs: new Catalogs(client), requested };
  }
  const manifest = pinned('/electorates/manifest.json') as {
    people_url: string;
  };

  test('Search and Ask loading together make one request for the manifest and one for the people file', async () => {
    const { catalogs, requested } = world();
    // Search's own read of the people catalogue (search/navigation.ts).
    const search = (async () => {
      const m = await catalogs.manifest();
      return (await catalogs.people(m.data)).data;
    })();
    const [fromSearch, fromAsk] = await Promise.all([
      search,
      askPeopleCatalog(catalogs),
    ]);
    expect(fromAsk).not.toBeNull();
    expect(fromAsk!.people.length).toBe(fromSearch.people.length);
    expect(requested.sort()).toEqual(
      ['/electorates/manifest.json', manifest.people_url].sort(),
    );
  });

  test('Ask after Search asks the network for nothing more, and for no other address', async () => {
    const { catalogs, requested } = world();
    const m = await catalogs.manifest();
    await catalogs.people(m.data);
    const before = [...requested];
    await askPeopleCatalog(catalogs);
    expect(requested).toEqual(before);
  });
});
