import { sydneyDay, type SydneyDate } from '../today/rules';

/**
 * The Sydney calendar day, now. Its own module so Jest can pin the day
 * (tests/pinned-day.js): a suite that draws the Bills list must not change
 * with the date it runs on. `useOnThisDay` decides when it is read.
 */
export function currentSydneyDay(): SydneyDate {
  return sydneyDay();
}
