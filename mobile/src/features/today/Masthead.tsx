import { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { colors, hairline, spacing } from '../../design/tokens';

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
/** "Tuesday 7 October", on this iPhone's calendar. */
export function mastheadDate(now: Date): string {
  return `${weekdays[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
}

/** Today's date, kept current when the app returns to the foreground. */
function useToday() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);
  return now;
}

/**
 * The front page's masthead under the large title: the OPAX mark, today's
 * date, and the independence line. Nothing here animates, so the first line
 * is drawn at once on a cold launch.
 */
export function Masthead() {
  const date = mastheadDate(useToday());
  return (
    <View style={styles.masthead} testID="today-masthead">
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={date}
        style={styles.row}
      >
        <Image
          source={require('../../../assets/splash/mark.png')}
          style={styles.mark}
          accessibilityIgnoresInvertColors
        />
        <Text wordSafe variant="kicker" tone="navy" testID="today-date">
          {date.toLocaleUpperCase('en-AU')}
        </Text>
      </View>
      <Text
        variant="fine"
        testID="today-screen-message"
        wordSafe
        style={{ flexShrink: 0 }}
      >
        OPAX is independent and non-partisan. It is not a government app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  masthead: {
    gap: spacing.s2,
    paddingBottom: spacing.s3,
    borderBottomWidth: hairline,
    borderBottomColor: colors.dividerDefault,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  mark: { width: 22, height: 22 },
});
