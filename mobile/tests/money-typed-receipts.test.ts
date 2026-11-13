import {
  decodeMoneyGraph,
  moneyDecodeLoss,
  typedReceipts,
} from '../src/features/money/data';

// Invented names. The older cells hold the party's return and the donor's
// own declaration of the same gift, so each $750,000 gift appears twice.
const meta = {
  generated: '2026-11-01',
  coverage: 'financial years 2019-20 to 2021-22',
  source: 'Fixture returns',
};
const party = {
  id: 'party:Fixture Party',
  label: 'Fixture Party',
  kind: 'party',
  group: 'parties',
  industry: 'party',
  total: 9_000_000,
  count: 90,
  firstYear: 2019,
  lastYear: 2021,
  byYear: { '2019': [3e6, 30], '2020': [3e6, 30], '2021': [3e6, 30] },
  by_type: { donation_received: 1_000_000 },
  by_type_year: { '2020-21': { donation_received: [1_000_000, 1] } },
};
const donor = (id: string, total: number) => ({
  id,
  label: id === 'donor:typed' ? 'Wattle Holdings Pty Ltd' : 'Banksia Pty Ltd',
  kind: 'donor',
  group: 'business',
  industry: 'Property',
  total,
  count: 2,
  firstYear: 2020,
  lastYear: 2020,
  byYear: { '2020': [total, 2] },
});
const typedEdge = {
  source: 'donor:typed',
  target: party.id,
  total: 1_500_000,
  count: 2,
  firstYear: 2020,
  lastYear: 2020,
  byYear: { '2020': [1_500_000, 2] },
  by_type: { donation_received: 750_000, other_receipt: 50_000.5 },
  by_type_year: {
    '2019-20': { other_receipt: [50_000.5, 1] },
    '2020-21': { donation_received: [750_000, 1] },
  },
};
const legacyEdge = {
  source: 'donor:legacy',
  target: party.id,
  total: 400_000,
  count: 2,
  firstYear: 2020,
  lastYear: 2020,
  byYear: { '2020': [400_000, 2] },
};
const graph = (edges: object[]) =>
  decodeMoneyGraph({
    meta,
    nodes: [
      party,
      {
        ...donor('donor:typed', 1_500_000),
        by_type: typedEdge.by_type,
        by_type_year: typedEdge.by_type_year,
      },
      donor('donor:legacy', 400_000),
    ],
    edges,
  });

test('a flow with typed cells counts each gift once, across all receipt types', () => {
  const decoded = graph([typedEdge, legacyEdge]);
  const flow = decoded.edges.find((e) => e.source === 'donor:typed')!;
  expect(flow).toMatchObject({
    total: 800_000.5,
    count: 2,
    firstYear: 2019,
    lastYear: 2020,
    byYear: { '2019': [50_000.5, 1], '2020': [750_000, 1] },
    typed: true,
  });
  expect(flow).not.toHaveProperty('by_type');
  const node = decoded.nodes.find((n) => n.id === 'donor:typed')!;
  expect(node.total).toBe(800_000.5);
  expect(node.typed).toBe(true);
  expect(moneyDecodeLoss(decoded).fields).toBe(0);
});

test('a flow without typed cells keeps the older figures, and says nothing typed', () => {
  const decoded = graph([typedEdge, legacyEdge]);
  const flow = decoded.edges.find((e) => e.source === 'donor:legacy')!;
  expect(flow.total).toBe(400_000);
  expect(flow.byYear).toEqual({ '2020': [400_000, 2] });
  expect(flow.typed).toBeUndefined();
});

test('the party keeps its own return: its typed cells only sum donors on the map', () => {
  const node = graph([typedEdge]).nodes.find((n) => n.id === party.id)!;
  expect(node.total).toBe(9_000_000);
  expect(node.typed).toBeUndefined();
  expect(node).not.toHaveProperty('by_type');
});

test('typed cells that do not hold together fall back to the older cells and are counted', () => {
  const decoded = graph([
    { ...typedEdge, by_type: { donation_received: 1 } },
    legacyEdge,
  ]);
  const flow = decoded.edges.find((e) => e.source === 'donor:typed')!;
  expect(flow.total).toBe(1_500_000);
  expect(flow.typed).toBeUndefined();
  expect(moneyDecodeLoss(decoded).fields).toBe(1);
});

test('an event names its year, and a period with no year stays undated', () => {
  expect(
    typedReceipts({
      by_type: { donation_received: 30 },
      by_type_year: {
        'Fadden By-election': { donation_received: [10, 1] },
        '2022 Federal Election': { donation_received: [10, 1] },
        'Unknown event': { donation_received: [10, 1] },
      },
    }),
  ).toMatchObject({
    total: 30,
    count: 3,
    firstYear: 2022,
    lastYear: 2023,
    byYear: { '2022': [10, 1], '2023': [10, 1] },
    undated: [10, 1],
  });
  expect(typedReceipts({ by_type: { donation_received: -1 } })).toBeNull();
});
