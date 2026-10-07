import type { ApiClient, RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import {
  decodeBriefs,
  decodeManifest,
  decodeRecords,
  decodeReports,
  decodeSummary,
} from './decoders';
import {
  isMoreKind,
  searchParams,
  type SearchFilters,
  type SearchSort,
} from './contracts';

/** Session snapshots and in-flight coalescing: returning or tapping twice
 * cannot spend twice. A failed action is retried only by another explicit tap. */
export class RecordSearch {
  private session = new Map<string, Promise<RecordResult<unknown>>>();
  constructor(private client: ApiClient) {}
  private read<T>(
    path: string,
    decode: (v: unknown) => T,
    summaryStream = false,
  ): Promise<RecordResult<T>> {
    const cached = this.session.get(path);
    if (cached) return cached as Promise<RecordResult<T>>;
    const pending = this.client.get(path, decode, false, {
      retries: 0,
      timeoutMs: summaryStream ? 85000 : 15000,
      summaryStream,
    });
    while (this.session.size >= 128)
      this.session.delete(this.session.keys().next().value!);
    this.session.set(path, pending);
    pending.catch(() => {
      if (this.session.get(path) === pending) this.session.delete(path);
    });
    return pending;
  }
  search(
    q: string,
    f: SearchFilters,
    page = 1,
    sort: SearchSort = 'relevance',
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
    );
  }
  summary(q: string, f: SearchFilters) {
    return this.read(
      `/api/search-summary?stream=1&${searchParams(q, f, 1, 'relevance')}`,
      decodeSummary,
      true,
    );
  }
  briefs(resources: string[]) {
    const ids = [...new Set(resources.filter((r) => /^[a-f0-9]{32}$/.test(r)))];
    if (!ids.length) return Promise.resolve(null);
    return this.read(
      '/api/brief?' + new URLSearchParams({ rids: ids.slice(0, 24).join(',') }),
      decodeBriefs,
    );
  }
  async suggestions(refresh = false) {
    const [manifest, reports] = await Promise.all([
      this.client.get('/search-catalog/manifest.json', decodeManifest, refresh),
      this.client.get('/reports/index.json', decodeReports, refresh),
    ]);
    return { manifest, reports };
  }
}
