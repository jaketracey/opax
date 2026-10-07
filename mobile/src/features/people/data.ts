import type { ApiClient } from '../../api/client';
import {
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
  access() {
    return this.client.get('/access.json', decodeAccess);
  }
  funding() {
    return this.client.get('/graph/aec-extras.json', decodeFunding);
  }
  topics(name: string) {
    return Promise.all([
      this.client.getForAction(
        '/api/person-topics?' + new URLSearchParams({ name }),
        decodePersonTopics,
      ),
      this.client.getForAction('/api/topics', decodeTopics),
    ]).then(([person, baseline]) => ({ person, baseline }));
  }
  async speeches(name: string) {
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
    );
    const briefs = await this.briefs(records.data.results);
    return { records, briefs };
  }
  async mentions(name: string, briefs = false) {
    const records = await this.client.getForAction(
      '/api/search?' + new URLSearchParams({ q: '"' + name + '"', top_k: '6' }),
      decodeRecords,
    );
    return {
      records,
      briefs: briefs ? await this.briefs(records.data.results.slice(0, 5)) : {},
    };
  }
  async news() {
    const result = await this.client.getForAction('/api/news', decodeNews);
    return { ...result, asOf: result.data.fetched_at ?? null };
  }
  private async briefs(rows: ReturnType<typeof decodeRecords>['results']) {
    const rids = [
      ...new Set(
        rows
          .map((r) => r.resource)
          .filter((r): r is string => !!r && /^[a-f0-9]{32}$/.test(r)),
      ),
    ];
    if (!rids.length) return {};
    try {
      return (
        await this.client.getForAction(
          '/api/brief?' + new URLSearchParams({ rids: rids.join(',') }),
          decodeBriefs,
        )
      ).data.briefs;
    } catch {
      return {};
    } // An optional brief never hides the source passage.
  }
}
