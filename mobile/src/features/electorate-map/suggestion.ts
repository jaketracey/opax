import type { Electorate, ElectorateDetail } from '../../api/catalogs';
import {
  borderDistance,
  contains,
  federalBoundary,
  type Geometry,
  type Position,
} from '../../api/electorate-geometry';
export interface Outline {
  seat: Electorate;
  geometry: Geometry;
}
export type Suggestion =
  | { kind: 'suggested'; seat: Electorate }
  | { kind: 'border' | 'no-match' | 'unavailable' | 'denied' };
export async function loadOutlines(
  seats: Electorate[],
  load: (path: string) => Promise<{ data: ElectorateDetail }>,
  progress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Outline[]> {
  const federal = seats.filter(
    (s) =>
      s.jurisdiction === 'federal' &&
      s.chamber === 'representatives' &&
      s.status === 'current',
  );
  if (!federal.length) throw new Error('No federal outlines.');
  const outlines: Outline[] = [];
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
        const boundary = federalBoundary(data.boundaries);
        if (!boundary?.geometry)
          throw new Error('Incomplete federal outlines.');
        outlines.push({ seat, geometry: boundary.geometry });
        progress(++done, federal.length);
      }
    }),
  );
  return outlines;
}
export function suggest(
  outlines: Outline[],
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
  const margin = Math.max(500, accuracy);
  if (outlines.some((o) => borderDistance(o.geometry, point) <= margin))
    return { kind: 'border' };
  const matches = outlines.filter((o) => contains(o.geometry, point));
  return matches.length === 1
    ? { kind: 'suggested', seat: matches[0]!.seat }
    : { kind: matches.length ? 'border' : 'no-match' };
}
