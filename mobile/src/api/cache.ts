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
const isSearch = (url: string) =>
  url.split('?')[0]!.endsWith('/api/search-all');
const bucket = (url: string) => (isSearch(url) ? 'search' : 'catalog');
export class CatalogCache {
  private queue: Promise<unknown> = Promise.resolve();
  private searches = new Map<string, CacheEntry>();
  // Parsed catalog snapshots share the disk cache's entry/byte bound. Expiry
  // remains ApiClient's decision; retaining a body never makes it fresh.
  private catalogs = new Map<string, CacheEntry>();
  private catalogBytes = new Map<string, number>();
  private reads = new Map<string, Promise<CacheEntry | undefined>>();
  private index?: CacheIndexEntry[];
  private indexLoad?: Promise<CacheIndexEntry[]>;
  constructor(
    private store: CacheStore,
    private maxBytes = 12 * 1024 * 1024,
    private maxEntries = 40,
    private searchMaxBytes = 1024 * 1024,
    private searchMaxEntries = 8,
  ) {}
  private async loadIndex() {
    if (this.index) return this.index;
    this.indexLoad ??= this.store
      .readIndex()
      .catch(() => [])
      .then(async (index) => {
        // Remove search pages written by older builds, including query URLs
        // in their index. Only public catalogs remain on disk.
        const catalogs = index.filter(
          (item) => item.bucket !== 'search' && !isSearch(item.url),
        );
        if (catalogs.length !== index.length) {
          try {
            for (const item of index)
              if (!catalogs.includes(item)) await this.store.remove(item.url);
            await this.store.writeIndex(catalogs);
          } catch {
            // Cleanup is best effort: catalog reads and writes must still work.
            // The old disk index (or DiskStore's orphan sweep) retries on launch.
          }
        }
        return (this.index = catalogs);
      });
    return this.indexLoad;
  }
  private readCatalog(url: string): Promise<CacheEntry | undefined> {
    const existing = this.catalogs.get(url);
    if (existing) {
      this.catalogs.delete(url);
      this.catalogs.set(url, existing);
      return Promise.resolve(existing);
    }
    let pending = this.reads.get(url);
    if (!pending) {
      pending = this.store
        .read(url)
        .catch(() => undefined)
        .then((entry) => {
          // A write/eviction can supersede an in-flight disk read.
          if (this.reads.get(url) === pending) {
            this.reads.delete(url);
            if (entry) this.remember(entry);
          }
          return entry;
        });
      this.reads.set(url, pending);
    }
    return pending;
  }
  private remember(entry: CacheEntry) {
    const bytes = this.index?.find((item) => item.url === entry.url)?.bytes;
    this.forget(entry.url);
    if (bytes === undefined || bytes > this.maxBytes || this.maxEntries < 1)
      return;
    let total = [...this.catalogBytes.values()].reduce(
      (sum, size) => sum + size,
      0,
    );
    while (
      this.catalogs.size >= this.maxEntries ||
      total + bytes > this.maxBytes
    ) {
      const oldest = this.catalogs.keys().next().value;
      if (oldest === undefined) break;
      total -= this.catalogBytes.get(oldest) ?? 0;
      this.forget(oldest);
    }
    this.catalogs.set(entry.url, entry);
    this.catalogBytes.set(entry.url, bytes);
  }
  private forget(url: string) {
    this.catalogs.delete(url);
    this.catalogBytes.delete(url);
    this.reads.delete(url);
  }
  async get(url: string): Promise<CacheEntry | undefined> {
    await this.queue;
    if (isSearch(url)) return this.searches.get(url);
    if (!(await this.loadIndex()).some((entry) => entry.url === url)) return;
    return this.readCatalog(url);
  }
  // Serialized compare-and-write; search queries and bodies stay in memory. A caller
  // receives the retained entry when its response loses a validation/date race.
  put(entry: CacheEntry, condition?: WriteCondition): Promise<CacheEntry> {
    const task = this.queue.then(async () => {
      const group = bucket(entry.url);
      const memoryOnly = group === 'search';
      const index: CacheIndexEntry[] = memoryOnly
        ? [...this.searches.values()].map((item) => ({
            url: item.url,
            bytes: new TextEncoder().encode(JSON.stringify(item)).length,
            validatedAt: item.validatedAt,
            bucket: 'search',
          }))
        : await this.loadIndex();
      const current = memoryOnly
        ? this.searches.get(entry.url)
        : await this.readCatalog(entry.url);
      if (current) {
        const currentDate = Date.parse(current.asOf ?? '');
        const incomingDate = Date.parse(entry.asOf ?? '');
        const olderDate = incomingDate < currentDate;
        const newerDate = incomingDate > currentDate;
        // The incoming validation time is this request's observation of now.
        // Future stored times are untrusted after a wall-clock rollback.
        const trustedValidation = current.validatedAt <= entry.validatedAt;
        if (
          olderDate ||
          (condition &&
            ((!newerDate &&
              trustedValidation &&
              condition.requestStartedAt < current.validatedAt) ||
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
      if (memoryOnly) {
        this.searches.set(entry.url, entry);
        for (const item of candidates)
          if (!kept.includes(item)) this.searches.delete(item.url);
        return entry;
      }
      this.forget(entry.url);
      await this.store.write(entry);
      const next = [...kept, ...index.filter((item) => item.bucket !== group)];
      for (const item of candidates)
        if (!kept.includes(item)) {
          this.forget(item.url);
          await this.store.remove(item.url);
        }
      await this.store.writeIndex(next);
      this.index = next;
      if (kept.some((item) => item.url === entry.url)) this.remember(entry);
      return entry;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
export const isFresh = (entry: CacheEntry, now: number) =>
  entry.validatedAt <= now && now < entry.expiresAt;
