import { useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import type { Bill } from '../../api/catalogs';
import {
  onThisDay,
  onThisDayMore,
  type OnThisDayIndex,
  type OnThisDayPicks,
} from './on-this-day';
import { readOnThisDay } from './on-this-day-data';
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
 *
 * The division and the speech follow the same rules. They come from the
 * day's dated index. `first` is the day the list was opened on and that
 * day's index as the first load brought it (undefined until it answers,
 * null when it had not answered in time): it is taken once, with the
 * register, so those rows are in the first frame too, and a refresh never
 * changes it. A later day's index is read when that day is chosen, out of
 * sight. If it answers while the list is back in view it is held, and used
 * the next time the list is hidden. The first day's index is held the same
 * way when it answers too late for the first frame (`first.late`): the
 * rows come at the next blur, not never.
 */
export function useOnThisDay(
  bills: readonly Bill[] | null | undefined,
  first?: {
    day: string;
    index: OnThisDayIndex | null | undefined;
    /** The first day's read, when it missed the first frame. */
    late?: Promise<OnThisDayIndex | null> | null;
  },
): OnThisDayPicks & {
  /** The bill row's pick, by its earlier name. */
  pick: OnThisDayPicks['bill'];
  stale: boolean;
} {
  const navigation = useContext(NavigationContext);
  const [day, setDay] = useState(() => first?.day ?? currentSydneyDay());
  // Each day's index, once it may be shown.
  const [files, setFiles] = useState<Record<string, OnThisDayIndex | null>>({});
  // Indexes that answered while the list was in view, for the next blur.
  const held = useRef<Record<string, OnThisDayIndex | null>>({});
  if (first && first.index !== undefined && !(first.day in files))
    setFiles({ ...files, [first.day]: first.index });
  // The day as last read, whether or not the list could choose again.
  const [today, setToday] = useState(day);
  useEffect(() => {
    const read = (hidden: boolean) => {
      const now = currentSydneyDay();
      setToday(now);
      if (!hidden) return;
      setDay(now);
      if (Object.keys(held.current).length) {
        const answered = held.current;
        held.current = {};
        setFiles((old) => ({ ...old, ...answered }));
      }
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
  const firstDay = first?.day;
  // The first read that missed the first frame, kept through any refresh.
  const [late, setLate] = useState<Promise<OnThisDayIndex | null> | null>(null);
  if (first?.late && !late) setLate(first.late);
  useEffect(() => {
    if (!late || !firstDay) return;
    let live = true;
    void late.then((index) => {
      if (!live || !index) return;
      if (navigation && !navigation.isFocused())
        setFiles((old) => ({ ...old, [firstDay]: index }));
      else held.current[firstDay] = index;
    });
    return () => {
      live = false;
    };
  }, [late, firstDay, navigation]);
  const reads = !!first;
  useEffect(() => {
    // The first day's index comes with the first load; no index, no reads.
    if (!reads || day === firstDay) return;
    let live = true;
    void readOnThisDay(day).then((index) => {
      if (!live) return;
      if (navigation && !navigation.isFocused())
        setFiles((old) => (day in old ? old : { ...old, [day]: index }));
      else held.current[day] = index;
    });
    return () => {
      live = false;
    };
  }, [day, reads, firstDay, navigation]);
  const file =
    day in files ? files[day] : first?.day === day ? first.index : undefined;
  const [chosen, setChosen] = useState<
    (OnThisDayPicks & { day: string; file: typeof file }) | null
  >(null);
  if (bills && (chosen?.day !== day || chosen.file !== file))
    setChosen({
      day,
      file,
      bill: onThisDay(bills, day),
      ...onThisDayMore(file, day),
    });
  return {
    pick: chosen?.bill ?? null,
    bill: chosen?.bill ?? null,
    division: chosen?.division ?? null,
    speech: chosen?.speech ?? null,
    stale: !!chosen && chosen.day === day && today !== day,
  };
}
