import { StyleSheet, View } from 'react-native';
import { formatDate } from '../../design/format';
import { MonthPager, Text } from '../../design/primitives';
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
 * The pager at the page's foot: the neighbouring years as a step pair, each
 * named for VoiceOver ("Previous year, 2024"). A missing side stays in
 * place, disabled. Not a bottom `Stack.Toolbar`: iOS 26's floating tab bar
 * stays up on pushes, so the toolbar's year sat in an empty glass circle
 * mid-bar and its controls covered the page's last heading (explore-08).
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
  return (
    <MonthPager
      month={String(year)}
      unit="year"
      labels
      testID="tm-pager"
      previousTestID="tm-previous"
      nextTestID="tm-next"
      previous={
        previous
          ? { label: String(previous), onPress: () => onYear(previous) }
          : null
      }
      next={next ? { label: String(next), onPress: () => onYear(next) } : null}
    />
  );
}
const styles = StyleSheet.create({
  header: { gap: rhythm.line },
});
