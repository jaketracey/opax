import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { border, colors, hairline, rhythm } from '../../design/tokens';

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
 * The front page's masthead: today's date in sentence case, the first line
 * under the large title. The independence line is at the foot of the page
 * (design review D4). Nothing here animates, so the first line is drawn at
 * once on a cold launch. `today-screen-message` names that first line for
 * the journeys, as it did when the independence line held the place.
 *
 * On iPad regular width the date sits over a bronze double rule (a thick and
 * a thin line), as a broadsheet's masthead is ruled. The rule is decorative.
 */
export function Masthead({ broadsheet = false }: { broadsheet?: boolean }) {
  const date = mastheadDate(useToday());
  return (
    <View style={broadsheet ? styles.broadsheet : null} testID="today-masthead">
      <Text
        wordSafe
        variant="metadata"
        accessibilityRole="header"
        testID="today-screen-message"
      >
        {date}
      </Text>
      {broadsheet ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.doubleRule}
        >
          <View style={styles.ruleThick} />
          <View style={styles.ruleThin} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  broadsheet: { gap: rhythm.heading },
  doubleRule: { gap: 2 },
  ruleThick: { height: border.masthead, backgroundColor: colors.bronze },
  ruleThin: { height: hairline, backgroundColor: colors.bronze },
});
