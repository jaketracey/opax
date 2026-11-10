import { decodeMoneyGraph } from '../src/features/money/data';
import {
  labelSlots,
  NAME_LABELS,
  NEIGHBOUR_LABELS,
  PARTY_LABELS,
  visibleLabels,
  type LabelKind,
  type LabelSlot,
} from '../src/features/money/map/labels';
import { layoutFor } from '../src/features/money/map/layout';
import { buildModel, otherEnd, PARTIES } from '../src/features/money/map/model';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
const model = buildModel(moneyView(graph, defaultMoneyFilters(graph)));
const layout = layoutFor(graph, 402 / 600);
const layoutIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
const toLayout = model.nodes.map((n) => layoutIndex.get(n.id) ?? 0);
const at = (i: number) => ({
  x: layout.x[toLayout[i]!]!,
  y: layout.y[toLayout[i]!]!,
});

const ofKind = (slots: LabelSlot[], kind: LabelKind) =>
  slots.filter((s) => s.kind === kind);
const namedNodes = (slots: LabelSlot[]) =>
  slots.filter((s) => s.node !== undefined).map((s) => s.node!);

describe('labelSlots without a focus', () => {
  const slots = labelSlots(model, layout.centres, at, null);

  test('one cluster slot per non-party cluster, hung from the top of its blob', () => {
    const clusters = ofKind(slots, 'cluster');
    const expected = model.clusters.filter((c) => c.key !== PARTIES);
    expect(clusters.map((s) => s.key)).toEqual(
      expected.map((c) => `cluster:${c.key}`),
    );
    for (const slot of clusters) {
      const key = slot.key.slice('cluster:'.length);
      const centre = layout.centres.get(key)!;
      expect(slot.x).toBe(centre.x);
      expect(slot.y).toBe(centre.y - centre.r);
      expect(slot.node).toBeUndefined();
    }
    expect(clusters.map((s) => s.text)).toEqual(expected.map((c) => c.label));
  });

  test('names the largest parties, up to PARTY_LABELS', () => {
    const parties = ofKind(slots, 'party');
    const all = model.nodes
      .filter((n) => n.kind === 'party')
      .sort((a, b) => b.amount - a.amount);
    expect(parties).toHaveLength(Math.min(PARTY_LABELS, all.length));
    expect(parties.map((s) => s.node)).toEqual(
      all.slice(0, PARTY_LABELS).map((n) => n.index),
    );
  });

  test('names up to NAME_LABELS other discs, largest first, never a party or a withheld donor', () => {
    const names = ofKind(slots, 'name');
    expect(names).toHaveLength(NAME_LABELS);
    const nodes = names.map((s) => model.nodes[s.node!]!);
    for (const n of nodes) {
      expect(n.kind).not.toBe('party');
      expect(n.withheld).toBe(false);
    }
    for (let i = 1; i < nodes.length; i++)
      expect(nodes[i - 1]!.amount).toBeGreaterThanOrEqual(nodes[i]!.amount);
  });

  test('a node slot carries its label, ink, position and radius', () => {
    const slot = ofKind(slots, 'party')[0]!;
    const node = model.nodes[slot.node!]!;
    expect(slot).toEqual({
      key: `party:${node.id}`,
      kind: 'party',
      text: node.label,
      ink: node.ink,
      ...at(node.index),
      r: node.radius,
      node: node.index,
    });
  });

  test('has no focus or neighbour slots, names no node twice and has unique keys', () => {
    expect(ofKind(slots, 'focus')).toHaveLength(0);
    expect(ofKind(slots, 'neighbour')).toHaveLength(0);
    const nodes = namedNodes(slots);
    expect(new Set(nodes).size).toBe(nodes.length);
    expect(new Set(slots.map((s) => s.key)).size).toBe(slots.length);
  });

  test('a cluster without a centre gets no slot', () => {
    const fewer = new Map(layout.centres);
    const dropped = model.clusters.find((c) => c.key !== PARTIES)!.key;
    fewer.delete(dropped);
    const without = labelSlots(model, fewer, at, null);
    expect(without.some((s) => s.key === `cluster:${dropped}`)).toBe(false);
    expect(ofKind(without, 'cluster')).toHaveLength(
      ofKind(slots, 'cluster').length - 1,
    );
  });
});

