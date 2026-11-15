import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { unbroken } from '../../design/format';
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
 * Stands in for the count and source line: the longest ordinary line (the
 * longest count noun, and "and 3 more" unbroken as the real line has it),
 * so it is never shorter than the counted form. It is always laid out,
 * unseen, and its height is the line's place at the current width and text
 * size, before the count is known and after.
 */
export const COUNT_STAND_IN = `0,000+ government agencies · Updated 00 Mmm 0000 · Hansard ${unbroken('and 3 more')}`;

/** The line without its sources' names: "… · 4 sources". */
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
 * would be taller than the held place is counted instead ("4 sources"): the
 * names are in the sheet the line opens, and in its spoken label.
 *
 * Which form fits is measured, not guessed: an unseen copy of the full line
 * is laid out at the line's own width and its height compared with the held
 * place. The line is drawn only once that is known, so the names never show
 * for a frame before the count replaces them. Both measurements are plain
 * layouts of views that are always mounted, so a rotation, a split view or a
 * new text size measures again by itself, and nothing changes while results
 * load.
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
  // The stand-in's box, as last laid out.
  const [box, setBox] = useState(0);
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
          style={[styles.line, styles.unseen]}
        >
          <View style={styles.glyph}>
            <Icon
              name={symbols.source}
              size={13}
              maxScale={1.5}
              tone="inkSoft"
            />
          </View>
          <Text variant="footnote" tone="inkSoft" style={styles.text}>
            {COUNT_STAND_IN}
          </Text>
        </View>
        {count !== null || details ? (
          <CountLine count={count} details={details} box={box} />
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
  box,
}: {
  count: string | null;
  details: SourceDetails | null;
  /** The held place's height (0 before it is laid out). */
  box: number;
}) {
  const parts = details ? sourceLineParts(details) : null;
  const lead = [count, parts?.date].filter(Boolean).join(' · ');
  const tail = parts?.rest.length ? ` · ${parts.rest.join(' · ')}` : '';
  const named = parts?.name ?? null;
  // The full line's words: what the unseen copy lays out, and its identity.
  const fullText = `${lead}${named ? `${lead ? ' · ' : ''}${named}` : ''}${tail}`;
  // The unseen copy's height, with the words it was measured for. A line
  // with no source names has nothing to count and is not measured.
  const [probe, setProbe] = useState<{ text: string; height: number } | null>(
    null,
  );
  const measured = !named || (box > 0 && probe?.text === fullText);
  const counted = !!named && measured && probe!.height > box + 0.5;
  const spoken = [
    count,
    parts?.date,
    counted && parts ? sourcesCounted(parts.sources) : null,
    named ? `Source: ${named}` : null,
    ...(parts?.rest ?? []),
  ]
    .filter(Boolean)
    .join('. ')
    .replace(/\u00a0/g, ' ');
  const glyph = details ? (
    <View style={styles.glyph}>
      <Icon name={symbols.source} size={13} maxScale={1.5} tone="inkSoft" />
    </View>
  ) : null;
  // The line's words as a text's own children (no wrapper), with `name` as
  // the source part: the names, or their count.
  const words = (name: string | null) => [
    lead,
    name ? (lead ? ' · ' : '') : '',
    name ? (
      <Text key="name" variant="footnote" style={{ color: colors.navy }}>
        {name}
      </Text>
    ) : null,
    tail,
  ];
  // Out of the flow and exactly the stand-in's box, so it adds no height;
  // unseen until the full line's height is known, so the names never show
  // and then give way to the count.
  const over = [
    styles.line,
    styles.over,
    box > 0 ? { height: box } : null,
    measured ? null : styles.unseen,
  ];
  const line = (
    <>
      {glyph}
      <Text
        variant="footnote"
        tone="inkSoft"
        style={styles.text}
        testID="search-count-text"
      >
        {words(counted && parts ? sourcesCounted(parts.sources) : named)}
      </Text>
    </>
  );
  return (
    <>
      {named ? (
        // The full line again, unseen and at its natural height, at the
        // line's own width. Keyed by its words only: new words mount a new
        // copy, and a new width or text size lays this one out again.
        <View
          key={fullText}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          testID="search-count-probe"
          onLayout={(event: LayoutChangeEvent) => {
            const { height } = event.nativeEvent.layout;
            setProbe((was) =>
              was?.text === fullText && was.height === height
                ? was
                : { text: fullText, height },
            );
          }}
          style={[styles.probe, styles.unseen]}
        >
          {glyph}
          <Text variant="footnote" tone="inkSoft" style={styles.text}>
            {words(named)}
          </Text>
        </View>
      ) : null}
      {details ? (
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
      ) : (
        <View
          accessible
          accessibilityLabel={spoken}
          testID="search-count"
          style={over}
        >
          {line}
        </View>
      )}
    </>
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
  unseen: { opacity: 0 },
  // The real line, over the stand-in's box and never taller than it.
  over: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    overflow: 'hidden',
  },
  // The measuring copy: the line's width, whatever height its words need.
  probe: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  glyph: { alignSelf: 'center' },
  text: { flexShrink: 1 },
});
