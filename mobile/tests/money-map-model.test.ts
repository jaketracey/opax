import { decodeMoneyGraph, type MoneyNode } from '../src/features/money/data';
import {
  buildModel,
  clusterLabel,
  isPublicEdge,
  nextAlongFlows,
  otherEnd,
  type MapEdge,
  type MapModel,
  type MapNode,
} from '../src/features/money/map/model';
import {
  EDGE_CAP,
  EDGE_FLOOR,
  edgeCapAmount,
  edgeWidth,
  PUBLIC_EDGE_CAP,
  publicEdgeCapAmount,
  publicEdgeEquivalent,
  publicEdgeWidth,
  HUB_RADIUS,
  NODE_FLOOR,
  nodeFloorAmount,
  nodeRadius,
  PARTIES,
  PUBLIC_MONEY,
} from '../src/features/money/map/scales';
import {
  defaultMoneyFilters,
  moneyFlowType,
  moneyView,
} from '../src/features/money/view';
import { contrastRatio } from '../src/design/contrast';
import { partyColors } from '../src/design/palette';
import {
  clusterColour,
  inkOn,
  partyMapColour,
  SURFACE,
} from '../src/features/money/ported/palette';
import { pinned } from './pinned';

const federal = decodeMoneyGraph(pinned('/graph/money.json'));
const federalView = moneyView(federal, defaultMoneyFilters(federal));
const model = buildModel(federalView);

