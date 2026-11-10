import { Fragment, useEffect, useRef, type ReactNode } from 'react';
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
export interface ReaderPart {
  id: string;
  text: string;
  title?: string;
}
/** A find in the text: every match washed, the current one underlined. */
export interface ReaderFind {
  query: string;
  passage?: boolean;
  current: { part: number; start: number } | null;
}
// Bound Android's selectable paragraph measurement and JS batches. The source
// slices still join to the exact original text; iOS keeps its existing target.
export const readerChunkTarget = Platform.OS === 'android' ? 600 : 1200;

/** Every match of `query` in the parts, in reading order. */
export function findMatches(parts: readonly ReaderPart[], query: string) {
  const needle = query.trim().toLocaleLowerCase('en-AU');
  const found: { part: number; start: number }[] = [];
  if (!needle) return found;
  parts.forEach((part, index) => {
    const hay = part.text.toLocaleLowerCase('en-AU');
    for (
      let at = hay.indexOf(needle);
      at >= 0;
      at = hay.indexOf(needle, at + needle.length)
    )
      found.push({ part: index, start: at });
  });
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
  const query = find?.query.trim();
  if (!query) return <>{text}</>;
  const length = query.length;
  const spans: ReactNode[] = [];
  let from = 0;
  for (const match of findMatches([{ id: '', text }], query)) {
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
        {text.slice(match.start, match.start + length)}
      </Text>,
    );
    from = match.start + length;
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
}: {
  parts: ReaderPart[];
  header: ReactNode;
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
          extraData={find}
          keyExtractor={(part) => part.id}
          style={styles.screen}
          contentContainerStyle={[styles.content, column.content]}
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
                  <Marked text={item.text} index={index} find={find} />
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
  // Paragraphs 11 apart (`row`); a part title 8 above its text.
  part: { paddingVertical: rhythm.row / 2, gap: rhythm.heading },
  match: { backgroundColor: colors.navyWash },
  current: {
    textDecorationLine: 'underline',
    textDecorationColor: colors.navy,
  },
});
