import type { ApiClient } from '../../api/client';
import { decodeCorpus } from '../../api/catalog-decoders';
import {
  arcPath,
  decodeIndustryMoney,
  decodeMatrix,
  decodeReport,
  decodeReportIndex,
  decodeSpeeches,
  decodeStats,
  decodeTide,
  decodeTopic,
  decodeTopics,
  reportSlugs,
  topicNames,
  type SpeechFilters,
} from './model';

// Constructing a reader sends nothing. A screen chosen by the reader calls
// these loaders. There is no expiry, background refresh or automatic retry;
// returning to a paid screen reuses the session's promise. Failed requests are
// retried only by a new explicit Try again action.
export class ReportsRepository {
  private session = new Map<string, Promise<unknown>>();
  constructor(private client: Pick<ApiClient, 'get'>) {}
  private read<T>(path: string, decoder: (v: unknown) => T, paid = false) {
    const existing = this.session.get(path);
    if (existing)
      return existing as ReturnType<ApiClient['get']> as Promise<
        import('../../api/client').RecordResult<T>
      >;
    const request = this.client.get(path, decoder, false, {
      retries: paid ? 0 : undefined,
    });
    this.session.set(path, request);
    void request
      .then((result) => {
        if (result.stale && this.session.get(path) === request)
          this.session.delete(path);
      })
      .catch(() => {});
    void request.catch(() => {
      if (this.session.get(path) === request) this.session.delete(path);
    });
    return request;
  }
  index = () => this.read('/reports/index.json', decodeReportIndex);
  report = (slug: string) => {
    if (!reportSlugs.includes(slug as (typeof reportSlugs)[number]))
      return Promise.reject(new Error('Unknown report'));
    return this.read(`/reports/${slug}.json`, decodeReport);
  };
  corpus = () => this.read('/corpus.json', decodeCorpus);
  money = () => this.read('/graph/money.json', decodeIndustryMoney);
  topics = () => this.read('/api/topics', decodeTopics, true);
  tide = () => this.read('/api/tide', decodeTide, true);
  topic = (slug: string) => {
    if (!topicNames[slug]) return Promise.reject(new Error('Unknown topic'));
    return this.read(`/api/topic/${slug}`, decodeTopic, true);
  };
  speeches = (slug: string, filters: SpeechFilters = {}) =>
    this.read(arcPath(slug, filters), decodeSpeeches, true);
  stats = () => this.read('/api/stats', decodeStats, true);
  matrix = () => this.read('/api/matrix', decodeMatrix, true);
}
