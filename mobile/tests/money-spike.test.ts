import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeMoneyGraph,
  moneyCatalogs,
  moneyDecodeLoss,
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
import { isOrganisationDonor } from '../src/privacy/donorEntity';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
} from '../src/api/cache';

test('a malformed or duplicated row is counted without blanking the valid jurisdiction', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  // 413 nodes and 1,159 edges, with the withheld donors folded into one node
  // per cluster (privacy/donorEntity) and their flows summed per party.
  const raw = pinned('/graph/money.json') as {
    nodes: (MoneyNode & { aliases?: string[] })[];
    edges: { total: number }[];
  };
  const hidden = raw.nodes.filter(
    (n) => n.kind === 'donor' && !isOrganisationDonor(n),
  );
  const clusters = new Set(
    hidden.map((n) => [n.group, n.industry, n.via ?? ''].join('|')),
  ).size;
  expect(raw.nodes).toHaveLength(413);
  expect(raw.edges).toHaveLength(1159);
  expect(graph.nodes).toHaveLength(413 - hidden.length + clusters);
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
    // Withheld donors are folded into a few aggregates, so fewer rows remain.
    expect((pinned(path) as { nodes: unknown[] }).nodes.length).toBeGreaterThan(
      100,
    );
    expect(graph.nodes.length).toBeGreaterThan(50);
    expect((pinned(path) as { edges: unknown[] }).edges.length).toBeGreaterThan(
      100,
    );
    expect(graph.edges.length).toBeGreaterThan(50);
    for (const fields of [
      { byYear: { '2025': [Infinity, 1] } },
      { undated: [-1, 1] },
      { firstYear: 2025, lastYear: 1998 },
    ]) {
      const dropped = decodeMoneyGraph({
        ...graph,
        nodes: [{ ...graph.nodes[0], ...fields }],
      });
      expect(dropped.nodes).toEqual([]);
      expect(moneyDecodeLoss(dropped).nodes).toBe(1);
    }
    const droppedField = decodeMoneyGraph({
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          grants: { total: NaN, count: 1, firstYear: null, lastYear: null },
          colour: 'invalid',
        },
      ],
    });
    expect(droppedField.nodes).toHaveLength(1);
    expect(droppedField.nodes[0]!.grants).toBeUndefined();
    expect(droppedField.nodes[0]!.colour).toBeUndefined();
    expect(moneyDecodeLoss(droppedField).fields).toBe(2);
  },
);
