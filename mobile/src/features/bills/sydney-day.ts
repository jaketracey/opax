import { useState } from 'react';
import { sydneyDay, type SydneyDate } from '../today/rules';

/**
 * The Sydney calendar day as this screen first saw it. It does not change
 * while the screen is up: On this day is chosen once for a visit. Its own
 * module so Jest can pin the day (tests/pinned-day.js): a suite that draws
 * the Bills list must not change with the date it runs on.
 */
export function useSydneyDay(): SydneyDate {
  const [day] = useState(() => sydneyDay());
  return day;
}
