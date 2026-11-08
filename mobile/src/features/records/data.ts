import type { ApiClient, RecordResult } from '../../api/client';
import type { Decoder } from '../../api/validation';
import { invalid } from '../../api/validation';
import {
  decodeDocument,
  decodeRecent,
  decodeSimilar,
  decodeBillTextManifest,
  decodeBillText,
  recordSlug,
  type DocumentRecord,
} from './model';
import { titleSubject } from './citations';

export class Records {
  // In-flight requests are shared too. Failed reads are evicted for a deliberate retry.
  private session = new Map<string, Promise<RecordResult<unknown>>>();
  constructor(private client: Pick<ApiClient, 'get'>) {}
  /**
   * `fresh` (a pull to refresh) bypasses the session copy for this one path.
   * A failed fresh read keeps the copy already held, so the list stays.
   */
  private read<T>(
    path: string,
    decode: Decoder<T>,
    { fresh = false }: { fresh?: boolean } = {},
  ): Promise<RecordResult<T>> {
    const held = this.session.get(path);
    if (held && !fresh) return held as Promise<RecordResult<T>>;
    const pending = this.client.get(path, decode, fresh).catch((error) => {
      if (this.session.get(path) === pending) {
        if (held && fresh) this.session.set(path, held);
        else this.session.delete(path);
      }
      throw error;
    });
    this.session.set(path, pending);
    return pending as Promise<RecordResult<T>>;
  }
  /** A session copy already held for a path, without a request. */
  held(path: string): boolean {
    return this.session.has(path);
  }
  document(slug: string) {
    recordSlug(slug);
    return this.read(`/api/resource/${slug}`, (value) => {
      const doc = decodeDocument(value);
      if (doc.slug !== slug) invalid();
      return doc;
    });
  }
  recent({ fresh = false }: { fresh?: boolean } = {}) {
    return this.read('/api/recent', decodeRecent, { fresh });
  }
  similar(doc: DocumentRecord, knownTopics: ReadonlySet<string>) {
    const params = new URLSearchParams({
      q: titleSubject(doc) || doc.title,
      kind: 'speech',
      per: '6',
    });
    const topic = doc.topics.find((slug) => knownTopics.has(slug));
    if (topic) params.set('topic', topic);
    return this.read(`/api/search?${params}`, decodeSimilar).then((record) => {
      const seen = new Set([doc.slug]);
      return {
        ...record,
        data: record.data
          .filter((row) => {
            if (seen.has(row.slug)) return false;
            seen.add(row.slug);
            return true;
          })
          .slice(0, 3),
      };
    });
  }
  billManifest(key: string) {
    return this.read(`/bill-texts/${key}/index.json`, (value) => {
      const manifest = decodeBillTextManifest(value);
      if (manifest.bill_key !== key) invalid();
      return manifest;
    });
  }
  billVersion(key: string, id: string) {
    return this.read(`/bill-texts/${key}/${id}.json`, (value) => {
      const doc = decodeBillText(value);
      if (doc.bill_key !== key || doc.version.id !== id) invalid();
      return doc;
    });
  }
}
