import { ReadSession } from '../../api/read-session';
import type { ApiClient, RecordResult } from '../../api/client';
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
  private session = new ReadSession<RecordResult<unknown>>();
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  private read<T>(
    path: string,
    decoder: (v: unknown) => T,
    paid = false,
    fresh = false,
    signal?: AbortSignal,
  ) {
    return this.session.read(
      path,
      (requestSignal) =>
        paid
          ? this.client.getForAction(path, decoder, { signal: requestSignal })
          : this.client.get(path, decoder, false, { signal: requestSignal }),
      { fresh, signal, retain: (result) => !result.stale },
    ) as Promise<RecordResult<T>>;
  }
  corpus = (signal?: AbortSignal) =>
    this.read('/corpus.json', decodeCorpus, undefined, undefined, signal);
  money = (signal?: AbortSignal) =>
    this.read(
      '/graph/money.json',
      decodeIndustryMoney,
      undefined,
      undefined,
      signal,
    );
  topics = (fresh = false, signal?: AbortSignal) =>
    this.read('/api/topics', decodeTopics, true, fresh, signal);
  tide = (fresh = false, signal?: AbortSignal) =>
    this.read('/api/tide', decodeTide, true, fresh, signal);
  topic = (slug: string, fresh = false, signal?: AbortSignal) => {
    if (!topicNames[slug]) return Promise.reject(new Error('Unknown topic'));
    return this.read(`/api/topic/${slug}`, decodeTopic, true, fresh, signal);
  };
  speeches = (
    slug: string,
    filters: SpeechFilters = {},
    fresh = false,
    signal?: AbortSignal,
  ) => this.read(arcPath(slug, filters), decodeSpeeches, true, fresh, signal);
  stats = (signal?: AbortSignal) =>
    this.read('/api/stats', decodeStats, true, undefined, signal);
  matrix = (signal?: AbortSignal) =>
    this.read('/api/matrix', decodeMatrix, true, undefined, signal);
}
