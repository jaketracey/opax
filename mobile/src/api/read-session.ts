import { abortError, throwIfAborted } from './abort';

interface Read<T> {
  controller: AbortController;
  promise: Promise<T>;
  readers: number;
  settled: boolean;
}

/** Session snapshots with cancellation owned by the screens still reading. */
export class ReadSession<T> {
  private reads = new Map<string, Read<T>>();
  constructor(private limit = Infinity) {}

  has(key: string) {
    return this.reads.has(key);
  }
  read(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    {
      fresh = false,
      signal,
      retain = () => true,
      keepPrevious = false,
    }: {
      fresh?: boolean;
      signal?: AbortSignal;
      retain?: (value: T) => boolean;
      keepPrevious?: boolean;
    } = {},
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    const held = this.reads.get(key);
    let read = !fresh ? held : undefined;
    if (!read) {
      const controller = new AbortController();
      read = { controller, readers: 0, settled: false, promise: undefined! };
      const current = read;
      current.promise = Promise.resolve()
        .then(() => {
          throwIfAborted(controller.signal);
          return load(controller.signal);
        })
        .then((value) => {
          throwIfAborted(controller.signal);
          current.settled = true;
          if (!retain(value) && this.reads.get(key) === current)
            this.reads.delete(key);
          return value;
        })
        .catch((error: unknown) => {
          if (this.reads.get(key) === current) {
            if (
              fresh &&
              keepPrevious &&
              held?.settled &&
              !held.controller.signal.aborted
            )
              this.reads.set(key, held);
            else this.reads.delete(key);
          }
          throw error;
        });
      while (this.reads.size >= this.limit)
        this.reads.delete(this.reads.keys().next().value!);
      this.reads.set(key, current);
    }
    const current = read;
    if (!signal || current.settled) {
      if (!current.settled) current.readers += 1;
      return current.promise;
    }
    current.readers += 1;
    return new Promise<T>((resolve, reject) => {
      let active = true;
      const release = () => {
        if (!active) return false;
        active = false;
        signal.removeEventListener('abort', cancel);
        current.readers -= 1;
        return true;
      };
      const cancel = () => {
        if (!release()) return;
        if (!current.settled && current.readers === 0) {
          if (this.reads.get(key) === current) {
            if (
              fresh &&
              keepPrevious &&
              held?.settled &&
              !held.controller.signal.aborted
            )
              this.reads.set(key, held);
            else this.reads.delete(key);
          }
          current.controller.abort();
        }
        reject(abortError());
      };
      signal.addEventListener('abort', cancel, { once: true });
      current.promise.then(
        (value) => {
          if (release()) resolve(value);
        },
        (error: unknown) => {
          if (release()) reject(error);
        },
      );
    });
  }
}
