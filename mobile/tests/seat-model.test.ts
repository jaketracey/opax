import { decodeElectorateIndex, type Electorate } from '../src/api/catalogs';
import type { Geometry } from '../src/api/electorate-geometry';
import {
  APPROXIMATE_ACCURACY,
  suggest,
} from '../src/features/electorate-map/suggestion';
import {
  abolishedLine,
  boundariesLine,
  browseStates,
  houseSeats,
  isStateCode,
  locationAnswer,
  matchLeads,
  matchSeats,
  regionOf,
  seatCopy,
  seatLabel,
  seatsInState,
  STATE_ORDER,
  vicCopy,
  vicDistricts,
  vicRegions,
} from '../src/features/seat/seat-model';
import { pinned } from './pinned';

const manifest = pinned('/electorates/manifest.json') as { index_url: string };
const electorates = decodeElectorateIndex(
  pinned(manifest.index_url),
).electorates;
const seat = (name: string) =>
  electorates.find(
    (s) =>
      s.name === name &&
      s.jurisdiction === 'federal' &&
      s.chamber === 'representatives' &&
      s.status === 'current',
  )!;
const names = (list: Electorate[]) => list.map((s) => s.name);
const az = (list: string[]) =>
  [...list].sort((a, b) => a.localeCompare(b, 'en-AU'));

describe('browse by state', () => {
  test('the eight states and territories in the AEC order, counted from the directory', () => {
    const states = browseStates(electorates);
    expect(states.map((s) => s.code)).toEqual([...STATE_ORDER]);
    expect(Object.fromEntries(states.map((s) => [s.code, s.count]))).toEqual({
      nsw: 46,
      vic: 38,
      qld: 30,
      wa: 16,
      sa: 10,
      tas: 5,
      act: 3,
      nt: 2,
    });
    expect(states.reduce((sum, s) => sum + s.count, 0)).toBe(150);
    expect(houseSeats(electorates)).toHaveLength(150);
    expect(states[0]!.name).toBe('New South Wales');
  });
  test('a state lists its current House seats A to Z, never abolished or state seats', () => {
    const sa = seatsInState(electorates, 'SA');
    expect(sa).toHaveLength(10);
    expect(names(sa)).toEqual(az(names(sa)));
    expect(names(sa)).not.toContain('Bonython');
    expect(
      sa.every(
        (s) => s.jurisdiction === 'federal' && s.chamber === 'representatives',
      ),
    ).toBe(true);
    expect(isStateCode('vic')).toBe(true);
    expect(isStateCode('VIC')).toBe(true);
    expect(isStateCode('vic_la')).toBe(false);
  });
});

describe('Victorian scope', () => {
  test('88 Assembly districts and 8 Council regions, each A to Z', () => {
    const districts = vicDistricts(electorates);
    const regions = vicRegions(electorates);
    expect(districts).toHaveLength(88);
    expect(regions).toHaveLength(8);
    expect(names(districts)).toEqual(az(names(districts)));
    expect(names(regions)).toEqual(az(names(regions)));
    expect(vicCopy.title).toBe('Victorian electorate');
  });
  test("a district's region comes from its within_upper_house relation", () => {
    const region = vicRegions(electorates).find(
      (s) => s.name === 'Western Victoria',
    )!;
    const relation = (kind: string, id: string) => ({
      kind,
      related_id: id as Electorate['electorate_id'],
      related: {} as never,
      sources: [],
      vintage: '2022',
    });
    expect(
      regionOf(
        {
          relations: [
            relation('overlaps', 'el_000000000000000000000001'),
            relation('within_upper_house', region.electorate_id),
          ],
        },
        electorates,
      ),
    ).toBe(region);
    expect(regionOf({ relations: [] }, electorates)).toBeNull();
    // A relation to something that is not a current region is ignored.
    expect(
      regionOf(
        {
          relations: [
            relation('within_upper_house', seat('Grayndler').electorate_id),
          ],
        },
        electorates,
      ),
    ).toBeNull();
  });
});

describe('typing', () => {
  test('seats whose name starts with the query come first, then other matches, each A to Z', () => {
    const results = matchSeats(electorates, 'gr');
    const prefix = results.filter((s) => s.name.toLowerCase().startsWith('gr'));
    expect(names(results.slice(0, prefix.length))).toEqual(az(names(prefix)));
    expect(names(results)).toContain('Grayndler');
    const rest = results.slice(prefix.length);
    expect(names(rest)).toEqual(az(names(rest)));
  });
  test("a member's name finds their seat", () => {
    expect(names(matchSeats(electorates, 'Albanese'))).toEqual(['Grayndler']);
  });
  test('only current House seats are offered', () => {
    expect(matchSeats(electorates, 'Batman')).toEqual([]);
    expect(matchSeats(electorates, 'Albert Park')).toEqual([]);
    expect(matchSeats(electorates, '   ')).toEqual([]);
  });
  test('senators and Victorian members lead to their state', () => {
    const [wong] = matchLeads(electorates, 'Penny Wong');
    expect(wong).toMatchObject({
      name: 'Penny Wong',
      slug: 'penny-wong',
      party: 'Labor',
      detail: 'Senator for South Australia',
      line: 'Choose your electorate in South Australia',
      state: 'sa',
    });
    const [taylor] = matchLeads(electorates, 'Nina Taylor');
    expect(taylor).toMatchObject({
      detail: 'Member for Albert Park, Victorian Parliament',
      state: 'vic',
    });
    // A House member is a seat row, never a lead.
    expect(matchLeads(electorates, 'Albanese')).toEqual([]);
    const hanson = matchLeads(electorates, 'Hanson');
    expect(hanson.map((l) => l.name)).toEqual(az(hanson.map((l) => l.name)));
    expect(hanson.length).toBeLessThanOrEqual(8);
  });
});

