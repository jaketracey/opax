import assert from 'node:assert/strict';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { exploreFixture } from '../scripts/explore-fixture';
import pins from '../scripts/fixtures/explore-pictures.json';
import { CatalogCache } from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { assertAllowedPath } from '../src/api/policy';
import { PortraitCache, type SavedPortrait } from '../src/api/portrait-cache';
import {
  assertYearPictureBytes,
  yearPictureKey,
  yearPictureKeyPattern,
  yearPictureMaxBytes,
  yearPicturePath,
} from '../src/api/year-picture-policy';
import { decodePictures } from '../src/features/explore/pictures';
const raw = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../portal/public/years/pictures.json'),
    'utf8',
  ),
);
const paths = Object.keys(pins);
const pictureBytes = new Uint8Array(
  exploreFixture(paths[0]!, () => undefined)!,
);
const cache = () =>
  new CatalogCache({
    readIndex: async () => [],
    writeIndex: async () => {},
    read: async () => undefined,
    write: async () => {},
    remove: async () => {},
  });
beforeEach(() => jest.useFakeTimers({ now: 1000 }));
afterEach(() => {
  const pendingTimers = jest.getTimerCount();
  jest.useRealTimers();
  expect(pendingTimers).toBe(0);
});
test('the web manifest preserves all 189 photos and credits, including unknown dates', () => {
  const cleaned = decodePictures(raw);
  const originals = Object.values(raw).flat() as any[];
  const byFile = new Map(originals.map((p) => [p.file, p]));
  for (const p of Object.values(cleaned).flat()) {
    const original = byFile.get(p.file);
    assert.deepEqual({ ...p, credit: original.credit }, original, p.file);
    assert.doesNotMatch(p.credit, /^(?:photo:\s*)?own work[.!]?$/i, p.file);
  }
  expect(Object.values(cleaned).flat()).toHaveLength(189);
  for (const rows of Object.values(cleaned))
    for (const p of rows) {
      assert.doesNotThrow(() => assertAllowedPath('/' + p.file), p.file);
      assert.equal(
        yearPicturePath(yearPictureKey('/' + p.file)),
        '/' + p.file,
        p.file,
      );
    }
});
test('all 189 source pictures meet mobile byte limits and exact RIFF lengths using only 12-byte headers', () => {
  const pictures = Object.values(raw).flat() as { file: string }[];
  assert.equal(pictures.length, 189);
  const header = Buffer.alloc(12);
  for (const { file } of pictures) {
    const path = resolve(__dirname, '../../portal/public', file);
    const size = statSync(path).size;
    assert.ok(size >= 30 && size <= yearPictureMaxBytes, file);
    const fd = openSync(path, 'r');
    try {
      assert.equal(readSync(fd, header, 0, 12, 0), 12, file);
    } finally {
      closeSync(fd);
    }
    assert.equal(header.toString('ascii', 0, 4), 'RIFF', file);
    assert.equal(header.toString('ascii', 8, 12), 'WEBP', file);
    assert.equal(header.readUInt32LE(4) + 8, size, file);
  }
});
test.each(['file', 'width', 'licence', 'source_url'])(
  'manifest refuses malformed %s and mismatched years',
  (field) => {
    const bad = { '2025': [{ ...raw['2025'][0] }] };
    bad['2025'][0][field] =
      field === 'width' ? 0 : field === 'licence' ? '' : '/api/og/paid';
    expect(() => decodePictures(bad)).toThrow();
    const wrongYear = { '1998': [raw['2025'][0]] };
    expect(() => decodePictures(wrongYear)).toThrow();
    const duplicate = { '2025': [raw['2025'][0], raw['2025'][0]] };
    expect(() => decodePictures(duplicate)).toThrow();
  },
);
test('an optional credit_url is decoded alongside the named credit', () => {
  const credit_url = 'https://archive.example.org/photos/2025';
  const photo = { ...raw['2025'][0], credit: 'Example Archive', credit_url };
  expect(decodePictures({ '2025': [photo] })['2025']![0]).toMatchObject({
    credit: 'Example Archive',
    credit_url,
  });
  expect(
    decodePictures({ '2025': [raw['2025'][0]] })['2025']![0]!.credit_url,
  ).toBeUndefined();
});

