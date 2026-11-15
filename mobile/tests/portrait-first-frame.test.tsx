/**
 * A portrait seen earlier in this launch is drawn in a row's first frame.
 * Before, every mount resolved it again through two awaits and a full read
 * and check of the file, so a row scrolling back into view showed a blank
 * circle that filled a moment later.
 */
import { act } from 'react';
import { Image } from 'react-native';
import TestRenderer from 'react-test-renderer';
import type { Catalogs } from '../src/api/catalogs';
import { PeoplePortraits } from '../src/api/people-portraits';
import { PortraitCache, type SavedPortrait } from '../src/api/portrait-cache';
import { portraitFor } from '../src/api/selectors';
import { CachedPortrait } from '../src/features/CachedPortrait';
import { SpeakerPortrait } from '../src/features/records/speaker';
import { catalogs } from './pinned';

const mockPortraitGet = jest.fn();
const mockPortraitPeek = jest.fn();
jest.mock('../src/api/runtime', () => ({
  portraits: {
    get: (...args: unknown[]) => mockPortraitGet(...args),
    peek: (...args: unknown[]) => mockPortraitPeek(...args),
  },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));

const DAY = 86400000;
function cache(now = { at: 10 * DAY }) {
  const files = new Map<string, SavedPortrait>();
  const store = {
    read: jest.fn(async (key: string) => files.get(key)),
    write: jest.fn(async (key: string) => {
      const saved = { localURI: `file:///cache/${key}.webp`, savedAt: now.at };
      files.set(key, saved);
      return saved;
    }),
    has: jest.fn((key: string) => files.get(key)?.localURI),
  };
  const client = { getPortrait: jest.fn(async () => new Uint8Array(4)) };
  return {
    files,
    store,
    client,
    now,
    cache: new PortraitCache(store, client, 3, () => now.at),
  };
}

test('a checked file is answered without a second read, while it is on disk and under a day old', async () => {
  const { cache: portraits, store, client, files, now } = cache();
  expect(portraits.peek('10007')).toBeUndefined();
  expect(await portraits.get('10007')).toBe('file:///cache/10007.webp');
  expect(client.getPortrait).toHaveBeenCalledTimes(1);
  expect(store.read).toHaveBeenCalledTimes(1);
  // Known now: at once, and the next get neither reads nor downloads.
  expect(portraits.peek('10007')).toBe('file:///cache/10007.webp');
  expect(await portraits.get('10007')).toBe('file:///cache/10007.webp');
  expect(store.read).toHaveBeenCalledTimes(1);
  expect(client.getPortrait).toHaveBeenCalledTimes(1);
  // A forced refresh still downloads.
  await portraits.get('10007', true);
  expect(client.getPortrait).toHaveBeenCalledTimes(2);
  // A day on, the file is refreshed as before, not answered from memory.
  now.at += DAY;
  expect(portraits.peek('10007')).toBeUndefined();
  await portraits.get('10007');
  expect(client.getPortrait).toHaveBeenCalledTimes(3);
  expect(portraits.peek('10007')).toBe('file:///cache/10007.webp');
  // Evicted from disk: nothing is answered for a file that has gone.
  files.delete('10007');
  expect(portraits.peek('10007')).toBeUndefined();
  await portraits.get('10007');
  expect(client.getPortrait).toHaveBeenCalledTimes(4);
});

test('a file found on disk is checked once in a launch', async () => {
  const { cache: portraits, store, client, files, now } = cache();
  files.set('10007', {
    localURI: 'file:///cache/10007.webp',
    savedAt: now.at - 1000,
  });
  expect(portraits.peek('10007')).toBeUndefined();
  await portraits.get('10007');
  await portraits.get('10007');
  expect(store.read).toHaveBeenCalledTimes(1);
  expect(client.getPortrait).not.toHaveBeenCalled();
});

function service() {
  const data = { ...catalogs };
  const record = (value: unknown) => ({ data: value });
  const source = {
    directory: jest.fn(async () => ({
      roster: record(data.roster),
      slugs: record(data.slugs),
      people: record(data.people),
      manifest: record(data.manifest),
    })),
    photoPeople: jest.fn(async () => record(data.photoPeople)),
    photoCredits: jest.fn(async () => record(data.photoCredits)),
  };
  const files = cache();
  return {
    data,
    files,
    reader: new PeoplePortraits(source as unknown as Catalogs, files.cache),
  };
}

test('the service answers at once only what the current index resolved', async () => {
  const { reader, data } = service();
  expect(reader.peek({ slug: 'anthony-albanese' })).toBeNull();
  const first = await reader.get({ slug: 'anthony-albanese' });
  expect(first?.info.key).toBe('10007');
  expect(reader.peek({ slug: 'anthony-albanese' })).toEqual(first);
  // Another person, or a name-only request never made, is not answered.
  expect(reader.peek({ slug: 'penny-wong' })).toBeNull();
  expect(reader.peek({ name: 'Anthony Albanese' })).toBeNull();
  // The photo map changes (a removed photo): the record is emptied with the
  // index, so the removed face is not drawn from memory.
  data.photoPeople = Object.fromEntries(
    Object.entries(data.photoPeople!).filter(([, key]) => key !== '10007'),
  ) as typeof data.photoPeople;
  expect(await reader.get({ slug: 'penny-wong' })).not.toBeNull();
  expect(reader.peek({ slug: 'anthony-albanese' })).toBeNull();
  expect(await reader.get({ slug: 'anthony-albanese' })).toBeNull();
  expect(reader.peek({ slug: 'anthony-albanese' })).toBeNull();
});

test('a known portrait is in the first frame, and the lookup still has the last word', async () => {
  const info = portraitFor(
    ['Anthony Albanese'],
    { 'anthony albanese': '10007' } as never,
    {},
  )!;
  const value = { info, localURI: 'file:///cache/10007.webp' };
  mockPortraitPeek.mockReturnValue(value);
  let answer!: (value: unknown) => void;
  mockPortraitGet.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  const onCredit = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <CachedPortrait
        name="Anthony Albanese"
        slug="anthony-albanese"
        onCredit={onCredit}
        testID="face"
      />,
    );
  });
  // First commit, the lookup still pending: the face, not the blank circle.
  const image = renderer.root.findByType(Image);
  expect(image.props.source).toEqual({ uri: value.localURI });
  expect(renderer.root.findAllByProps({ testID: 'face-blank' })).toHaveLength(
    0,
  );
  act(() => image.props.onLoad());
  expect(onCredit).toHaveBeenLastCalledWith(info);
  // The same answer keeps the drawn image (no reload, no blank frame).
  await act(async () => answer(value));
  expect(renderer.root.findByType(Image).props.source).toEqual({
    uri: value.localURI,
  });
  // A retry asks afresh and shows nothing from memory.
  mockPortraitGet.mockResolvedValue(null);
  await act(async () =>
    renderer.update(
      <CachedPortrait
        name="Anthony Albanese"
        slug="anthony-albanese"
        onCredit={onCredit}
        testID="face"
        retryKey={1}
      />,
    ),
  );
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  act(() => renderer.unmount());
});

