import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  decodeManifest,
  decodePeople,
  decodeRoster,
  decodeSlugs,
  decodeVotes,
} from '../src/api/catalog-decoders';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { isPartialCatalog } from '../src/api/validation';
import {
  partyLabels,
  partyMembers,
  partyPastMembers,
} from '../src/api/party-page';
import { PersonRow } from '../src/design/people';
import { PartyPage, PastMembers } from '../src/features/Party';
import { ProfileScreen } from '../src/features/Person';
import { forgetProfiles } from '../src/features/people/profile-memo';
import { accessibilityElements } from './a11y-tree';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  router: { push: jest.fn() },
  useSegments: () => [],
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
    partyPage: jest.fn(),
  },
  apiClient: { get: jest.fn() },
  peopleDepth: {
    funding: jest.fn(async () => {
      throw new Error('Fixture unavailable');
    }),
    access: jest.fn(async () => {
      throw new Error('Fixture unavailable');
    }),
    topics: jest.fn(async () => {
      throw new Error('Fixture unavailable');
    }),
  },
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  ...jest.requireActual('../src/features/your-mp/useSeat'),
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));

const generated = '2026-11-01';
const service = (party: string, start: string | null, end: string | null) => ({
  party,
  start,
  end,
  jurisdiction: 'federal',
  chamber: 'senate',
  electorate: 'Fixture State',
  source_url: 'https://example.invalid/service',
});
const rawRoster = {
  meta: { generated },
  people: [
    {
      pid: '30001',
      name: 'Ellery Vance',
      current: true,
      party: 'Bay Party',
      party_now: 'Bay Party',
      parties: ['Harbour Party', 'Bay Party'],
      chambers: ['senate'],
      affiliations: [
        service('Harbour Party', '2012-07-01', '2016-06-30'),
        service('Bay Party', '2016-07-01', null),
      ],
    },
    // A second print of the same person must not produce a second row.
    {
      pid: '30001',
      name: 'Vance',
      party: 'Harbour Party',
      affiliations: [service('Harbour Party', '2012-07-01', '2016-06-30')],
    },
    {
      pid: '30002',
      name: 'Marlow Quint',
      current: true,
      party: 'Harbour Party',
      party_now: 'Harbour Party',
      chambers: ['senate'],
      parties: ['Harbour Party'],
      affiliations: [service('Harbour Party', '2020-07-01', null)],
    },
    {
      pid: '30003',
      name: 'Casey Vale',
      current: false,
      party: 'Bay Party',
      parties: ['Harbour Party', 'Bay Party'],
      chambers: ['senate'],
      affiliations: [
        service('Harbour Party', '2007-07-01', '2010-06-30'),
        service('Harbour Party', '2012-07-01', '2014-06-30'),
      ],
    },
    {
      pid: '30004',
      name: 'Dorian Holt',
      party: 'Harbour Party',
      parties: ['Harbour Party'],
      chambers: ['senate'],
    },
  ],
};
const roster = decodeRoster(rawRoster);
const slugs = decodeSlugs({
  generated,
  slugs: {
    'ellery-vance': 'Ellery Vance',
    vance: 'Vance',
    'marlow-quint': 'Marlow Quint',
    'casey-vale': 'Casey Vale',
    'dorian-holt': 'Dorian Holt',
  },
});
const manifest = decodeManifest({
  generated,
  release_id: '1234567890abcdef',
  index_url: '/electorates/releases/1234567890abcdef/index.json',
  people_url: '/electorates/releases/1234567890abcdef/people.json',
  files: {},
  sources: [],
  coverage: { jurisdictions: {}, notes: [] },
});
const people = decodePeople({
  meta: { generated, release_id: manifest.release_id },
  people: rawRoster.people
    .filter((p) => p.current === true)
    .map((p, i) => ({
      person_id: `person_${String(i + 1).padStart(24, '0')}`,
      legacy_person_id: p.pid,
      name: p.name,
      aliases: [],
      sources: [],
      electorates: [],
    })),
});
const vote = (name: string, party: string) => ({
  name,
  party,
  jurisdiction: 'federal',
  house: 'senate',
  ayes: 2,
  noes: 3,
  divisions_total: 5,
  years: [2011, 2019],
  for: [],
  against: [],
});
const rawVotes = {
  '30001': vote('Ellery Vance', 'Bay Party'),
  '30002': vote('Marlow Quint', 'Harbour Party'),
  '30004': vote('Dorian Holt', 'Harbour Party'),
  '30005': vote('Piper Wynn', 'Harbour Party'),
  _names: {
    'Ellery Vance': ['30001'],
    'Marlow Quint': ['30002'],
    'Dorian Holt': ['30004'],
    'Piper Wynn': ['30005'],
  },
};
const votes = decodeVotes(rawVotes);
const past = () =>
  partyPastMembers('Harbour Party', votes, slugs, [], roster, people);

