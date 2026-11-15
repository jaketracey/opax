import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { catalogs } from '../../api/runtime';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate, type DateInput } from '../../design/format';
import { Pressable } from '../../design/pressable';
import { RowLink } from '../../design/row-link';
import { useRowHighlight } from '../../design/row-padding';
import type { SourceDetails } from '../../design/source';
import { Text } from '../../design/text';
import { minimumTarget, radii, rhythm, textStyles } from '../../design/tokens';
import { recentRecordsRoute } from '../../navigation/routes';
import { presentSource } from '../../navigation/sheets';
import {
  moreSince,
  refreshLikely,
  rememberVisit,
  type Visit,
} from './visit-store';

/** What the collection record answered for this visit. */
export interface Since {
  /** More records than at the last visit; 0 when the total did not grow. */
  count: number;
  /** The collection record's own check date; null when it was not read. */
  checkedAt: string | null;
}

export interface SinceLastVisit {
  /** Null until the collection record answers. */
  answer: Since | null;
  /**
   * Hold the line's place from the first frame: there was a last visit and
   * a newer collection record has likely been published since. Decided once,
   * from the disk, and never turned on later, so no line is inserted after
   * the page is drawn.
   */
  hold: boolean;
}

/**
 * Today's "since your last visit": how many more records the collection
 * holds than when the reader last opened the app.
 *
 * - The count is the change in the total the collection's own public record
 *   states (`/corpus.json`, a free catalogue read: no paid read on launch).
 * - `last` is the visit the launch read from the device (undefined until
 *   the disk answers, null on the first ever launch). It is compared on the
 *   device and never sent anywhere.
 * - This visit is kept for the next launch once the record answers; a read
 *   that fails keeps the last visit as it was.
 */
export function useSinceLastVisit(
  last: Visit | null | undefined,
  now: Date,
): SinceLastVisit {
  const [visit, setVisit] = useState<{
    last: Visit | null;
    hold: boolean;
  } | null>(null);
  // Latched while rendering, once: a later launch read (the date rolling
  // over) never starts a second visit under the reader.
  if (visit === null && last !== undefined)
    setVisit({
      last,
      hold: !!last && refreshLikely(last, now.getTime()),
    });
  const [answer, setAnswer] = useState<Since | null>(null);
  useEffect(() => {
    if (!visit) return;
    let active = true;
    Promise.resolve()
      .then(() => catalogs.corpus())
      .then((record) => {
        const total = record.data.expected_resources;
        const checkedAt = record.data.refresh.checked_at;
        void rememberVisit({ openedAt: Date.now(), total, checkedAt });
        if (active)
          setAnswer({ count: moreSince(visit.last, total), checkedAt });
      })
      .catch(() => {
        if (active) setAnswer({ count: 0, checkedAt: null });
      });
    return () => {
      active = false;
    };
  }, [visit]);
  return { answer, hold: visit?.hold ?? false };
}

/** The collection's public record, as About and Coverage name it. */
export const COLLECTION_RECORD = 'OPAX collection coverage record';

/**
 * The line's words. The number is the change in the collection's stated
 * total, so it says "more records in OPAX", which is exactly what it is.
 */
export const sinceWords = (count: number) =>
  count > 0
    ? `${count.toLocaleString('en-AU')} more ${count === 1 ? 'record' : 'records'} in OPAX since your last visit`
    : NO_GROWTH;

/**
 * The held place is never left blank: a total that has not grown (the same,
 * or smaller) is said as plainly, with the same source and the same link.
 */
const NO_GROWTH = 'The OPAX record count hasn’t grown since your last visit';

/** The line's source, in the line: the record's own check date and name. */
export const sinceSourceWords = (checkedAt: DateInput) =>
  `As at ${formatDate(checkedAt, 'short')}, ${COLLECTION_RECORD}.`;

/** The line's source, as About cites the collection record. */
export function sinceSources(since: Since): SourceDetails {
  return {
    asOf: since.checkedAt,
    citation: COLLECTION_RECORD,
    originals: [
      {
        label: COLLECTION_RECORD,
        url: '/corpus.json',
        asOf: since.checkedAt,
      },
    ],
    notes: [
      'The number is the change in the total number of records the collection record states, since you last opened OPAX on this device.',
      'When you last opened OPAX is kept on this device only.',
    ],
  };
}

/**
 * Unseen words the length of the usual line, so the held place wraps as
 * the line will at every text size.
 */
const RESERVED_WORDS = `${sinceWords(400)}. ${sinceSourceWords('2026-11-16')}`;

/**
 * The line under Today's date: "412 more records in OPAX since your last
 * visit. As at 15 Nov 2026, OPAX collection coverage record." It opens Just
 * added; touch and hold (or its VoiceOver action) opens the sources.
 *
 * Nothing is drawn unless `hold` was set on the first frame. A held place
 * always ends in a true line: the count, or that the count hasn't grown.
 * Only while the record is read is it empty, and when the record could not
 * be read at all, where there is nothing true to say: Today gives that
 * place back once it is out of view (`dropped`).
 */
export function SinceLine({
  since,
  dropped = false,
}: {
  since: SinceLastVisit;
  /** Today is out of view, or was: an empty held place is given back. */
  dropped?: boolean;
}) {
  const fixed = useAccessibilitySize();
  const highlight = useRowHighlight();
  const [textHeight, setTextHeight] = useState<number>(
    textStyles.secondary.lineHeight,
  );
  if (!since.hold) return null;
  const answer = since.answer;
  if (!answer || !answer.checkedAt)
    return dropped && answer ? null : (
      <Text
        wordSafe={fixed}
        variant="secondary"
        maxFontSizeMultiplier={sinceCap}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.reserved}
        testID="today-since-reserved"
      >
        {RESERVED_WORDS}
      </Text>
    );
  const words = sinceWords(answer.count);
  const source = sinceSourceWords(answer.checkedAt);
  const details = sinceSources(answer);
  const band = Math.max(0, (minimumTarget - textHeight) / 2);
  return (
    <RowLink
      href={recentRecordsRoute}
      menu={[
        {
          title: 'Sources',
          symbol: 'doc.text',
          onPress: () => presentSource(details, { testID: 'today-since' }),
        },
      ]}
    >
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={`${words}. ${source}`}
        accessibilityHint="Opens Just added"
        testID="today-since"
        onPress={() => router.push(recentRecordsRoute)}
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
          maxFontSizeMultiplier={sinceCap}
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
          <Text variant="secondary" tone="link" testID="today-since-count">
            {words}
          </Text>
          {`. ${source}`}
        </Text>
      </Pressable>
    </RowLink>
  );
}

/** The line's Dynamic Type cap, the date line's and the sitting line's. */
const sinceCap = 1.353;

const styles = StyleSheet.create({
  // The held place: laid out, never seen.
  reserved: { opacity: 0 },
  line: {
    justifyContent: 'center',
    paddingHorizontal: rhythm.tight,
    marginHorizontal: -rhythm.tight,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
  },
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  fixed: { alignSelf: 'stretch' },
});
