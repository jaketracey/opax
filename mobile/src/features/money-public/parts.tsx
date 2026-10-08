import { headerItems } from '../../navigation/chrome';
import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  AsAtLine,
  Divider,
  EmptyState,
  Group,
  Heading,
  InfoButton,
  ChoiceChips,
  SourceLink,
  Text,
} from '../../design/primitives';
import { colors, layout, rhythm } from '../../design/tokens';
import { shareHeaderItem } from '../../navigation/share';
import { webPageUrl } from '../../navigation/external';
import type { decodeMeta } from './data';
export function MoneyHeader({ title, path }: { title: string; path: string }) {
  return (
    <Stack.Screen
      options={{
        title,
        headerTitle: '',
        ...headerItems(() => [shareHeaderItem({ title, path })]),
      }}
    />
  );
}
export function Provenance({ meta }: { meta: ReturnType<typeof decodeMeta> }) {
  return (
    <Group>
      <AsAtLine
        asOf={meta.asOf}
        citation={meta.source}
        licence={meta.licence}
      />
      <InfoButton
        title="About these figures"
        notes={[meta.coverage, meta.threshold, ...meta.caveats]}
      />
    </Group>
  );
}
export function OrganisationWebLink({
  path,
  name,
}: {
  path: string;
  name: string;
}) {
  return (
    <SourceLink
      label="Open on opax.com.au"
      citation="Open on opax.com.au"
      record={name}
      url={webPageUrl(path)!}
      kind="record"
    />
  );
}
export function MoneyChoices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string, string?])[];
}) {
  return (
    <ChoiceChips
      value={value}
      onChange={onChange}
      segments={options.map(([value, label, testID]) => ({
        value,
        label,
        testID,
      }))}
    />
  );
}
export function MoneyList<T>({
  rows,
  rowKey,
  render,
  header,
  footer,
  refreshing,
  refresh,
  id,
  loaded,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  render: (row: T, index: number) => ReactNode;
  header: ReactNode;
  footer?: ReactNode;
  refreshing: boolean;
  refresh: () => void;
  id: string;
  loaded: boolean;
}) {
  return (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      testID={id}
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={5}
      removeClippedSubviews={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
      ListHeaderComponent={<Group>{header}</Group>}
      ListFooterComponent={
        <Group>
          {footer}
          <Text wordSafe variant="fine" testID={`${id}-end`}>
            End of record
          </Text>
        </Group>
      }
      ListEmptyComponent={
        loaded ? (
          <EmptyState message="No matching records in the available export." />
        ) : null
      }
      renderItem={({ item, index }) => (
        <Group style={styles.row}>
          {render(item, index)}
          <Divider variant="subtle" />
        </Group>
      )}
    />
  );
}
export function ResultCount({
  count,
  noun,
}: {
  count: number | null;
  noun: string;
}) {
  useEffect(() => {
    if (count === null) return;
    const timer = setTimeout(
      () =>
        AccessibilityInfo.announceForAccessibility(
          `${count.toLocaleString('en-AU')} ${noun}`,
        ),
      350,
    );
    return () => clearTimeout(timer);
  }, [count, noun]);
  if (count === null) return null;
  return (
    <Text wordSafe variant="metadata" accessibilityLiveRegion="polite">
      {count.toLocaleString('en-AU')} {noun}
    </Text>
  );
}
export function Title({ children, id }: { children: ReactNode; id: string }) {
  return (
    <Heading level={1} tone="moneyInk" testID={id}>
      {children}
    </Heading>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
    gap: rhythm.block,
  },
  row: { paddingVertical: rhythm.tight },
});
