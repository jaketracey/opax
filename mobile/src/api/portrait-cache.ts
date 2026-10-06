import { portraitKeyPattern } from './portrait-policy';
import { ApiError } from './errors';
export interface SavedPortrait {
  localURI: string;
  savedAt: number;
}
export interface PortraitStore {
  read(key: string): Promise<SavedPortrait | undefined>;
  write(key: string, bytes: Uint8Array): Promise<SavedPortrait>;
}
/** Deduplicate by file key, bound all reads/downloads, retain valid offline files. */
export class PortraitCache {
  private pending = new Map<string, Promise<string>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private store: PortraitStore,
    private client: { getPortrait(path: string): Promise<Uint8Array> },
    private concurrency = 3,
    private now = Date.now,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6)
      throw new Error('Invalid portrait concurrency');
  }
  get(key: string, force = false): Promise<string> {
    if (!portraitKeyPattern.test(key))
      return Promise.reject(new Error('Invalid portrait key'));
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
      if (
        saved &&
        !force &&
        saved.savedAt <= this.now() &&
        this.now() - saved.savedAt < 86400000
      )
        return saved.localURI;
      try {
        const bytes = await this.client.getPortrait(`/photos/${key}.webp`);
        return (await this.store.write(key, bytes)).localURI;
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
