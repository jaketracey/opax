import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import type { Bill } from '../../api/catalogs';
import { onThisDay, type OnThisDayBill } from './on-this-day';
import { currentSydneyDay } from './sydney-day';

/**
 * On this day for the Bills list. It is chosen in the render that first has
 * the register, so the row is in the list's first frame or not there at
 * all, and it never changes while the list is in front of the reader.
 *
 * Bills is a tab root and stays mounted for days. So the day is read again
 * whenever the list goes out of sight or comes back (the screen blurs or
 * takes focus, the app goes to the background or returns), and a new day
 * chooses again there: yesterday's "On this day" is never shown as today's.
 */
export function useOnThisDay(
  bills: readonly Bill[] | null | undefined,
): OnThisDayBill | null {
  const navigation = useContext(NavigationContext);
  const [day, setDay] = useState(currentSydneyDay);
  useEffect(() => {
    const check = () => setDay(currentSydneyDay());
    const off = [
      navigation?.addListener?.('blur', check),
      navigation?.addListener?.('focus', check),
    ];
    // Not `inactive`: the list is still on screen under Control Centre.
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'inactive') check();
    });
    return () => {
      off.forEach((remove) => remove?.());
      app.remove();
    };
  }, [navigation]);
  const [chosen, setChosen] = useState<{
    day: string;
    pick: OnThisDayBill | null;
  } | null>(null);
  if (bills && chosen?.day !== day)
    setChosen({ day, pick: onThisDay(bills, day) });
  return chosen?.pick ?? null;
}