describe('buildModel on the federal graph', () => {
  test('has one map node per view node and one map edge per typed view edge', () => {
    expect(model.nodes).toHaveLength(federalView.nodes.length);
    const byId = new Map(federalView.nodes.map((n) => [n.id, n]));
    const typed = federalView.edges.filter((e) => moneyFlowType(e, byId));
    expect(model.edges).toHaveLength(typed.length);
    model.nodes.forEach((n, i) => expect(n.index).toBe(i));
    model.edges.forEach((e, i) => expect(e.index).toBe(i));
  });

  test('maps parties to party, grantors to hub, and every other node to donor', () => {
    const source = new Map(federalView.nodes.map((n) => [n.id, n]));
    for (const node of model.nodes) {
      const raw = source.get(node.id)!;
      expect(node.kind).toBe(
        raw.kind === 'party'
          ? 'party'
          : raw.kind === 'grantor'
            ? 'hub'
            : 'donor',
      );
      expect(node.amount).toBe(raw.total);
    }
    const kinds = new Set(model.nodes.map((n) => n.kind));
    expect(kinds).toEqual(new Set(['party', 'donor', 'hub']));
  });

  test('hubs are a fixed ring with a grants or contracts flow; other discs are sized by amount', () => {
    for (const node of model.nodes) {
      if (node.kind === 'hub') {
        expect(node.radius).toBe(HUB_RADIUS);
        expect(['grants', 'contracts']).toContain(node.flow);
        expect(node.cluster).toBe(PUBLIC_MONEY);
      } else {
        expect(node.radius).toBe(nodeRadius(node.amount));
        expect(node.flow).toBeUndefined();
      }
      if (node.kind === 'party') expect(node.cluster).toBe(PARTIES);
    }
  });

  test('a party disc is its party colour, with a label ink that reads on paper', () => {
    const parties = model.nodes.filter((n) => n.kind === 'party');
    expect(parties.length).toBeGreaterThan(1);
    for (const node of parties) {
      const { colour, ink } = partyMapColour(node.label);
      expect(node.colour).toBe(colour);
      expect(contrastRatio(ink, SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
    // Labor and the Liberals are the app's party dots, not one grey.
    const labor = parties.find((n) => /labor/i.test(n.label));
    const liberal = parties.find((n) => /^liberal/i.test(n.label));
    if (labor) expect(labor.colour).toBe(partyColors.labor);
    if (liberal) expect(liberal.colour).toBe(partyColors.liberal);
    expect(new Set(parties.map((n) => n.colour)).size).toBeGreaterThan(1);
    // An unmapped party takes the app's "other" dot, as its chips do; only a
    // label that is no party at all keeps the neutral grey.
    expect(partyMapColour('Not a party').colour).toBe(partyColors.other);
    expect(partyMapColour('Party not recorded').colour).toBe(
      clusterColour(PARTIES).colour,
    );
  });

  test('inkOn darkens a colour only as far as 4.5:1 on paper needs', () => {
    expect(inkOn('#1D4F91')).toBe('#1d4f91');
    const lnp = inkOn(partyColors.lnp);
    expect(lnp).not.toBe(partyColors.lnp.toLowerCase());
    expect(contrastRatio(lnp, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lnp, SURFACE)).toBeLessThan(5.2);
  });

  test('byId maps every node id to its index', () => {
    expect(model.byId.size).toBe(model.nodes.length);
    for (const node of model.nodes)
      expect(model.byId.get(node.id)).toBe(node.index);
  });

  test('clusters put the parties first, then by size, and hold every node once', () => {
    expect(model.clusters[0]!.key).toBe(PARTIES);
    expect(model.clusters[0]!.label).toBe('Parties');
    const rest = model.clusters.slice(1);
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i - 1]!,
        b = rest[i]!;
      expect(a.nodes.length).toBeGreaterThanOrEqual(b.nodes.length);
      if (a.nodes.length === b.nodes.length)
        expect(a.key.localeCompare(b.key, 'en-AU')).toBeLessThan(0);
    }
    const members = model.clusters.flatMap((c) => c.nodes);
    expect(members.sort((a, b) => a - b)).toEqual(
      model.nodes.map((n) => n.index),
    );
    for (const cluster of model.clusters)
      for (const i of cluster.nodes)
        expect(model.nodes[i]!.cluster).toBe(cluster.key);
  });

  test("each node's flows are its own edges, strongest first", () => {
    let total = 0;
    model.flows.forEach((list, node) => {
      total += list.length;
      for (const index of list) {
        const edge = model.edges[index]!;
        expect(edge.a === node || edge.b === node).toBe(true);
      }
      for (let i = 1; i < list.length; i++)
        expect(model.edges[list[i - 1]!]!.amount).toBeGreaterThanOrEqual(
          model.edges[list[i]!]!.amount,
        );
    });
    // Every edge is listed at both of its ends.
    expect(total).toBe(model.edges.length * 2);
  });

  test('an edge runs from source to target, takes its source colour and is sized by amount', () => {
    for (const edge of model.edges) {
      expect(edge.width).toBe(
        edge.type === 'donations'
          ? edgeWidth(edge.amount)
          : publicEdgeWidth(edge.amount),
      );
      expect(isPublicEdge(edge)).toBe(edge.type !== 'donations');
      expect(edge.colour).toBe(model.nodes[edge.a]!.colour);
      if (edge.type === 'donations') {
        expect(model.nodes[edge.a]!.kind).toBe('donor');
        expect(model.nodes[edge.b]!.kind).toBe('party');
      } else expect(model.nodes[edge.a]!.kind).toBe('hub');
    }
  });

  test('totals by flow type equal the sums of the view edges by moneyFlowType', () => {
    const byId = new Map<string, MoneyNode>(
      federalView.nodes.map((n) => [n.id, n]),
    );
    const sums = { donations: 0, grants: 0, contracts: 0 };
    for (const e of federalView.edges) {
      const type = moneyFlowType(e, byId);
      if (type) sums[type] += e.total;
    }
    expect(model.totals).toEqual(sums);
    expect(model.totals.donations).toBeGreaterThan(0);
    expect(model.totals.grants).toBeGreaterThan(0);
    expect(model.totals.contracts).toBeGreaterThan(0);
  });

  test('the states build too, and a state without public money has no hubs and zero public totals', () => {
    for (const file of [
      '/graph/money.qld.json',
      '/graph/money.vic.json',
      '/graph/money.tas.json',
    ]) {
      const graph = decodeMoneyGraph(pinned(file));
      const m = buildModel(moneyView(graph, defaultMoneyFilters(graph)));
      expect(m.nodes.length).toBeGreaterThan(0);
      expect(m.clusters[0]!.key).toBe(PARTIES);
      if (!m.nodes.some((n) => n.kind === 'hub')) {
        expect(m.totals.grants).toBe(0);
        expect(m.totals.contracts).toBe(0);
      }
    }
  });
});

describe('scales', () => {
  test('a disc never drops below the floor, and nothing is negative', () => {
    expect(nodeRadius(0)).toBe(NODE_FLOOR);
    expect(nodeRadius(-5e6)).toBe(NODE_FLOOR);
    expect(nodeRadius(1000)).toBe(NODE_FLOOR);
  });

  test('disc area is proportional to the amount above the floor', () => {
    for (const x of [1e6, 3.3e7, 1e8, 2.5e8]) {
      expect(nodeRadius(x)).toBeGreaterThan(NODE_FLOOR);
      expect(nodeRadius(4 * x)).toBeCloseTo(2 * nodeRadius(x), 9);
      expect(nodeRadius(9 * x)).toBeCloseTo(3 * nodeRadius(x), 9);
    }
    // The scale's anchor: a $1.12bn party is 70 world units.
    expect(nodeRadius(1.12e9)).toBeCloseTo(70, 9);
  });

  test('nodeFloorAmount is where a disc leaves the floor', () => {
    const floor = nodeFloorAmount();
    expect(nodeRadius(floor)).toBeCloseTo(NODE_FLOOR, 9);
    expect(nodeRadius(floor * 0.9)).toBe(NODE_FLOOR);
    expect(nodeRadius(floor * 1.1)).toBeGreaterThan(NODE_FLOOR);
    // The legend states this as "about $400,000".
    expect(floor).toBeGreaterThan(3.5e5);
    expect(floor).toBeLessThan(5e5);
  });

  test('a line has a floor and a cap, and edgeCapAmount is where it reaches the cap', () => {
    expect(edgeWidth(0)).toBe(EDGE_FLOOR);
    expect(edgeWidth(-1)).toBe(EDGE_FLOOR);
    expect(edgeWidth(1e13)).toBe(EDGE_CAP);
    expect(edgeWidth(1.28e8)).toBeCloseTo(10, 9);
    const cap = edgeCapAmount();
    expect(edgeWidth(cap)).toBeCloseTo(EDGE_CAP, 9);
    expect(edgeWidth(cap * 0.9)).toBeLessThan(EDGE_CAP);
    expect(edgeWidth(cap * 1.1)).toBe(EDGE_CAP);
    // Between floor and cap, width goes with the square root of the amount.
    expect(edgeWidth(4e7)).toBeCloseTo(2 * edgeWidth(1e7), 9);
  });
});

describe('nextAlongFlows', () => {
  // A small hand-built model: 0 gives to 1 (strongest) and 2; 1 gets from 3.
  const node = (index: number): MapNode => ({
    index,
    id: `n${index}`,
    label: `Node ${index}`,
    kind: index === 1 ? 'party' : 'donor',
    cluster: index === 1 ? PARTIES : 'finance',
    amount: 1,
    count: 1,
    firstYear: 2020,
    lastYear: 2020,
    radius: 2,
    colour: '#000',
    ink: '#000',
  });
  const edge = (index: number, a: number, b: number, amount: number) =>
    ({
      index,
      a,
      b,
      amount,
      count: 1,
      width: 1,
      colour: '#000',
      type: 'donations',
      firstYear: 2020,
      lastYear: 2020,
    }) satisfies MapEdge;
  const edges = [edge(0, 0, 1, 500), edge(1, 0, 2, 100), edge(2, 3, 1, 300)];
  const small: MapModel = {
    nodes: [0, 1, 2, 3].map(node),
    edges,
    clusters: [],
    byId: new Map([0, 1, 2, 3].map((i) => [`n${i}`, i])),
    flows: [[0, 1], [0, 2], [1], [2]],
    totals: { donations: 900, grants: 0, contracts: 0 },
  };

  test('walks the strongest flow not already in the trail', () => {
    expect(nextAlongFlows(small, 0, [0])).toBe(1);
    expect(nextAlongFlows(small, 1, [0, 1])).toBe(3);
    expect(nextAlongFlows(small, 0, [0, 1])).toBe(2);
  });

  test('returns null when every flow leads back along the trail', () => {
    expect(nextAlongFlows(small, 3, [0, 1, 3])).toBeNull();
    expect(nextAlongFlows(small, 0, [0, 1, 2])).toBeNull();
  });

  test('returns null for a node with no flows or out of range', () => {
    const lonely: MapModel = { ...small, flows: [[], [], [], []] };
    expect(nextAlongFlows(lonely, 0, [])).toBeNull();
    expect(nextAlongFlows(small, 99, [])).toBeNull();
  });

  test('on the federal map, a walk from the largest party visits distinct nodes and ends', () => {
    const start = model.nodes
      .filter((n) => n.kind === 'party')
      .sort((a, b) => b.amount - a.amount)[0]!.index;
    const first = nextAlongFlows(model, start, [start]);
    // The first step is the other end of the party's strongest flow.
    expect(first).toBe(otherEnd(model.edges[model.flows[start]![0]!]!, start));
    const trail = [start];
    let at: number | null = start;
    while (at !== null && trail.length < model.nodes.length + 1) {
      at = nextAlongFlows(model, at, trail);
      if (at !== null) {
        expect(trail).not.toContain(at);
        trail.push(at);
      }
    }
    expect(at).toBeNull();
  });
});

test('clusterLabel names the parties, public money and each industry', () => {
  expect(clusterLabel(PARTIES)).toBe('Parties');
  expect(clusterLabel(PUBLIC_MONEY)).toBe('Public money');
  expect(clusterLabel('mining & energy')).toBe('Mining and energy');
  expect(clusterLabel('health_pharma')).toBe('Health pharma');
  expect(clusterLabel('finance')).toBe('Finance');
});

describe('the public money scale', () => {
  test('is lighter than the donation scale, with the same floor and its own cap', () => {
    expect(publicEdgeWidth(0)).toBe(EDGE_FLOOR);
    expect(publicEdgeWidth(-1)).toBe(EDGE_FLOOR);
    expect(publicEdgeWidth(1e9)).toBeCloseTo(6, 9);
    expect(publicEdgeWidth(1e13)).toBe(PUBLIC_EDGE_CAP);
    const cap = publicEdgeCapAmount();
    expect(publicEdgeWidth(cap)).toBeCloseTo(PUBLIC_EDGE_CAP, 9);
    expect(publicEdgeWidth(cap * 0.9)).toBeLessThan(PUBLIC_EDGE_CAP);
    // Square-root law: four times the money, twice the width.
    expect(publicEdgeWidth(4e8)).toBeCloseTo(2 * publicEdgeWidth(1e8), 9);
    for (const amount of [1e6, 1e8, 1e9, 1e10])
      expect(publicEdgeWidth(amount)).toBeLessThan(edgeWidth(amount));
  });
  test('states the donation a public line is as wide as', () => {
    const equivalent = publicEdgeEquivalent(1e9);
    expect(edgeWidth(equivalent)).toBeCloseTo(publicEdgeWidth(1e9), 9);
    expect(equivalent).toBeGreaterThan(4e7);
    expect(equivalent).toBeLessThan(5e7);
  });
  test('the federal map draws its contract lines on the public scale', () => {
    const publicEdges = model.edges.filter(isPublicEdge);
    expect(publicEdges.length).toBeGreaterThan(0);
    for (const edge of publicEdges)
      expect(edge.width).toBeLessThanOrEqual(PUBLIC_EDGE_CAP);
  });
});
