import type { ApiClient } from '../../api/client';
import { decodeCorpus } from '../../api/catalog-decoders';
import {
  arcPath,
  decodeIndustryMoney,
  decodeMatrix,
  decodeSpeeches,
  decodeStats,
  decodeTide,
  decodeTopic,
  decodeTopics,
  topicNames,
  type SpeechFilters,
} from './model';

// Constructing a reader sends nothing. A screen chosen by the reader calls
// these loaders. There is no expiry, background refresh or automatic retry;
// returning to a paid screen reuses the session's promise. Failed requests are
// retried only by a new explicit Try again action; pull to refresh (`fresh`)
// is the reader's explicit action to read again.
export class ReportsRepository {
  private session = new Map<string, Promise<unknown>>();
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  private read<T>(
    path: string,
    decoder: (v: unknown) => T,
    paid = false,
    fresh = false,
  ) {
    if (fresh) this.session.delete(path);
    const existing = this.session.get(path);
    if (existing)
      return existing as ReturnType<ApiClient['get']> as Promise<
        import('../../api/client').RecordResult<T>
      >;
    const request = paid
      ? this.client.getForAction(path, decoder)
      : this.client.get(path, decoder);
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
  corpus = () => this.read('/corpus.json', decodeCorpus);
  money = () => this.read('/graph/money.json', decodeIndustryMoney);
  topics = (fresh = false) =>
    this.read('/api/topics', decodeTopics, true, fresh);
  tide = (fresh = false) => this.read('/api/tide', decodeTide, true, fresh);
  topic = (slug: string, fresh = false) => {
    if (!topicNames[slug]) return Promise.reject(new Error('Unknown topic'));
    return this.read(`/api/topic/${slug}`, decodeTopic, true, fresh);
  };
  speeches = (slug: string, filters: SpeechFilters = {}, fresh = false) =>
    this.read(arcPath(slug, filters), decodeSpeeches, true, fresh);
  stats = () => this.read('/api/stats', decodeStats, true);
  matrix = () => this.read('/api/matrix', decodeMatrix, true);
}
