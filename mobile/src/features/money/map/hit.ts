/**
 * Tap picking: a uniform grid over the discs. The pick radius grows as the
 * reader zooms out, so a small disc stays tappable at every zoom.
 */
import type { ReservedRegions } from '../../../design/fold';
import { screenToWorld, type Camera } from './camera';

export function blockedMapPoint(
  x: number,
  y: number,
  regions: ReservedRegions,
) {
  return [...regions.divisions, ...regions.occlusions].some(
    (r) =>
      r.active &&
      x >= r.x &&
      x <= r.x + r.width &&
      y >= r.y &&
      y <= r.y + r.height,
  );
}

/** Reserved regions are screen points; disc picking remains in world points. */
export function pickMapPoint(
  hit: HitGrid,
  camera: Camera,
  x: number,
  y: number,
  slack: number,
  regions: ReservedRegions,
) {
  if (blockedMapPoint(x, y, regions)) return null;
  const world = screenToWorld(camera, x, y);
  return hit.pick(world.x, world.y, slack / camera.k);
}

export class HitGrid {
  private readonly cells = new Map<number, number[]>();
  private largest = 0;
  constructor(
    private readonly x: ArrayLike<number>,
    private readonly y: ArrayLike<number>,
    private readonly radius: ArrayLike<number>,
    indices: Iterable<number>,
    private readonly cell = 48,
  ) {
    for (const i of indices) {
      const key = this.key(x[i]!, y[i]!);
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
      if (radius[i]! > this.largest) this.largest = radius[i]!;
    }
  }
  private key(x: number, y: number) {
    return (
      (Math.floor(x / this.cell) + 32768) * 65536 +
      (Math.floor(y / this.cell) + 32768)
    );
  }
  /**
   * The disc under a world point: the nearest whose rim is within `slack`
   * world units of the point (slack is the touch allowance in screen points
   * divided by the zoom). Larger discs win ties by being nearer their rim.
   */
  pick(wx: number, wy: number, slack: number): number | null {
    const reach = Math.ceil((slack + this.largest) / this.cell);
    const gx = Math.floor(wx / this.cell),
      gy = Math.floor(wy / this.cell);
    let best: number | null = null,
      bestDistance = Infinity;
    for (let dx = -reach; dx <= reach; dx++)
      for (let dy = -reach; dy <= reach; dy++) {
        const list = this.cells.get(
          (gx + dx + 32768) * 65536 + (gy + dy + 32768),
        );
        if (!list) continue;
        for (const i of list) {
          const distance =
            Math.hypot(this.x[i]! - wx, this.y[i]! - wy) - this.radius[i]!;
          if (distance <= slack && distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        }
      }
    return best;
  }
}
