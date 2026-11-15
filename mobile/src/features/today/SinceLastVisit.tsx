import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { catalogs } from '../../api/runtime';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate, type DateInput } from '../../design/format';
import { Pressable } from '../../design/pressable';
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

/** The collection record's two facts the line needs. */
export interface Collection {
  /** Its stated total of records. */
  total: number;
  /** Its own check date. */
  checkedAt: string;
}

/** What the collection record answered for this visit. */
export interface Since {
  /** More records than at the last visit; 0 when the total did not grow. */
  count: number;
  /** The collection record's own check date. */
  checkedAt: string;
}

export interface SinceLastVisit {
  /** Null until the collection record answers. */
  answer: Since | null;
  /**
   * Hold the line's place from the first frame. Decided once, from the disk
   * alone: there was a last visit, a copy of the collection record is saved
   * on the device, and a newer one has likely been published since. It is
   * never turned on later, so no line is inserted after the page is drawn;
   * and with a saved copy there is always a dated record to cite, so a held
   * place always ends in a line and is never given back.
   */
  hold: boolean;
}

/** The collection record as the device saved it, for the launch read. */
export async function readSavedCollection(): Promise<Collection | null> {
  try {
    const record = await catalogs.corpusSaved();
    return record ? collectionOf(record.data) : null;
  } catch {
    // A reader without saved copies has nothing saved.
    return null;
  }
}
const collectionOf = (data: {
  expected_resources: number;
  refresh: { checked_at: string };
}): Collection => ({
  total: data.expected_resources,
  checkedAt: data.refresh.checked_at,
});

/**
 * Today's "since your last visit": how many more records the collection
 * holds than when the reader last opened the app.
 *
 * - The count is the change in the total the collection's own public record
 *   states (`/corpus.json`, a free catalogue read: no paid read on launch).
 * - `last` is the visit, and `saved` the collection record, as the launch
 *   read them from the device (`last` undefined until the disk answers, null
 *   on the first ever launch). They are compared on the device; the visit
 *   is never sent anywhere.
 * - The record is read once. If it cannot be reached, the saved copy
 *   answers, with its own date. This visit is then kept for the next launch.
 */
export function useSinceLastVisit(
  last: Visit | null | undefined,
  saved: Collection | null,
  now: Date,
): SinceLastVisit {
  const [visit, setVisit] = useState<{
    last: Visit | null;
    saved: Collection | null;
    hold: boolean;
  } | null>(null);
  // Latched while rendering, once: a later launch read (the date rolling
  // over) never starts a second visit under the reader.
  if (visit === null && last !== undefined)
    setVisit({
      last,
      saved,
      hold: !!last && !!saved && refreshLikely(last, now.getTime()),
    });
  const [answer, setAnswer] = useState<Since | null>(null);
  useEffect(() => {
    if (!visit) return;
    let active = true;
    const settle = (collection: Collection | null) => {
      if (!collection) return;
      void rememberVisit({ openedAt: Date.now(), ...collection });
      if (active)
        setAnswer({
          count: moreSince(visit.last, collection.total),
          checkedAt: collection.checkedAt,
        });
    };
    Promise.resolve()
      .then(() => catalogs.corpus())
      .then((record) => settle(collectionOf(record.data)))
      .catch(() => settle(visit.saved));
    return () => {
      active = false;
    };
  }, [visit]);
  return { answer, hold: visit?.hold ?? false };
}

/** The collection's public record, as About and Coverage name it. */
export const COLLECTION_RECORD = 'OPAX collection coverage record';

/**
 * The held place is never left blank: a total that has not grown (the same,
 * or smaller) is said as plainly, with the same source and the same link.
 */
const NO_GROWTH = 'The OPAX record count hasn’t grown since your last visit';

/**
 * The line's words. The number is the change in the collection's stated
 * total, so it says "more records in OPAX", which is exactly what it is.
 */
