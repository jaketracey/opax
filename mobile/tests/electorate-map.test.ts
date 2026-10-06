import {
  decodeElectorate,
  decodeElectorateIndex,
  type Electorate,
} from '../src/api/catalogs';
import {
  contains,
  borderDistance,
  decodeGeometry,
  federalBoundaries,
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
  const set = await loadOutlines(
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
  expect(set.outlines).toHaveLength(150);
  // The vintage is read from the release, not written into the app.
  expect(set.vintage).toBe('2025 election');
  expect(set.skipped).toEqual([]);
  expect(max).toBeLessThanOrEqual(4);
  expect(progress).toHaveBeenLastCalledWith(150, 150);
  expect(suggest(set, [151.145, -33.9], 20)).toMatchObject({
    kind: 'suggested',
    seat: { name: 'Grayndler' },
    vintage: '2025 election',
  });
  expect(suggest(set, [155, -35], 20)).toEqual({ kind: 'no-match' });
  const [boundary] = federalBoundaries(
    details.get(seats.find((s) => s.name === 'Grayndler')!.detail_url)!
      .boundaries,
  );
  if (!boundary) throw new Error('Grayndler has no federal outline.');
  const point =
    boundary.geometry!.type === 'Polygon'
      ? boundary.geometry!.coordinates[0]![0]!
      : boundary.geometry!.coordinates[0]![0]![0]!;
  expect(suggest(set, point, 20)).toEqual({ kind: 'border' });
  expect(suggest(set, [151.145, -33.9], null)).toEqual({
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
  const set = { outlines, vintage: '2025 election', skipped: [] };
  expect(
    suggest({ ...set, outlines: [...outlines, ...outlines] }, [0.2, 0.2], 10),
  ).toEqual({
    kind: 'border',
  });
  expect(suggest(set, [0.2, 0.2], 50000)).toEqual({ kind: 'border' });
});
test('the border margin adds the outline error to the fix accuracy', () => {
  const seat = seats[0] as Electorate;
  const set = {
    outlines: [{ seat, geometry: square }],
    vintage: '2025 election',
    skipped: [],
  };
  // 520 m inside the square's east edge, on the 1° parallel.
  const point: [number, number] = [
    2 - 520 / (111320 * Math.cos(Math.PI / 180)),
    1,
  ];
  expect(borderDistance(square, point)).toBeCloseTo(520, 0);
  // Up to 250 m accuracy the margin is 500 m.
  for (const accuracy of [0, 65, 250])
    expect(suggest(set, point, accuracy)).toMatchObject({ kind: 'suggested' });
  // At 300 m it is 550 m; max(500, accuracy) would have suggested a seat.
  expect(suggest(set, point, 300)).toEqual({ kind: 'border' });
  expect(suggest(set, point, 269)).toMatchObject({ kind: 'suggested' });
  expect(suggest(set, point, 271)).toEqual({ kind: 'border' });
});
test('the federal vintage comes from the release, the most common one winning', async () => {
  // Synthetic copies of pinned seat files with a relabelled vintage; the
  // outlines themselves are the pinned ones.
  const relabel = (vintage: string) => (path: string) => {
    const data = details.get(path)!;
    return {
      data: {
        ...data,
        boundaries: data.boundaries.map((b) =>
          b.geometry_kind === 'official' ? { ...b, vintage } : b,
        ),
      },
    };
  };
  const next = await loadOutlines(
    seats,
    async (path) => relabel('2028 election')(path),
    () => {},
  );
  expect(next.vintage).toBe('2028 election');
  expect(next.outlines).toHaveLength(150);
  expect(suggest(next, [151.145, -33.9], 20)).toMatchObject({
    kind: 'suggested',
    seat: { name: 'Grayndler' },
    vintage: '2028 election',
  });
  // One seat still on an older vintage is skipped, never mixed in.
  const grayndler = seats.find((s) => s.name === 'Grayndler')!;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const mixed = await loadOutlines(
    seats,
    async (path) =>
      relabel(
        path === grayndler.detail_url ? '2025 election' : '2028 election',
      )(path),
    () => {},
  );
  expect(mixed.vintage).toBe('2028 election');
  expect(mixed.skipped).toEqual([grayndler.electorate_id]);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(grayndler.electorate_id),
  );
  warn.mockRestore();
});
test('a seat without a usable outline is skipped and logged; a fix there is unavailable, not no-match', async () => {
  const grayndler = seats.find((s) => s.name === 'Grayndler')!;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Every Grayndler outline has an unclosed ring: the seat file still decodes.
  const raw = pinned(grayndler.detail_url) as { boundaries: object[] };
  const broken = decodeElectorate({
    ...raw,
    boundaries: raw.boundaries.map((b) => ({
      ...b,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [151, -33],
            [151.1, -33],
            [151.1, -33.1],
          ],
        ],
      },
    })),
  });
  expect(broken.boundaries).toEqual([]);
  expect(warn).toHaveBeenCalledWith(
    `Skipped a malformed display outline for ${grayndler.electorate_id}`,
  );
  warn.mockClear();
  const set = await loadOutlines(
    seats,
    async (path) => ({
      data: path === grayndler.detail_url ? broken : details.get(path)!,
    }),
    () => {},
  );
  expect(set.outlines).toHaveLength(149);
  expect(set.skipped).toEqual([grayndler.electorate_id]);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain(grayndler.electorate_id);
  // Inside Grayndler: no other seat contains the point.
  expect(suggest(set, [151.145, -33.9], 20)).toEqual({ kind: 'unavailable' });
  // Elsewhere the remaining seats still suggest.
  expect(suggest(set, [149.1244, -35.3081], 20)).toMatchObject({
    kind: 'suggested',
    seat: { name: 'Canberra' },
  });
  warn.mockRestore();
});