test('reads the portal export fields and unions roster parties with voting parties by person ID', () => {
  expect(roster.people[0]!.parties).toEqual(['Harbour Party', 'Bay Party']);
  expect(roster.people[0]!.affiliations?.[0]).toEqual(
    service('Harbour Party', '2012-07-01', '2016-06-30'),
  );
  expect(past().map((p) => [p.personId, p.name])).toEqual([
    ['roster:30003', 'Casey Vale'],
    ['vote:30005', 'Piper Wynn'],
    ['person_000000000000000000000001', 'Ellery Vance'],
  ]);
  expect(past().find((p) => p.name === 'Ellery Vance')).toMatchObject({
    periods: [service('Harbour Party', '2012-07-01', '2016-06-30')],
    years: [],
  });
  // A vote under the old party and a second printed name still make one row.
  const duplicate = decodeVotes({
    ...rawVotes,
    '30001': vote('Vance', 'Harbour Party'),
  });
  const rows = partyPastMembers(
    'Harbour Party',
    duplicate,
    slugs,
    [],
    roster,
    people,
  );
  expect(
    rows.filter((p) => p.personId === 'person_000000000000000000000001'),
  ).toHaveLength(1);
  expect(
    rows.find((p) => p.personId === 'person_000000000000000000000001')?.periods,
  ).toHaveLength(1);
});

test('does not infer former status from undated labels or an earlier ended term followed by an open term', () => {
  expect(
    past().some((p) => ['Marlow Quint', 'Dorian Holt'].includes(p.name)),
  ).toBe(false);
  const returned = decodeRoster({
    ...rawRoster,
    people: rawRoster.people.map((p) =>
      p.pid === '30001'
        ? {
            ...p,
            affiliations: [
              ...(p.affiliations ?? []),
              service('Harbour Party', '2024-07-01', null),
            ],
          }
        : p,
    ),
  });
  expect(
    partyPastMembers('Harbour Party', votes, slugs, [], returned, people).some(
      (p) => p.personId === 'person_000000000000000000000001',
    ),
  ).toBe(false);
});

test('keeps undated exports compatible, confirms former people without inventing service dates, and keeps the votes fallback', () => {
  const older = decodeRoster({
    ...rawRoster,
    people: rawRoster.people.map(({ affiliations: _affiliations, ...p }) => p),
  });
  const rows = partyPastMembers(
    'Harbour Party',
    votes,
    slugs,
    [],
    older,
    people,
  );
  expect(rows.map((p) => p.name)).toEqual(['Casey Vale', 'Piper Wynn']);
  expect(rows.every((p) => p.periods === undefined)).toBe(true);
  expect(rows.find((p) => p.name === 'Piper Wynn')?.slug).toBeNull();
  expect(partyLabels(older, people)).toContain('Harbour Party');
});

test('current member rows are identical with and without dated party history', () => {
  const older = decodeRoster({
    ...rawRoster,
    people: rawRoster.people.map(({ affiliations: _affiliations, ...p }) => p),
  });
  for (const party of ['Harbour Party', 'Bay Party']) {
    const current = partyMembers(party, roster, people, slugs, manifest);
    expect(current.current).toEqual(
      partyMembers(party, older, people, slugs, manifest).current,
    );
    expect(current.current.map((p) => p.name)).toEqual([
      party === 'Harbour Party' ? 'Marlow Quint' : 'Ellery Vance',
    ]);
  }
});

test('different person IDs keep two same-name people separate', () => {
  const distinct = decodeRoster({
    ...rawRoster,
    people: [
      ...rawRoster.people,
      {
        pid: '30006',
        name: 'Ellery Vance',
        current: false,
        parties: ['Harbour Party'],
      },
    ],
  });
  const rows = partyPastMembers(
    'Harbour Party',
    votes,
    slugs,
    [],
    distinct,
    people,
  ).filter((p) => p.name === 'Ellery Vance');
  expect(rows.map((p) => p.personId).sort()).toEqual([
    'person_000000000000000000000001',
    'roster:30006',
  ]);
  expect(rows.every((p) => p.slug === null)).toBe(true);
});