describe('copy', () => {
  test('the chooser speaks plainly and names this device', () => {
    expect(seatCopy.title).toBe('Your electorate');
    expect(seatCopy.noMatch).toBe('No matching electorate or member.');
    expect(seatCopy.footnote()).toBe(
      'Your location is used once to find your electorate. Your choice is saved on this iPhone only.',
    );
    expect(abolishedLine('Batman')).toBe('Batman is no longer an electorate.');
    expect(boundariesLine('2025 election')).toBe(
      'Based on the 2025 boundaries. Check it’s right.',
    );
    for (const text of Object.values(seatCopy))
      expect(typeof text === 'string' ? text : text()).not.toMatch(/[—!']/);
  });
  test('VoiceOver hears the seat, member and party', () => {
    expect(seatLabel(seat('Grayndler'))).toBe(
      'Grayndler. Anthony Albanese, Labor.',
    );
    expect(seatLabel(seat('Grayndler'), seatCopy.fromLocation)).toBe(
      'Grayndler. Anthony Albanese, Labor. From your location.',
    );
  });
});

describe('location', () => {
  // Two synthetic seats side by side, sharing the line at 1° east.
  const west = seat('Adelaide');
  const east = seat('Boothby');
  const box = (x0: number, x1: number): Geometry => ({
    type: 'Polygon',
    coordinates: [
      [
        [x0, 0],
        [x1, 0],
        [x1, 1],
        [x0, 1],
        [x0, 0],
      ],
    ],
  });
  const set = {
    outlines: [
      { seat: east, geometry: box(1, 2) },
      { seat: west, geometry: box(0, 1) },
    ],
    vintage: '2025 election',
    skipped: [],
  };
  test('a precise fix well inside one seat suggests it', () => {
    expect(suggest(set, [0.5, 0.5], 20)).toEqual({
      kind: 'suggested',
      seat: west,
      vintage: '2025 election',
    });
  });
  test('a fix near the line offers the nearby seats, A to Z', () => {
    expect(suggest(set, [0.999, 0.5], 20)).toEqual({
      kind: 'border',
      seats: [west, east],
      vintage: '2025 election',
    });
  });
  test('Precise Location off: approximate, with the seats inside the radius', () => {
    expect(suggest(set, [0.5, 0.5], 3000, true)).toEqual({
      kind: 'approximate',
      seats: [west],
      vintage: '2025 election',
    });
    // A wider radius reaches the seat next door.
    expect(suggest(set, [0.9, 0.5], 20000, true)).toEqual({
      kind: 'approximate',
      seats: [west, east],
      vintage: '2025 election',
    });
    // Reduced accuracy that happens to be tight is an ordinary answer.
    expect(suggest(set, [0.5, 0.5], 20, true)).toMatchObject({
      kind: 'suggested',
    });
    // Nothing within the radius: no seat, never a guess.
    expect(suggest(set, [10, 10], 3000, true)).toEqual({ kind: 'no-match' });
  });
  test('a poor fix with Precise Location on is unavailable', () => {
    expect(suggest(set, [0.5, 0.5], APPROXIMATE_ACCURACY + 1)).toEqual({
      kind: 'unavailable',
    });
  });
  test('each outcome becomes one answer row', () => {
    const vintage = '2025 election';
    expect(
      locationAnswer({ kind: 'suggested', seat: west, vintage }, false),
    ).toEqual({ kind: 'found', seats: [west], near: false, vintage });
    expect(
      locationAnswer({ kind: 'border', seats: [west, east], vintage }, false),
    ).toEqual({ kind: 'found', seats: [west, east], near: true, vintage });
    expect(
      locationAnswer({ kind: 'approximate', seats: [west], vintage }, false),
    ).toEqual({ kind: 'approximate', seats: [west], vintage });
    expect(locationAnswer({ kind: 'denied' }, false)).toEqual({
      kind: 'message',
      text: seatCopy.denied,
      settings: true,
    });
    expect(locationAnswer({ kind: 'no-match' }, false)).toEqual({
      kind: 'message',
      text: seatCopy.outside,
      settings: false,
    });
    expect(locationAnswer({ kind: 'unavailable' }, false)).toMatchObject({
      text: seatCopy.unavailable,
    });
    expect(
      locationAnswer({ kind: 'border', seats: [], vintage }, false),
    ).toMatchObject({ text: seatCopy.unavailable });
  });
  test('a locate the reader stopped returns to idle silently', () => {
    expect(locationAnswer({ kind: 'unavailable' }, true)).toEqual({
      kind: 'idle',
    });
  });
});
