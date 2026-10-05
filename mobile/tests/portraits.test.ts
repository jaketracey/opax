import { portraitKey } from '../src/api/ids';
import {
  buildPortraitIndex,
  buildPortraitIndexAsync,
  samePortraitPerson,
} from '../src/api/portrait-index';
import { portraitFor } from '../src/api/selectors';
import { assertPortraitBytes } from '../src/api/portrait-policy';
import { PortraitCache, type SavedPortrait } from '../src/api/portrait-cache';
import { catalogs, pinnedBytes, roster } from './pinned';
import type { PortraitCatalogs } from '../src/api/portrait-index';
import { portraitFaceKey } from '../src/api/portrait-byte-groups';
import { pinnedPortraitBlobs } from '../scripts/portrait-byte-probe';
test('the pinned directory refuses surname/initials keys and every unrelated shared face', () => {
  const index = buildPortraitIndex(catalogs as PortraitCatalogs);
  expect(roster.people).toHaveLength(1557);
  expect(index.refusedSurnameKeys).toBe(206);
  expect(index.refusedInitialKeys).toBe(51);
  expect(index.portraits.get('anthony-albanese')?.key).toBe('10007');
  expect(index.portraits.get('sheena-watt')?.key).toBe('wd-Q100327610');
  expect(index.portraits.has('madonna-jarrett')).toBe(false);
  const owners = new Map<string, string[]>();
  for (const [slug, p] of index.portraits) {
    const face = portraitFaceKey(p.key);
    owners.set(face, [...(owners.get(face) ?? []), slug]);
  }
  for (const group of owners.values())
    for (const a of group)
      for (const b of group)
        expect(
          samePortraitPerson(
            index.identities.get(a)!,
            index.identities.get(b)!,
          ),
        ).toBe(true);
});
test('all pinned byte-identical files are reviewed and unrelated owners get blank portraits', () => {
  expect(pinnedPortraitBlobs().size).toBe(850);
  const index = buildPortraitIndex(catalogs as PortraitCatalogs);
  for (const slug of [
    'anna-burke',
    'tony-burke',
    'sandy-macdonald',
    'alexander-somlyay',
    'john-alexander',
    'bruce-scott',
    'scott-buchholz',
  ])
    expect(index.portraits.has(slug)).toBe(false);
});
test.each(['Abbott', 'Albanese', 'T Smith', 'K.J. Maher'])(
  'a bare or initials map match is refused: %s',
  (name) => {
    expect(
      portraitFor([name], catalogs.photoPeople!, catalogs.photoCredits!),
    ).toBeNull();
  },
);
test('resolved person_id wins over a surname map, while a different numeric face is refused', () => {
  expect(
    portraitFor(['Tony Abbott'], { abbott: '10001' } as never, {}, '10001')
      ?.key,
  ).toBe('10001');
  expect(
    portraitFor(
      ['Tony Abbott'],
      { 'tony abbott': '10007' } as never,
      {},
      '10001',
    ),
  ).toBeNull();
});
test('only unchanged 200×200 WebP bytes enter the cache', () => {
  const bytes = new Uint8Array(pinnedBytes('/photos/10007.webp'));
  expect(() => assertPortraitBytes(bytes)).not.toThrow();
  for (const wrong of [
    new Uint8Array(65537),
    bytes.slice(0, 29),
    new TextEncoder().encode('<html>oops</html>'),
  ])
    expect(() => assertPortraitBytes(wrong)).toThrow();
  const resized = bytes.slice();
  resized[26] = 199;
  expect(() => assertPortraitBytes(resized)).toThrow();
});
test('portrait downloads deduplicate, stay bounded, persist identical bytes, and work offline on a new cache', async () => {
  const files = new Map<string, SavedPortrait>();
  const savedBytes = new Map<string, Uint8Array>();
  const store = {
    read: jest.fn(async (key: string) => files.get(key)),
    write: jest.fn(async (key: string, bytes: Uint8Array) => {
      savedBytes.set(key, bytes);
      const entry = { localURI: `file:///cache/${key}.webp`, savedAt: 1000 };
      files.set(key, entry);
      return entry;
    }),
  };
  const bytes = new Uint8Array(pinnedBytes('/photos/10007.webp'));
  let active = 0,
    peak = 0;
  const client = {
    getPortrait: jest.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return bytes;
    }),
  };
  const cache = new PortraitCache(store, client, 3, () => 1000);
  await Promise.all(
    ['10007', '10007', '10678', '10257', '10001', '10002'].map((key) =>
      cache.get(key),
    ),
  );
  expect(client.getPortrait).toHaveBeenCalledTimes(5);
  expect(peak).toBe(3);
  expect(savedBytes.get('10007')).toEqual(bytes);
  const offline = {
    getPortrait: jest.fn(async () => {
      throw new Error('offline');
    }),
  };
  expect(
    await new PortraitCache(store, offline, 3, () => 100000000).get('10007'),
  ).toBe('file:///cache/10007.webp');
  await expect(new PortraitCache(store, offline).get('99999')).rejects.toThrow(
    'offline',
  );
  await expect(cache.get('../10007')).rejects.toThrow();
});

test('a map assigning one Commons face to two unrelated resolved people is refused for both', () => {
  const index = buildPortraitIndex({
    ...catalogs,
    photoPeople: {
      ...catalogs.photoPeople!,
      'sheena watt': portraitKey('wd-Q100327610'),
      'enver erdogan': portraitKey('wd-Q100327610'),
    },
  } as PortraitCatalogs);
  expect(index.portraits.has('sheena-watt')).toBe(false);
  expect(index.portraits.has('enver-erdogan')).toBe(false);
  expect(index.conflictingKeysRefused).toBeGreaterThan(0);
});

test('yielding native directory lookup retains every synchronous identity refusal and face key', async () => {
  const sync = buildPortraitIndex(catalogs as PortraitCatalogs);
  let UIHandled = false;
  const pending = buildPortraitIndexAsync(catalogs as PortraitCatalogs);
  setTimeout(() => {
    UIHandled = true;
  }, 0);
  const asyncIndex = await pending;
  expect(UIHandled).toBe(true);
  expect([...asyncIndex.portraits]).toEqual([...sync.portraits]);
  expect(asyncIndex.conflictingKeysRefused).toBe(sync.conflictingKeysRefused);
});