test('a party recorded only in dated history can resolve without becoming current', () => {
  const history = decodeRoster({
    meta: { generated },
    people: [rawRoster.people[0]],
  });
  expect(partyLabels(history, people)).toContain('Harbour Party');
  expect(
    partyMembers('Harbour Party', history, people, slugs, manifest).current,
  ).toEqual([]);
  expect(
    partyPastMembers('Harbour Party', votes, slugs, [], history, people).some(
      (p) => p.name === 'Ellery Vance',
    ),
  ).toBe(true);
});

const api = (failVotes = false, rosterInput: unknown = rawRoster) =>
  new Catalogs({
    get: async (path, decode) => {
      const data: Record<string, unknown> = {
        '/parliamentarians.json': rosterInput,
        '/api/person-slugs': slugs,
        '/electorates/manifest.json': manifest,
        [manifest.people_url]: people,
        [manifest.index_url]: { meta: people.meta, electorates: [] },
        '/votes.json': rawVotes,
      };
      if (!(path in data) || (failVotes && path === '/votes.json'))
        throw new Error('Fixture unavailable');
      const decoded = decode(data[path]);
      return {
        data: decoded,
        partial: isPartialCatalog(decoded),
        stale: false,
        savedAt: 1,
        asOf: generated,
      };
    },
  });

const goodAffiliation = service('Harbour Party', '2012-07-01', '2016-06-30');
const mixedAffiliations = [
  goodAffiliation,
  { ...goodAffiliation, party: '' },
  { ...goodAffiliation, start: 'not-a-date' },
  { ...goodAffiliation, end: '2026-02-30' },
  { ...goodAffiliation, source_url: 'not-a-url' },
  null,
  { ...service('Bay Party', '2016-07-01', null), source_url: '' },
  { ...service('Bay Party', '2016-07-01', null), source_url: null },
];
const withAffiliations = (affiliations: unknown) => ({
  ...rawRoster,
  people: rawRoster.people.map((p, i) =>
    i === 0 ? { ...p, affiliations } : p,
  ),
});

test('bad optional affiliations drop only themselves, blank URLs are absent, and the roster stays whole', () => {
  const warning = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  try {
    const decoded = decodeRoster(withAffiliations(mixedAffiliations));
    const expected = decodeRoster(
      withAffiliations([
        goodAffiliation,
        service('Bay Party', '2016-07-01', null),
        service('Bay Party', '2016-07-01', null),
      ]),
    );
    expect(decoded.people).toHaveLength(rawRoster.people.length);
    expect(decoded.people[0]).toEqual({
      ...expected.people[0],
      affiliations: [
        expected.people[0]!.affiliations![0],
        ...expected.people[0]!.affiliations!.slice(1).map(
          ({ source_url: _url, ...a }) => a,
        ),
      ],
    });
    expect(isPartialCatalog(decoded)).toBe(false);
    expect(warning.mock.calls.map(([message]) => message)).toEqual(
      [1, 2, 3, 4, 5].map(
        (index) =>
          `Dropped malformed catalog row: roster.affiliation [${index}]`,
      ),
    );
  } finally {
    warning.mockRestore();
  }
});

test('even entirely bad optional service leaves the person and roster usable', () => {
  const warning = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  try {
    const decoded = decodeRoster(
      withAffiliations(mixedAffiliations.slice(1, 6)),
    );
    expect(decoded.people[0]).toEqual({
      ...roster.people[0],
      affiliations: [],
    });
    expect(isPartialCatalog(decoded)).toBe(false);
  } finally {
    warning.mockRestore();
  }
});

test.each([null, {}, 'bad', false, 42])(
  'non-array affiliations %j mean none',
  (value) => {
    const decoded = decodeRoster(withAffiliations(value));
    expect(decoded.people[0]).toEqual({
      ...roster.people[0],
      affiliations: undefined,
    });
    expect(isPartialCatalog(decoded)).toBe(false);
  },
);

