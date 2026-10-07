import type { ApiClient, RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import * as d from './data';
export class MoneyCatalogs {
  constructor(private client: Pick<ApiClient, 'get'>) {}
  async grants(jur: d.Jurisdiction, refresh = false) {
    return this.client.get(
      `/graph/grants.${jur}.json`,
      d.decodeGrantIndex,
      refresh,
    );
  }
  async notes(refresh = false) {
    return this.client.get(
      '/grants/program-notes.json',
      d.decodeNotes,
      refresh,
    );
  }
  async largest(refresh = false) {
    return this.client.get(
      '/social/grants-largest.json',
      d.decodeLargest,
      refresh,
    );
  }
  async program(jur: d.Jurisdiction, key: string, refresh = false) {
    return this.client
      .get(`/grants/${jur}/programs/${key}.json`, d.decodeProgram, refresh)
      .then((r) => {
        if (r.data.key !== key || r.data.jur !== jur)
          throw new ApiError(
            'invalid-data',
            'The program record does not match the selected program.',
          );
        return r;
      });
  }
  async agencies(refresh = false) {
    return this.client.get('/agencies.json', d.decodeAgencies, refresh);
  }
  async agency(id: string, refresh = false) {
    const directory = await this.agencies(refresh);
    const entry = directory.data.agencies.find(
      (a) => a.id === id || a.name === id,
    );
    if (!entry)
      throw new ApiError(
        'not-found',
        'Agency not found in the available records.',
      );
    const profile = await this.client.get(entry.path, d.decodeAgency, refresh);
    if (profile.data.id !== entry.id)
      throw new ApiError(
        'invalid-data',
        'The agency record does not match the selected agency.',
      );
    return combine([directory, profile], {
      meta: directory.data.meta,
      profile: profile.data,
    });
  }
  async allocation(refresh = false) {
    return this.client.get('/research/mlci.json', d.decodeAllocation, refresh);
  }
  async report(refresh = false) {
    return this.client.get(
      '/reports/grants-allocation.json',
      d.decodeReport,
      refresh,
    );
  }
  async history(refresh = false) {
    return this.client.get(
      '/research/grants-history.json',
      d.decodeHistory,
      refresh,
    );
  }
  async locations(refresh = false) {
    return this.client.get(
      '/research/grant-locations.json',
      d.decodeLocations,
      refresh,
    );
  }
  async connections(refresh = false) {
    return this.client.get(
      '/evidence/index.json',
      d.decodeConnections,
      refresh,
    );
  }
  async evidence(id: string, refresh = false) {
    return this.client.get(
      `/evidence/${id.slice(0, 2)}.json`,
      d.decodeEvidence,
      refresh,
    );
  }
}
export function combine<T>(
  records: RecordResult<unknown>[],
  data: T,
): RecordResult<T> {
  return {
    data,
    stale: records.some((r) => r.stale),
    partial: records.some((r) => r.partial),
    savedAt: Math.min(...records.map((r) => r.savedAt)),
    asOf: null,
    staleReason: records.find((r) => r.staleReason)?.staleReason,
  };
}
