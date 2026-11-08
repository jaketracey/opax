import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { IconButton, Text } from '../../design/primitives';
import { formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { FIRST_YEAR, LAST_YEAR, YearMenu } from './YearMenu';

/** The partial-year statement: only the current calendar year, from its file's date. */
export function partialYearLine(
  year: number,
  generatedAt: string | null | undefined,
  today = new Date(),
) {
  if (!generatedAt) return null;
  const current = Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
    }).format(today),
  );
  return year === current ? `To ${formatDate(generatedAt)}` : null;
}

/** The screen's name, the year as its menu, and "To 4 September 2026" for this year. */
export function YearHeader({
  year,
  onYear,
  generatedAt,
}: {
  year: number;
  onYear: (year: number) => void;
  generatedAt?: string | null;
}) {
  const partial = partialYearLine(year, generatedAt);
  return (
    <View style={styles.header}>
      <Text wordSafe variant="secondary">
        Time machine
      </Text>
      <YearMenu year={year} onChange={onYear} />
      {partial ? (
        <Text wordSafe variant="secondary" testID="tm-partial-year">
          {partial}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The bottom pager, with MonthPager's anatomy (chevrons only, the year as
 * the toolbar's title, the neighbours named for VoiceOver). A missing side
 * stays in place, disabled.
 */
export function YearPager({
  year,
  onYear,
}: {
  year: number;
  onYear: (year: number) => void;
}) {
  const previous = year > FIRST_YEAR ? year - 1 : null,
    next = year < LAST_YEAR ? year + 1 : null;
  const previousLabel = `Previous year${previous ? `, ${previous}` : ''}`,
    nextLabel = `Next year${next ? `, ${next}` : ''}`;
  if (Platform.OS !== 'ios')
    return (
      <View style={styles.steps}>
        <IconButton
          symbol="chevron.left"
          accessibilityLabel={previousLabel}
          disabled={!previous}
          onPress={() => previous && onYear(previous)}
          testID="tm-previous"
        />
        <Text variant="subsectionTitle" style={styles.shrink}>
          {String(year)}
        </Text>
        <IconButton
          symbol="chevron.right"
          accessibilityLabel={nextLabel}
          disabled={!next}
          onPress={() => next && onYear(next)}
          testID="tm-next"
        />
      </View>
    );
  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        icon="chevron.left"
        disabled={!previous}
        accessibilityLabel={previousLabel}
        onPress={() => previous && onYear(previous)}
      />
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.View>
        <Text variant="subsectionTitle">{String(year)}</Text>
      </Stack.Toolbar.View>
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Button
        icon="chevron.right"
        disabled={!next}
        accessibilityLabel={nextLabel}
        onPress={() => next && onYear(next)}
      />
    </Stack.Toolbar>
  );
}
const styles = StyleSheet.create({
  header: { gap: rhythm.line },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  shrink: { flexShrink: 1, textAlign: 'center' },
});
