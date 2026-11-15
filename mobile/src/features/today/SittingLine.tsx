import { useEffect, useState } from 'react';
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

/** Today's sitting calendar: the read, and what the first frame needs. */
export interface Sitting {
  /** The saved copy first, then the read's answer; null until one answers. */
  read: SittingRead | null;
  /**
   * Nothing is saved and the read is still out: the line's place is held,
   * so its arrival pushes nothing down.
   */
  reserve: boolean;
  /** The device has been asked for its saved copy (or the read answered). */
  settled: boolean;
}

/**
 * Today's one read of the sitting calendar, shared by the line under the
 * date and the page's closing line (sweep 3, item 7), so a launch asks once
 * and a pull revalidates both together. Null until a read answers; a read
 * that throws answers "no calendar", so the closing line still draws.
 *
 * The copy the device saved answers first, with no request, so the line is
 * under the date in the first frame and is not inserted when the network
 * read answers (which pushed the whole page down a line). With nothing
 * saved (a first launch) the line's place is held until the read answers.
 */
export function useSitting(attempt: number): Sitting {
  const [saved, setSaved] = useState<SittingRead | 'none' | null>(null);
  useEffect(() => {
    let active = true;
    // A reader without saved copies is "nothing saved", like a failed read.
    Promise.resolve()
      .then(() => catalogs.sittingDaysSaved())
      .catch(() => null)
      .then((record) => {
        if (active) setSaved(record ? { record } : 'none');
      });
    return () => {
      active = false;
    };
  }, []);
  const read = useTodayRead(
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
  return {
    read: read ?? (saved && saved !== 'none' ? saved : null),
    reserve: read === null && saved === 'none',
    settled: read !== null || saved !== null,
  };
}

/** The calendar's read alone (the closing line, and tests of the line). */
export function useSittingRead(attempt: number): SittingRead | null {
  return useSitting(attempt).read;
}

/**
 * Today's sitting line (critique 13): one `secondary` line under the date,
 * by rule from the published sitting calendar, opening its source sheet.
 * `now` is Today's clock, so the line rolls over with the date line.
 *
 * Nothing is drawn while the saved calendar is read or when it cannot say.
 * While `reserve` is set the line's height is held empty, and it stays held
 * for this visit if the answer has no line: the page under the date never
 * moves, up or down, once it is on screen.
 */
export function SittingLine({
  now,
  sitting,
  reserve = false,
}: {
  now: Date;
  /** `useSittingRead`'s answer, null while it loads. */
  sitting: SittingRead | null;
  /** `useSitting`'s `reserve`: hold the line's place. */
  reserve?: boolean;
}) {
  const [held, setHeld] = useState(false);
  // Held while rendering (React's adjust-state-on-change pattern).
  if (reserve && !held) setHeld(true);
  const read = sitting?.record ?? null;
  const line = read ? sittingLine(read.data, now) : null;
  if (!read || !line)
    return reserve || held ? (
      <Text
        variant="secondary"
        maxFontSizeMultiplier={sittingCap}
        numberOfLines={1}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="today-sitting-reserved"
      >
        {'\u00a0'}
      </Text>
    ) : null;
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
