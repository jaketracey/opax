import { abortError } from '../../api/abort';

/** Optional readers share the core title's native layout, then two frames. */
export function createPartyPresentation() {
  let didLayout!: () => void;
  const layout = new Promise<void>((resolve) => {
    didLayout = resolve;
  });
  return {
    didLayout,
    afterFrame: async (signal?: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          signal?.removeEventListener('abort', abort);
          reject(abortError());
        };
        if (signal?.aborted) return abort();
        signal?.addEventListener('abort', abort, { once: true });
        void layout.then(() => {
          signal?.removeEventListener('abort', abort);
          if (signal?.aborted) reject(abortError());
          else resolve();
        });
      });
      await afterPartyFrame(signal);
    },
  };
}

/** Leave two native frame turns for the party's core before optional work. */
export function afterPartyFrame(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let frame: number;
    let finished = false;
    const finish = (cancelled = false) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      signal?.removeEventListener('abort', abort);
      if (cancelled) reject(abortError());
      else resolve();
    };
    const abort = () => finish(true);
    signal?.addEventListener('abort', abort, { once: true });
    frame = requestAnimationFrame(() => {
      if (!finished) frame = requestAnimationFrame(() => finish());
    });
  });
}
