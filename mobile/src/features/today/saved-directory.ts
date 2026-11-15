import { useEffect, useState } from 'react';
import { catalogs } from '../../api/runtime';
import type { Directory } from '../your-mp/model';

/**
 * The directory as the device saved it, for Today's first frame when the
 * last launch kept no shape for the saved choice: the choice is migrated
 * from it, not laid out as 1.0 wrote it.
 *
 * The read starts when Today mounts, beside the launch's other disk reads
 * and before it is known to be `wanted`, so the cover never waits on a read
 * that began late. It asks the disk only. The seat's own directory read is
 * of the same saved files: the cache hands both the one parsed body and the
 * client decodes a body once, so the files are parsed once however the two
 * reads interleave.
 *
 * Undefined while `wanted` and the disk has not answered (the page waits),
 * null with none saved or when not wanted. Once the seat has `resolved`
 * the copy is let go, not kept for the session; a seat read again later
 * asks the disk again and holds nothing while it does.
 */
export function useSavedDirectory(
  wanted: boolean,
  resolved: boolean,
): Directory | null | undefined {
  const [saved, setSaved] = useState<Directory | null | undefined>(undefined);
  // Let go while rendering (React's adjust-state-on-change pattern).
  if (resolved && saved !== null) setSaved(null);
  useEffect(() => {
    if (resolved) return;
    let active = true;
    void Promise.resolve()
      .then(() => catalogs.directorySaved())
      .catch(() => null)
      .then((directory) => {
        if (active) setSaved(directory ?? null);
      });
    return () => {
      active = false;
    };
  }, [resolved]);
  return wanted ? saved : null;
}
