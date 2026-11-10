import { Skia } from '@shopify/react-native-skia';
import { decodeMoneyGraph, type MoneyGraph } from '../src/features/money/data';
import { layoutBounds, layoutFor } from '../src/features/money/map/layout';
import {
  buildModel,
  isPublicEdge,
  type MapModel,
} from '../src/features/money/map/model';
import {
  countingPainter,
  paintEdges,
  paintFocus,
  paintNodes,
  paintOverview,
  SMALL_NODE,
  THIN_EDGE,
  type Painter,
  type PositionOf,
} from '../src/features/money/map/scene';
import { recordPicture } from '../src/features/money/map/skia-painter';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

const PAPER = '#fbfaf7';
const INK = '#1c1b19';

/** As MoneyMap.tsx: the model's index is for the view, the layout's for the graph. */
function setup(graph: MoneyGraph) {
  const model = buildModel(moneyView(graph, defaultMoneyFilters(graph)));
  const layout = layoutFor(graph, 402 / 600);
  const layoutIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const toLayout = model.nodes.map((n) => layoutIndex.get(n.id) ?? 0);
  const at: PositionOf = (i) => {
    const li = toLayout[i] ?? 0;
    return { x: layout.x[li]!, y: layout.y[li]! };
  };
  return { model, layout, toLayout, at };
}

const federal = setup(decodeMoneyGraph(pinned('/graph/money.json')));
const { model, at } = federal;

/** A painter that records every call with its arguments. */
function recordingPainter() {
  const calls: { op: keyof Painter; args: unknown[] }[] = [];
  const painter: Painter = {
    circle: (...args) => void calls.push({ op: 'circle', args }),
    ring: (...args) => void calls.push({ op: 'ring', args }),
    line: (...args) => void calls.push({ op: 'line', args }),
  };
  return { painter, calls };
}

describe('paintEdges', () => {
  const donations = model.edges.filter((e) => !isPublicEdge(e));
  const publicEdges = model.edges.filter(isPublicEdge);

  test('draws exactly one tier, and the three tiers together are every edge', () => {
    const thin = countingPainter(),
      thick = countingPainter(),
      pub = countingPainter();
    const drawnThin = paintEdges(thin.painter, model, at, 'thin');
    const drawnThick = paintEdges(thick.painter, model, at, 'thick');
    const drawnPublic = paintEdges(pub.painter, model, at, 'public');
    const expectedThin = donations.filter((e) => e.width < THIN_EDGE).length;
    expect(drawnThin).toBe(expectedThin);
    expect(drawnThick).toBe(donations.length - expectedThin);
    expect(drawnPublic).toBe(publicEdges.length);
    expect(drawnThin + drawnThick + drawnPublic).toBe(model.edges.length);
    expect(thin.counts).toEqual({ circles: 0, rings: 0, lines: drawnThin });
    expect(thick.counts).toEqual({ circles: 0, rings: 0, lines: drawnThick });
    expect(pub.counts).toEqual({ circles: 0, rings: 0, lines: drawnPublic });
    // The federal map has all three tiers, so the split is a real one.
    expect(drawnThin).toBeGreaterThan(0);
    expect(drawnThick).toBeGreaterThan(0);
    expect(drawnPublic).toBeGreaterThan(0);
  });

  test('public money lines are the quieter register: beneath the donations, never as strong', () => {
    const pub = recordingPainter(),
      don = recordingPainter();
    paintEdges(pub.painter, model, at, 'public');
    paintEdges(don.painter, model, at, 'thick');
    const publicAlpha = pub.calls[0]!.args[6] as number;
    const donationAlpha = don.calls[0]!.args[6] as number;
    expect(publicAlpha).toBeLessThan(donationAlpha);
    for (const call of pub.calls) {
      expect(call.args[6]).toBe(publicAlpha);
      // Each public line is one of the public edges, at its own width.
      const width = call.args[4] as number;
      expect(publicEdges.some((e) => e.width === width)).toBe(true);
    }
  });

  test('honours the skip set', () => {
    const thick = donations.filter((e) => e.width >= THIN_EDGE);
    const thin = donations.filter((e) => e.width < THIN_EDGE);
    const skip = new Set([thick[0]!.index, thick[1]!.index, thin[0]!.index]);
    const a = countingPainter(),
      b = countingPainter();
    expect(paintEdges(a.painter, model, at, 'thick', skip)).toBe(
      thick.length - 2,
    );
    expect(paintEdges(b.painter, model, at, 'thin', skip)).toBe(
      thin.length - 1,
    );
  });

  test('draws each line between its two ends at its own width and colour', () => {
    const { painter, calls } = recordingPainter();
    paintEdges(painter, model, at, 'thick');
    const first = model.edges.find(
      (e) => !isPublicEdge(e) && e.width >= THIN_EDGE,
    )!;
    const a = at(first.a),
      b = at(first.b);
    expect(calls[0]).toEqual({
      op: 'line',
      args: [a.x, a.y, b.x, b.y, first.width, first.colour, expect.any(Number)],
    });
  });
});

