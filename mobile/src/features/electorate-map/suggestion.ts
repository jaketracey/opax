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
export type Suggestion =
  | { kind: 'suggested'; seat: Electorate; vintage: string }
  | { kind: 'border' | 'no-match' | 'unavailable' | 'denied' };
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
export function suggest(
  { outlines, vintage, skipped }: OutlineSet,
  point: Position,
  accuracy: number | null,
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
  // Display outlines sit within about 222 m of the line (0.002° simplified),
  // and iOS accuracy is a 68% radius: the two errors add.
  const margin = 250 + Math.max(250, accuracy);
  if (outlines.some((o) => borderDistance(o.geometry, point) <= margin))
    return { kind: 'border' };
  const matches = outlines.filter((o) => contains(o.geometry, point));
  if (matches.length === 1)
    return { kind: 'suggested', seat: matches[0]!.seat, vintage };
  if (matches.length) return { kind: 'border' };
  // The fix may be in a skipped seat, so "nothing matches" would be untrue.
  return { kind: skipped.length ? 'unavailable' : 'no-match' };
}
