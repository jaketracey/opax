import { useEffect, useRef, type ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Group, Heading, Text, useReduceMotion } from '../../design/primitives';
import { colors, layout, spacing } from '../../design/tokens';
export interface ReaderPart {
  id: string;
  text: string;
  title?: string;
}
/** The sole scrolling surface: source paragraphs remain selectable and unabridged. */
export function ReaderList({
  parts,
  header,
  footer,
  testID,
  jumpTo,
}: {
  parts: ReaderPart[];
  header: ReactNode;
  footer?: ReactNode;
  testID: string;
  jumpTo?: { index: number; attempt: number } | null;
}) {
  const list = useRef<FlatList<ReaderPart>>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReduceMotion();
  useEffect(() => {
    if (!jumpTo) return;
    pending.current = jumpTo.index;
    list.current?.scrollToIndex({
      index: jumpTo.index,
      animated: !reduced,
      viewPosition: 0,
    });
  }, [jumpTo, reduced]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <FlatList
      ref={list}
      testID={testID}
      data={parts}
      keyExtractor={(part) => part.id}
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews={false}
      ListHeaderComponent={<Group>{header}</Group>}
      ListFooterComponent={footer ? <Group>{footer}</Group> : null}
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
              viewPosition: 0,
            });
        }, 150);
      }}
      renderItem={({ item, index }) => (
        <View style={styles.part}>
          {item.title ? (
            <Heading level={3} testID={`reader-part-title-${index}`}>
              {item.title}
            </Heading>
          ) : null}
          <Text selectable testID={`reader-text-${index}`}>
            {item.text}
          </Text>
        </View>
      )}
    />
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
  },
  part: { paddingVertical: spacing.s3, gap: spacing.s3 },
});
