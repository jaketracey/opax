import { useEffect, useState, type ReactNode } from 'react';
import {
  AppState,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { DateInput } from '../../design/format';
import { OfflineLine } from '../../design/states';
import { Text } from '../../design/text';
import { isAccessibilityCategory, rhythm } from '../../design/tokens';
import { androidDotScale, dotHeight, dotWidth } from './australia-dots-model';
import { dayWords, deviceDayWords } from './day-words';

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
    if (!Number.isNaN(day.getTime())) return dayWords(day);
  } catch {
    /* Fall through to the device calendar. */
  }
  return deviceDayWords(now);
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
 * text, not a header), the sitting line when the published calendar can
 * say it, then, only when the last revalidation failed for network
 * reasons, the page's one offline line with the oldest saved date among
 * the blocks drawn. No rule under it. `today-screen-message` names the
 * first line for the journeys.
 */
export function Masthead({
  now,
  offlineSavedAt,
  mark,
  sitting,
}: {
  now: Date;
  /** Set when offline: the oldest saved date among the drawn blocks. */
  offlineSavedAt?: DateInput | null;
  /** Absolute decorative art, behind the date and the native large title. */
  mark?: ReactNode;
  /** The sitting line under the date (`SittingLine`); draws nothing when unknown. */
  sitting?: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  const androidArt =
    Platform.OS === 'android' && !!mark && !isAccessibilityCategory(fontScale);
  const date = (
    <Text
      wordSafe
      variant="secondary"
      maxFontSizeMultiplier={1.353}
      testID="today-screen-message"
    >
      {mastheadDate(now)}
    </Text>
  );
  return (
    <View testID="today-masthead" style={styles.masthead}>
      {androidArt ? (
        <View testID="today-masthead-date" style={styles.androidDate}>
          {mark}
          {date}
        </View>
      ) : (
        <>
          {mark}
          {date}
        </>
      )}
      {sitting}
      {offlineSavedAt !== undefined && offlineSavedAt !== null ? (
        <OfflineLine savedAt={offlineSavedAt} testID="today-offline" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  masthead: { gap: rhythm.tight },
  androidDate: {
    minHeight: dotHeight * androidDotScale,
    paddingRight: dotWidth * androidDotScale + rhythm.tight,
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
