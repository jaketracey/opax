import {
  contains,
  displayBoundary,
  polygons,
  type Boundary,
  type Geometry,
  type Position,
} from '../../api/electorate-geometry';
import outline from '../today/australia-outline.json';

/**
 * Where an electorate sits in its state (sweep 1 item 8): the state's outline
 * from the bundled Australia drawing (`today/australia-outline.json`, ABS
 * ASGS 2021, the masthead's source) with the electorate as one dot.
 *
 * The drawing is a plain longitude and latitude grid. Its scale is fitted to
 * the state borders it draws (129°E, 138°E, 141°E, 26°S) and the coast's
 * extreme points (Steep Point, Cape Byron, Cape York, South East Cape); every
 * anchor lands within one unit of the 400-unit drawing.
 */
const LON_SCALE = 9.7976;
const LON_OFFSET = -1106.091;
const LAT_SCALE = 10.7856;
const LAT_OFFSET = -113.551;
export function projectToOutline([lon, lat]: Position): Position {
  return [LON_SCALE * lon + LON_OFFSET, -LAT_SCALE * lat + LAT_OFFSET];
}

// ABS state codes in the drawing. An ACT seat draws New South Wales around
// the Territory, as the masthead groups them.
const STATE_CODES: Record<string, readonly string[]> = {
  nsw: ['1'],
  vic: ['2'],
  qld: ['3'],
  sa: ['4'],
  wa: ['5'],
  tas: ['6'],
  nt: ['7'],
  act: ['1', '8'],
};
type Ring = Position[];
const ringCache = new Map<string, Ring[]>();
/** The drawing's rings for one ABS code, parsed from its M/L/Z path once. */
function rings(code: string): Ring[] {
  const cached = ringCache.get(code);
  if (cached) return cached;
  const d = outline.states.find((s) => s.code === code)?.d ?? '';
  const out: Ring[] = [];
  for (const part of d.split(/(?=M)/)) {
    const nums = part.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const ring: Ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2)
      ring.push([nums[i]!, nums[i + 1]!]);
    if (ring.length >= 3) out.push(ring);
  }
  ringCache.set(code, out);
  return out;
}
export function stateRings(state: string): Ring[] {
  return (STATE_CODES[state.toLowerCase()] ?? []).flatMap(rings);
}
function inRing([x, y]: Position, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
/** Whether a drawing point is inside the state as drawn (islands included). */
export function insideState(point: Position, state: string): boolean {
  return stateRings(state).some((ring) => inRing(point, ring));
}
function bounds(points: readonly Position[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}
const area = (ring: Ring) =>
  ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]!;
    return sum + x * ny - nx * y;
  }, 0) / 2;

/**
 * A longitude and latitude inside the electorate: the centroid of its largest
 * part, or, when that falls outside (a crescent), the grid point inside it
 * nearest the centroid.
 */
export function seatPoint(geometry: Geometry): Position | null {
  const largest = polygons(geometry)
    .map((p) => p[0]!)
    .sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  if (!largest || largest.length < 4) return null;
  const a = area(largest);
  let cx = 0,
    cy = 0;
  for (let i = 0; i < largest.length; i++) {
    const [x, y] = largest[i]!;
    const [nx, ny] = largest[(i + 1) % largest.length]!;
    const cross = x * ny - nx * y;
    cx += (x + nx) * cross;
    cy += (y + ny) * cross;
  }
  const centroid: Position = a
    ? [cx / (6 * a), cy / (6 * a)]
    : [largest[0]![0], largest[0]![1]];
  if (contains(geometry, centroid)) return centroid;
  const b = bounds(largest);
  let best: Position | null = null;
  let distance = Infinity;
  const steps = 12;
  for (let i = 1; i < steps; i++)
    for (let j = 1; j < steps; j++) {
      const p: Position = [
        b.minX + ((b.maxX - b.minX) * i) / steps,
        b.minY + ((b.maxY - b.minY) * j) / steps,
      ];
      const d = Math.hypot(p[0] - centroid[0], p[1] - centroid[1]);
      if (d < distance && contains(geometry, p)) {
        best = p;
        distance = d;
      }
    }
  return best ?? centroid;
}

export interface Locator {
  /** The state's outline as an SVG path, fitted to `width` by `height`. */
  path: string;
  width: number;
  height: number;
  /** The electorate's dot, in the same box. */
  dot: Position;
  /** The dot in the Australia drawing's own units, before the fit. */
  at: Position;
}
/**
 * The locator's drawing for an electorate, fitted inside `size` square, or
 * null when it would say nothing: no outline, an unknown state, or a seat
 * that covers nine tenths of its state or more (a Senate or whole-state
 * council electorate, or Lingiari).
 */
export function locatorFor(
  boundaries: Boundary[],
  state: string,
  size = 72,
): Locator | null {
  const geometry = displayBoundary(boundaries)?.geometry;
  const shapes = stateRings(state);
  if (!geometry || !shapes.length) return null;
  const box = bounds(shapes.flat());
  const spanX = box.maxX - box.minX,
    spanY = box.maxY - box.minY;
  // Areas in the drawing's units: outer rings less holes.
  const seatArea = polygons(geometry).reduce(
    (sum, [outer, ...holes]) =>
      sum +
      Math.abs(area(outer!.map(projectToOutline))) -
      holes.reduce(
        (h, ring) => h + Math.abs(area(ring.map(projectToOutline))),
        0,
      ),
    0,
  );
  const stateArea = shapes.reduce((sum, ring) => sum + Math.abs(area(ring)), 0);
  if (stateArea > 0 && seatArea / stateArea >= 0.9) return null;
  const point = seatPoint(geometry);
  if (!point) return null;
  let dot = projectToOutline(point);
  // The drawing is simplified: a seat on the coast can land just offshore.
  // Step towards the state's middle until the dot is on land.
  const middle: Position = [box.minX + spanX / 2, box.minY + spanY / 2];
  for (let i = 0; i < 20 && !insideState(dot, state); i++)
    dot = [
      dot[0] + (middle[0] - dot[0]) * 0.05,
      dot[1] + (middle[1] - dot[1]) * 0.05,
    ];
  const scale = size / Math.max(spanX, spanY, 1e-6);
  const fit = ([x, y]: Position): Position => [
    (x - box.minX) * scale,
    (y - box.minY) * scale,
  ];
  const path = shapes
    .map(
      (ring) =>
        ring
          .map((p, i) => {
            const [x, y] = fit(p);
            return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(' ') + ' Z',
    )
    .join(' ');
  return {
    path,
    width: spanX * scale,
    height: spanY * scale,
    dot: fit(dot),
    at: dot,
  };
}
