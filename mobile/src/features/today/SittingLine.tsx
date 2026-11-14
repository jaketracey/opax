import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { catalogs } from '../../api/runtime';
import { useAccessibilitySize } from '../../design/accessibility';
import { Pressable } from '../../design/pressable';
import { useRowHighlight } from '../../design/row-padding';
import type { SourceDetails } from '../../design/source';
import { Text } from '../../design/text';
import { minimumTarget, radii, rhythm, textStyles } from '../../design/tokens';
import { presentSource } from '../../navigation/sheets';
import { sittingLine, sittingSources } from './sitting';
import { useTodayRead } from './TodayBlock';
import { useTermWords, withTermAction } from '../../design/term';
import { sittingTerm } from '../learn/term-map';

/** The sitting calendar's read: the saved or fetched file, or null for none. */
export interface SittingRead {
  record: Awaited<ReturnType<typeof catalogs.sittingDays>>;
}

/**
 * Today's one read of the sitting calendar, shared by the line under the
 * date and the page's closing line (sweep 3, item 7), so a launch asks once
 * and a pull revalidates both together. Null until the read answers; a read
 * that throws answers "no calendar", so the closing line still draws.
 */
export function useSittingRead(attempt: number): SittingRead | null {
  return useTodayRead(
    'sitting',
    async (refresh): Promise<SittingRead> => {
      try {
        return { record: await catalogs.sittingDays(refresh) };
      } catch {
        return { record: null };
      }
    },
    attempt,
  );
}

/**
 * Today's sitting line (critique 13): one `secondary` line under the date,
 * by rule from the published sitting calendar, opening its source sheet.
 * Nothing is drawn while the calendar loads or when it cannot say.
 * `now` is Today's clock, so the line rolls over with the date line.
 */
export function SittingLine({
  now,
  sitting,
}: {
  now: Date;
  /** `useSittingRead`'s answer, null while it loads. */
  sitting: SittingRead | null;
}) {
  const read = sitting?.record ?? null;
  const line = read ? sittingLine(read.data, now) : null;
  if (!read || !line) return null;
  return (
    <SittingText
      text={line.text}
      details={sittingSources(read.data, line, read)}
    />
  );
}

/** The sitting line's Dynamic Type cap, shared with its marked term. */
const sittingCap = 1.353;

/**
 * The drawn line: real text, read as drawn, a button that opens the
 * sources. Its touch band is 44 pt (48 on Android) but overlaps the date
 * above and the space below, so the text sits where a plain line would.
 * Capped with the date line, so the large title keeps the lead at
 * accessibility sizes; it wraps, never truncates.
 */
export function SittingText({
  text,
  details,
}: {
  text: string;
  details: SourceDetails;
}) {
  const fixed = useAccessibilitySize();
  const highlight = useRowHighlight();
  const [textHeight, setTextHeight] = useState<number>(
    textStyles.secondary.lineHeight,
  );
  const band = Math.max(0, (minimumTarget - textHeight) / 2);
  const term = sittingTerm(text);
  const termAction = withTermAction([], term?.term);
  const words = useTermWords(text, term?.term, term?.phrase, sittingCap);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint="Opens the sources"
      accessibilityActions={term ? termAction.actions : undefined}
      onAccessibilityAction={(event) =>
        void termAction.handle(event.nativeEvent.actionName)
      }
      testID="today-sitting"
      onPress={() => presentSource(details, { testID: 'today-sitting' })}
      style={({ pressed }) => [
        styles.line,
        { marginVertical: -band, paddingVertical: band },
        fixed ? styles.fixed : styles.hug,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      <Text
        wordSafe={fixed}
        variant="secondary"
        maxFontSizeMultiplier={sittingCap}
        accessible={false}
        onTextLayout={(event) => {
          const total = event.nativeEvent.lines.reduce(
            (sum, l) => sum + l.height,
            0,
          );
          if (total > 0 && Math.abs(total - textHeight) > 0.5)
            setTextHeight(total);
        }}
      >
        {words}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    justifyContent: 'center',
    paddingHorizontal: rhythm.tight,
    marginHorizontal: -rhythm.tight,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
  },
  // Hugging its text, so the pressed highlight is the line's own shape.
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  // At accessibility sizes the column's full width, so word-safe text has a
  // fixed frame to fit (a hugging width would chase its own text).
  fixed: { alignSelf: 'stretch' },
});
