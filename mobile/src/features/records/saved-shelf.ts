import {
  decodeBill,
  decodeElectorate,
  decodeManifest,
} from '../../api/catalog-decoders';
import type { ApiClient } from '../../api/client';
import { billRoute, electorateRoute } from '../../navigation/routes';

/** One record with a copy saved on this device. */
export interface ShelfItem {
  /** Stable for the list: the saved copy's path. */
  key: string;
  kind: 'Bill' | 'Electorate';
  title: string;
  route: ReturnType<typeof billRoute> | ReturnType<typeof electorateRoute>;
}

/** No more rows than this; the list is a way on, not a library. */
export const SHELF_ROWS = 5;
/** Saved copies read at most, so a damaged run cannot read the whole cache. */
const SHELF_READS = 12;

const BILL = /^\/bills\/(au-federal-[a-z0-9-]+)\.json$/;
const SEAT =
  /^\/electorates\/releases\/([a-f0-9]{16})\/(el_[a-f0-9]{24})\.json$/;

type ShelfClient = Pick<ApiClient, 'saved' | 'savedPaths'>;

/**
 * The offline shelf: records whose own file is already saved on this
 * device, most recently confirmed first. It reads the API client's existing
 * saved copies and nothing else: the cache's index says which paths are
 * saved, and each title comes from that record's saved, validated copy. No
 * network read, and nothing is written.
 *
 * Only records that open offline are listed: a bill (its own file is the
 * page) and an electorate of the seat release this device has saved (an
 * older release's file is not what the page would read). Speeches and other
 * documents are never saved on the device, so they cannot be listed. A copy
 * that no longer validates is skipped.
 */
export async function readSavedShelf(
  client: ShelfClient,
  rows = SHELF_ROWS,
): Promise<ShelfItem[]> {
  const paths = (await client.savedPaths()).filter(
    ({ path }) => BILL.test(path) || SEAT.test(path),
  );
  if (!paths.length) return [];
  let release: string | null | undefined;
  const shelf: ShelfItem[] = [];
  for (const { path } of paths.slice(0, SHELF_READS)) {
    if (shelf.length >= rows) break;
    const seat = SEAT.exec(path);
    if (seat) {
      if (release === undefined)
        release =
          (await client.saved('/electorates/manifest.json', decodeManifest))
            ?.data.release_id ?? null;
      if (seat[1] !== release) continue;
      const saved = await client.saved(path, decodeElectorate);
      if (!saved || saved.data.electorate_id !== seat[2]) continue;
      shelf.push({
        key: path,
        kind: 'Electorate',
        title: saved.data.name,
        route: electorateRoute(saved.data.electorate_id),
      });
      continue;
    }
    const saved = await client.saved(path, decodeBill);
    if (!saved) continue;
    shelf.push({
      key: path,
      kind: 'Bill',
      title: saved.data.title,
      route: billRoute(saved.data.key),
    });
  }
  return shelf;
}
