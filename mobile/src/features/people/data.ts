import { throwIfAborted } from '../../api/abort';
import type { ApiClient } from '../../api/client';
import { briefRids, type ShownPassage } from '../../api/short-turn';
import {
  cleanPassage,
  decodeAccess,
  decodeBriefs,
  decodeFunding,
  decodeNews,
  decodePersonTopics,
  decodeRecords,
  decodeTopics,
} from './model';

export class PeopleDepth {
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  access(signal?: AbortSignal) {
    return this.client.get('/access.json', decodeAccess, false, { signal });
  }
  funding(signal?: AbortSignal) {
    return this.client.get('/graph/aec-extras.json', decodeFunding, false, {
      signal,
    });
  }
  topics(name: string, signal?: AbortSignal) {
    return Promise.all([
      this.client.getForAction(
        '/api/person-topics?' + new URLSearchParams({ name }),
        decodePersonTopics,
        { signal },
      ),
      this.client.getForAction('/api/topics', decodeTopics, { signal }),
    ]).then(([person, baseline]) => ({ person, baseline }));
  }
  async speeches(name: string, signal?: AbortSignal) {
    const records = await this.client.getForAction(
      '/api/search?' +
        new URLSearchParams({
          q: name,
          speaker: name,
          page: '1',
          per: '8',
          sort: 'newest',
        }),
      decodeRecords,
      { signal },
    );
    const briefs = await this.briefs(
      records.data.results,
      signal,
      cleanPassage,
    );
    return { records, briefs };
  }
  async mentions(name: string, briefs = false, signal?: AbortSignal) {
    const records = await this.client.getForAction(
      '/api/search?' + new URLSearchParams({ q: '"' + name + '"', top_k: '6' }),
      decodeRecords,
      { signal },
    );
    return {
      records,
      briefs: briefs
        ? await this.briefs(records.data.results.slice(0, 5), signal)
        : {},
    };
  }
  /**
   * One page of a pushed record list, newest first: a person's speeches or
   * the record's mentions of a name (people.md 2.1, route 15).
   */
  async list(
    name: string,
    kind: 'speeches' | 'mentions',
    page: number,
    signal?: AbortSignal,
  ) {
    const params: Record<string, string> =
      kind === 'speeches'
        ? {
            q: name,
            speaker: name,
            page: String(page),
            per: '20',
            sort: 'newest',
          }
        : {
            q: '"' + name + '"',
            page: String(page),
            per: '20',
            sort: 'newest',
          };
    const records = await this.client.getForAction(
      '/api/search?' + new URLSearchParams(params),
      decodeRecords,
      { signal },
    );
    // The list shows a speech's cleaned passage, a mention's plain one.
    const briefs = await this.briefs(
      records.data.results,
      signal,
      kind === 'speeches' ? cleanPassage : undefined,
    );
    return { records, briefs };
  }
  async news(signal?: AbortSignal) {
    const result = await this.client.getForAction('/api/news', decodeNews, {
      signal,
    });
    return { ...result, asOf: result.data.fetched_at ?? null };
  }
  private async briefs(
    rows: ReturnType<typeof decodeRecords>['results'],
    signal?: AbortSignal,
    passage?: ShownPassage,
  ) {
    // A known short speech turn shows its own passage, never a brief.
    const rids = briefRids(rows, passage);
    if (!rids.length) return {};
    try {
      return (
        await this.client.getForAction(
          '/api/brief?' + new URLSearchParams({ rids: rids.join(',') }),
          decodeBriefs,
          { signal },
        )
      ).data.briefs;
    } catch {
      throwIfAborted(signal);
      return {};
    } // An optional brief never hides the source passage.
  }
}
