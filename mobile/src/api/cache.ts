export interface CacheEntry {
  url: string;
  body: unknown;
  savedAt: number;
  validatedAt: number;
  expiresAt: number;
  asOf: string | null;
  etag?: string;
}
export interface CacheIndexEntry {
  url: string;
  bytes: number;
  validatedAt: number;
  bucket: 'catalog' | 'search';
}
export interface CacheStore {
  readIndex(): Promise<CacheIndexEntry[]>;
  writeIndex(entries: CacheIndexEntry[]): Promise<void>;
  read(url: string): Promise<CacheEntry | undefined>;
  write(entry: CacheEntry): Promise<void>;
  remove(url: string): Promise<void>;
}
export interface WriteCondition {
  requestStartedAt: number;
  // Present only for a conditional 304; an absent ETag cannot validate a body.
  revalidatedETag?: string;
}
const bucket = (url: string) =>
  url.includes('/api/search-all?') ? 'search' : 'catalog';
export class CatalogCache {
  private queue: Promise<unknown> = Promise.resolve();
  private index?: CacheIndexEntry[];
  constructor(
    private store: CacheStore,
    private maxBytes = 12 * 1024 * 1024,
    private maxEntries = 40,
    private searchMaxBytes = 1024 * 1024,
    private searchMaxEntries = 8,
  ) {}
  private async loadIndex() {
    this.index ??= await this.store.readIndex().catch(() => []);
    return this.index;
  }
  async get(url: string): Promise<CacheEntry | undefined> {
    await this.queue;
    if (!(await this.loadIndex()).some((entry) => entry.url === url)) return;
    return this.store.read(url).catch(() => undefined);
  }
  // Serialized compare-and-write, including a fresh per-URL disk read. A caller
  // receives the retained entry when its response loses a validation/date race.
  put(entry: CacheEntry, condition?: WriteCondition): Promise<CacheEntry> {
    const task = this.queue.then(async () => {
      const index = await this.loadIndex();
      const current = await this.store.read(entry.url).catch(() => undefined);
      if (current) {
        const olderDate =
          current.asOf &&
          entry.asOf &&
          Date.parse(entry.asOf) < Date.parse(current.asOf);
        if (
          olderDate ||
          (condition &&
            (condition.requestStartedAt < current.validatedAt ||
              ('revalidatedETag' in condition &&
                (!condition.revalidatedETag ||
                  current.etag !== condition.revalidatedETag))))
        )
          return current;
      } else if (condition && 'revalidatedETag' in condition) {
        // The validator's body has disappeared; do not resurrect it.
        return entry;
      }
      const bytes = new TextEncoder().encode(JSON.stringify(entry)).length;
      const group = bucket(entry.url);
      const maxBytes = group === 'search' ? this.searchMaxBytes : this.maxBytes;
      const maxEntries =
        group === 'search' ? this.searchMaxEntries : this.maxEntries;
      if (bytes > maxBytes) return entry;
      const metadata: CacheIndexEntry = {
        url: entry.url,
        bytes,
        validatedAt: entry.validatedAt,
        bucket: group,
      };
      const candidates = [
        metadata,
        ...index.filter((item) => item.url !== entry.url),
      ]
        .filter((item) => item.bucket === group)
        .sort((a, b) => b.validatedAt - a.validatedAt);
      let total = 0;
      const kept = candidates.filter((item, i) => {
        total += item.bytes;
        return i < maxEntries && total <= maxBytes;
      });
      await this.store.write(entry);
      const next = [...kept, ...index.filter((item) => item.bucket !== group)];
      for (const item of candidates)
        if (!kept.includes(item)) await this.store.remove(item.url);
      await this.store.writeIndex(next);
      this.index = next;
      return entry;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
export const isFresh = (entry: CacheEntry, now: number) =>
  now < entry.expiresAt;