describe('labelSlots with a focus', () => {
  const party = model.nodes
    .filter((n) => n.kind === 'party')
    .sort((a, b) => b.amount - a.amount)[0]!.index;

  test('the focus slot comes first, then up to NEIGHBOUR_LABELS neighbours in flow order', () => {
    const slots = labelSlots(model, layout.centres, at, party);
    expect(slots[0]!.kind).toBe('focus');
    expect(slots[0]!.node).toBe(party);
    const neighbours = ofKind(slots, 'neighbour');
    const expected: number[] = [];
    for (const i of model.flows[party]!) {
      const other = otherEnd(model.edges[i]!, party);
      if (!expected.includes(other)) expected.push(other);
    }
    expect(neighbours.map((s) => s.node)).toEqual(
      expected.slice(0, NEIGHBOUR_LABELS),
    );
    expect(slots.slice(1, 1 + neighbours.length).map((s) => s.kind)).toEqual(
      neighbours.map(() => 'neighbour'),
    );
  });

  test('no node is named twice: a focused party is not also a party slot, a neighbour is not also a name', () => {
    const slots = labelSlots(model, layout.centres, at, party);
    const nodes = namedNodes(slots);
    expect(new Set(nodes).size).toBe(nodes.length);
    expect(ofKind(slots, 'party').some((s) => s.node === party)).toBe(false);
    expect(ofKind(slots, 'party').length).toBeLessThanOrEqual(PARTY_LABELS);
    expect(ofKind(slots, 'name').length).toBeLessThanOrEqual(NAME_LABELS);
  });

  test('a donor with few flows has as many neighbour slots as distinct neighbours', () => {
    const donor = model.nodes.find(
      (n) =>
        n.kind === 'donor' &&
        model.flows[n.index]!.length > 0 &&
        model.flows[n.index]!.length < NEIGHBOUR_LABELS,
    )!;
    const slots = labelSlots(model, layout.centres, at, donor.index);
    const distinct = new Set(
      model.flows[donor.index]!.map((i) =>
        otherEnd(model.edges[i]!, donor.index),
      ),
    );
    expect(ofKind(slots, 'neighbour')).toHaveLength(distinct.size);
    const nodes = namedNodes(slots);
    expect(new Set(nodes).size).toBe(nodes.length);
  });

  test('a focus index not in the model is ignored', () => {
    const slots = labelSlots(model, layout.centres, at, 99999);
    expect(ofKind(slots, 'focus')).toHaveLength(0);
    expect(slots).toEqual(labelSlots(model, layout.centres, at, null));
  });
});

