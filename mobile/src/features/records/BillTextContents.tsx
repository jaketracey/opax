import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import { StatePageProvider } from '../../design/states';
import { colors, hairline, layout, rhythm } from '../../design/tokens';
import { publishContents } from './contentsChannel';
import { RecordLoadError } from './RecordLoadError';
import { records } from './runtime';
import { useRead } from './useRead';

/** Past this many sections the sheet gains a search field. */
const SEARCH_FROM = 20;

/**
 * Contents (records.md 4.2): the version's own section headings as a plain
 * list. A tap hands the section back to the reader and closes the sheet;
 * nothing navigates. Reads the version from the session cache.
 */
export default function BillTextContents() {
  const { key = '', version = '' } = useLocalSearchParams<{
    key: string;
    version?: string;
  }>();
  const load = useCallback(
    () =>
      version
        ? records.billVersion(key, version)
        : records
            .billManifest(key)
            .then((manifest) =>
              records.billVersion(key, manifest.data.default_version_id),
            ),
    [key, version],
  );
  const { value, error, retry } = useRead(load);
  const sections = useMemo(
    () =>
      value?.data.sections.map((section, index) => ({ ...section, index })) ??
      [],
    [value],
  );
  const [query, setQuery] = useState('');
  const search = useListSearchBar({
    placeholder: 'Section number or heading',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const needle = query.trim().toLocaleLowerCase('en-AU');
  const shown = needle
    ? sections.filter((section) =>
        section.title.toLocaleLowerCase('en-AU').includes(needle),
      )
    : sections;
  const choose = (section: string) => {
    if (!value) return;
    publishContents(key, value.data.version.id, section);
    router.back();
  };
  return (
    <>
      {sections.length > SEARCH_FROM ? (
        <RouteOptions options={{ headerSearchBarOptions: search }} />
      ) : null}
      <StatePageProvider refreshing={false}>
        <FlatList
          testID="bill-text-contents-screen"
          style={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          data={shown}
          keyExtractor={(section) => section.id}
          ListHeaderComponent={
            error ? (
              <RecordLoadError
                error={error}
                slug=""
                subject="This bill's text"
                onRetry={retry}
                testID="bill-text-contents-error"
              />
            ) : null
          }
          ListEmptyComponent={
            needle && sections.length ? (
              <Text
                wordSafe
                variant="body"
                tone="inkSoft"
                style={styles.row}
                testID="bill-text-contents-none"
              >
                No section matches “{query.trim()}”.
              </Text>
            ) : null
          }
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Shows this section"
              onPress={() => choose(item.id)}
              testID={`bill-text-section-${item.index}`}
              style={({ pressed }) => [
                styles.row,
                pressed ? { backgroundColor: colors.sunken } : null,
              ]}
            >
              <Text wordSafe variant="body">
                {item.title}
              </Text>
            </Pressable>
          )}
        />
      </StatePageProvider>
    </>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.paper },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: rhythm.row,
    paddingHorizontal: layout.screenMargin,
  },
  separator: {
    height: hairline,
    marginLeft: layout.screenMargin,
    backgroundColor: colors.dividerSubtle,
  },
});