test.each(['ios', 'android'] as const)(
  '%s still renders the party and person with malformed optional service',
  async (platform) => {
    const original = Platform.OS;
    Platform.OS = platform;
    const warning = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const fixture = api(false, withAffiliations(mixedAffiliations));
    const mock = jest.mocked(runtime);
    mock.partyPage.mockImplementation(fixture.partyPage.bind(fixture));
    mock.person.mockImplementation(fixture.person.bind(fixture));
    mock.profileFor.mockImplementation(fixture.profileFor.bind(fixture));
    mock.directory.mockImplementation(fixture.directory.bind(fixture));
    const renderers: TestRenderer.ReactTestRenderer[] = [];
    forgetProfiles();
    try {
      const page = (await fixture.partyPage('Harbour Party')).data!;
      expect(page.members.status).toBe('ready');
      expect(
        page.past?.data?.find((p) => p.name === 'Ellery Vance')?.periods,
      ).toEqual([goodAffiliation]);
      await act(async () => {
        renderers.push(
          TestRenderer.create(<PartyPage input="Harbour Party" />),
        );
      });
      expect(
        renderers[0]!.root.findAllByProps({ testID: 'party-screen' }).length,
      ).toBeGreaterThan(0);
      await act(async () => {
        renderers.push(
          TestRenderer.create(<ProfileScreen slug="ellery-vance" />),
        );
      });
      expect(
        renderers[1]!.root.findAllByProps({ testID: 'person-screen' }).length,
      ).toBeGreaterThan(0);
      expect(
        renderers[1]!.root.findAllByProps({ testID: 'person-pending-screen' }),
      ).toHaveLength(0);
    } finally {
      for (const renderer of renderers) act(() => renderer.unmount());
      forgetProfiles();
      for (const method of Object.values(mock)) method.mockReset();
      warning.mockRestore();
      Platform.OS = original;
    }
  },
);

test('the party page passes fetched roster history to past members', async () => {
  const page = (await api().partyPage('Harbour Party')).data!;
  expect(page.past?.data).toEqual(past());
  expect(page.members.data?.current.map((p) => p.name)).toEqual([
    'Marlow Quint',
  ]);
  expect(page.past?.sources.some((s) => s.label.includes('roster'))).toBe(true);
  expect(page.past?.sources.some((s) => s.label.includes('Vote'))).toBe(true);
  expect(
    page.past?.sources.some((s) => s.url === 'https://example.invalid/service'),
  ).toBe(true);
});

test('available roster service remains visible as partial when voting records fail', async () => {
  const page = (await api(true).partyPage('Harbour Party')).data!;
  expect(page.past).toMatchObject({ status: 'ready', partial: true });
  expect(page.past?.data?.map((p) => p.name)).toEqual([
    'Casey Vale',
    'Ellery Vance',
  ]);
});

test.each(['ios', 'android'] as const)(
  '%s renders party-specific service dates in the shared person row',
  (platform) => {
    const original = Platform.OS;
    Platform.OS = platform;
    let rendered!: TestRenderer.ReactTestRenderer;
    try {
      act(() => {
        rendered = TestRenderer.create(
          <PastMembers
            block={{
              status: 'ready',
              data: past(),
              stale: false,
              asAt: generated,
              sources: [],
            }}
            retry={jest.fn()}
          />,
        );
      });
      const disclosure = rendered.root.find(
        (n) =>
          n.props.testID === 'party-past-toggle' &&
          typeof n.props.onPress === 'function',
      );
      act(() => disclosure.props.onPress());
      const rows = rendered.root.findAllByType(PersonRow);
      expect(rows.map((r) => [r.props.name, r.props.place])).toEqual([
        [
          'Casey Vale',
          'Senate, 1 Jul 2007 to 30 Jun 2010; 1 Jul 2012 to 30 Jun 2014',
        ],
        ['Piper Wynn', 'Senate, 2011 to 2019'],
        ['Ellery Vance', 'Senate, 1 Jul 2012 to 30 Jun 2016'],
      ]);
      expect(
        rows.find((r) => r.props.name === 'Piper Wynn')?.props.href,
      ).toBeUndefined();
      expect(
        accessibilityElements(rendered.root).some((e) =>
          e.label.includes('Ellery Vance, Senate, 1 Jul 2012 to 30 Jun 2016'),
        ),
      ).toBe(true);
    } finally {
      if (rendered) act(() => rendered.unmount());
      Platform.OS = original;
    }
  },
);
