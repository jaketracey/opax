import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { money } from './runtime';
import type { SeatGrantPage } from './seat-grants-data';

type SeatRead = RecordResult<{
  key: string | undefined;
  grants: SeatGrantPage['grants'];
  missing: boolean;
  /** Whether Show all applied to this read, so every loaded row is shown. */
  expanded: boolean;
  moreError: unknown;
  next: string | null;
}>;

/** Fetch only page one until Show all, publishing each later page as it arrives. */
export function useSeatGrants(key: string | undefined) {
  const request = useRef<{
    controller: AbortController;
    key: string | undefined;
  } | null>(null);
  const expanded = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(
    async (
      refresh: boolean,
      publish: (record: SeatRead) => void,
    ): Promise<SeatRead> => {
      request.current?.controller.abort();
      if (request.current?.key !== key) expanded.current = false;
      const controller = new AbortController();
      request.current = { controller, key };
      const pages: RecordResult<SeatGrantPage>[] = [];
      const result = (moreError: unknown = null): SeatRead => {
        const data = {
          key,
          grants: pages.flatMap((p) => p.data.grants),
          missing: !pages.length,
          expanded: expanded.current,
          moreError,
          next: pages.at(-1)?.data.next ?? null,
        };
        return pages.length
          ? combine(pages, data)
          : { data, stale: false, savedAt: 0, asOf: null };
      };
      try {
        if (!key) return result();
        const first = await money.seat('federal', key, refresh, {
          signal: controller.signal,
        });
        if (controller.signal.aborted)
          throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        if (!first) return result();
        pages.push(first);
        if (expanded.current && first.data.next) setLoadingMore(true);
        if (!refresh) publish(result());
        while (expanded.current && pages.at(-1)!.data.next) {
          let page: RecordResult<SeatGrantPage> | null;
          try {
            page = await money.seat('federal', key, refresh, {
              page: pages.at(-1)!.data.next!,
              signal: controller.signal,
            });
            if (controller.signal.aborted)
              throw Object.assign(new Error('Cancelled'), {
                name: 'AbortError',
              });
            if (!page)
              throw new ApiError(
                'not-found',
                'The remaining grants are not available.',
              );
            const a = first.data,
              b = page.data;
            const ids = new Set(
              pages.flatMap((p) => p.data.grants.map((g) => g.id)),
            );
            if (
              a.name !== b.name ||
              a.state !== b.state ||
              a.total !== b.total ||
              a.count !== b.count ||
              ids.size + b.grants.length > a.count ||
              b.grants.some((g) => ids.has(g.id))
            )
              throw new ApiError(
                'invalid-data',
                'The seat pages do not match.',
              );
          } catch (error) {
            if (controller.signal.aborted) throw error;
            return result(error);
          }
          pages.push(page);
          if (!refresh) publish(result());
        }
        return result();
      } finally {
        if (request.current?.controller === controller) setLoadingMore(false);
      }
    },
    [key],
  );
  const status = useCatalogRecord(load);
  useEffect(
    () => () => {
      const previous = request.current;
      request.current = null;
      previous?.controller.abort();
    },
    [],
  );
  const record = status.record?.data.key === key ? status.record : null;
  return {
    ...status,
    record,
    loadingMore,
    grants:
      record?.data.grants.slice(0, record.data.expanded ? undefined : 25) ?? [],
    showAll: () => {
      if (loadingMore) return;
      expanded.current = true;
      setLoadingMore(true);
      status.retry();
    },
  };
}
