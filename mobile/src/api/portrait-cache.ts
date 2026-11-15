import { portraitKeyPattern } from './portrait-policy';
import { ApiError } from './errors';
export interface SavedPortrait {
  localURI: string;
  savedAt: number;
}
export interface PortraitStore {
  read(key: string): Promise<SavedPortrait | undefined>;
  write(key: string, bytes: Uint8Array): Promise<SavedPortrait>;
  /** Without reading it: the file's URI if it is still on disk. */
  has?(key: string): string | undefined;
}
const DAY = 86400000;
/** Deduplicate by file key, bound all reads/downloads, retain valid offline files. */
export class PortraitCache {
  private pending = new Map<string, Promise<string>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  /**
   * Files read and checked, or written, in this launch, with their save
   * time. A row that comes back into view (a list scrolling, a screen
   * returning) asks for the same portrait again; it is answered from here
   * while the file is still on disk and under a day old, without loading
   * and checking its bytes a second time.
   */
  private checked = new Map<string, number>();
  constructor(
    private store: PortraitStore,
    private client: { getPortrait(path: string): Promise<Uint8Array> },
    private concurrency = 3,
    private now = Date.now,
    private files = {
      keyPattern: portraitKeyPattern,
      path: (key: string) => `/photos/${key}.webp`,
    },
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6)
      throw new Error('Invalid portrait concurrency');
  }
  /**
   * A portrait already checked in this launch, at once: its URI if the file
   * is still on disk and fresh. For a first frame; `get` remains the answer.
   */
  peek(key: string): string | undefined {
    const savedAt = this.checked.get(key);
    if (savedAt === undefined) return;
    const now = this.now();
    if (savedAt > now || now - savedAt >= DAY) return;
    let uri: string | undefined;
    try {
      uri = this.store.has?.(key);
    } catch {
      uri = undefined;
    }
    // Evicted by the store's budget, or cleared by the system.
    if (!uri) this.checked.delete(key);
    return uri;
  }
  get(key: string, force = false): Promise<string> {
    if (!this.files.keyPattern.test(key))
      return Promise.reject(new Error('Invalid portrait key'));
    if (!force) {
      const known = this.peek(key);
      if (known) return Promise.resolve(known);
    }
    const previous = this.pending.get(key);
    if (previous) return previous;
    const task = this.load(key, force).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
  private async load(key: string, force: boolean): Promise<string> {
    if (this.active >= this.concurrency)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      const saved = await this.store.read(key).catch(() => undefined);
      if (saved) this.checked.set(key, saved.savedAt);
      else this.checked.delete(key);
      if (
        saved &&
        !force &&
        saved.savedAt <= this.now() &&
        this.now() - saved.savedAt < DAY
      )
        return saved.localURI;
      try {
        const bytes = await this.client.getPortrait(this.files.path(key));
        const written = await this.store.write(key, bytes);
        this.checked.set(key, written.savedAt);
        return written.localURI;
      } catch (error) {
        if (
          saved &&
          !(
            error instanceof ApiError &&
            ['forbidden', 'invalid-data', 'not-found'].includes(error.code)
          )
        )
          return saved.localURI;
        throw error;
      }
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
