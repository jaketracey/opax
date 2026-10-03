import { Directory, File, Paths } from 'expo-file-system';
import type { CacheEntry, CacheIndexEntry, CacheStore } from './cache';
// Stable compact filename; the full URL is checked in the body before reuse.
// Two independent 32-bit hashes avoid OS filename limits on long search URLs.
const key = (url: string) => {
  let a = 2166136261,
    b = 5381;
  for (const char of url) {
    a = Math.imul(a ^ char.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ char.charCodeAt(0);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}.json`;
};
export class DiskStore implements CacheStore {
  private directory = new Directory(Paths.cache, 'opax-catalog-v2');
  private index = new File(this.directory, 'index.json');
  private prepare() {
    this.directory.create({ idempotent: true, intermediates: true });
    const legacy = new Directory(Paths.cache, 'opax-catalog-v1');
    if (legacy.exists) legacy.delete();
  }
  private async atomic(file: File, value: unknown) {
    this.prepare();
    const temporary = new File(this.directory, `${file.name}.tmp`);
    await temporary.write(JSON.stringify(value));
    temporary.move(file, { overwrite: true });
  }
  async readIndex(): Promise<CacheIndexEntry[]> {
    let rows: unknown = [];
    if (this.index.exists) {
      try {
        rows = JSON.parse(await this.index.text());
      } catch {
        /* Reclaim an interrupted/corrupt index. */
      }
    }
    const entries: CacheIndexEntry[] = Array.isArray(rows)
      ? rows.filter(
          (row): row is CacheIndexEntry =>
            !!row &&
            typeof row.url === 'string' &&
            typeof row.bytes === 'number' &&
            Number.isFinite(row.bytes) &&
            row.bytes > 0 &&
            typeof row.validatedAt === 'number' &&
            ['catalog', 'search'].includes(row.bucket),
        )
      : [];
    // A crash between body and index writes can leave an orphan. Reclaim it
    // once at startup, without parsing catalog bodies or allowing disk growth.
    const live = new Set(entries.map((entry) => key(entry.url)));
    if (this.directory.exists)
      for (const file of this.directory.list())
        if (
          file instanceof File &&
          file.name !== 'index.json' &&
          !live.has(file.name)
        )
          file.delete();
    return entries;
  }
  async writeIndex(entries: CacheIndexEntry[]) {
    await this.atomic(this.index, entries);
  }
  async read(url: string): Promise<CacheEntry | undefined> {
    const file = new File(this.directory, key(url));
    if (!file.exists) return;
    const entry = JSON.parse(await file.text());
    if (
      entry?.url !== url ||
      typeof entry.savedAt !== 'number' ||
      typeof entry.validatedAt !== 'number' ||
      typeof entry.expiresAt !== 'number' ||
      !('body' in entry)
    )
      return;
    return entry;
  }
  async write(entry: CacheEntry) {
    const file = new File(this.directory, key(entry.url));
    if (file.exists) {
      let existing;
      try {
        existing = JSON.parse(await file.text());
      } catch {
        /* Repair corrupt cache bytes. */
      }
      if (existing && existing.url !== entry.url)
        throw new Error('Cache key collision');
    }
    await this.atomic(file, entry);
  }
  async remove(url: string) {
    const file = new File(this.directory, key(url));
    if (file.exists) file.delete();
  }
}
