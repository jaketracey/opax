/** Local points, in the coordinate space of the enclosing ReservedRegionArea. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** UIKit's frame already includes the hardware region's margins. */
export interface Region extends Rect {
  active: boolean;
}

export interface ReservedRegions {
  divisions: readonly Region[];
  occlusions: readonly Region[];
}

export const emptyReservedRegions: ReservedRegions = {
  divisions: [],
  occlusions: [],
};

export function activeVerticalFold(regions: readonly Region[]): Region | null {
  return regions.find((r) => r.active && r.height > r.width) ?? null;
}

export function activeHorizontalFold(
  regions: readonly Region[],
): Region | null {
  return regions.find((r) => r.active && r.width > r.height) ?? null;
}

export type FoldSides =
  | { leading: Rect; trailing: Rect }
  | { top: Rect; bottom: Rect };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));
const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const area = (r: Rect) => r.width * r.height;
const overlaps = (a: Rect, b: Rect) =>
  a.width > 0 &&
  a.height > 0 &&
  b.width > 0 &&
  b.height > 0 &&
  a.x < right(b) &&
  right(a) > b.x &&
  a.y < bottom(b) &&
  bottom(a) > b.y;

/** The fold's whole strip is excluded; leading/trailing use local x order. */
export function sidesOf(fold: Region, bounds: Rect): FoldSides {
  if (fold.height > fold.width) {
    const start = clamp(fold.x, bounds.x, right(bounds));
    const end = clamp(right(fold), bounds.x, right(bounds));
    return {
      leading: { ...bounds, width: start - bounds.x },
      trailing: { ...bounds, x: end, width: right(bounds) - end },
    };
  }
  const start = clamp(fold.y, bounds.y, bottom(bounds));
  const end = clamp(bottom(fold), bounds.y, bottom(bounds));
  return {
    top: { ...bounds, height: start - bounds.y },
    bottom: { ...bounds, y: end, height: bottom(bounds) - end },
  };
}

function orderedSides(fold: Region, bounds: Rect): [Rect, Rect] {
  const sides = sidesOf(fold, bounds);
  return 'leading' in sides
    ? [sides.leading, sides.trailing]
    : [sides.top, sides.bottom];
}

/** All maximal rectangular spaces around a camera, without double margins. */
function clearSpaces(space: Rect, obstacle: Rect): Rect[] {
  if (!overlaps(space, obstacle)) return [space];
  const x = clamp(obstacle.x, space.x, right(space));
  const endX = clamp(right(obstacle), space.x, right(space));
  const y = clamp(obstacle.y, space.y, bottom(space));
  const endY = clamp(bottom(obstacle), space.y, bottom(space));
  return [
    { ...space, width: x - space.x },
    { ...space, x: endX, width: right(space) - endX },
    { ...space, height: y - space.y },
    { ...space, y: endY, height: bottom(space) - endY },
  ];
}

/**
 * Keep a fixed element's size, moving only when needed. A straddled division
 * favours the larger side (trailing/bottom on a tie), then the least travel
 * outside all active cameras. A clear element stays put. If no clear space
 * can fit it, return its bounds-clamped position without shrinking it.
 */
export function placeClear(
  rect: Rect,
  regions: ReservedRegions,
  bounds: Rect,
): Rect {
  let spaces: { rect: Rect; preference: number[] }[] = [
    { rect: bounds, preference: [] },
  ];
  for (const fold of regions.divisions.filter(
    (r) => r.active && overlaps(r, bounds),
  )) {
    const [leading, trailing] = orderedSides(fold, bounds);
    const preferTrailing = area(trailing) >= area(leading);
    spaces = spaces.flatMap((space) => {
      const sides = orderedSides(fold, space.rect);
      return sides.map((side, index) => ({
        rect: side,
        preference: [
          ...space.preference,
          overlaps(rect, fold) ? Number((index === 1) !== preferTrailing) : 0,
        ],
      }));
    });
  }
  for (const occlusion of regions.occlusions.filter((r) => r.active)) {
    spaces = spaces.flatMap((space) =>
      clearSpaces(space.rect, occlusion).map((rect) => ({ ...space, rect })),
    );
  }
  const within = (space: Rect): Rect => ({
    ...rect,
    x: clamp(rect.x, space.x, right(space) - rect.width),
    y: clamp(rect.y, space.y, bottom(space) - rect.height),
  });
  const distance = (r: Rect) => (r.x - rect.x) ** 2 + (r.y - rect.y) ** 2;
  const candidates = spaces
    .filter(
      (space) =>
        space.rect.width >= rect.width && space.rect.height >= rect.height,
    )
    .map((space) => ({ ...space, placed: within(space.rect) }));
  candidates.sort((a, b) => {
    for (let i = 0; i < a.preference.length; i++) {
      const order = a.preference[i]! - b.preference[i]!;
      if (order) return order;
    }
    return (
      distance(a.placed) - distance(b.placed) ||
      b.placed.x - a.placed.x ||
      b.placed.y - a.placed.y
    );
  });
  return candidates[0]?.placed ?? within(bounds);
}

/** One column remains usable; every multi-column phone grid is even. */
export function evenColumns(count: number): number {
  const whole = Math.max(1, Math.floor(count));
  return whole === 1 ? 1 : whole - (whole % 2);
}
