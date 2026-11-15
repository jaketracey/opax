import { onThisDayPathPattern } from '../src/api/policy';

/**
 * On this day in the fixture. The app asks for the simulator's own date
 * (`/parliament/on-this-day/MM-DD.json`), and the pinned snapshot can hold
 * one day at most, so every run on another date logged OUTSIDE_ALLOW_LIST
 * and failed its boundary check. Any valid day is answered from what the
 * snapshot pins: that day's file when there is one, else a quiet 404 ("not
 * published"), which the app reads as no rows.
 *
 * Only the strict form matches: the app's own allow-list pattern, a real
 * month and day, and nothing before or after it. Every other path is left
 * to the allow-list as before.
 */
export type OnThisDayAnswer =
  | { day: string; pinned: string; path: string }
  | { day: string; pinned: null; path: null };

const DAY = /^\/parliament\/on-this-day\/(\d\d-\d\d)\.json$/;

/** The pinned on-this-day files, in order: the first is the one served. */
export function pinnedOnThisDay(paths: Iterable<string>): string[] {
  return [...paths].filter((path) => onThisDayPathPattern.test(path)).sort();
}

/** The answer for a request path, or null when it is not an on-this-day day. */
export function onThisDayAnswer(
  path: string,
  pinnedPaths: Iterable<string>,
): OnThisDayAnswer | null {
  if (!onThisDayPathPattern.test(path)) return null;
  const day = DAY.exec(path)?.[1];
  if (!day) return null;
  const pinned = pinnedOnThisDay(pinnedPaths);
  const served = pinned.includes(path) ? path : pinned[0];
  return served
    ? { day, pinned: DAY.exec(served)![1]!, path: served }
    : { day, pinned: null, path: null };
}

/** One line for fixture.log, so a run shows the substitution happened. */
export function onThisDayLogLine(answer: OnThisDayAnswer): string {
  return `ONTHISDAY_PINNED ${answer.day} -> ${answer.pinned ?? 'not pinned (404, no rows)'}`;
}