describe('visibleLabels', () => {
  const camera = { tx: 0, ty: 0, k: 1 };
  const viewport = { width: 400, height: 600 };
  const box = { width: 80, height: 20 };
  const slot = (key: string, kind: LabelKind, x: number, y: number) =>
    ({ key, kind, text: key, ink: '#000', x, y, r: 0 }) satisfies LabelSlot;

  test('keeps every slot whose boxes clear each other and sit on screen', () => {
    const slots = [
      slot('a', 'name', 50, 50),
      slot('b', 'cluster', 200, 50),
      slot('c', 'party', 50, 200),
    ];
    expect(visibleLabels(slots, camera, viewport, box)).toEqual({
      a: 1,
      b: 1,
      c: 1,
    });
  });

  test('of overlapping slots, priority wins: focus, neighbour, party, cluster, name', () => {
    const kinds: LabelKind[] = [
      'name',
      'cluster',
      'party',
      'neighbour',
      'focus',
    ];
    // All at one spot, listed lowest priority first.
    const slots = kinds.map((kind) => slot(kind, kind, 100, 100));
    expect(visibleLabels(slots, camera, viewport, box)).toEqual({ focus: 1 });
    for (let drop = 4; drop > 0; drop--) {
      const rest = slots.slice(0, drop);
      expect(Object.keys(visibleLabels(rest, camera, viewport, box))).toEqual([
        kinds[drop - 1],
      ]);
    }
  });

  test('within one kind, the earlier slot wins an overlap', () => {
    const slots = [
      slot('first', 'name', 100, 100),
      slot('second', 'name', 130, 105),
    ];
    expect(visibleLabels(slots, camera, viewport, box)).toEqual({ first: 1 });
  });

  test('boxes that only overlap on one axis both stay', () => {
    const slots = [
      slot('a', 'name', 100, 100),
      slot('b', 'name', 100 + box.width, 100),
      slot('c', 'name', 100, 100 + box.height),
    ];
    expect(Object.keys(visibleLabels(slots, camera, viewport, box))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('drops slots a box or more off screen; a slot partly off screen stays', () => {
    const slots = [
      slot('left', 'focus', -box.width - 1, 100),
      slot('right', 'focus', viewport.width + box.width + 1, 300),
      slot('above', 'focus', 200, -box.height - 1),
      slot('below', 'focus', 300, viewport.height + box.height + 1),
      slot('edge', 'focus', -box.width / 2, 400),
    ];
    expect(visibleLabels(slots, camera, viewport, box)).toEqual({ edge: 1 });
  });

  test('applies the camera: a slot off screen comes on when the camera pans to it', () => {
    const slots = [slot('far', 'name', 2000, 3000)];
    expect(visibleLabels(slots, camera, viewport, box)).toEqual({});
    expect(
      visibleLabels(slots, { k: 0.1, tx: 0, ty: 0 }, viewport, box),
    ).toEqual({ far: 1 });
    expect(
      visibleLabels(slots, { k: 1, tx: -1900, ty: -2900 }, viewport, box),
    ).toEqual({ far: 1 });
  });

  test('an off-screen slot does not block a lower-priority slot', () => {
    const slots = [
      slot('focus', 'focus', -1000, -1000),
      slot('name', 'name', 100, 100),
    ];
    expect(visibleLabels(slots, camera, viewport, box)).toEqual({ name: 1 });
  });

  test('returns a plain record of keys, and on the real slots keeps the focus', () => {
    const party = model.nodes.find((n) => n.kind === 'party')!.index;
    const slots = labelSlots(model, layout.centres, at, party);
    const p = at(party);
    // Centre the focus on screen.
    const cam = { k: 1, tx: 200 - p.x, ty: 300 - p.y };
    const shown = visibleLabels(slots, cam, viewport, box);
    expect(Object.getPrototypeOf(shown)).toBe(Object.prototype);
    expect(shown[slots[0]!.key]).toBe(1);
    for (const [key, value] of Object.entries(shown)) {
      expect(value).toBe(1);
      expect(slots.some((s) => s.key === key)).toBe(true);
    }
  });
});

test('visibleLabels hides a name that would hang under the panel', () => {
  const slots = [
    { key: 'a', kind: 'name' as const, text: 'A', ink: '#000', x: 100, y: 100, r: 2 },
    { key: 'b', kind: 'name' as const, text: 'B', ink: '#000', x: 100, y: 700, r: 2 },
  ];
  const camera = { tx: 0, ty: 0, k: 1 };
  const box = { width: 120, height: 22 };
  // Without insets both are on screen.
  expect(visibleLabels(slots, camera, { width: 400, height: 800 }, box)).toEqual({ a: 1, b: 1 });
  // A panel 200 points tall covers the second.
  expect(
    visibleLabels(slots, camera, { width: 400, height: 800, insets: { bottom: 200 } }, box),
  ).toEqual({ a: 1 });
});
