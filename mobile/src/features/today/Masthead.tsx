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
export function Masthead({ broadsheet = false }: { broadsheet?: boolean }) {
  const date = mastheadDate(useToday());
  if (broadsheet) return <BroadsheetMasthead date={date} />;
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
        <Text wordSafe variant="label" tone="navy" testID="today-date">
          {date}
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

/**
 * iPad regular width: the same three things on one line, the date at the
 * leading edge and the independence line at the trailing edge, over a
 * bronze double rule (a thick and a thin hairline), as a broadsheet's
 * masthead is ruled. The rule is decorative.
 */
function BroadsheetMasthead({ date }: { date: string }) {
  return (
    <View style={styles.broadsheet} testID="today-masthead">
      <View style={styles.broadsheetRow}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={date}
          style={styles.row}
        >
          <Image
            source={require('../../../assets/splash/mark.png')}
            style={styles.markLarge}
            accessibilityIgnoresInvertColors
          />
          <Text wordSafe variant="label" tone="navy" testID="today-date">
            {date}
          </Text>
        </View>
        <Text
          variant="fine"
          testID="today-screen-message"
          wordSafe
          style={styles.broadsheetLine}
        >
          OPAX is independent and non-partisan. It is not a government app.
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.doubleRule}
      >
        <View style={styles.ruleThick} />
        <View style={styles.ruleThin} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  broadsheet: { gap: spacing.s3 },
  broadsheetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.s4,
    rowGap: spacing.s2,
  },
  broadsheetLine: { flexShrink: 1, textAlign: 'right' },
  markLarge: { width: 26, height: 26 },
  doubleRule: { gap: 2 },
  ruleThick: { height: 2, backgroundColor: colors.bronze },
  ruleThin: { height: hairline, backgroundColor: colors.bronze },
  masthead: {
    gap: spacing.s2,
    paddingBottom: spacing.s3,
    borderBottomWidth: hairline,
    borderBottomColor: colors.dividerDefault,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  mark: { width: 22, height: 22 },
});
