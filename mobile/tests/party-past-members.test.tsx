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
import {
  partyLabels,
  partyMembers,
  partyPastMembers,
} from '../src/api/party-page';
import { PersonRow } from '../src/design/people';
import { PastMembers } from '../src/features/Party';
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
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {},
  apiClient: {},
  peopleDepth: {},
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

const api = (failVotes = false) =>
  new Catalogs({
    get: async (path, decode) => {
      const data: Record<string, unknown> = {
        '/parliamentarians.json': rawRoster,
        '/api/person-slugs': slugs,
        '/electorates/manifest.json': manifest,
        [manifest.people_url]: people,
        '/votes.json': rawVotes,
      };
      if (!(path in data) || (failVotes && path === '/votes.json'))
        throw new Error('Fixture unavailable');
      return {
        data: decode(data[path]),
        stale: false,
        savedAt: 1,
        asOf: generated,
      };
    },
  });

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
