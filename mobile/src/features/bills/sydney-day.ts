import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { sydneyDay, type SydneyDate } from '../today/rules';

/**
 * The Sydney calendar day, checked again each time the app comes forward.
 * Its own module so Jest can pin the day (tests/pinned-day.js): a suite
 * that draws the Bills list must not change with the date it runs on.
 */
export function useSydneyDay(): SydneyDate {
  const [day, setDay] = useState(() => sydneyDay());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDay(sydneyDay());
    });
    return () => subscription.remove();
  }, []);
  return day;
}
