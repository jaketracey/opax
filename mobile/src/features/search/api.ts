import { ReadSession } from '../../api/read-session';
import type { ApiClient, RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import {
  isMoreKind,
  searchParams,
  type SearchFilters,
  type SearchSort,
} from './contracts';
import {
  decodeBriefs,
  decodeManifest,
  decodeRecords,
  decodeSummary,
} from './decoders';

/** Session snapshots and in-flight coalescing: returning or tapping twice
 * cannot spend twice. A failed action is retried only by another explicit tap. */
export class RecordSearch {
  private session = new ReadSession<RecordResult<unknown>>(128);
  constructor(private client: ApiClient) {}
  private read<T>(
    path: string,
    decode: (v: unknown) => T,
    summaryStream = false,
    signal?: AbortSignal,
  ): Promise<RecordResult<T>> {
    return this.session.read(
      path,
      (requestSignal) =>
        path.startsWith('/api/brief?')
          ? this.client.getForAction(path, decode, { signal: requestSignal })
          : this.client.get(path, decode, false, {
              retries: 0,
              timeoutMs: summaryStream ? 85000 : 15000,
              summaryStream,
              signal: requestSignal,
            }),
      { signal },
    ) as Promise<RecordResult<T>>;
  }
  search(
    q: string,
    f: SearchFilters,
    page = 1,
    sort: SearchSort = 'relevance',
    signal?: AbortSignal,
  ) {
    if (!isMoreKind(f.kind) && ['tas', 'wa', 'nt'].includes(f.state))
      return Promise.reject(
        new ApiError(
          'not-found',
          'Document search is not available for this jurisdiction. Choose another jurisdiction or a public-record catalog.',
        ),
      );
    return this.read(
      `${isMoreKind(f.kind) ? '/api/search-all' : '/api/search'}?${searchParams(q, f, page, sort)}`,
      decodeRecords,
      false,
      signal,
    );
  }
  summary(q: string, f: SearchFilters, signal?: AbortSignal) {
    return this.read(
      `/api/search-summary?stream=1&${searchParams(q, f, 1, 'relevance')}`,
      decodeSummary,
      true,
      signal,
    );
  }
  briefs(resources: string[], signal?: AbortSignal) {
    const ids = [...new Set(resources.filter((r) => /^[a-f0-9]{32}$/.test(r)))];
    if (!ids.length) return Promise.resolve(null);
    return this.read(
      '/api/brief?' + new URLSearchParams({ rids: ids.slice(0, 24).join(',') }),
      decodeBriefs,
      undefined,
      signal,
    );
  }
  async suggestions(refresh = false, signal?: AbortSignal) {
    const manifest = await this.client.get(
      '/search-catalog/manifest.json',
      decodeManifest,
      refresh,
      { signal },
    );
    return { manifest };
  }
}
