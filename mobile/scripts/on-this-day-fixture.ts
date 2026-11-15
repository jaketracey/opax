import { onThisDayPathPattern } from '../src/api/policy';

/**
 * On this day in the fixture. The app asks for the simulator's own date
 * (`/parliament/on-this-day/MM-DD.json`), which the pinned snapshot rarely
 * holds, so every run on another date logged OUTSIDE_ALLOW_LIST and failed
 * its boundary check. A day the snapshot pins is served as itself; any other
 * valid day is a quiet 404 ("not published"), which the app reads as no
 * rows. Another day's file is never served in its place: the app draws
 * nothing from a file for another day, and would only cache it under the
 * asked address.
 *
 * Only the strict form matches: the app's MM-DD pattern
 * (`onThisDayPathPattern`), with nothing before or after it. Every other
 * path is left to the allow-list as before.
 */
export interface OnThisDayAnswer {
  day: string;
  /** The snapshot holds this day's own file. */
  pinned: boolean;
}

const DAY = /^\/parliament\/on-this-day\/(\d\d-\d\d)\.json$/;

/** The answer for a request path, or null when it is not an on-this-day day. */
export function onThisDayAnswer(
  path: string,
  pinnedPaths: Iterable<string>,
): OnThisDayAnswer | null {
  if (!onThisDayPathPattern.test(path)) return null;
  const day = DAY.exec(path)?.[1];
  if (!day) return null;
  for (const pinned of pinnedPaths)
    if (pinned === path) return { day, pinned: true };
  return { day, pinned: false };
}

/** One line for fixture.log, so a run shows what On this day was given. */
export function onThisDayLogLine(answer: OnThisDayAnswer): string {
  return `ONTHISDAY ${answer.day} -> ${answer.pinned ? 'pinned' : '404 (not pinned)'}`;
}
