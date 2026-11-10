import { decodeMoneyGraph } from '../src/features/money/data';
import {
  ForceLayout,
  blobRadius,
  clusterCentres,
  layoutBounds,
  layoutFor,
  layoutLinks,
  layoutNodes,
} from '../src/features/money/map/layout';
import { PARTIES } from '../src/features/money/map/scales';
import { pinned } from './pinned';

const federal = decodeMoneyGraph(pinned('/graph/money.json'));

test('two layouts from the same graph tick to identical, finite positions', () => {
  const nodes = layoutNodes(federal),
    links = layoutLinks(federal, nodes);
  const a = new ForceLayout(nodes, links, 402 / 600);
  const b = new ForceLayout(nodes, links, 402 / 600);
  a.tick(40);
  b.tick(40);
  expect(Array.from(a.x)).toEqual(Array.from(b.x));
  expect(Array.from(a.y)).toEqual(Array.from(b.y));
  for (let i = 0; i < a.count; i++) {
    expect(Number.isFinite(a.x[i])).toBe(true);
    expect(Number.isFinite(a.y[i])).toBe(true);
  }
});

test('the federal graph settles within the tick budget in well under a second', () => {
  const nodes = layoutNodes(federal),
    links = layoutLinks(federal, nodes);
  const layout = new ForceLayout(nodes, links, 402 / 600);
  const started = performance.now();
  let ticks = 0;
  while (!layout.tick(1)) ticks++;
  const elapsed = performance.now() - started;
  // Node's JIT is far faster than Hermes; the budget here guards the
  // algorithm (no O(n^2) over 413 nodes per tick), the device run measures.
  expect(ticks).toBeLessThan(320);
  expect(elapsed).toBeLessThan(1000);
  console.info(`layout: ${ticks} ticks in ${elapsed.toFixed(0)} ms`);
});

test('clusters keep their room: no two cluster blobs overlap and the parties sit at the origin', () => {
  const nodes = layoutNodes(federal);
  const layout = new ForceLayout(nodes, layoutLinks(federal, nodes), 1);
  const centres = [...layout.centres.entries()];
  expect(layout.centres.get(PARTIES)).toMatchObject({ x: 0, y: 0 });
  for (let i = 0; i < centres.length; i++)
    for (let j = i + 1; j < centres.length; j++) {
      const [, a] = centres[i]!,
        [, b] = centres[j]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
        (a.r + b.r) * 0.999,
      );
    }
  while (!layout.tick(8));
  // After settling, every node sits near its cluster: cross-cluster flows
  // tug a well-connected donor toward the parties, never out of its cluster.
  nodes.forEach((node, i) => {
    const centre = layout.centres.get(node.cluster)!;
    expect(
      Math.hypot(layout.x[i]! - centre.x, layout.y[i]! - centre.y),
    ).toBeLessThan(centre.r * 1.7);
  });
  const bounds = layoutBounds(layout);
  expect(bounds.maxX - bounds.minX).toBeGreaterThan(100);
  expect(bounds.maxY - bounds.minY).toBeGreaterThan(100);
});

test('a cluster of large discs is at least as wide as its packing', () => {
  expect(blobRadius([70, 65, 10, 3, 3])).toBeGreaterThan(70 + 65);
  expect(blobRadius([2, 2, 2, 2])).toBe(30 * 2 + 34);
});

test('cluster centres are laid out from the caller order and clear the central blob', () => {
  const groups = new Map<string, number[]>([
    [PARTIES, [70, 60, 5]],
    ['finance', Array(53).fill(3)],
    ['unions', Array(31).fill(3)],
    ['other', Array(62).fill(3)],
  ]);
  const centres = clusterCentres(groups, 402 / 600);
  const central = centres.get(PARTIES)!;
  for (const [key, c] of centres) {
    if (key === PARTIES) continue;
    expect(Math.hypot(c.x, c.y)).toBeGreaterThanOrEqual(central.r + c.r);
  }
});

test('one layout is kept per graph object', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.tas.json'));
  expect(layoutFor(graph, 1)).toBe(layoutFor(graph, 2));
  const other = decodeMoneyGraph(pinned('/graph/money.tas.json'));
  expect(layoutFor(other, 1)).not.toBe(layoutFor(graph, 1));
});
