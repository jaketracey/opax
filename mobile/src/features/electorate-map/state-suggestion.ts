import type { Electorate } from '../../api/catalogs';
import {
  borderDistance,
  contains,
  type Geometry,
  type Position,
} from '../../api/electorate-geometry';
import {
  APPROXIMATE_ACCURACY,
  APPROXIMATE_SEATS,
  BORDER_SEATS,
  nearby,
} from './suggestion';

/**
 * The bundled state and territory district outlines
 * (scripts/generate-state-outlines.mjs): ABS SED statistical approximations
 * from the dated release, rings as integer deltas in 1/precision degrees.
 */
export interface StateOutlineFile {
  schema: 1;
  release_id: string;
  vintage: string;
  geometry_kind: 'statistical';
  source: { label: string; url: string; licence: string };
  precision: number;
  seats: Record<string, number[][][]>;
}
export type StateSuggestion =
  | { kind: 'suggested'; seat: Electorate; vintage: string }
  | { kind: 'border'; seats: Electorate[]; vintage: string }
  | { kind: 'approximate'; seats: Electorate[]; vintage: string }
  | { kind: 'no-match' | 'unavailable' | 'denied' };

let bundled: StateOutlineFile | undefined;
/** Read on the first "Use my location" tap, never at launch (0.9 MB). */
export function stateOutlineFile(): StateOutlineFile {
  bundled ??= require('./state-outlines.json') as StateOutlineFile;
  return bundled;
}

export function decodeStateOutline(
  polygons: number[][][],
  precision: number,
): Geometry {
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map((rings) =>
      rings.map((flat) => {
        const ring: Position[] = [];
        let x = 0,
          y = 0;
        for (let i = 0; i + 1 < flat.length; i += 2) {
          x += flat[i]!;
          y += flat[i + 1]!;
          ring.push([x / precision, y / precision]);
        }
        return ring;
      }),
    ),
  };
}

/**
 * The state district a fix falls in, among the seats the chooser offers.
 * The outlines are simplified by up to 0.003° (about 330 m), and iOS accuracy
 * is a 68% radius: the two add, so anything that close to a line is a border.
 * A seat the bundle does not hold (a later release) cannot be ruled out, so
 * "nothing matches" is then unavailable, not untrue.
 *
 * As for federal seats (suggestion.ts): near a line the nearest districts
 * (up to three, A to Z) are offered as rows; a fix over 1 km is approximate
 * with Precise Location off (`reduced`), otherwise unavailable.
 */
export function suggestState(
  seats: Electorate[],
  point: Position,
  accuracy: number | null,
  outlines: StateOutlineFile = stateOutlineFile(),
  reduced = false,
): StateSuggestion {
  if (
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]) ||
    Math.abs(point[0]) > 180 ||
    Math.abs(point[1]) > 90 ||
    accuracy === null ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    return { kind: 'unavailable' };
  const districts = seats.filter(
    (s) => s.status === 'current' && s.jurisdiction !== 'federal',
  );
  const held = districts.filter((s) => outlines.seats[s.electorate_id]);
  if (!held.length) return { kind: 'unavailable' };
  const shapes = held.map((seat) => ({
    seat,
    geometry: decodeStateOutline(
      outlines.seats[seat.electorate_id]!,
      outlines.precision,
    ),
  }));
  // Upper-house regions have no outline here; districts the bundle lacks
  // might hold the fix.
  const lower = districts.filter((s) => !/_lc$/.test(s.chamber));
  const none = {
    kind: held.length < lower.length ? 'unavailable' : 'no-match',
  } as const;
  const vintage = outlines.vintage;
  if (accuracy > APPROXIMATE_ACCURACY) {
    if (!reduced) return { kind: 'unavailable' };
    const near = nearby(shapes, point, accuracy, APPROXIMATE_SEATS);
    return near.length ? { kind: 'approximate', seats: near, vintage } : none;
  }
  const margin = 350 + Math.max(250, accuracy);
  const matches = shapes.filter((s) => contains(s.geometry, point));
  if (
    shapes.some((s) => borderDistance(s.geometry, point) <= margin) ||
    matches.length > 1
  )
    return {
      kind: 'border',
      seats: nearby(shapes, point, margin, BORDER_SEATS),
      vintage,
    };
  if (matches.length === 1)
    return { kind: 'suggested', seat: matches[0]!.seat, vintage };
  return none;
}
