import type { Centre } from './layout';
import { otherEnd, PARTIES, type MapModel } from './model';

/**
 * Which names the map draws, and where. Slots are chosen on JS when the
 * model or focus changes; the stage positions them on the UI thread.
 */
export type LabelKind = 'cluster' | 'party' | 'name' | 'focus' | 'neighbour';
export interface LabelSlot {
  key: string;
  kind: LabelKind;
  text: string;
  ink: string;
  /** World position the label hangs from. */
  x: number;
  y: number;
  /** World offset: the disc's radius, so the text sits beside its rim. */
  r: number;
  /** A node's model index, where the slot names one. */
  node?: number;
}

/** How many parties are named at once: the largest in view. */
export const PARTY_LABELS = 4;
/** How many other discs are named when zoomed in: the largest in view. */
export const NAME_LABELS = 14;
/** How many of a focus's flows are named beside their discs. */
export const NEIGHBOUR_LABELS = 6;

export function labelSlots(
  model: MapModel,
  centres: ReadonlyMap<string, Centre>,
  at: (modelIndex: number) => { x: number; y: number },
  focus: number | null,
): LabelSlot[] {
  const slots: LabelSlot[] = [];
  const named = new Set<number>();
  const nodeSlot = (index: number, kind: LabelKind): LabelSlot => {
    const node = model.nodes[index]!;
    const p = at(index);
    named.add(index);
    return {
      key: `${kind}:${node.id}`,
      kind,
      text: node.label,
      ink: node.ink,
      x: p.x,
      y: p.y,
      r: node.radius,
      node: index,
    };
  };
  if (focus !== null && model.nodes[focus]) {
    slots.push(nodeSlot(focus, 'focus'));
    const neighbours: number[] = [];
    for (const index of model.flows[focus] ?? []) {
      const other = otherEnd(model.edges[index]!, focus);
      if (!neighbours.includes(other)) neighbours.push(other);
      if (neighbours.length >= NEIGHBOUR_LABELS) break;
    }
    for (const other of neighbours) slots.push(nodeSlot(other, 'neighbour'));
  }
  for (const cluster of model.clusters) {
    if (cluster.key === PARTIES) continue;
    const centre = centres.get(cluster.key);
    if (!centre) continue;
    slots.push({
      key: `cluster:${cluster.key}`,
      kind: 'cluster',
      text: cluster.label,
      ink: cluster.ink,
      x: centre.x,
      y: centre.y - centre.r,
      r: 0,
    });
  }
  // Parties are drawn in one neutral grey: the largest are named beside
  // their discs, so no party is told apart by colour alone.
  const parties = model.nodes
    .filter((n) => n.kind === 'party' && !named.has(n.index))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, PARTY_LABELS);
  for (const party of parties) slots.push(nodeSlot(party.index, 'party'));
  const others = model.nodes
    .filter((n) => n.kind !== 'party' && !n.withheld && !named.has(n.index))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, NAME_LABELS);
  for (const node of others) slots.push(nodeSlot(node.index, 'name'));
  return slots;
}

/**
 * Greedy de-overlap for a camera: slots in priority order keep their place
 * when their box clears every box already kept and sits on screen. Runs on
 * the UI thread each time the camera moves, so it returns a plain record.
 */
export function visibleLabels(
  slots: readonly LabelSlot[],
  camera: { tx: number; ty: number; k: number },
  viewport: { width: number; height: number },
  box: { width: number; height: number },
): Record<string, 1> {
  'worklet';
  const shown: Record<string, 1> = {};
  const keptX: number[] = [];
  const keptY: number[] = [];
  const order = ['focus', 'neighbour', 'party', 'cluster', 'name'];
  for (let o = 0; o < order.length; o++) {
    const kind = order[o];
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s]!;
      if (slot.kind !== kind) continue;
      const sx = slot.x * camera.k + camera.tx;
      const sy = slot.y * camera.k + camera.ty;
      if (
        sx < -box.width ||
        sy < -box.height ||
        sx > viewport.width + box.width ||
        sy > viewport.height + box.height
      )
        continue;
      let clear = true;
      for (let i = 0; i < keptX.length; i++)
        if (
          Math.abs(keptX[i]! - sx) < box.width &&
          Math.abs(keptY[i]! - sy) < box.height
        ) {
          clear = false;
          break;
        }
      if (!clear) continue;
      keptX.push(sx);
      keptY.push(sy);
      shown[slot.key] = 1;
    }
  }
  return shown;
}
