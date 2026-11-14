import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  RegionProvider,
  SidebarSafe,
  Text,
  useReduceMotion,
  useScreenColumn,
} from '../../design/primitives';
import { StatePageProvider } from '../../design/states';
import { colors, layout, rhythm } from '../../design/tokens';
import { entityMatches } from './find';
import { useFloatingBarFoot } from '../../navigation/floating-bar';
export interface ReaderPart {
  id: string;
  text: string;
  title?: string;
}
/** A find in the text: every match washed, the current one underlined. */
export interface ReaderFind {
  query: string;
  passage?: boolean;
  tolerant?: boolean;
  current: { part: number; start: number } | null;
}
// Bound Android's selectable paragraph measurement and JS batches. The source
// slices still join to the exact original text; iOS keeps its existing target.
export const readerChunkTarget = Platform.OS === 'android' ? 600 : 1200;

/** Lowercase matches mapped back to UTF-16 ranges in the untouched source. */
function textMatches(text: string, needle: string) {
  const hay = text.toLocaleLowerCase('en-AU');
  const matches: { start: number; end: number }[] = [];
  for (
    let at = hay.indexOf(needle);
    at >= 0;
    at = hay.indexOf(needle, at + needle.length)
  )
    matches.push({ start: at, end: at + needle.length });
  if (!matches.length || hay.length === text.length) return matches;

  // For example, İ becomes i + combining dot. Both folded units belong to
  // the same original character; query length cannot slice the source text.
  // Lowercase the whole string above to retain contextual forms such as ς.
  const source: { start: number; end: number }[] = [];
  let offset = 0;
  for (const character of text) {
    const range = { start: offset, end: offset + character.length };
    const length = character.toLocaleLowerCase('en-AU').length;
    for (let i = 0; i < length; i++) source.push(range);
    offset = range.end;
  }
  return matches.map(({ start, end }) => ({
    start: source[start]!.start,
    end: source[end - 1]!.end,
  }));
}

/** Every match of `query` in the parts, in reading order. */
export function findMatches(
  parts: readonly ReaderPart[],
  query: string,
  options?: Pick<ReaderFind, 'tolerant'>,
): { part: number; start: number }[] {
  const needle = query.trim().toLocaleLowerCase('en-AU');
  const found: { part: number; start: number }[] = [];
  if (!needle) return found;
  parts.forEach((part, index) => {
    for (const match of options?.tolerant
      ? entityMatches(part.text, query)
      : textMatches(part.text, needle))
      found.push({ part: index, start: match.start });
  });
  // Search arrivals prefer whole-word entity spellings. If none occur anywhere
  // in the document, retain the original query's literal substring behaviour.
  if (options?.tolerant && !found.length) return findMatches(parts, query);
  return found;
}

function Marked({
  text,
  index,
  find,
}: {
  text: string;
  index: number;
  find?: ReaderFind | null;
}) {
  const query = find?.query.trim().toLocaleLowerCase('en-AU');
  if (!query) return <>{text}</>;
  const spans: ReactNode[] = [];
  let from = 0;
  for (const match of find?.tolerant
    ? entityMatches(text, find.query)
    : textMatches(text, query)) {
    const current =
      find?.current?.part === index && find.current.start === match.start;
    spans.push(
      <Fragment key={`t${match.start}`}>
        {text.slice(from, match.start)}
      </Fragment>,
      <Text
        key={`m${match.start}`}
        testID={current && find?.passage ? 'doc-passage-highlight' : undefined}
        variant="recordText"
        style={[styles.match, current ? styles.current : null]}
      >
        {text.slice(match.start, match.end)}
      </Text>,
    );
    from = match.end;
  }
  spans.push(<Fragment key="end">{text.slice(from)}</Fragment>);
  return <>{spans}</>;
}

