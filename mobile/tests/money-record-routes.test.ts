import { decodeMoneyGraph } from '../src/features/money/data';
import type { MapNode } from '../src/features/money/map/model';
import {
  associatedEntityRoute,
  moneyMapEntityRoute,
} from '../src/features/money/record-routes';
import {
  moneyRecordRoute,
  partyRoute,
  resultsRoute,
} from '../src/navigation/routes';
import { pinned } from './pinned';

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
  const donor = graph.nodes.find((n) => n.kind === 'donor')!;
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
