import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { catalogs } from '../../api/runtime';
import { useAccessibilitySize } from '../../design/accessibility';
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
 * Today's "since your last visit": how many more records the collection
 * holds than when the reader last opened the app.
 *
 * - The count is the change in the total the collection's own public record
 *   states (`/corpus.json`, a free catalogue read: no paid read on launch).
 * - The last visit is read from the device and compared on the device; it
 *   is never sent anywhere, and the read carries nothing of it.
 * - The record is asked for as soon as the device has answered for the
 *   last visit, at launch, beside Today's other launch reads.
 * - The line is drawn only if that answer is in hand when Today's first
 *   frame is `drawn` (the launch cover is still up), and only when it
 *   shows records added from a current source (`SOURCE_LIMIT_DAYS`). In
 *   every other case nothing is drawn for this session: no place is held
 *   for a line, and none is inserted later, so nothing under the date ever
 *   moves. The launch cover is never held for it.
 * - Either way this visit is kept for the next launch; if the record
 *   cannot be reached, the copy the device saved is kept with it.
 */
export function useSinceLastVisit(drawn: boolean): Since | null {
  const [answer, setAnswer] = useState<Since | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const last = await readVisit();
      const collection = await Promise.resolve()
        .then(() => catalogs.corpus())
        .then((record) => collectionOf(record.data))
        .catch(async () => {
          // Unreachable: the saved copy answers, with its own date.
          const saved = await catalogs.corpusSaved();
          return saved ? collectionOf(saved.data) : null;
        });
      if (!collection) return;
      void rememberVisit({ openedAt: Date.now(), ...collection });
      const count = moreSince(last, collection.total);
      // Nothing added, or a record older than the limit: no line.
      if (
        active &&
        count > 0 &&
        sourceCurrent(collection.checkedAt, Date.now())
      )
        setAnswer({ count, checkedAt: collection.checkedAt });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  // The first frame takes what is in hand, once (latched while rendering):
  // an answer after it is never drawn this session.
  const [first, setFirst] = useState<{ line: Since | null } | null>(null);
  if (drawn && first === null) setFirst({ line: answer });
  return first?.line ?? null;
}

/** The collection's public record, as About and Coverage name it. */
export const COLLECTION_RECORD = 'OPAX collection coverage record';

/**
 * The line's words, only ever for records added. The number is the change
 * in the collection's stated total, so it says "more records in OPAX",
 * which is exactly what it is.
 */
export const sinceWords = (count: number) =>
  `${count.toLocaleString('en-AU')} more ${count === 1 ? 'record' : 'records'} in OPAX since your last visit`;

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
 * Under Today's date, when records were added: "412 more records in OPAX
 * since your last visit", and under it the source line every Today source
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
  const words = sinceWords(since.count);
  const updated = updatedText(since.checkedAt);
  const band = Math.max(0, (minimumTarget - textHeight) / 2);
  const openAdded = () => router.push(recentRecordsRoute);
  const openSources = () =>
    presentSource(sinceSources(since), { testID: 'today-since' });
  return (
    <View testID="today-since">
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
      />
    </View>
  );
}

/** The count's Dynamic Type cap, the date line's and the sitting line's. */
const sinceCap = 1.353;

const styles = StyleSheet.create({
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