test('the lookup answering "no portrait" clears a face drawn from memory', async () => {
  const info = portraitFor(
    ['Anthony Albanese'],
    { 'anthony albanese': '10007' } as never,
    {},
  )!;
  mockPortraitPeek.mockReturnValue({
    info,
    localURI: 'file:///cache/10007.webp',
  });
  mockPortraitGet.mockResolvedValue(null);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <CachedPortrait name="Anthony Albanese" slug="anthony-albanese" />,
    );
  });
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  act(() => renderer.unmount());
});

test("a speech row's speaker is in the first frame too, and the lookup still decides", async () => {
  const info = portraitFor(
    ['Anthony Albanese'],
    { 'anthony albanese': '10007' } as never,
    {},
  )!;
  mockPortraitPeek.mockReturnValue({
    info,
    localURI: 'file:///cache/10007.webp',
  });
  let answer!: (value: unknown) => void;
  mockPortraitGet.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SpeakerPortrait name="Anthony Albanese" slug="anthony-albanese" />,
    );
  });
  expect(mockPortraitPeek).toHaveBeenLastCalledWith({
    name: 'Anthony Albanese',
    slug: 'anthony-albanese',
  });
  expect(renderer.root.findByType(Image).props.source).toEqual({
    uri: 'file:///cache/10007.webp',
  });
  // The lookup says there is no portrait now: the face goes.
  await act(async () => answer(null));
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  act(() => renderer.unmount());
  // Nothing known: nothing drawn until the lookup answers.
  mockPortraitPeek.mockReturnValue(null);
  mockPortraitGet.mockReturnValue(new Promise(() => undefined));
  act(() => {
    renderer = TestRenderer.create(
      <SpeakerPortrait name="Penny Wong" slug="penny-wong" />,
    );
  });
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  act(() => renderer.unmount());
});