export const sinceWords = (count: number) =>
  count > 0
    ? `${count.toLocaleString('en-AU')} more ${count === 1 ? 'record' : 'records'} in OPAX since your last visit`
    : NO_GROWTH;

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
 * The longest line the place can hold, never seen: the longer of the
 * no-growth sentence and a count of seven digits, with the longest date. It
 * is laid out in the line's own box and type, so the place is as tall as
 * any line can be at this width and text size, and the line that arrives
 * sits in it without moving anything.
 */
export const LONGEST_LINE = (() => {
  const count = sinceWords(8_888_888);
  const words = count.length > NO_GROWTH.length ? count : NO_GROWTH;
  return `${words}. ${sinceSourceWords('2026-09-28')}`;
})();

/**
 * The line under Today's date: "412 more records in OPAX since your last
 * visit. As at 15 Nov 2026, OPAX collection coverage record." It opens Just
 * added; touch and hold (or its VoiceOver action) opens the sources.
 *
 * Nothing is drawn unless `hold` was set on the first frame. The place is
 * one box from then on: the unseen longest line sets its size, and the line
 * that arrives is drawn over it, so the box never grows or shrinks and the
 * page under it never moves. Once drawn, the line stays for the life of the
 * screen; the next cold launch works it out again.
 */
export function SinceLine({ since }: { since: SinceLastVisit }) {
  const fixed = useAccessibilitySize();
  const highlight = useRowHighlight();
  const [textHeight, setTextHeight] = useState<number>(
    textStyles.secondary.lineHeight,
  );
  if (!since.hold) return null;
  const answer = since.answer;
  const words = answer ? sinceWords(answer.count) : '';
  const source = answer ? sinceSourceWords(answer.checkedAt) : '';
  const band = Math.max(0, (minimumTarget - textHeight) / 2);
  const openSources = () => {
    if (answer) presentSource(sinceSources(answer), { testID: 'today-since' });
  };
  return (
    <Pressable
      disabled={!answer}
      accessible={!!answer}
      accessibilityElementsHidden={!answer}
      importantForAccessibility={answer ? 'yes' : 'no-hide-descendants'}
      accessibilityRole="link"
      accessibilityLabel={answer ? `${words}. ${source}` : undefined}
      accessibilityHint="Opens Just added"
      accessibilityActions={[{ name: 'sources', label: 'Sources' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'sources') openSources();
      }}
      testID={answer ? 'today-since' : 'today-since-reserved'}
      onPress={() => router.push(recentRecordsRoute)}
      onLongPress={openSources}
      style={({ pressed }) => [
        styles.line,
        { marginVertical: -band, paddingVertical: band },
        fixed ? styles.fixed : styles.hug,
        pressed && answer ? { backgroundColor: highlight } : null,
      ]}
    >
      <Text
        wordSafe={fixed}
        variant="secondary"
        maxFontSizeMultiplier={sinceCap}
        accessible={false}
        style={styles.unseen}
        testID="today-since-place"
        onTextLayout={(event) => {
          const total = event.nativeEvent.lines.reduce(
            (sum, l) => sum + l.height,
            0,
          );
          if (total > 0 && Math.abs(total - textHeight) > 0.5)
            setTextHeight(total);
        }}
      >
        {LONGEST_LINE}
      </Text>
      {answer ? (
        <Text
          wordSafe={fixed}
          variant="secondary"
          maxFontSizeMultiplier={sinceCap}
          accessible={false}
          style={[styles.drawn, { top: band }]}
          testID="today-since-words"
        >
          <Text variant="secondary" tone="link" testID="today-since-count">
            {words}
          </Text>
          {`. ${source}`}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The line's Dynamic Type cap, the date line's and the sitting line's. */
const sinceCap = 1.353;

const styles = StyleSheet.create({
  // The place's size: laid out, never seen.
  unseen: { opacity: 0 },
  // The line, over the place, inside the box's own padding: the same width
  // as the unseen line, so it wraps no later than that one does.
  drawn: {
    position: 'absolute',
    left: rhythm.tight,
    right: rhythm.tight,
  },
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
