import { associatedLine, donorAssociated } from '../../../api/associated';
import { partyMapColour } from '../ported/palette';
import type { Insets } from './camera';
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
  /** Register attribution under the selected donor, without shortening its name. */
  sub?: string;
  ink: string;
  /** World position the label hangs from. */
  x: number;
  y: number;
  /**
   * World offset: the disc's radius, so the text sits beside its rim, or
   * further when another disc covers the rim (parties crowd the centre, and
   * a smaller party's name would otherwise start inside its neighbour).
   */
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
    const associated =
      kind === 'focus' && node.kind === 'donor'
        ? associatedLine(donorAssociated(node))
        : null;
    named.add(index);
    return {
      key: `${kind}:${node.id}`,
      kind,
      text: node.label,
      ...(associated ? { sub: associated } : {}),
      // A party's name is set in its colour, darkened to read on paper.
      ink: node.kind === 'party' ? partyMapColour(node.label).ink : node.ink,
      x: p.x,
      y: p.y,
      r: clearRim(model, at, index),
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
  // Party discs carry party colours; the largest are also named beside
  // their discs, so no party is told apart by colour alone.
  const parties = model.nodes
    .filter((n) => n.kind === 'party' && !named.has(n.index))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, PARTY_LABELS);
  for (const party of parties) slots.push(nodeSlot(party.index, 'party'));
  const others = model.nodes
    .filter((n) => n.kind !== 'party' && !named.has(n.index))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, NAME_LABELS);
  for (const node of others) slots.push(nodeSlot(node.index, 'name'));
  return slots;
}

/**
 * Where a disc's name begins, as a distance from its centre: the rim, pushed
 * right past any other disc that covers the point where the name would start.
 */
export function clearRim(
  model: MapModel,
  at: (modelIndex: number) => { x: number; y: number },
  index: number,
): number {
  const node = model.nodes[index]!;
  const p = at(index);
  let r = node.radius;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const other of model.nodes) {
      if (other.index === index) continue;
      const q = at(other.index);
      const dy = q.y - p.y;
      if (Math.abs(dy) >= other.radius) continue;
      const half = Math.sqrt(other.radius * other.radius - dy * dy);
      const start = p.x + r;
      if (q.x - half <= start && q.x + half > start) {
        r = q.x + half - p.x;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return r;
}

/**
 * Greedy de-overlap for a camera: slots in priority order keep their place
 * when their box clears every box already kept and sits on screen. Runs on
 * the UI thread each time the camera moves, so it returns a plain record.
 */
export function visibleLabels(
  slots: readonly LabelSlot[],
  camera: { tx: number; ty: number; k: number },
  viewport: { width: number; height: number; insets?: Insets },
  box: { width: number; height: number },
): Record<string, 1> {
  'worklet';
  const shown: Record<string, 1> = {};
  const keptX: number[] = [];
  const keptY: number[] = [];
  const keptH: number[] = [];
  // Nothing hangs under the panel or a side rail: the map may run beneath
  // them, but a name half under glass reads as a fault. Zero safe sides
  // retain the existing partial off-screen and top-edge visibility.
  const safeLeft = viewport.insets?.left ?? 0;
  const safeRight = viewport.insets?.right ?? 0;
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
        sx > viewport.width + box.width
      )
        continue;
      const lines =
        Math.ceil(slot.text.length / perLine) +
        (slot.sub ? Math.ceil(slot.sub.length / perLine) : 0);
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
      // Its last line must clear the panel's edge, with a little air.
      if (top + h > bottom - 6) continue;
      if (safeLeft > 0 && left < safeLeft + 6) continue;
      if (safeRight > 0 && left + box.width > viewport.width - safeRight - 6)
        continue;
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
