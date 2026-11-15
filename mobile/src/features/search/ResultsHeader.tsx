import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextLayoutEvent,
} from 'react-native';
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
 * Stands in for the count and source line: an ordinary full line. It is
 * always laid out, unseen, and its height is the line's place at the current
 * width and text size, before the count is known and after.
 */
export const COUNT_STAND_IN =
  '0,000+ results · Updated 00 Mmm 0000 · Hansard and 3 more';

/** The line without its sources' names: "… · 4 sources". Never longer than the stand-in. */
export const sourcesCounted = (n: number) =>
  `${n} ${n === 1 ? 'source' : 'sources'}`;

/**
 * The results header under the scope control (journeys/search.md 3.4):
 * the count and source line, one footnote line and one 44 pt target that
 * opens `/source` ("42 speeches · Updated 8 Nov 2026 · Hansard and 3
 * more"), then, only when filters are on, the one filter line. This is the
 * results' one `SourceLine`: a paged list has no reachable foot.
 *
 * The line's height never depends on what the search returns. The stand-in
 * holds its place from the first frame; the real line is drawn over it, in
 * the same place. A first source with a long name (a royal commission's) that
 * would need more lines than are held is counted instead ("4 sources"): the
 * names are in the sheet the line opens, and in its spoken label. Because the
 * stand-in is laid out with the page, the held height follows a rotation, a
 * split view or a new text size, and never changes while results load.
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
  // The stand-in's box and one of its text lines, as last laid out.
  const [box, setBox] = useState(0);
  const [lineHeight, setLineHeight] = useState(0);
  const lines =
    box > 0 && lineHeight > 0
      ? Math.max(1, Math.floor((box + 0.5) / lineHeight))
      : null;
  return (
    <View style={styles.header}>
      <View testID="search-count-slot">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="search-count-stand-in"
          onLayout={(event: LayoutChangeEvent) =>
            setBox(event.nativeEvent.layout.height)
          }
          style={[styles.line, styles.standIn]}
        >
          <View style={styles.glyph}>
            <Icon
              name={symbols.source}
              size={13}
              maxScale={1.5}
              tone="inkSoft"
            />
          </View>
          <Text
            variant="footnote"
            tone="inkSoft"
            style={styles.text}
            onTextLayout={(event: TextLayoutEvent) => {
              const first = event.nativeEvent.lines[0];
              if (first) setLineHeight(first.height);
            }}
          >
            {COUNT_STAND_IN}
          </Text>
        </View>
        {count !== null || details ? (
          <CountLine count={count} details={details} lines={lines} box={box} />
        ) : null}
      </View>
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
  lines,
  box,
}: {
  count: string | null;
  details: SourceDetails | null;
  /** The text lines the held place has room for; null before it is known. */
  lines: number | null;
  /** The held place's height (0 before it is laid out). */
  box: number;
}) {
  // Out of the flow and exactly the stand-in's box, so it adds no height.
  const over = [styles.line, styles.over, box > 0 ? { height: box } : null];
  const { width, fontScale } = useWindowDimensions();
  const parts = details ? sourceLineParts(details) : null;
  const lead = [count, parts?.date].filter(Boolean).join(' · ');
  const tail = parts?.rest.length ? ` · ${parts.rest.join(' · ')}` : '';
  // The full line as it was when it last needed more lines than are held, at
  // this width and text size. A new width, size or line asks again.
  const key = `${lead}|${parts?.name ?? ''}|${tail}|${lines}|${width}|${fontScale}`;
  const [tooLong, setTooLong] = useState<string | null>(null);
  const counted = tooLong === key && !!parts?.name;
  const spoken = [
    count,
    parts?.date,
    parts?.name ? `Source: ${parts.name}` : null,
    ...(parts?.rest ?? []),
  ]
    .filter(Boolean)
    .join('. ')
    .replace(/\u00a0/g, ' ');
  const line = (
    <>
      {details ? (
        <View style={styles.glyph}>
          <Icon name={symbols.source} size={13} maxScale={1.5} tone="inkSoft" />
        </View>
      ) : null}
      <Text
        variant="footnote"
        tone="inkSoft"
        style={styles.text}
        testID="search-count-text"
        onTextLayout={(event: TextLayoutEvent) => {
          if (
            !counted &&
            lines !== null &&
            event.nativeEvent.lines.length > lines
          )
            setTooLong(key);
        }}
      >
        {lead}
        {parts?.name ? (
          <>
            {lead ? ' · ' : ''}
            <Text variant="footnote" style={{ color: colors.navy }}>
              {counted ? sourcesCounted(parts.sources) : parts.name}
            </Text>
          </>
        ) : null}
        {tail}
      </Text>
    </>
  );
  if (!details)
    return (
      <View
        accessible
        accessibilityLabel={spoken}
        testID="search-count"
        style={over}
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
      style={over}
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
  standIn: { opacity: 0 },
  // The real line, over the stand-in's box and never taller than it.
  over: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    overflow: 'hidden',
  },
  glyph: { alignSelf: 'center' },
  text: { flexShrink: 1 },
});
