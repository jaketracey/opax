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
 * Bills is a tab root and stays mounted for days, so a new day chooses
 * again, but only where the list cannot be seen: when the screen blurs, or
 * on an app-state change while another screen has the focus. Never on focus
 * or on the app's return to this screen: both are heard after the list is
 * already on screen, and the row changing or leaving would move the bills.
 *
 * That leaves one case: the reader comes back to this list on a new day.
 * The pick stays, and `stale` says its day has passed, so the row can stop
 * calling it "On this day" without changing size, until the next blur.
 */
export function useOnThisDay(bills: readonly Bill[] | null | undefined): {
  pick: OnThisDayBill | null;
  stale: boolean;
} {
  const navigation = useContext(NavigationContext);
  const [day, setDay] = useState(currentSydneyDay);
  // The day as last read, whether or not the list could choose again.
  const [today, setToday] = useState(day);
  useEffect(() => {
    const read = (hidden: boolean) => {
      const now = currentSydneyDay();
      setToday(now);
      if (hidden) setDay(now);
    };
    // No navigation (a test, a preview): treat the list as in view.
    const unseen = () => !!navigation && !navigation.isFocused();
    const off = [
      // The screen is already hidden when blur is heard.
      navigation?.addListener?.('blur', () => read(true)),
      navigation?.addListener?.('focus', () => read(false)),
    ];
    // Not `inactive`: the list is still on screen under Control Centre.
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'inactive') read(unseen());
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
  return {
    pick: chosen?.pick ?? null,
    stale: !!chosen && chosen.day === day && today !== day,
  };
}
