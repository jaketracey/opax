// TestFlight build 32 (10 Oct, AEArfYzu): "the electorate finder that uses my
// location for federal electorate could be used for my state electorate."
// Control hub rules: the lookup runs on the device against bundled outlines;
// no coordinates or location-derived IDs leave it; permission is asked only
// at the tap; the manual chooser is always the fallback.
import * as Location from 'expo-location';
import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as c from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { suggestStateFromLocation } from '../src/features/electorate-map/location';
import {
  decodeStateOutline,
  stateOutlineFile,
  suggestState,
} from '../src/features/electorate-map/state-suggestion';
import YourMP from '../src/features/YourMP';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
    yourMP: jest.fn(),
    electorate: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));

const find = (name: string, chamber?: string) =>
  index.electorates.find(
    (s) => s.name === name && (!chamber || s.chamber === chamber),
  )!;
const essendon = find('Essendon', 'vic_la');
// 1.6 km inside the Essendon outline (Moonee Ponds), well clear of a border.
const inside = { longitude: 144.917912345, latitude: -37.776512345 };
const victoria = index.electorates.filter((s) => s.jurisdiction === 'vic');

beforeEach(() => {
  jest.clearAllMocks();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { ...inside, accuracy: 20 },
  });
});

describe('bundled state outlines', () => {
  const file = stateOutlineFile();
  test('hold every current state and territory district of the dated release, and nothing else', () => {
    const lower = new Set([
      'act_la',
      'nsw_la',
      'nt_la',
      'qld_la',
      'sa_ha',
      'tas_ha',
      'vic_la',
      'wa_la',
    ]);
    const expected = index.electorates
      .filter((s) => s.status === 'current' && lower.has(s.chamber))
      .map((s) => s.electorate_id)
      .sort();
    expect(Object.keys(file.seats).sort()).toEqual(expected);
    expect(expected).toHaveLength(415);
    expect(file.release_id).toBe(manifest.release_id);
    expect(file.source.licence).toBe('CC BY 4.0');
    expect(file.source.label).toBe('ABS SED 2025 statistical boundaries');
  });
  test('decode to closed rings inside Australia', () => {
    for (const polygons of Object.values(file.seats)) {
      const geometry = decodeStateOutline(polygons, file.precision);
      for (const ring of geometry.coordinates.flat()) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        for (const [x, y] of ring) {
          expect(x).toBeGreaterThan(96);
          expect(x).toBeLessThan(168);
          expect(y).toBeGreaterThan(-44);
          expect(y).toBeLessThan(-9);
        }
      }
    }
  });
  test('stay under a megabyte in the app (the 2 MB budget was the stop line)', () => {
    const bytes = readFileSync(
      join(__dirname, '../src/features/electorate-map/state-outlines.json'),
    ).length;
    expect(bytes).toBeLessThan(1_000_000);
  });
});

describe('on-device state suggestion', () => {
  test('a fix inside Essendon suggests Essendon among the Victorian seats', () => {
    expect(
      suggestState(victoria, [inside.longitude, inside.latitude], 20),
    ).toMatchObject({ kind: 'suggested', seat: { name: 'Essendon' } });
  });
  test('an approximate fix near a line is a border, never a guess', () => {
    expect(
      suggestState(victoria, [inside.longitude, inside.latitude], 2000),
    ).toEqual({ kind: 'border' });
  });
  test('a fix in another state matches no district here', () => {
    // Sydney, against the Victorian seats the chooser offers.
    expect(suggestState(victoria, [151.2093, -33.8688], 20)).toEqual({
      kind: 'no-match',
    });
  });
  test('the lookup fetches nothing and the fix never leaves the device', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const logs = jest.spyOn(console, 'log');
    const result = await suggestStateFromLocation(
      victoria,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ kind: 'suggested', seat: essendon });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runtime.electorate).not.toHaveBeenCalled();
    const evidence = JSON.stringify({ result, logs: logs.mock.calls });
    expect(evidence).not.toContain('144.917912345');
    expect(evidence).not.toContain('-37.776512345');
    fetchSpy.mockRestore();
    logs.mockRestore();
  });
  test('denial neither reads a fix nor suggests anything', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(
      { status: 'denied' },
    );
    expect(
      await suggestStateFromLocation(victoria, new AbortController().signal),
    ).toEqual({ kind: 'denied' });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});

describe('Your MP state chooser', () => {
  const result = <T,>(data: T) => ({
    data,
    stale: false,
    savedAt: 1,
    asOf: null,
  });
  const directory = {
    manifest: result(manifest),
    people: result(people),
    roster: result(roster),
    slugs: result(slugs),
    electorates: result(index),
  };
  async function render(element: ReactElement) {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(element);
    });
    return r;
  }
  const pressable = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.findAll(
      (n) => n.props?.testID === testID && typeof n.props.onPress === 'function',
    )[0]!;
  const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.findAll((n) => n.props?.testID === testID).length > 0;
  async function openStateChooser() {
    const mock = runtime as jest.Mocked<typeof runtime>;
    mock.directory.mockResolvedValue(directory as never);
    mock.yourMP.mockImplementation(async (id, chosen) =>
      c.yourMPFor(id, index, manifest, chosen),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    (loadChoice as jest.Mock).mockResolvedValue({
      version: 1,
      seatId: find('Maribyrnong').electorate_id,
      stateSeatIds: [],
    });
    (saveChoice as jest.Mock).mockResolvedValue(undefined);
    const r = await render(<YourMP />);
    await act(async () => pressable(r, 'choose-state-seat').props.onPress());
    return r;
  }
  test('asks for location only at the tap, then saves the confirmed district', async () => {
    const r = await openStateChooser();
    expect(has(r, 'state-use-my-location')).toBe(true);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await act(async () =>
      pressable(r, 'state-use-my-location').props.onPress(),
    );
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(has(r, 'state-location-suggestion')).toBe(true);
    await act(async () => pressable(r, 'state-location-confirm').props.onPress());
    expect(saveChoice).toHaveBeenLastCalledWith(
      expect.objectContaining({ stateSeatIds: [essendon.electorate_id] }),
    );
    await act(async () => r.unmount());
  });
  test('denied permission says so and keeps the manual chooser', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(
      { status: 'denied' },
    );
    const r = await openStateChooser();
    await act(async () =>
      pressable(r, 'state-use-my-location').props.onPress(),
    );
    expect(has(r, 'state-location-denied')).toBe(true);
    expect(
      r.root.findAll(
        (n) =>
          n.props?.testID === 'seat-search' &&
          typeof n.props.onChangeText === 'function',
      ).length,
    ).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });
});
