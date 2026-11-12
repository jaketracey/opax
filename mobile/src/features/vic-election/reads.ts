import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ApiClient, RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { isAbortError } from '../../api/abort';
import { object, invalid } from '../../api/validation';
import {
  decodeFind,
  decodeOverview,
  decodeSeat,
  type Overview,
} from './decoders';
import { apiClient } from '../../api/runtime';

export const overviewPath = '/api/app/v1/vic-election';
export class ElectionUnavailable extends Error {
  constructor(public reason: 'not_found' | 'not_published') {
    super(reason);
  }
}
const withAbsence =
  <T>(decode: (v: unknown) => T) =>
  (v: unknown): T | { error: 'not_found' | 'not_published' } => {
    const o = object(v);
    if ('error' in o && !('schema_version' in o)) {
      if (o.error !== 'not_found' && o.error !== 'not_published') invalid();
      return { error: o.error };
    }
    return decode(v);
  };
export type ElectionRead<T> = {
  record: RecordResult<T> | null;
  error: unknown;
  loading: boolean;
};
const initial: ElectionRead<Overview> = {
  record: null,
  error: null,
  loading: true,
};
/** One shared overview snapshot keeps Today and Search in step on withdrawal. */
export class ElectionReads {
  overview: ElectionRead<Overview> = initial;
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  constructor(private client: ApiClient) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.overview;
  private show(value: ElectionRead<Overview>) {
    this.overview = value;
    this.listeners.forEach((fn) => fn());
  }
  async read<T>(
    path: string,
    decode: (v: unknown) => T,
    signal?: AbortSignal,
  ): Promise<RecordResult<T>> {
    const record = await this.client.get(path, withAbsence(decode), true, {
      absence: true,
      signal,
    });
    if (
      record.data &&
      typeof record.data === 'object' &&
      'error' in record.data
    ) {
      await this.client.forget(path);
      const reason = (record.data as { error: 'not_found' | 'not_published' })
        .error;
      if (path === overviewPath || reason === 'not_published') {
        await this.client.forget(overviewPath);
        this.show({
          record: null,
          loading: false,
          error: new ElectionUnavailable('not_published'),
        });
      }
      throw new ElectionUnavailable(reason);
    }
    return record as RecordResult<T>;
  }
  loadOverview = (): Promise<void> => {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      if (!this.overview.record) {
        const saved = await Promise.resolve()
          .then(() => this.client.saved(overviewPath, decodeOverview))
          .catch(() => null);
        if (saved) this.show({ record: saved, error: null, loading: true });
      }
      try {
        this.show({
          record: await this.read(overviewPath, decodeOverview),
          error: null,
          loading: false,
        });
      } catch (error) {
        if (
          error instanceof ElectionUnavailable ||
          (error instanceof ApiError && error.code === 'not-found')
        ) {
          await this.client.forget(overviewPath);
          this.show({
            record: null,
            error: new ElectionUnavailable('not_published'),
            loading: false,
          });
        } else
          this.show({
            record: this.overview.record
              ? { ...this.overview.record, stale: true }
              : null,
            error,
            loading: false,
          });
      }
    })().finally(() => {
      this.pending = null;
    });
    return this.pending;
  };
  seat = (slug: string, signal?: AbortSignal) =>
    this.read(`${overviewPath}/seat/${slug}`, decodeSeat, signal);
  savedSeat = (slug: string) =>
    this.client.saved(`${overviewPath}/seat/${slug}`, decodeSeat);
  find = (q: string, signal?: AbortSignal) =>
    this.client.get(
      `${overviewPath}/find?${new URLSearchParams({ q: q.trim().slice(0, 60) })}`,
      decodeFind,
      true,
      { signal, retries: 0 },
    );
}
export const electionReads = new ElectionReads(apiClient);
export function useOverview(enabled = true, attempt = 0) {
  const state = useSyncExternalStore(
    electionReads.subscribe,
    electionReads.snapshot,
  );
  useEffect(() => {
    if (enabled) void electionReads.loadOverview();
  }, [enabled, attempt]);
  return { ...state, retry: electionReads.loadOverview };
}
export function useElectionSeat(slug: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    ElectionRead<Awaited<ReturnType<typeof electionReads.seat>>['data']> & {
      slug: string;
    }
  >({ record: null, error: null, loading: true, slug });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const saved = await electionReads.savedSeat(slug).catch(() => null);
      if (!controller.signal.aborted && saved)
        setState({ record: saved, error: null, loading: true, slug });
      try {
        const record = await electionReads.seat(slug, controller.signal);
        if (!controller.signal.aborted)
          setState({ record, error: null, loading: false, slug });
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error))
          setState((prev) => ({
            record:
              error instanceof ElectionUnavailable
                ? null
                : prev.slug === slug
                  ? prev.record
                    ? { ...prev.record, stale: true }
                    : null
                  : null,
            error,
            loading: false,
            slug,
          }));
      }
    })();
    return () => controller.abort();
  }, [slug, attempt]);
  return {
    ...(state.slug === slug
      ? state
      : { record: null, loading: true, error: null }),
    retry: () => setAttempt((n) => n + 1),
  };
}
