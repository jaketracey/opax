import { decodeMoneyGraph } from '../src/features/money/data';
import type { MapNode } from '../src/features/money/map/model';
import {
  associatedEntityRoute,
  entitySearchRoute,
  moneyMapEntityRoute,
} from '../src/features/money/record-routes';
import {
  moneyRecordRoute,
  partyRoute,
  resultsRoute,
} from '../src/navigation/routes';
import { pinned } from './pinned';
import { findAliases } from '../src/features/records/find';
import { findMatches } from '../src/features/records/ReaderList';
import { speechRoute } from '../src/features/search/SpeechResults';
import { decodeRecord } from '../src/features/search/decoders';

jest.mock('../src/api/runtime', () => ({ catalogs: {}, portraits: {} }));

const graph = decodeMoneyGraph(pinned('/graph/money.json'));

test('a party selection opens its party page', () => {
  expect(
    moneyMapEntityRoute(
      { kind: 'party', label: 'Labor' },
      moneyRecordRoute({ node: 'party:Labor' }),
    ),
  ).toEqual(partyRoute('Labor'));
});

test.each(['donor', 'hub'] as const)(
  'a %s selection retains its money record and map window',
  (kind) => {
    const record = moneyRecordRoute({
      node: `${kind}:example`,
      jurisdiction: 'qld',
      from: '2020',
      to: '2024',
      via: 'map',
    });
    expect(moneyMapEntityRoute({ kind, label: 'Example' }, record)).toBe(
      record,
    );
  },
);

test('an unsupported kind or absent record has no link', () => {
  expect(
    moneyMapEntityRoute(
      { kind: 'unknown' as MapNode['kind'], label: 'Example' },
      moneyRecordRoute({ node: 'unknown:example' }),
    ),
  ).toBeNull();
  expect(
    moneyMapEntityRoute({ kind: 'donor', label: 'Example' }, null),
  ).toBeNull();
});

test('associated entities use the published donor id, never a grant recipient id', () => {
  const donor = graph.nodes.find((n) => n.kind === 'donor' && !n.withheld)!;
  const named = {
    ...graph,
    nodes: [
      {
        ...donor,
        id: 'donor:cormack-foundation',
        label: 'Cormack Foundation Pty Ltd',
        aliases: ['Cormack Foundation Trust'],
      },
    ],
  };
  for (const name of ['CORMACK FOUNDATION', 'Cormack Foundation Trust']) {
    const route = associatedEntityRoute(name, named);
    expect(route).toEqual(
      moneyRecordRoute(
        { node: 'donor:cormack-foundation', jurisdiction: 'federal' },
        'Cormack Foundation Pty Ltd',
      ),
    );
    expect(route.params).not.toHaveProperty('rid');
  }
});

test('an associated entity without a donor record opens a name search', () => {
  for (const available of [graph, null])
    expect(
      associatedEntityRoute('Unlisted associated entity', available),
    ).toEqual(resultsRoute('all', { q: 'Unlisted associated entity' }));
});

test('associated entity matching excludes withheld donors', () => {
  const withheld = graph.nodes.find((n) => n.kind === 'donor' && n.withheld)!;
  expect(
    associatedEntityRoute(withheld.label, { ...graph, nodes: [withheld] }),
  ).toEqual(resultsRoute('all', { q: withheld.label }));
});

test('a donor search carries graph aliases to a speech even when its search result has no aliases', () => {
  const donor = graph.nodes.find(
    (node) => node.kind === 'donor' && !node.withheld,
  )!;
  const named = {
    ...graph,
    nodes: [
      {
        ...donor,
        label: 'Example Union',
        aliases: ['Example Workers Association', 'EWA'],
      },
    ],
  };
  const search = entitySearchRoute('Example Union', named);
  const params = search.params as Record<string, string>;
  expect(search.params).toMatchObject({
    q: 'Example Union',
    aliases: JSON.stringify(['Example Workers Association', 'EWA']),
  });
  const row = decodeRecord({
    slug: 'speech-1',
    title: 'Example speech',
    kind: 'speech',
    resource: '',
    snippet: '',
  });
  expect(row.aliases ?? []).toEqual([]);
  const route = speechRoute(row, params.q!, findAliases(params.aliases))!;
  expect(
    findMatches(
      [{ id: 'speech', text: 'The Example Workers Association spoke.' }],
      route.params.q!,
      { tolerant: true, aliases: findAliases(route.params.aliases) },
    ),
  ).toEqual([{ part: 0, start: 4 }]);
});