test('an optional credit_url still rejects an unsafe address', () => {
  expect(() =>
    decodePictures({
      '2025': [{ ...raw['2025'][0], credit_url: 'javascript:alert(1)' }],
    }),
  ).toThrow();
});
test.each([
  '/years/pictures.json',
  '/years/pictures/1998/swanson-dock-picket.webp',
  '/years/pictures/2025/cooper-polling-place.webp',
])('free static route admitted: %s', (path) => {
  expect(() => assertAllowedPath(path)).not.toThrow();
});
test.each([
  '/years/pictures/2025/../cooper.webp',
  '/years/pictures/2025/a.webp?q=x',
  '/years/pictures/2025/a.jpg',
  '/years/pictures/2025/%61.webp',
  '/years/pictures/2025/a.webp#x',
  '/years/pictures/2025//a.webp',
  '/years/pictures.json?prefetch=1',
])('unreviewed picture route refused: %s', (path) => {
  expect(() => assertAllowedPath(path)).toThrow();
});
test('small fixture subset is pinned, exact WebP bytes; unknown images never proxy production', () => {
  expect(paths).toHaveLength(7);
  expect(Object.values(pins).reduce((n, p) => n + p.bytes, 0)).toBeLessThan(
    1024 * 1024,
  );
  for (const path of paths)
    expect(() =>
      assertYearPictureBytes(
        new Uint8Array(exploreFixture(path, () => undefined)!),
      ),
    ).not.toThrow();
  expect(
    exploreFixture(
      '/years/pictures/1998/swanson-dock-picket.webp',
      () => undefined,
    ),
  ).toBeUndefined();
  expect(
    decodePictures(
      JSON.parse(
        exploreFixture('/years/pictures.json', () => undefined)!.toString(),
      ),
    ),
  ).toEqual(decodePictures(raw));
});
test('byte client uses one bounded free read, rejects redirects and non-WebP, JSON client cannot read an image', async () => {
  const transport = jest.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(pictureBytes, { headers: { 'content-type': 'image/webp' } }),
  );
  const client = new ApiClient({
    origin: 'http://127.0.0.1:8951',
    version: '1',
    build: '1',
    transport: transport as typeof fetch,
    cache: cache(),
  });
  await expect(client.get(paths[0]!, (v) => v)).rejects.toThrow('byte client');
  expect(transport).not.toHaveBeenCalled();
  // Compare every byte natively, without Jest enumerating typed-array properties.
  expect(
    Buffer.from(await client.getYearPicture(paths[0]!)).equals(
      Buffer.from(pictureBytes),
    ),
  ).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]![1]).toMatchObject({
    redirect: 'manual',
    credentials: 'omit',
    headers: { Accept: 'image/webp' },
  });
  transport.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { location: 'https://opax.com.au/api/og/x' },
    }),
  );
  await expect(client.getYearPicture(paths[0]!)).rejects.toThrow('redirects');
  transport.mockResolvedValueOnce(
    new Response('{}', { headers: { 'content-type': 'application/json' } }),
  );
  await expect(client.getYearPicture(paths[0]!)).rejects.toThrow('WebP');
  await expect(client.getYearPicture('/api/matrix')).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(3);
  expect(() =>
    assertYearPictureBytes(new Uint8Array(512 * 1024 + 1)),
  ).toThrow();
  expect(() =>
    assertYearPictureBytes(
      new TextEncoder().encode('<html>not an image</html>'),
    ),
  ).toThrow();
});
test('existing image cache deduplicates photos, bounds downloads, survives a new session offline and never reads implicitly', async () => {
  const files = new Map<string, SavedPortrait>();
  const store = {
    read: async (key: string) => files.get(key),
    write: async (key: string, bytes: Uint8Array) => {
      expect(Buffer.from(bytes).equals(Buffer.from(pictureBytes))).toBe(true);
      const saved = { localURI: `file:///cache/${key}.webp`, savedAt: 1000 };
      files.set(key, saved);
      return saved;
    },
  };
  let active = 0,
    peak = 0;
  const getPortrait = jest.fn(async (_path: string) => {
    active++;
    peak = Math.max(peak, active);
    // Yield asynchronously without coupling fixture downloads to host timers.
    await Promise.resolve();
    active--;
    return pictureBytes;
  });
  const policy = { keyPattern: yearPictureKeyPattern, path: yearPicturePath };
  const photos = new PortraitCache(
    store,
    { getPortrait },
    3,
    () => 1000,
    policy,
  );
  expect(getPortrait).not.toHaveBeenCalled();
  await Promise.all(
    [...paths, paths[0]!].map((path) => photos.get(yearPictureKey(path))),
  );
  expect(getPortrait).toHaveBeenCalledTimes(paths.length);
  expect(peak).toBe(3);
  await photos.get(yearPictureKey(paths[0]!));
  expect(getPortrait).toHaveBeenCalledTimes(paths.length);
  const offline = new PortraitCache(
    store,
    {
      getPortrait: async () => {
        throw new Error('offline');
      },
    },
    3,
    () => 100000000,
    policy,
  );
  expect(await offline.get(yearPictureKey(paths[0]!))).toBe(
    files.get(yearPictureKey(paths[0]!))!.localURI,
  );
});