/** The sole scrolling surface: source paragraphs remain selectable and unabridged. */
export function ReaderList({
  parts,
  header,
  footer,
  testID,
  jumpTo,
  find,
  onScroll,
  centred = false,
}: {
  parts: ReaderPart[];
  header: ReactNode;
  /** A whole-page state in the header (a missing record), centred. */
  centred?: boolean;
  footer?: ReactNode;
  testID: string;
  /** Scrolls a part into view; `position` 0 is the top, 0.33 a third down. */
  jumpTo?: { index: number; attempt: number; position?: number } | null;
  find?: ReaderFind | null;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const list = useRef<FlatList<ReaderPart>>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReduceMotion();
  const lastJump = useRef<typeof jumpTo>(null);
  // A readable column on iPad, with a split pane's Back first.
  const column = useScreenColumn();
  // A centred page state keeps Screen's foot, so a missing record sits at the
  // same height as every other not-found page (18 pt high with the reader's).
  const foot = useFloatingBarFoot(
    centred ? rhythm.section : rhythm.section * 2,
  );
  // Highlight with the same document-wide pass as the find counter, including
  // parts that are not mounted in the virtualised list yet.
  const query = find?.query;
  const tolerantFind = find?.tolerant;
  const tolerant = useMemo(
    () =>
      !!tolerantFind &&
      !!query &&
      parts.some((part) => entityMatches(part.text, query).length > 0),
    [parts, tolerantFind, query],
  );
  const marks =
    find?.tolerant && !tolerant ? { ...find, tolerant: false } : find;
  useEffect(() => {
    if (!jumpTo) {
      lastJump.current = null;
      return;
    }
    // A motion setting change affects future jumps, never replays the last.
    if (
      lastJump.current?.index === jumpTo.index &&
      lastJump.current.attempt === jumpTo.attempt &&
      lastJump.current.position === jumpTo.position
    )
      return;
    lastJump.current = jumpTo;
    pending.current = jumpTo.index;
    list.current?.scrollToIndex({
      index: jumpTo.index,
      animated: !reduced,
      viewPosition: jumpTo.position ?? 0,
    });
  }, [jumpTo, reduced]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <SidebarSafe style={styles.screen}>
      <StatePageProvider refreshing={false}>
        <FlatList
          ref={list}
          testID={testID}
          data={parts}
          extraData={marks}
          keyExtractor={(part) => part.id}
          style={styles.screen}
          contentContainerStyle={[
            styles.content,
            column.content,
            centred ? styles.centred : null,
            foot,
          ]}
          onLayout={column.onLayout}
          contentInsetAdjustmentBehavior="automatic"
          // In the iPad split pane the list's search keyboard may still be
          // up; the pane's Back and actions take the first tap.
          keyboardShouldPersistTaps="handled"
          initialNumToRender={Platform.OS === 'android' ? 1 : 4}
          maxToRenderPerBatch={Platform.OS === 'android' ? 2 : 4}
          windowSize={7}
          removeClippedSubviews={false}
          onScroll={onScroll}
          scrollEventThrottle={onScroll ? 16 : undefined}
          ListHeaderComponent={
            <RegionProvider value={column.inner}>
              {column.bar}
              <View>{header}</View>
            </RegionProvider>
          }
          ListFooterComponent={footer ? <View>{footer}</View> : null}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            list.current?.scrollToOffset({
              offset: averageItemLength * index,
              animated: false,
            });
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              if (pending.current === index)
                list.current?.scrollToIndex({
                  index,
                  animated: false,
                  viewPosition: jumpTo?.position ?? 0,
                });
            }, 150);
          }}
          renderItem={({ item, index }) => (
            <View style={styles.part}>
              {item.title ? (
                <Text
                  variant="rowRecord"
                  wordSafe
                  accessibilityRole="header"
                  testID={`reader-part-title-${index}`}
                >
                  {item.title}
                </Text>
              ) : null}
              <Text
                variant="recordText"
                selectable
                testID={`reader-text-${index}`}
              >
                {find?.query.trim() ? (
                  <Marked text={item.text} index={index} find={marks} />
                ) : (
                  item.text
                )}
              </Text>
            </View>
          )}
        />
      </StatePageProvider>
    </SidebarSafe>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section * 2,
  },
  centred: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: rhythm.section,
  },
  // Paragraphs 11 apart (`row`); a part title 8 above its text.
  part: { paddingVertical: rhythm.row / 2, gap: rhythm.heading },
  match: { backgroundColor: colors.navyWash },
  current: {
    textDecorationLine: 'underline',
    textDecorationColor: colors.navy,
  },
});
