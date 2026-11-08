import type { Electorate, ElectorateDetail } from '../../api/catalogs';
import {
  borderDistance,
  contains,
  federalBoundaries,
  type Boundary,
  type Geometry,
  type Position,
} from '../../api/electorate-geometry';
export interface Outline {
  seat: Electorate;
  geometry: Geometry;
}
export interface OutlineSet {
  outlines: Outline[];
  /** The release's federal display vintage, from the data ("2025 election"). */
  vintage: string;
  /** Current seats with no usable outline of that vintage: skipped, logged. */
  skipped: string[];
}
/**
 * What one fix says. `border`: the fix is within the margin of a line, so
 * the nearest seats (at most three, A to Z) are offered and the reader picks.
 * `approximate`: Precise Location is off for OPAX, so the fix is a wide
 * circle; the seats inside it are offered (at most five, A to Z) and the
 * reader is told how to turn precision on (first-launch 4.3, S8).
 */
export type Suggestion =
  | { kind: 'suggested'; seat: Electorate; vintage: string }
  | { kind: 'border'; seats: Electorate[]; vintage: string }
  | { kind: 'approximate'; seats: Electorate[]; vintage: string }
  | { kind: 'no-match' | 'unavailable' | 'denied' };
/** A fix wider than this is not used to find one seat. */
export const APPROXIMATE_ACCURACY = 1000;
const BORDER_SEATS = 3;
const APPROXIMATE_SEATS = 5;
/** The nearest `limit` outlines within `within` metres, then A to Z. */
function nearby(
  outlines: Outline[],
  point: Position,
  within: number,
  limit: number,
): Electorate[] {
  return (
    outlines
      .map((o) => ({
        seat: o.seat,
        distance: contains(o.geometry, point)
          ? 0
          : borderDistance(o.geometry, point),
      }))
      .filter((o) => o.distance <= within)
      .sort(
        (a, b) =>
          a.distance - b.distance || a.seat.name.localeCompare(b.seat.name),
      )
      // Overlapping outlines of one seat list it once, at its nearest.
      .filter(
        (o, i, all) =>
          all.findIndex(
            (p) => p.seat.electorate_id === o.seat.electorate_id,
          ) === i,
      )
      .slice(0, limit)
      .map((o) => o.seat)
      .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'))
  );
}
export async function loadOutlines(
  seats: Electorate[],
  load: (path: string) => Promise<{ data: ElectorateDetail }>,
  progress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<OutlineSet> {
  const federal = seats.filter(
    (s) =>
      s.jurisdiction === 'federal' &&
      s.chamber === 'representatives' &&
      s.status === 'current',
  );
  if (!federal.length) throw new Error('No federal outlines.');
  const loaded: { seat: Electorate; boundaries: Boundary[] }[] = [];
  let next = 0,
    done = 0;
  progress(0, federal.length);
  await Promise.all(
    Array.from({ length: Math.min(4, federal.length) }, async () => {
      while (next < federal.length) {
        if (signal?.aborted) throw new Error('Cancelled.');
        const seat = federal[next++]!;
        const { data } = await load(seat.detail_url);
        if (data.electorate_id !== seat.electorate_id)
          throw new Error('Mismatched outline.');
        loaded.push({ seat, boundaries: federalBoundaries(data.boundaries) });
        progress(++done, federal.length);
      }
    }),
  );
  // The vintage most seats carry, the later on a tie: a new federal vintage
  // in a future release is read, not refused for everyone.
  const counts = new Map<string, number>();
  for (const { boundaries } of loaded)
    for (const vintage of new Set(boundaries.map((b) => b.vintage)))
      counts.set(vintage, (counts.get(vintage) ?? 0) + 1);
  const vintage = [...counts].sort(
    (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
  )[0]?.[0];
  if (!vintage) throw new Error('Incomplete federal outlines.');
  const outlines: Outline[] = [],
    skipped: string[] = [];
  for (const { seat, boundaries } of loaded) {
    const geometry = boundaries.find((b) => b.vintage === vintage)?.geometry;
    if (geometry) outlines.push({ seat, geometry });
    else skipped.push(seat.electorate_id);
  }
  // One seat without a usable outline is skipped, not fatal to the rest.
  if (skipped.length)
    console.warn(
      `Location suggestion skipped ${skipped.length} seat(s) with no ${vintage} display outline: ${skipped.sort().join(', ')}`,
    );
  return { outlines, vintage, skipped };
}
/**
 * The seat a fix falls in. `reduced`: iOS reports reduced accuracy (Precise
 * Location off for OPAX) or Android a coarse grant. A fix over 1 km is
 * checked before the boundary test: approximate when precision is off,
 * otherwise unavailable (a poor fix indoors), never a dozen border seats.
 */
export function suggest(
  { outlines, vintage, skipped }: OutlineSet,
  point: Position,
  accuracy: number | null,
  reduced = false,
): Suggestion {
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
  if (accuracy > APPROXIMATE_ACCURACY) {
    if (!reduced) return { kind: 'unavailable' };
    const seats = nearby(outlines, point, accuracy, APPROXIMATE_SEATS);
    return seats.length
      ? { kind: 'approximate', seats, vintage }
      : { kind: skipped.length ? 'unavailable' : 'no-match' };
  }
  // Display outlines sit within about 222 m of the line (0.002° simplified),
  // and iOS accuracy is a 68% radius: the two errors add.
  const margin = 250 + Math.max(250, accuracy);
  const near = nearby(outlines, point, margin, BORDER_SEATS);
  const matches = outlines.filter((o) => contains(o.geometry, point));
  if (
    outlines.some((o) => borderDistance(o.geometry, point) <= margin) ||
    matches.length > 1
  )
    return { kind: 'border', seats: near, vintage };
  if (matches.length === 1)
    return { kind: 'suggested', seat: matches[0]!.seat, vintage };
  // The fix may be in a skipped seat, so "nothing matches" would be untrue.
  return { kind: skipped.length ? 'unavailable' : 'no-match' };
}
