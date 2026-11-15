import { client } from '../../api/runtime';
import type { SydneyDate } from '../today/rules';
import {
  decodeOnThisDayIndex,
  onThisDayPath,
  type OnThisDayIndex,
} from './on-this-day';

/** How long the Bills list's first frame waits for the day's index. */
export const ON_THIS_DAY_GRACE_MS = 100;

/**
 * The day's index through the catalog cache, like every static read: the
 * saved copy answers offline. A file that is not there, was never saved or
 * fails the decoder is null: no rows, never an error on Bills.
 */
export async function readOnThisDay(
  today: SydneyDate,
  signal?: AbortSignal,
): Promise<OnThisDayIndex | null> {
  try {
    const record = await client.get(
      onThisDayPath(today),
      decodeOnThisDayIndex,
      false,
      { signal },
    );
    return record.data;
  } catch {
    return null;
  }
}

/**
 * The index if it answers by the time the bills are ready, give or take a
 * moment; otherwise null for this visit. The rows are decided for the
 * list's first frame and never added after it, so a slow read costs the
 * rows, not a jump. The read carries on and is saved for the next visit.
 */
export async function onThisDayInTime(
  read: Promise<OnThisDayIndex | null>,
  grace = ON_THIS_DAY_GRACE_MS,
): Promise<OnThisDayIndex | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), grace);
  });
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}
