import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { catalogs } from '../../api/runtime';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate, type DateInput } from '../../design/format';
import { Pressable } from '../../design/pressable';
import { useRowHighlight } from '../../design/row-padding';
import {
  SourceAffordance,
  sourceSymbol,
  updatedText,
  type SourceDetails,
} from '../../design/source';
import { Text } from '../../design/text';
import { minimumTarget, radii, rhythm, textStyles } from '../../design/tokens';
import { recentRecordsRoute } from '../../navigation/routes';
import { presentSource } from '../../navigation/sheets';
import {
  moreSince,
  readVisit,
  rememberVisit,
  sourceCurrent,
} from './visit-store';

/** The line a visit draws: records were added, and the source is current. */
export interface Since {
  /** More records than at the last visit; always more than 0. */
  count: number;
  /** The collection record's own check date. */
  checkedAt: string;
  /** The collection's total the count was worked out from. */
  total: number;
  /**
   * The check date of the collection record the count starts from (the
   * copy whose total this device kept): the date the line names. Kept with
   * that total, on the device only.
   */
  since: string;
}

/** The collection record's two facts the line needs. */
interface Collection {
  total: number;
  checkedAt: string;
}
const collectionOf = (data: {
  expected_resources: number;
  refresh: { checked_at: string };
}): Collection => ({
  total: data.expected_resources,
  checkedAt: data.refresh.checked_at,
});

/**
 * Today's records-added line: how many more records the collection holds
 * than the copy of its record this device last kept, and that copy's date.
 *
 * - The count is the change in the total the collection's own public record
 *   states (`/corpus.json`, a free catalogue read: no paid read on launch).
 * - The last visit is read from the device and compared on the device; it
 *   is never sent anywhere, and the read carries nothing of it.
 * - The copy of the record the device saved answers first, from the disk,
 *   and the record itself is asked for at launch, as soon as the device
 *   has answered for the last visit, beside Today's other launch reads.
 * - The line is drawn only if an answer is in hand when Today's first
 *   frame is `drawn` (the launch cover is still up), and only when it
 *   shows records added from a current source (`SOURCE_LIMIT_DAYS`). In
 *   every other case nothing is drawn for this session: no place is held
 *   for a line, and none is inserted later, so nothing under the date ever
 *   moves. The launch cover is never held for it.
 * - What the device keeps as the last visit is the total the reader was
 *   last told of. It moves on only when the line is drawn (to the total
 *   drawn) or when the record shows nothing added. Growth that answers
 *   too late to draw leaves it alone and only refreshes the saved copy of
 *   the record, so the next launch draws that growth in its first frame,
 *   from the disk, whatever the network does.
 */
export function useSinceLastVisit(drawn: boolean): Since | null {
  const [answer, setAnswer] = useState<Since | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const last = await readVisit();
      /** Growth from a current source is a line to draw, if in time. */
      const offer = (collection: Collection) => {
        const count = moreSince(last, collection.total);
        if (active && last && sourceCurrent(collection.checkedAt, Date.now()))
          setAnswer({ count, ...collection, since: last.checkedAt });
      };
      const saved = await Promise.resolve()
        .then(() => catalogs.corpusSaved())
        .then((record) => (record ? collectionOf(record.data) : null))
        .catch(() => null);
      if (saved && moreSince(last, saved.total) > 0) offer(saved);
      // The read refreshes the saved copy; unreachable, that copy answers.
      const fresh = await Promise.resolve()
        .then(() => catalogs.corpus())
        .then((record) => collectionOf(record.data))
        .catch(() => saved);
      if (!fresh) return;
      if (moreSince(last, fresh.total) > 0) offer(fresh);
      // Nothing added (or the first ever visit): the last visit moves on.
      else void rememberVisit({ openedAt: Date.now(), ...fresh });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  // The first frame takes what is in hand, once (latched while rendering):
  // an answer after it is never drawn this session.
  const [first, setFirst] = useState<{ line: Since | null } | null>(null);
  if (drawn && first === null) setFirst({ line: answer });
  const line = first?.line ?? null;
  // A drawn line is what the reader has now been told: kept as the visit.
  useEffect(() => {
    if (line)
      void rememberVisit({
        openedAt: Date.now(),
        total: line.total,
        checkedAt: line.checkedAt,
      });
  }, [line]);
  return line;
}

/** The collection's public record, as About and Coverage name it. */
export const COLLECTION_RECORD = 'OPAX collection coverage record';

/**
 * The line's words, only ever for records added: "412 more records in OPAX
 * since 14 Nov". The number is the change in the collection's stated total
 * between two copies of its record, and the date is the earlier copy's own
 * check date, so the sentence is true whichever launch draws it and
 * however long before a visit that copy was checked. The date is said as
 * the source line says the later copy's, without the year in this year.
 */
export const sinceWords = (
  count: number,
  since: DateInput,
  year = new Date().getFullYear(),
) =>
  `${count.toLocaleString('en-AU')} more ${count === 1 ? 'record' : 'records'} in OPAX since ${formatDate(since, 'short').replace(new RegExp(` ${year}$`), '')}`;

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
      'The number is the change in the total number of records the collection record states, from the copy of the record checked on the date shown.',
      'Which copy you last saw is kept on this device only.',
    ],
  };
}

/**
 * Under Today's date, when records were added: "412 more records in OPAX
 * since 14 Nov", and under it the source line every Today source
 * draws (`SourceAffordance`: the source glyph, "Updated 15 Nov 2026" and
 * the record's name in navy). Both open Just added; touch and hold on the
 * count (or its VoiceOver action) opens the sources. With no line, nothing
 * is drawn and no place is kept: there is no "no change" line.
 */
export function SinceLine({ since }: { since: Since | null }) {
  const fixed = useAccessibilitySize();
  const highlight = useRowHighlight();
  const [textHeight, setTextHeight] = useState<number>(
    textStyles.secondary.lineHeight,
  );
  if (!since) return null;
  const words = sinceWords(since.count, since.since);
  const updated = updatedText(since.checkedAt);
  const band = Math.max(0, (minimumTarget - textHeight) / 2);
  const openAdded = () => router.push(recentRecordsRoute);
  const openSources = () =>
    presentSource(sinceSources(since), { testID: 'today-since' });
  return (
    <View testID="today-since" style={styles.block}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={words}
        accessibilityHint="Opens Just added"
        accessibilityActions={[{ name: 'sources', label: 'Sources' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'sources') openSources();
        }}
        testID="today-since-count"
        onPress={openAdded}
        onLongPress={openSources}
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
          tone="link"
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
          {words}
        </Text>
      </Pressable>
      <SourceAffordance
        glyph={sourceSymbol}
        date={updated}
        name={COLLECTION_RECORD}
        accessibilityLabel={[updated, COLLECTION_RECORD]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Opens Just added"
        accessibilityRole="link"
        onPress={openAdded}
        testID="today-since-source"
        // As TodayBlock's source lines: the touch band overlaps upward, so
        // the text sits a group gap under the count, not a band below it.
        overlap
      />
    </View>
  );
}

/** The count's Dynamic Type cap, the date line's and the sitting line's. */
const sinceCap = 1.353;

const styles = StyleSheet.create({
  // The count to its source line, as a Today block's body to its own.
  block: { gap: rhythm.group },
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
