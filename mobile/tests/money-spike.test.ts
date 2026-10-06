import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeMoneyGraph,
  moneyCatalogs,
  type MoneyNode,
} from '../src/features/money/data';
import {
  clusterCentres3D,
  ForceSim3D,
} from '../src/features/money/ported/force3d';
import {
  EDGE_VERTEX_SHADER,
  EDGE_FRAGMENT_SHADER,
} from '../src/features/money/ported/edge-shaders';
import { pinned } from './pinned';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
} from '../src/api/cache';

test('the full pinned graph is accepted and corrupt endpoints or numbers are rejected', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  expect(graph.nodes).toHaveLength(413);
  expect(graph.edges).toHaveLength(1159);
  expect(() =>
    decodeMoneyGraph({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }),
  ).toThrow();
  expect(() =>
    decodeMoneyGraph({
      ...graph,
      edges: [{ ...graph.edges[0], target: 'missing' }],
    }),
  ).toThrow();
  expect(() =>
    decodeMoneyGraph({
      ...graph,
      nodes: [{ ...graph.nodes[0], total: Infinity }],
    }),
  ).toThrow();
});
test('a canonical donor split across name casing and disjoint years retains every disclosed figure and edge', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.tas.json'));
  const first: MoneyNode = {
    id: 'donor:fixture',
    label: 'Fixture donor',
    kind: 'donor',
    industry: 'individual',
    group: 'individuals',
    total: 3700,
    count: 1,
    firstYear: 2025,
    lastYear: 2025,
    byYear: { '2025': [3700, 1] as [number, number] },
  };
  const second = {
    ...first,
    label: 'FIxture donor',
    total: 1401,
    firstYear: 2026,
    lastYear: 2026,
    byYear: { '2026': [1401, 1] as [number, number] },
  };
  const edge = (node: MoneyNode) => ({
    ...node,
    source: node.id,
    target: graph.nodes[0]!.id,
  });
  const input = {
    ...graph,
    nodes: [graph.nodes[0]!, first, second],
    edges: [edge(first), edge(second)],
  };
  const decoded = decodeMoneyGraph(input);
  expect(decoded.nodes).toHaveLength(2);
  expect(decoded.nodes[1]).toMatchObject({
    label: 'Fixture donor',
    total: 5101,
    count: 2,
    firstYear: 2025,
    lastYear: 2026,
    byYear: { '2025': [3700, 1], '2026': [1401, 1] },
  });
  expect(decoded.edges).toBe(input.edges);
  expect(input.nodes).toHaveLength(3);
  for (const ambiguous of [
    {
      ...second,
      byYear: first.byYear,
      total: 3700,
      firstYear: 2025,
      lastYear: 2025,
    },
    { ...second, label: 'Another fixture donor' },
    { ...second, kind: 'party' },
    { ...second, byYear: {} },
    {
      ...second,
      grants: { total: 0, count: 0, firstYear: null, lastYear: null },
    },
  ])
    expect(() =>
      decodeMoneyGraph({ ...input, nodes: [first, ambiguous] }),
    ).toThrow();
});
test('native force layout is reproducible, finite and preserves the web physics', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const groups = new Map<string, number>();
  graph.nodes.forEach((n) =>
    groups.set(n.group, (groups.get(n.group) ?? 0) + 1),
  );
  const create = () =>
    new ForceSim3D({
      nodes: graph.nodes.map((n) => ({ id: n.id, group: n.group, radius: 10 })),
      links: graph.edges,
      layout: 'grouped',
      centres: clusterCentres3D(groups, 1, 'parties'),
    });
  const a = create();
  const b = create();
  a.tick(20);
  b.tick(20);
  expect(a.nodes).toEqual(b.nodes);
  expect(a.nodes.every((n) => [n.x, n.y, n.z].every(Number.isFinite))).toBe(
    true,
  );
});
test('flow shaders are the web shaders, without a network loader', () => {
  const web = readFileSync(
    resolve(__dirname, '../../portal/graph/map3d-engine.ts'),
    'utf8',
  );
  expect(web).toContain(`const EDGE_VERTEX_SHADER = \`${EDGE_VERTEX_SHADER}\``);
  expect(web).toContain(
    `const EDGE_FRAGMENT_SHADER = \`${EDGE_FRAGMENT_SHADER}\``,
  );
  const renderer = readFileSync(
    resolve(__dirname, '../src/features/money/NativeMoneyScene.ts'),
    'utf8',
  );
  expect(renderer).not.toMatch(
    /(?:Loader|fetch|XMLHttpRequest|WebSocket)\s*\(/,
  );
});
test.each(Object.values(moneyCatalogs))(
  'reviewed $path survives an offline read from saved cache',
  async ({ path }) => {
    const graph = pinned(path);
    let offline = false;
    const transport = jest.fn(async () => {
      if (offline) throw new Error('fixture offline');
      return new Response(JSON.stringify(graph), {
        status: 200,
        headers: { 'cache-control': 'max-age=0' },
      });
    });
    const entries = new Map<string, CacheEntry>();
    let index: CacheIndexEntry[] = [];
    const client = new ApiClient({
      origin: 'https://fixture.invalid',
      version: '0.1.0',
      build: '4',
      cache: new CatalogCache({
        readIndex: async () => index,
        writeIndex: async (value) => {
          index = value;
        },
        read: async (url) => entries.get(url),
        write: async (entry) => {
          entries.set(entry.url, entry);
        },
        remove: async (url) => {
          entries.delete(url);
        },
      }),
      transport,
      retries: 0,
    });
    const online = await client.get(path, decodeMoneyGraph);
    offline = true;
    const saved = await client.get(path, decodeMoneyGraph);
    expect(saved.data).toEqual(online.data);
    expect(saved.stale).toBe(true);
    expect(saved.asOf).toBe('2026-09-21');
  },
);

test.each(Object.values(moneyCatalogs))(
  'year cells and public-money blocks are validated for $path',
  ({ path }) => {
    const graph = decodeMoneyGraph(pinned(path));
    expect(graph.nodes.length).toBeGreaterThan(100);
    expect(graph.edges.length).toBeGreaterThan(100);
    for (const fields of [
      { byYear: { '2025': [Infinity, 1] } },
      { undated: [-1, 1] },
      { firstYear: 2025, lastYear: 1998 },
    ]) {
      expect(() =>
        decodeMoneyGraph({
          ...graph,
          nodes: [{ ...graph.nodes[0], ...fields }],
        }),
      ).toThrow();
    }
    expect(() =>
      decodeMoneyGraph({
        ...graph,
        nodes: [
          {
            ...graph.nodes[0],
            grants: { total: NaN, count: 1, firstYear: null, lastYear: null },
          },
        ],
      }),
    ).toThrow();
  },
);
