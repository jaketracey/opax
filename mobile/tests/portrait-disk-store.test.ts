import { PortraitDiskStore } from '../src/api/portrait-disk-store';
import { pinnedBytes } from './pinned';
const mockFiles = new Map<string, { bytes: Uint8Array; at: number }>();
let mockClock = 1000;
let mockMoveDelay: Promise<void> | undefined;
let mockMoveStarted: (() => void) | undefined;
jest.mock('expo-file-system', () => {
  const joined = (parts: (string | { uri: string })[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : p.uri))
      .join('/')
      .replace(/(?<!:)\/{2,}/g, '/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joined(parts);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.bytes.length ?? 0;
    }
    get modificationTime() {
      return mockFiles.get(this.uri)?.at;
    }
    async bytes() {
      return mockFiles.get(this.uri)!.bytes;
    }
    async write(bytes: Uint8Array) {
      mockFiles.set(this.uri, { bytes: bytes.slice(), at: ++mockClock });
    }
    async move(destination: File) {
      mockMoveStarted?.();
      await mockMoveDelay;
      const row = mockFiles.get(this.uri)!;
      mockFiles.delete(this.uri);
      this.uri = destination.uri;
      mockFiles.set(this.uri, row);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return {
    File,
    Paths: { cache: { uri: 'file:///cache' } },
    Directory: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = joined(parts);
      }
      create() {}
      list() {
        return [...mockFiles.keys()]
          .filter((key) => key.startsWith(this.uri + '/'))
          .map((key) => new File(key));
      }
    },
  };
});
beforeEach(() => {
  mockFiles.clear();
  mockMoveDelay = undefined;
  mockMoveStarted = undefined;
});
test('atomic move retains the destination when Expo changes the temporary File URI', async () => {
  const bytes = new Uint8Array(pinnedBytes('/photos/10007.webp'));
  const store = new PortraitDiskStore('https://example.test');
  const saved = await store.write('10007', bytes);
  expect(await store.read('10007')).toEqual(saved);
  expect(mockFiles.get(saved.localURI)?.bytes).toEqual(bytes);
  expect([...mockFiles.keys()].some((key) => key.endsWith('.tmp'))).toBe(false);
});
test('bounded disk cache evicts older files and isolates server origins', async () => {
  const bytes = new Uint8Array(pinnedBytes('/photos/10007.webp'));
  const store = new PortraitDiskStore(
    'https://example.test',
    bytes.length * 2,
    2,
  );
  for (const key of ['10007', '10678', '10257']) await store.write(key, bytes);
  expect(await store.read('10007')).toBeUndefined();
  expect(await store.read('10257')).toBeDefined();
  expect(mockFiles.size).toBe(2);
  expect(
    await new PortraitDiskStore('http://127.0.0.1:8916').read('10257'),
  ).toBeUndefined();
});

test('does not publish a URI or release queued reads before the asynchronous move finishes', async () => {
  const bytes = new Uint8Array(pinnedBytes('/photos/10007.webp'));
  const store = new PortraitDiskStore('https://example.test');
  let completeMove!: () => void;
  mockMoveDelay = new Promise<void>((resolve) => {
    completeMove = resolve;
  });
  const started = new Promise<void>((resolve) => {
    mockMoveStarted = resolve;
  });
  let published = false;
  const write = store.write('10007', bytes).then((saved) => {
    published = true;
    return saved;
  });
  await started;
  const read = store.read('10007');
  await Promise.resolve();
  await Promise.resolve();
  expect(published).toBe(false);
  expect([...mockFiles.keys()]).toEqual([expect.stringMatching(/10007\.tmp$/)]);
  completeMove();
  const saved = await write;
  expect(await read).toEqual(saved);
  expect(mockFiles.get(saved.localURI)?.bytes).toEqual(bytes);
  expect([...mockFiles.keys()]).toEqual([saved.localURI]);
});

test('cleans the temporary file and rejects an asynchronous move failure', async () => {
  const bytes = new Uint8Array(pinnedBytes('/photos/10007.webp'));
  const store = new PortraitDiskStore('https://example.test');
  let failMove!: (reason: Error) => void;
  mockMoveDelay = new Promise<void>((_resolve, reject) => {
    failMove = reject;
  });
  const started = new Promise<void>((resolve) => {
    mockMoveStarted = resolve;
  });
  const writing = store.write('10007', bytes);
  const failure = expect(writing).rejects.toThrow('move failed');
  await started;
  failMove(new Error('move failed'));
  await failure;
  expect(mockFiles.size).toBe(0);
  expect(await store.read('10007')).toBeUndefined();
});
