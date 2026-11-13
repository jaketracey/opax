import { throwIfAborted } from '../../api/abort';
import { ReadSession } from '../../api/read-session';
import { catalogs } from '../../api/runtime';
import type { Catalogs } from '../../api/catalogs';
import type { BillDetail } from '../../api/catalog-decoders';
import { ApiError } from '../../api/errors';
import { divisionRows, type DivisionRow } from './model';
export interface DivisionRecord {
  rows: DivisionRow[];
  loaded: number;
  total: number;
  failed: number;
  asAt: string;
  stale: boolean;
  savedAt: number;
  partial: boolean;
}
// Bounded transport concurrency; retain only the small division projection in
// memory for back-navigation. No launch work, document/ARAG route or per-row call.
export async function readDivisionHistory(
  source: Pick<Catalogs, 'bills' | 'bill'>,
  refresh = false,
  publish?: (record: DivisionRecord) => void,
  signal?: AbortSignal,
): Promise<DivisionRecord> {
  const index = await source.bills(refresh, signal);
  const candidates = index.data.bills
    .filter((b) => b.divisions > 0)
    .sort((a, b) =>
      (b.status_as_of ?? b.introduced ?? '').localeCompare(
        a.status_as_of ?? a.introduced ?? '',
      ),
    );
  const view: DivisionRecord = {
    rows: [],
    loaded: 0,
    total: candidates.length,
    failed: 0,
    asAt: index.data.generated_at,
    stale: index.stale,
    savedAt: index.savedAt,
    partial: !!index.partial,
  };
  throwIfAborted(signal);
  // Bill status dates do not bound their division dates. No batch is a final
  // chronological prefix until every candidate has settled, so publish once.
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = await Promise.allSettled(
      candidates
        .slice(i, i + 8)
        .map((b) => source.bill(b.key, refresh, signal)),
    );
    throwIfAborted(signal);
    const files: BillDetail[] = [];
    for (let j = 0; j < batch.length; j++) {
      const result = batch[j]!;
      if (
        result.status === 'rejected' ||
        result.value.data.key !== candidates[i + j]!.key
      ) {
        view.failed++;
        continue;
      }
      view.loaded++;
      view.stale ||= result.value.stale;
      view.partial ||= !!result.value.partial;
      view.savedAt = Math.min(view.savedAt, result.value.savedAt);
      files.push(result.value.data);
    }
    view.rows.push(...divisionRows(files));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (candidates.length && !view.loaded)
    throw new ApiError('http', 'Bill division records could not be loaded.');
  throwIfAborted(signal);
  // view.rows is this function's own accumulator, never a cached catalog.
  // eslint-disable-next-line no-restricted-syntax
  view.rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
  );
  publish?.(view);
  return view;
}
const session = new ReadSession<DivisionRecord>();
export function loadDivisionHistory(
  refresh = false,
  publish?: (record: DivisionRecord) => void,
  signal?: AbortSignal,
) {
  return session.read(
    'divisions',
    (requestSignal) =>
      readDivisionHistory(catalogs, refresh, publish, requestSignal),
    {
      fresh: refresh,
      signal,
      keepPrevious: true,
      retain: (record) => !record.failed && !record.stale,
    },
  );
}
