import {
  array,
  invalid,
  number,
  object,
  shape,
  text,
  nullable,
  optional,
  boolean,
  url,
  type Decoder,
} from './validation';
export type Position = [number, number];
export type Geometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };
const position: Decoder<Position> = (v) => {
  if (!Array.isArray(v) || v.length < 2) invalid('Invalid outline position.');
  const x = number(v[0]),
    y = number(v[1]);
  if (Math.abs(x) > 180 || Math.abs(y) > 90)
    invalid('Invalid outline position.');
  return [x, y];
};
const ring: Decoder<Position[]> = (v) => {
  const r = array(position)(v);
  if (r.length < 4 || r[0]![0] !== r.at(-1)![0] || r[0]![1] !== r.at(-1)![1])
    invalid('Unclosed outline.');
  return r;
};
const polygon: Decoder<Position[][]> = (v) => {
  const p = array(ring)(v);
  if (!p.length) invalid();
  return p;
};
export const decodeGeometry: Decoder<Geometry> = (v) => {
  const g = object(v);
  if (g.type === 'Polygon')
    return { type: 'Polygon', coordinates: polygon(g.coordinates) };
  if (g.type === 'MultiPolygon') {
    const coordinates = array(polygon)(g.coordinates);
    if (!coordinates.length) invalid();
    return { type: 'MultiPolygon', coordinates };
  }
  return invalid('Unsupported outline geometry.');
};
export const decodeBoundary = shape({
  boundary_version_id: text,
  electorate_id: text,
  geometry_kind: text,
  vintage: text,
  crs: nullable(text),
  display_simplified: optional(boolean),
  source_geometry_url: optional(nullable(url)),
  geometry: nullable(decodeGeometry),
  note: optional(text),
  sources: array(text),
});
export type Boundary = ReturnType<typeof decodeBoundary>;
export function displayBoundary(boundaries: Boundary[]) {
  return (
    boundaries.find(
      (b) =>
        b.geometry_kind === 'official' &&
        b.geometry &&
        ['EPSG:4283', 'EPSG:4326'].includes(b.crs ?? ''),
    ) ??
    boundaries.find(
      (b) => b.geometry && ['EPSG:4283', 'EPSG:4326'].includes(b.crs ?? ''),
    )
  );
}
// Official simplified federal display outlines of any vintage. The release
// says which vintage it carries ("2025 election"); see loadOutlines.
export function federalBoundaries(boundaries: Boundary[]) {
  return boundaries.filter(
    (b) =>
      b.geometry_kind === 'official' &&
      b.display_simplified === true &&
      b.geometry &&
      ['EPSG:4283', 'EPSG:4326'].includes(b.crs ?? ''),
  );
}
export const polygons = (g: Geometry): Position[][][] =>
  g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
function inRing([x, y]: Position, r: Position[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!,
      b = r[j]!;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function contains(g: Geometry, p: Position) {
  return polygons(g).some(
    (r) => inRing(p, r[0]!) && !r.slice(1).some((h) => inRing(p, h)),
  );
}
// Local tangent-plane distances in metres: conservative uncertainty, never allocation.
export function borderDistance(g: Geometry, [x, y]: Position) {
  const scaleX = 111320 * Math.cos((y * Math.PI) / 180),
    scaleY = 111320;
  let closest = Infinity;
  for (const r of polygons(g).flat())
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1]!,
        b = r[i]!;
      const ax = (a[0] - x) * scaleX,
        ay = (a[1] - y) * scaleY,
        bx = (b[0] - x) * scaleX,
        by = (b[1] - y) * scaleY;
      const dx = bx - ax,
        dy = by - ay,
        den = dx * dx + dy * dy;
      const t = den ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / den)) : 0;
      closest = Math.min(closest, Math.hypot(ax + t * dx, ay + t * dy));
    }
  return closest;
}
export function outlinePath(g: Geometry, width: number, height: number) {
  const rings = polygons(g).flat(),
    points = rings.flat();
  const midLat = points.reduce((s, p) => s + p[1], 0) / points.length,
    c = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p[0] * c),
    ys = points.map((p) => -p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(
    (width - 32) / Math.max(maxX - minX, 1e-6),
    (height - 32) / Math.max(maxY - minY, 1e-6),
  );
  const ox = (width - (maxX - minX) * scale) / 2,
    oy = (height - (maxY - minY) * scale) / 2;
  return rings
    .map(
      (r) =>
        r
          .map(
            (p, i) =>
              `${i ? 'L' : 'M'} ${(ox + (p[0] * c - minX) * scale).toFixed(2)} ${(oy + (-p[1] - minY) * scale).toFixed(2)}`,
          )
          .join(' ') + ' Z',
    )
    .join(' ');
}
