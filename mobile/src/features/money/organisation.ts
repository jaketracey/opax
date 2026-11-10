import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import {
  array,
  count,
  nonempty,
  number,
  object,
  optional,
  text,
} from '../../api/validation';
import { publicRecipient } from '../money-public/privacy';
import { money } from '../money-public/runtime';

const opt = (v: unknown) => optional(text)(v) ?? '';

/** One grant recipient from a grants index, with its totals by year. */
export interface GrantRecipient {
  id: string;
  name: string;
  /** False for a private individual: never named, never a page. */
  organisation: boolean;
  total: number;
  count: number;
  /** Financial-year strings as published ("2024-25") to [dollars, grants]. */
  byYear: [string, number, number][];
}
export interface RecipientIndex {
  generated: string;
  jur: 'federal' | 'qld';
  sourceUrl: string;
  licence: string;
  recipients: GrantRecipient[];
}

/**
 * The grants index's recipients (id, name, kind, total, count and one cell
 * per financial year), read for the organisation page. Names pass the same
 * privacy check as every money list: an individual keeps no name.
 */
export function decodeRecipientIndex(value: unknown): RecipientIndex {
  const d = object(value),
    meta = object(d.meta);
  const years = array(nonempty)(meta.years);
  const jur = meta.jurisdiction === 'qld' ? 'qld' : 'federal';
  return {
    generated: nonempty(meta.generated),
    jur,
    sourceUrl: opt(meta.source_url) || 'https://www.grants.gov.au/',
    licence: opt(meta.licence),
    recipients: array((v) => {
      const r = object(v);
      const id = nonempty(r.id);
      const cells = Array.isArray(r.by) ? r.by : [];
      const byYear: [string, number, number][] = [];
      cells.forEach((cell, i) => {
        if (Array.isArray(cell) && years[i])
          byYear.push([years[i]!, number(cell[0]), count(cell[1])]);
      });
      const { name, organisation } = publicRecipient(
        nonempty(r.n),
        opt(r.k),
        opt(r.abn_type),
        id,
      );
      return {
        id,
        name,
        organisation,
        total: number(r.t),
        count: count(r.c),
        byYear,
      };
    })(d.recipients),
  };
}

/** One government supplier, as its agency's file records it. */
export interface AgencySupplier {
  agency: { id: string; name: string };
  supplier: {
    id: string;
    name: string;
    organisation: boolean;
    total: number;
    count: number;
  };
  contracts: {
    id: string;
    title: string;
    value: number;
    start: string;
    end: string;
    published: string;
  }[];
}

type Loaded<T> = {
  record: RecordResult<T> | null;
  error: unknown;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
};
function useLoad<T>(
  key: string | null,
  load: (refresh: boolean) => Promise<RecordResult<T>>,
): Loaded<T> {
  const [attempt, setAttempt] = useState({ n: 0, refresh: false });
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<{
    key: string;
    record: RecordResult<T> | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    load(attempt.refresh)
      .then(
        (record) => {
          if (active) setState({ key, record, error: null });
        },
        (error) => {
          if (active)
            setState((previous) =>
              attempt.refresh && previous?.key === key && previous.record
                ? previous
                : { key, record: null, error },
            );
        },
      )
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
    // `load` is keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = state?.key === key ? state : null;
  return {
    record: current?.record ?? null,
    error: current?.error ?? null,
    refreshing,
    refresh: useCallback(() => {
      setRefreshing(true);
      setAttempt((a) => ({ n: a.n + 1, refresh: true }));
    }, []),
    retry: useCallback(() => {
      setState(null);
      setAttempt((a) => ({ n: a.n + 1, refresh: true }));
    }, []),
  };
}

/** A grant recipient by its id in a jurisdiction's grants index. */
export function useGrantRecipient(rid: string | null, jur: 'federal' | 'qld') {
  const loaded = useLoad(rid ? `grants:${jur}` : null, (refresh) =>
    apiClient.get(`/graph/grants.${jur}.json`, decodeRecipientIndex, refresh),
  );
  const recipient =
    loaded.record?.data.recipients.find((r) => r.id === rid) ?? null;
  return { ...loaded, recipient };
}

/**
 * A supplier through the agency it holds contracts with: the agency file is
 * on the public allow-list, the per-supplier files are not yet.
 */
export function useAgencySupplier(rid: string | null, agency: string | null) {
  const loaded = useLoad(rid && agency ? `agency:${agency}` : null, (refresh) =>
    money.agency(agency!, refresh),
  );
  const profile = loaded.record?.data.profile;
  const supplier = profile?.suppliers.find((s) => s.id === rid) ?? null;
  const found: AgencySupplier | null =
    profile && supplier
      ? {
          agency: { id: profile.id, name: profile.name },
          supplier,
          contracts: supplier.organisation
            ? profile.contracts
                .filter((c) =>
                  c.supplierId
                    ? c.supplierId === supplier.id
                    : c.supplier === supplier.name,
                )
                .map((c) => ({
                  id: c.id,
                  title: c.title,
                  value: c.value,
                  start: c.start,
                  end: c.end,
                  published: c.published,
                }))
            : [],
        }
      : null;
  return { ...loaded, found };
}

export const notFound = (error: unknown) =>
  error instanceof ApiError && error.code === 'not-found';
