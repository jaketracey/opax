import { Directory, File, Paths } from 'expo-file-system';
import type { PortraitStore, SavedPortrait } from './portrait-cache';
import { assertPortraitBytes, portraitKeyPattern } from './portrait-policy';
// Separate fixture/development/production origins. Never reuse another server's file.
export function portraitNamespace(origin: string): string {
  let hash = 2166136261;
  for (const char of origin)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function portraitDirectory(origin: string) {
  return new Directory(
    Paths.cache,
    'opax-portraits-v1',
    portraitNamespace(origin),
  );
}
export class PortraitDiskStore implements PortraitStore {
  private directory: Directory;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    origin: string,
    private maxBytes = 12 * 1024 * 1024,
    private maxEntries = 1024,
  ) {
    this.directory = portraitDirectory(origin);
  }
  private file(key: string) {
    if (!portraitKeyPattern.test(key)) throw new Error('Invalid portrait key');
    return new File(this.directory, `${key}.webp`);
  }
  async read(key: string): Promise<SavedPortrait | undefined> {
    await this.writes;
    const file = this.file(key);
    if (!file.exists) return;
    try {
      assertPortraitBytes(await file.bytes());
    } catch {
      file.delete();
      return;
    }
    return { localURI: file.uri, savedAt: file.modificationTime ?? 0 };
  }
  write(key: string, bytes: Uint8Array): Promise<SavedPortrait> {
    assertPortraitBytes(bytes);
    const file = this.file(key);
    const task = this.writes.then(async () => {
      this.directory.create({ idempotent: true, intermediates: true });
      // Writes are serialized; reclaim partial files from an interrupted launch.
      for (const entry of this.directory.list())
        if (entry instanceof File && entry.name.endsWith('.tmp'))
          entry.delete();
      const temporary = new File(this.directory, `${key}.tmp`);
      let moved = false;
      try {
        await temporary.write(bytes);
        // The native move is asynchronous: publish the URI only after it exists.
        await temporary.move(file, { overwrite: true });
        moved = true;
      } finally {
        if (!moved && temporary.exists) temporary.delete();
      }
      // The finite file/byte budget also covers files left by previous launches.
      const files = this.directory
        .list()
        .filter(
          (entry): entry is File =>
            entry instanceof File && entry.name.endsWith('.webp'),
        )
        .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
      let total = 0;
      files.forEach((entry, i) => {
        total += entry.size;
        if (i >= this.maxEntries || total > this.maxBytes) entry.delete();
      });
      return {
        localURI: file.uri,
        savedAt: file.modificationTime ?? Date.now(),
      };
    });
    this.writes = task.catch(() => undefined);
    return task;
  }
}
