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
/** Bill files in flight at once. */
const CONCURRENCY = 8;
/**
 * Every bill with a counted vote, read once and published once.
 *
 * The bills index names about a thousand such bills and no single file
 * carries their votes, so this is a thousand small reads. Two things keep
 * that short:
 * - a rolling pool, so one slow file holds one slot, not the seven reads
 *   queued behind its batch;
 * - no offline copy of each file (`persist: false`). The cache writes one
 *   record at a time, two file writes each, and that queue, not the network,
 *   held the list for 8 s on a local server. A thousand records also pushed
 *   every other saved catalog out of the 220-record cache. A bill opened on
 *   its own page is still saved as before.
 *
 * Only the small division projection stays in memory for back-navigation.
 * No launch work, document/ARAG route or per-row call.
 */
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
  // Bill status dates do not bound their division dates. No part is a final
  // chronological prefix until every candidate has settled, so publish once.
  const files: (BillDetail | undefined)[] = new Array(candidates.length);
  let next = 0;
  let settled = 0;
  let offline: unknown;
  const worker = async () => {
    for (let i = next++; i < candidates.length; i = next++) {
      try {
        const result = await source.bill(candidates[i]!.key, refresh, signal, {
          persist: false,
        });
        throwIfAborted(signal);
        if (result.data.key !== candidates[i]!.key) view.failed++;
        else {
          view.loaded++;
          view.stale ||= result.stale;
          view.partial ||= !!result.partial;
          view.savedAt = Math.min(view.savedAt, result.savedAt);
          files[i] = result.data;
        }
      } catch (error) {
        throwIfAborted(signal);
        if (error instanceof ApiError && error.code === 'offline')
          offline ??= error;
        view.failed++;
      }
      // Saved copies answer without a network turn: let the screen draw.
      if (++settled % CONCURRENCY === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      throwIfAborted(signal);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker),
  );
  if (candidates.length && !view.loaded) {
    // Nothing saved and no connection reads as that, not as a failed record.
    if (offline) throw offline;
    throw new ApiError('http', 'Bill division records could not be loaded.');
  }
  throwIfAborted(signal);
  // Candidate order in, so the rows are the same whichever read lands first.
  view.rows = divisionRows(files.filter((file) => file !== undefined));
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
