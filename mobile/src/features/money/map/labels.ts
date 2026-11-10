import type { Centre } from './layout';
import { otherEnd, PARTIES, PUBLIC_MONEY, type MapModel } from './model';

/**
 * Which names the map draws, and where. Slots are chosen on JS when the
 * model or focus changes; the stage positions them on the UI thread.
 */
export type LabelKind =
  | 'cluster'
  | 'hub'
  | 'party'
  | 'name'
  | 'focus'
  | 'neighbour';
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
  // The public-money hubs are named at every zoom: the fan of lines starts
  // there, and a reader should never have to guess where from. Their
  // cluster then needs no second label.
  const hubs = model.nodes
    .filter((n) => n.kind === 'hub' && !named.has(n.index))
    // The hubs share one spot, so the larger register keeps the name.
    .sort((a, b) => b.amount - a.amount);
  for (const hub of hubs) slots.push(nodeSlot(hub.index, 'hub'));
  for (const cluster of model.clusters) {
    if (cluster.key === PARTIES) continue;
    if (cluster.key === PUBLIC_MONEY && hubs.length) continue;
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
  viewport: { width: number; height: number; insets?: { bottom: number } },
  box: { width: number; height: number },
): Record<string, 1> {
  'worklet';
  const shown: Record<string, 1> = {};
  const keptX: number[] = [];
  const keptY: number[] = [];
  const keptH: number[] = [];
  // Nothing hangs under the panel or the tab bar: the map may run beneath
  // them, but a name half under glass reads as a fault.
  const bottom =
    viewport.height - (viewport.insets ? viewport.insets.bottom : 0);
  // A long name wraps inside the box: its height is counted in lines, as
  // the stage lays it out (about 0.3 of the line height a character).
  const perLine = Math.max(4, Math.floor(box.width / (box.height * 0.3)));
  const order = ['focus', 'neighbour', 'hub', 'party', 'cluster', 'name'];
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
        sy > bottom - box.height / 2
      )
        continue;
      const lines = Math.min(3, Math.ceil(slot.text.length / perLine));
      const h = box.height * (lines < 1 ? 1 : lines);
      // The box as the stage lays it out: beside the rim for a disc, centred
      // above the blob for a cluster, the text growing downward from its
      // first line.
      const left =
        slot.kind === 'cluster'
          ? sx - box.width / 2
          : sx + slot.r * camera.k + 6;
      const top =
        slot.kind === 'cluster' ? sy - box.height - 4 : sy - box.height / 2;
      const cy = top + h / 2;
      let clear = true;
      for (let i = 0; i < keptX.length; i++)
        if (
          Math.abs(keptX[i]! - left) < box.width &&
          Math.abs(keptY[i]! - cy) < (keptH[i]! + h) / 2
        ) {
          clear = false;
          break;
        }
      if (!clear) continue;
      keptX.push(left);
      keptY.push(cy);
      keptH.push(h);
      shown[slot.key] = 1;
    }
  }
  return shown;
}
