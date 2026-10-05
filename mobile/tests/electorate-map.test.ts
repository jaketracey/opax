import {
  decodeElectorate,
  decodeElectorateIndex,
  type Electorate,
} from '../src/api/catalogs';
import {
  contains,
  borderDistance,
  decodeGeometry,
  federalBoundary,
  outlinePath,
  type Geometry,
} from '../src/api/electorate-geometry';
import {
  loadOutlines,
  suggest,
} from '../src/features/electorate-map/suggestion';
import { pinned } from './pinned';
import snapshot from '../scripts/fixture-snapshot.json';
const manifest = pinned('/electorates/manifest.json') as { index_url: string };
const index = decodeElectorateIndex(pinned(manifest.index_url));
const seats = index.electorates.filter(
  (s) =>
    s.jurisdiction === 'federal' &&
    s.chamber === 'representatives' &&
    s.status === 'current',
);
const details = new Map(
  seats.map((s) => [s.detail_url, decodeElectorate(pinned(s.detail_url))]),
);
const square: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
    [
      [0.5, 0.5],
      [0.5, 1],
      [1, 1],
      [1, 0.5],
      [0.5, 0.5],
    ],
  ],
};
test('Polygon holes and MultiPolygon islands do not imply allocation', () => {
  expect(contains(square, [0.2, 0.2])).toBe(true);
  expect(contains(square, [0.75, 0.75])).toBe(false);
  expect(
    contains(
      {
        type: 'MultiPolygon',
        coordinates: [
          square.coordinates,
          [
            [
              [4, 4],
              [5, 4],
              [5, 5],
              [4, 5],
              [4, 4],
            ],
          ],
        ],
      },
      [4.5, 4.5],
    ),
  ).toBe(true);
  expect(borderDistance(square, [0, 1])).toBe(0);
  expect(outlinePath(square, 320, 250)).toMatch(/^M .*Z$/);
});
test.each([NaN, 181])('refuses malformed geometry (%s)', (n) =>
  expect(() =>
    decodeGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [n, 0],
          [1, 0],
          [1, 1],
          [n, 0],
        ],
      ],
    }),
  ).toThrow(),
);
test('loads the complete pinned federal display set with bounded concurrency and progress', async () => {
  let concurrent = 0,
    max = 0;
  const progress = jest.fn();
  const outlines = await loadOutlines(
    seats,
    async (path) => {
      concurrent++;
      max = Math.max(max, concurrent);
      await Promise.resolve();
      concurrent--;
      return { data: details.get(path)! };
    },
    progress,
  );
  expect(outlines).toHaveLength(150);
  expect(max).toBeLessThanOrEqual(4);
  expect(progress).toHaveBeenLastCalledWith(150, 150);
  expect(suggest(outlines, [151.145, -33.9], 20)).toMatchObject({
    kind: 'suggested',
    seat: { name: 'Grayndler' },
  });
  expect(suggest(outlines, [155, -35], 20)).toEqual({ kind: 'no-match' });
  const boundary = federalBoundary(
    details.get(seats.find((s) => s.name === 'Grayndler')!.detail_url)!
      .boundaries,
  )!;
  const point =
    boundary.geometry!.type === 'Polygon'
      ? boundary.geometry!.coordinates[0]![0]!
      : boundary.geometry!.coordinates[0]![0]![0]!;
  expect(suggest(outlines, point, 20)).toEqual({ kind: 'border' });
  expect(suggest(outlines, [151.145, -33.9], null)).toEqual({
    kind: 'unavailable',
  });
  expect(
    Object.keys(snapshot.files).filter((p) =>
      seats.some((s) => s.detail_url === p),
    ),
  ).toHaveLength(150);
});
test('partial, mismatched and cancelled outlines cannot produce a suggestion', async () => {
  const seat = seats[0]!;
  await expect(
    loadOutlines(
      [seat],
      async () => {
        throw new Error('offline');
      },
      () => {},
    ),
  ).rejects.toThrow();
  await expect(
    loadOutlines(
      [seat],
      async () => ({ data: details.get(seats[1]!.detail_url)! }),
      () => {},
    ),
  ).rejects.toThrow();
  const signal = new AbortController();
  signal.abort();
  const load = jest.fn();
  await expect(
    loadOutlines([seat], load, () => {}, signal.signal),
  ).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
});
// The safe UI result cannot contain the transient fix.
test('overlapping outlines and approximate fixes fall back', () => {
  const seat = seats[0] as Electorate;
  const outlines = [{ seat, geometry: square }];
  expect(suggest([...outlines, ...outlines], [0.2, 0.2], 10)).toEqual({
    kind: 'border',
  });
  expect(suggest(outlines, [0.2, 0.2], 50000)).toEqual({ kind: 'border' });
});
