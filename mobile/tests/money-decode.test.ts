import {
  decodeMoneyGraph,
  moneyDecodeLoss,
  type MoneyNode,
} from '../src/features/money/data';
import { pinned } from './pinned';

test('a malformed or duplicated row is counted without blanking the valid jurisdiction', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  // 413 nodes and 1,159 edges, every donor kept under its own name.
  const raw = pinned('/graph/money.json') as {
    nodes: (MoneyNode & { aliases?: string[] })[];
    edges: { total: number }[];
  };
  expect(raw.nodes).toHaveLength(413);
  expect(raw.edges).toHaveLength(1159);
  expect(graph.nodes).toHaveLength(413);
  expect(graph.nodes.map((n) => n.label)).toEqual(
    raw.nodes.map((n) => n.label),
  );
  const sum = (edges: { total: number }[]) =>
    edges.reduce((n, e) => n + e.total, 0);
  expect(sum(graph.edges)).toBe(sum(raw.edges));
  const held = graph.nodes.length,
    flows = graph.edges.length;
  const duplicate = decodeMoneyGraph({
    ...graph,
    nodes: [...graph.nodes, graph.nodes[0]],
  });
  expect(duplicate.nodes).toHaveLength(held);
  expect(moneyDecodeLoss(duplicate).nodes).toBe(1);
  const bad = decodeMoneyGraph({
    ...graph,
    nodes: [
      ...graph.nodes,
      { ...graph.nodes[0], id: 'fixture:bad', total: Infinity },
    ],
    edges: [...graph.edges, { ...graph.edges[0], target: 'missing' }],
  });
  expect(bad.nodes).toHaveLength(held);
  expect(bad.edges).toHaveLength(flows);
  expect(moneyDecodeLoss(bad)).toEqual({ nodes: 1, edges: 1, fields: 0 });
});
test('ID duplicates retain the larger total only when all other fields are identical; ambiguity removes all rows and dangling edges', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const donor: MoneyNode = {
    id: 'donor:fixture',
    label: 'Fixture donor',
    kind: 'donor',
    industry: 'individual',
    group: 'individuals',
    total: 5,
    count: 1,
    firstYear: null,
    lastYear: null,
  };
  const edge = {
    source: donor.id,
    target: graph.nodes[0]!.id,
    total: 5,
    count: 1,
    firstYear: null,
    lastYear: null,
  };
  const input = {
    ...graph,
    nodes: [graph.nodes[0]!, donor, { ...donor, total: 10 }],
    edges: [edge],
  };
  const clean = decodeMoneyGraph(input);
  expect(clean.nodes[1]!.total).toBe(10);
  expect(moneyDecodeLoss(clean).nodes).toBe(1);
  for (const changed of [
    { ...donor, label: 'FIxture donor' },
    { ...donor, byYear: { '2026': [5, 1] } },
    { ...donor, count: 2 },
  ]) {
    const omitted = decodeMoneyGraph({
      ...input,
      nodes: [graph.nodes[0]!, donor, changed, donor],
    });
    expect(omitted.nodes.map((n) => n.id)).toEqual([graph.nodes[0]!.id]);
    expect(omitted.edges).toEqual([]);
    expect(moneyDecodeLoss(omitted)).toMatchObject({ nodes: 3, edges: 1 });
  }
  const repeatedEdges = decodeMoneyGraph({
    ...graph,
    edges: [...graph.edges, graph.edges[0]!],
  });
  expect(repeatedEdges.edges).toHaveLength(graph.edges.length);
  expect(moneyDecodeLoss(repeatedEdges).edges).toBe(1);
  expect(input.nodes).toHaveLength(3);
});
