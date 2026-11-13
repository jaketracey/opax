import { Pressable, StyleSheet, View } from 'react-native';
import {
  Icon,
  Text,
  sourceLineParts,
  symbols,
  type SourceDetails,
} from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { presentSource } from '../../navigation/sheets';
import { FiltersLine } from './FiltersLine';

/**
 * The results header under the scope control (journeys/search.md 3.4):
 * the count and source line, one footnote line and one 44 pt target that
 * opens `/source` ("42 speeches · Updated 8 Nov 2026 · Hansard and 3
 * more"), then, only when filters are on, the one filter line. This is the
 * results' one `SourceLine`: a paged list has no reachable foot.
 */
export function ResultsHeader({
  count,
  details,
  filters,
  onClearFilters,
  onOpenFilters,
}: {
  /** "42 speeches"; null while the count is unknown. */
  count: string | null;
  details: SourceDetails | null;
  filters?: string;
  onClearFilters?: () => void;
  onOpenFilters?: () => void;
}) {
  return (
    <View style={styles.header}>
      {count !== null || details ? (
        <CountLine count={count} details={details} />
      ) : null}
      {filters && onClearFilters ? (
        <FiltersLine
          text={filters}
          onClear={onClearFilters}
          onPress={onOpenFilters}
        />
      ) : null}
    </View>
  );
}

function CountLine({
  count,
  details,
}: {
  count: string | null;
  details: SourceDetails | null;
}) {
  const parts = details ? sourceLineParts(details) : null;
  const lead = [count, parts?.date].filter(Boolean).join(' · ');
  const spoken = [
    count,
    parts?.date,
    parts?.name ? `Source: ${parts.name}` : null,
    ...(parts?.rest ?? []),
  ]
    .filter(Boolean)
    .join('. ');
  const line = (
    <>
      {details ? (
        <View style={styles.glyph}>
          <Icon name={symbols.source} size={13} maxScale={1.5} tone="inkSoft" />
        </View>
      ) : null}
      <Text variant="footnote" tone="inkSoft" style={styles.text}>
        {lead}
        {parts?.name ? (
          <>
            {lead ? ' · ' : ''}
            <Text variant="footnote" style={{ color: colors.navy }}>
              {parts.name}
            </Text>
          </>
        ) : null}
        {parts?.rest.length ? ` · ${parts.rest.join(' · ')}` : ''}
      </Text>
    </>
  );
  if (!details)
    return (
      <View
        accessible
        accessibilityLabel={spoken}
        testID="search-count"
        style={styles.line}
      >
        {line}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${spoken}.`}
      accessibilityHint="Opens the sources"
      testID="search-count"
      onPress={() => presentSource(details, { testID: 'search-sources' })}
      style={styles.line}
    >
      {line}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: rhythm.line },
  line: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  glyph: { alignSelf: 'center' },
  text: { flexShrink: 1 },
});
