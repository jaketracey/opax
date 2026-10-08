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
): Promise<DivisionRecord> {
  const index = await source.bills(refresh);
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
  publish?.({ ...view });
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = await Promise.allSettled(
      candidates.slice(i, i + 8).map((b) => source.bill(b.key, refresh)),
    );
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
    view.rows = [...view.rows, ...divisionRows(files)].sort(
      (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
    );
    publish?.({ ...view });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (candidates.length && !view.loaded)
    throw new ApiError('http', 'Bill division records could not be loaded.');
  return view;
}
let saved: DivisionRecord | undefined;
let reading: Promise<DivisionRecord> | undefined;
export function loadDivisionHistory(
  refresh = false,
  publish?: (record: DivisionRecord) => void,
) {
  if (saved && !refresh && !saved.failed && !saved.stale)
    return Promise.resolve(saved);
  if (reading && !refresh) return reading;
  const pending = readDivisionHistory(catalogs, refresh, publish).then(
    (record) => {
      saved = record;
      return record;
    },
  );
  const tracked = pending.finally(() => {
    if (reading === tracked) reading = undefined;
  });
  reading = tracked;
  return tracked;
}