describe('paintNodes', () => {
  const small = model.nodes.filter((n) => n.radius < SMALL_NODE);
  const large = model.nodes.filter((n) => n.radius >= SMALL_NODE);
  const hubs = (list: typeof model.nodes) =>
    list.filter((n) => n.kind === 'hub').length;

  test('the two tiers together draw every node once', () => {
    const a = countingPainter(),
      b = countingPainter();
    const s = paintNodes(a.painter, model, at, 'small', PAPER);
    const l = paintNodes(b.painter, model, at, 'large', PAPER);
    expect(s).toBe(small.length);
    expect(l).toBe(large.length);
    expect(s + l).toBe(model.nodes.length);
    expect(a.counts.lines + b.counts.lines).toBe(0);
  });

  test('small discs are one circle each; hubs are a ring and a paper disc', () => {
    const { painter, counts } = countingPainter();
    paintNodes(painter, model, at, 'small', PAPER);
    // A hub is HUB_RADIUS (16), so it is never in the small tier.
    expect(hubs(small)).toBe(0);
    expect(counts).toEqual({ circles: small.length, rings: 0, lines: 0 });
  });

  test('large discs are a circle plus a hairline ring; hubs a ring plus a paper disc', () => {
    const { painter, counts } = countingPainter();
    paintNodes(painter, model, at, 'large', PAPER);
    expect(hubs(large)).toBeGreaterThan(0);
    // Each large node, hub or disc, is exactly one circle and one ring.
    expect(counts).toEqual({
      circles: large.length,
      rings: large.length,
      lines: 0,
    });
  });

  test('a hub paints its ring in its own colour and then a paper disc inside it', () => {
    const { painter, calls } = recordingPainter();
    paintNodes(painter, model, at, 'large', PAPER);
    const hub = model.nodes.find((n) => n.kind === 'hub')!;
    const p = at(hub.index);
    const i = calls.findIndex(
      (c) =>
        c.op === 'ring' &&
        c.args[0] === p.x &&
        c.args[1] === p.y &&
        c.args[4] === hub.colour,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    expect(calls[i]!.args[2]).toBe(hub.radius);
    expect(calls[i + 1]!.op).toBe('circle');
    expect(calls[i + 1]!.args[3]).toBe(PAPER);
    expect(calls[i + 1]!.args[2]).toBeLessThan(hub.radius);
  });

  test('honours the skip set', () => {
    const skip = new Set([large[0]!.index, small[0]!.index]);
    const a = countingPainter(),
      b = countingPainter();
    expect(paintNodes(a.painter, model, at, 'large', PAPER, skip)).toBe(
      large.length - 1,
    );
    expect(paintNodes(b.painter, model, at, 'small', PAPER, skip)).toBe(
      small.length - 1,
    );
  });
});

describe('paintFocus', () => {
  const neighboursOf = (m: MapModel, focus: number) =>
    new Set(
      (m.flows[focus] ?? []).map((i) => {
        const e = m.edges[i]!;
        return e.a === focus ? e.b : e.a;
      }),
    );

  test('draws the node, each of its flows, each neighbour once and one halo ring', () => {
    // The largest party: many flows, all from donor discs.
    const focus = model.nodes
      .filter((n) => n.kind === 'party')
      .sort((a, b) => b.amount - a.amount)[0]!.index;
    const neighbours = neighboursOf(model, focus);
    const { painter, counts } = countingPainter();
    const drawn = paintFocus(painter, model, at, focus, INK, PAPER);
    expect(drawn).toEqual({
      nodes: neighbours.size + 1,
      edges: model.flows[focus]!.length,
    });
    const hubNeighbours = [...neighbours].filter(
      (i) => model.nodes[i]!.kind === 'hub',
    ).length;
    expect(counts.lines).toBe(model.flows[focus]!.length);
    // Each neighbour: a disc and a hairline ring (hub: ring and paper disc).
    // The focus: one disc. The halo: one ring.
    expect(counts.circles).toBe(neighbours.size + 1);
    expect(counts.rings).toBe(neighbours.size + 1);
    expect(hubNeighbours).toBe(0);
  });

  test('the last call is the ink halo, just outside the focus rim', () => {
    const focus = model.nodes.find((n) => n.kind === 'donor')!.index;
    const { painter, calls } = recordingPainter();
    paintFocus(painter, model, at, focus, INK, PAPER);
    const halo = calls.at(-1)!;
    const p = at(focus);
    expect(halo.op).toBe('ring');
    expect(halo.args[0]).toBe(p.x);
    expect(halo.args[1]).toBe(p.y);
    expect(halo.args[2]).toBeGreaterThan(model.nodes[focus]!.radius);
    expect(halo.args[4]).toBe(INK);
    expect(calls.filter((c) => c.args.includes(INK))).toHaveLength(1);
  });

  test('a focused hub is drawn as a ring and paper disc, plus the halo', () => {
    const focus = model.nodes.find((n) => n.kind === 'hub')!.index;
    const neighbours = neighboursOf(model, focus);
    const { painter, counts } = countingPainter();
    const drawn = paintFocus(painter, model, at, focus, INK, PAPER);
    expect(drawn.nodes).toBe(neighbours.size + 1);
    expect(counts.lines).toBe(model.flows[focus]!.length);
    // Neighbours (donors): circle + ring each. Hub: ring + paper. Halo: ring.
    expect(counts.circles).toBe(neighbours.size + 1);
    expect(counts.rings).toBe(neighbours.size + 2);
  });

  test('a focus not in the model draws nothing', () => {
    const { painter, counts } = countingPainter();
    expect(paintFocus(painter, model, at, 99999, INK, PAPER)).toEqual({
      nodes: 0,
      edges: 0,
    });
    expect(counts).toEqual({ circles: 0, rings: 0, lines: 0 });
  });
});

test('paintOverview draws one circle per cluster', () => {
  const { layout } = federal;
  const blobs = [...layout.centres.values()].map((c, i) => ({
    ...c,
    colour: model.clusters[i % model.clusters.length]!.colour,
  }));
  const { painter, counts } = countingPainter();
  expect(paintOverview(painter, blobs)).toBe(blobs.length);
  expect(counts).toEqual({ circles: blobs.length, rings: 0, lines: 0 });
  expect(blobs.length).toBe(layout.centres.size);
  expect(paintOverview(countingPainter().painter, [])).toBe(0);
});

test('recordPicture captures every draw call the painter makes into the Skia picture', () => {
  const { toLayout, layout } = federal;
  const bounds = layoutBounds(layout, toLayout);
  const { painter, counts } = countingPainter();
  paintNodes(painter, model, at, 'large', PAPER);
  const picture = recordPicture(bounds, (p) =>
    paintNodes(p, model, at, 'large', PAPER),
  ) as unknown as { calls: number };
  expect(picture.calls).toBe(counts.circles + counts.rings + counts.lines);
  expect(Skia.PictureRecorder).toBeDefined();
});

test('a state map with no public money paints without hubs', () => {
  const tas = setup(decodeMoneyGraph(pinned('/graph/money.tas.json')));
  const { painter, counts } = countingPainter();
  const drawn =
    paintNodes(painter, tas.model, tas.at, 'small', PAPER) +
    paintNodes(painter, tas.model, tas.at, 'large', PAPER);
  expect(drawn).toBe(tas.model.nodes.length);
  expect(tas.model.nodes.some((n) => n.kind === 'hub')).toBe(false);
  expect(counts.circles).toBe(tas.model.nodes.length);
});
