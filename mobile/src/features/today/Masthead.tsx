import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import type { DateInput } from '../../design/format';
import { OfflineLine } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** "Sunday 8 November": the Sydney calendar day of an instant. */
export function mastheadDate(now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const n = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const day = new Date(Date.UTC(n('year'), n('month') - 1, n('day')));
    if (!Number.isNaN(day.getTime()))
      return `${weekdays[day.getUTCDay()]} ${day.getUTCDate()} ${months[day.getUTCMonth()]}`;
  } catch {
    /* Fall through to the device calendar. */
  }
  return `${weekdays[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
}

const msToSydneyMidnight = (now: Date) => {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);
  const into = ((hm[0] ?? 0) * 3600 + (hm[1] ?? 0) * 60 + (hm[2] ?? 0)) * 1000;
  return Math.max(1000, 86_400_000 - into + 500);
};

/**
 * The current instant, renewed when the app returns to the foreground and at
 * Sydney midnight while Today is open, so the date line and the day's rules
 * roll over with the calendar.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), msToSydneyMidnight(now));
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}

/**
 * Slot 0 under the large title: the date line ("Sunday 8 November", plain
 * text, not a header), then, only when the last revalidation failed for
 * network reasons, the page's one offline line with the oldest saved date
 * among the blocks drawn. No rule under it. `today-screen-message` names
 * the first line for the journeys.
 */
export function Masthead({
  now,
  offlineSavedAt,
}: {
  now: Date;
  /** Set when offline: the oldest saved date among the drawn blocks. */
  offlineSavedAt?: DateInput | null;
}) {
  return (
    <View testID="today-masthead" style={styles.masthead}>
      <Text wordSafe variant="secondary" testID="today-screen-message">
        {mastheadDate(now)}
      </Text>
      {offlineSavedAt !== undefined && offlineSavedAt !== null ? (
        <OfflineLine savedAt={offlineSavedAt} testID="today-offline" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  masthead: { gap: rhythm.tight },
});
