import type { ApiClient, RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import * as d from './data';
import { decodeSeatGrants } from './seat-grants-data';
export class MoneyCatalogs {
  constructor(private client: Pick<ApiClient, 'get'>) {}
  async grants(jur: d.Jurisdiction, refresh = false, signal?: AbortSignal) {
    return this.client.get(
      `/graph/grants.${jur}.json`,
      d.decodeGrantIndex,
      refresh,
      { signal },
    );
  }
  async notes(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/grants/program-notes.json',
      d.decodeNotes,
      refresh,
      { signal },
    );
  }
  async largest(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/social/grants-largest.json',
      d.decodeLargest,
      refresh,
      { signal },
    );
  }
  async program(
    jur: d.Jurisdiction,
    key: string,
    refresh = false,
    signal?: AbortSignal,
  ) {
    return this.client
      .get(`/grants/${jur}/programs/${key}.json`, d.decodeProgram, refresh, {
        signal,
      })
      .then((r) => {
        if (r.data.key !== key || r.data.jur !== jur)
          throw new ApiError(
            'invalid-data',
            'The program record does not match the selected program.',
          );
        return r;
      });
  }
  async seat(
    jur: 'federal',
    key: string | undefined,
    refresh = false,
    { page, signal }: { page?: string; signal?: AbortSignal } = {},
  ) {
    if (!key) return null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key))
      throw new ApiError('invalid-data', 'The seat key could not be read.');
    const file = page ?? `${key}.json`;
    const suffix = file.slice(key.length);
    const pageNumber = file === `${key}.json` ? 1 : Number(suffix.slice(1, -5));
    if (
      !file.startsWith(key) ||
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      file !== (pageNumber === 1 ? `${key}.json` : `${key}-${pageNumber}.json`)
    )
      throw new ApiError('invalid-data', 'The seat page could not be read.');
    try {
      const record = await this.client.get(
        `/grants/${jur}/seats/${file}`,
        decodeSeatGrants,
        refresh,
        { signal },
      );
      if (
        record.data.key !== key ||
        record.data.jur !== jur ||
        record.data.page !== pageNumber
      )
        throw new ApiError(
          'invalid-data',
          'The seat record does not match the selected seat.',
        );
      return record;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not-found') return null;
      throw error;
    }
  }
  async agencies(refresh = false, signal?: AbortSignal) {
    return this.client.get('/agencies.json', d.decodeAgencies, refresh, {
      signal,
    });
  }
  async agency(id: string, refresh = false, signal?: AbortSignal) {
    const directory = await this.agencies(refresh, signal);
    const entry = directory.data.agencies.find(
      (a) => a.id === id || a.name === id,
    );
    if (!entry)
      throw new ApiError(
        'not-found',
        'Agency not found in the available records.',
      );
    const profile = await this.client.get(entry.path, d.decodeAgency, refresh, {
      signal,
    });
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
  async allocation(refresh = false, signal?: AbortSignal) {
    return this.client.get('/research/mlci.json', d.decodeAllocation, refresh, {
      signal,
    });
  }
  async report(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/reports/grants-allocation.json',
      d.decodeReport,
      refresh,
      { signal },
    );
  }
  async history(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/research/grants-history.json',
      d.decodeHistory,
      refresh,
      { signal },
    );
  }
  async locations(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/research/grant-locations.json',
      d.decodeLocations,
      refresh,
      { signal },
    );
  }
  async connections(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/evidence/index.json',
      d.decodeConnections,
      refresh,
      { signal },
    );
  }
  async evidence(id: string, refresh = false, signal?: AbortSignal) {
    return this.client.get(
      `/evidence/${id.slice(0, 2)}.json`,
      d.decodeEvidence,
      refresh,
      { signal },
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
