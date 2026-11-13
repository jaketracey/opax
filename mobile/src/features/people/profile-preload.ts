import { useCallback } from 'react';
import { AppState } from 'react-native';
import {
  decodeExpenseCategories,
  decodeExpenses,
  decodePay,
  decodeVotes,
} from '../../api/catalog-decoders';
import type { ApiClient } from '../../api/client';
import { perfHeap, perfMark } from '../../perf/probe';

/**
 * The four catalogs a profile reads beyond the directory and Today's own
 * reads (PF2): the same paths and decoders as Catalogs.votes, pay, expenses
 * and expenseCategories. The client keys its decoded snapshots by body and
 * decoder, so a profile opened later reuses what the preload decoded.
 */
export const PROFILE_PRELOAD: readonly {
  path: string;
  decode: (value: unknown) => unknown;
}[] = [
  { path: '/votes.json', decode: decodeVotes },
  { path: '/pay.json', decode: decodePay },
  { path: '/expenses.json', decode: decodeExpenses },
  { path: '/expense-categories.json', decode: decodeExpenseCategories },
];

/** After Today's first content is drawn, before the first idle read. */
export const PRELOAD_SETTLE_MS = 1500;

export type PreloadResult = {
  outcome: 'done' | 'cancelled' | 'unavailable';
  /** Saved and decoded now (or already in memory). */
  read: string[];
  /** Not saved on this device: left for the profile's own read. */
  skipped: string[];
};

const cancelled = () =>
  Object.assign(new Error('Cancelled'), { name: 'AbortError' });

/** The next moment the JS thread has nothing else queued. */
export function idleSlot(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(cancelled());
    const request = globalThis.requestIdleCallback;
    const cancel = globalThis.cancelIdleCallback;
    if (typeof request !== 'function')
      return reject(new Error('No idle callbacks'));
    const abort = () => {
      cancel?.(id);
      reject(cancelled());
    };
    const id = request(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** One drawn frame, then the settle time, then an idle slot. */
export function afterDrawn(
  signal: AbortSignal,
  settleMs = PRELOAD_SETTLE_MS,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(cancelled());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(resolve, settleMs);
    });
    signal.addEventListener(
      'abort',
      () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        reject(cancelled());
      },
      { once: true },
    );
  }).then(() => idleSlot(signal));
}

/**
 * Reads the profile catalogs from the saved copies only, one per idle slot,
 * through the client's decode path. Never a network read: a catalog that is
 * not saved is skipped and the profile reads it as before. Stops between
 * catalogs when `signal` aborts or the app is no longer active; a read
 * already started finishes (the profile it gives way to reuses it).
 */
export async function preloadProfileCatalogs(
  client: Pick<ApiClient, 'saved'>,
  {
    signal,
    first = afterDrawn,
    next = idleSlot,
    active = () => AppState.currentState === 'active',
  }: {
    signal: AbortSignal;
    first?: (signal: AbortSignal) => Promise<void>;
    next?: (signal: AbortSignal) => Promise<void>;
    active?: () => boolean;
  },
): Promise<PreloadResult> {
  const result: PreloadResult = { outcome: 'done', read: [], skipped: [] };
  let wait = first;
  for (const { path, decode } of PROFILE_PRELOAD) {
    try {
      await wait(signal);
    } catch {
      result.outcome = signal.aborted ? 'cancelled' : 'unavailable';
      break;
    }
    wait = next;
    if (signal.aborted || !active()) {
      result.outcome = 'cancelled';
      break;
    }
    if (!result.read.length && !result.skipped.length) {
      perfMark('preload-start');
      perfHeap('preload-heap-start');
    }
    let saved = null;
    try {
      saved = await client.saved(path, decode);
    } catch {
      saved = null;
    }
    (saved ? result.read : result.skipped).push(path);
    perfMark(saved ? 'preload-read' : 'preload-skip', path);
  }
  if (result.read.length || result.skipped.length) {
    perfHeap('preload-heap-end');
    perfMark(`preload-${result.outcome}`);
  }
  return result;
}

// Clients whose preload finished this session: it runs once per launch.
const finished = new WeakSet<object>();

/**
 * Starts the preload for `client` while the app is active, stopping when it
 * leaves (and starting again on return) until it has finished once. The
 * returned stop cancels a pending wait; call it when Today loses focus.
 */
export function startProfilePreload(
  client: Pick<ApiClient, 'saved'>,
  options: {
    first?: (signal: AbortSignal) => Promise<void>;
    next?: (signal: AbortSignal) => Promise<void>;
  } = {},
): () => void {
  let run: AbortController | null = null;
  const begin = () => {
    if (run || finished.has(client) || AppState.currentState !== 'active')
      return;
    const controller = (run = new AbortController());
    void preloadProfileCatalogs(client, {
      ...options,
      signal: controller.signal,
    }).then((result) => {
      if (run === controller) run = null;
      if (result.outcome !== 'cancelled') finished.add(client);
    });
  };
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') begin();
    else {
      run?.abort();
      run = null;
    }
  });
  begin();
  return () => {
    subscription.remove();
    run?.abort();
    run = null;
  };
}

/**
 * Today's preload (PF2): starts once Today's body is drawn, only while the
 * screen has focus, and stops when it loses it (a tap that navigates away
 * cancels the waits still queued). `useFocus` is the screen's focus effect.
 */
export function useProfilePreload(
  client: Pick<ApiClient, 'saved'>,
  drawn: boolean,
  useFocus: (effect: () => void | (() => void)) => void,
) {
  useFocus(
    useCallback(
      () => (drawn ? startProfilePreload(client) : undefined),
      [client, drawn],
    ),
  );
}
