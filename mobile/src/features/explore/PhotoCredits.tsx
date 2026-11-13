import { RouteOptions } from '../../navigation/preview';

import { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { counted, formatCount } from '../../design/format';
import {
  Divider,
  InlineError,
  RegionProvider,
  SidebarSafe,
  Skeleton,
  SourceLine,
  Text,
  useScreenColumn,
  type SourceOriginal,
} from '../../design/primitives';
import { StatePageProvider } from '../../design/states';
import { colors, rhythm } from '../../design/tokens';
import { useRead } from '../methods/read';
import {
  CreditRow,
  matches,
  NoResults,
  paperBar,
  sourcesCopy as text,
  useBarSearch,
} from '../sources/parts';
import type { YearPicture } from './pictures';
import { creditShown } from './photo-credit';
import { explore } from './runtime';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

/**
 * A photograph's originals: its Wikimedia Commons page, then its licence.
 * Creative Commons still publishes some licence links as http; they are
 * served over https.
 */
export function photoOriginals(p: YearPicture): SourceOriginal[] {
  return [
    { label: 'Photo source', record: 'Wikimedia Commons', url: p.source_url },
    ...(p.licence_url
      ? [
          {
            label: 'Licence',
            record: p.licence,
            url: p.licence_url.replace(
              /^http:\/\/creativecommons\.org\//,
              'https://creativecommons.org/',
            ),
          },
        ]
      : []),
  ];
}

const loadPictures = (_refresh: boolean, signal?: AbortSignal) =>
  explore.pictures(signal);

/**
 * Time machine photographs (account.md 4.6, explore.md 9): the reference
 * list behind the credits beside every photograph. By year, newest first;
 * each photograph's caption, "Photo: {author} · {licence}" and its original
 * on Wikimedia Commons. The bar search finds a year, caption or name.
 */
export function PhotoCreditsList() {
  const column = useScreenColumn();
  const foot = useFloatingBarFoot();
  const search = useBarSearch(text.searchPhotos);
  const read = useRead(loadPictures);
  const record = read.record;
  const sections = useMemo(
    () =>
      Object.entries(record?.data ?? {})
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, pictures]) => ({
          year,
          data: pictures.filter((p) =>
            matches(search.query, [year, p.caption, p.author, p.date ?? '']),
          ),
        }))
        .filter((section) => section.data.length > 0),
    [record, search.query],
  );
  const footer = record ? (
    <View style={styles.footer}>
      <SourceLine
        asOf={record.asOf}
        citation="OPAX year photographs"
        savedAt={record.stale ? record.savedAt : null}
        notes={[
          'Each photograph keeps its own licence on Wikimedia Commons. OPAX shows it with its credit beside it.',
        ]}
        testID="explore-photo-credits-manifest"
      />
    </View>
  ) : null;
  return (
    <SidebarSafe style={styles.screen}>
      <RouteOptions
        options={{
          title: text.photos,
          headerSearchBarOptions: search.options,
          ...paperBar,
        }}
      />
      <StatePageProvider refreshing={false}>
        <SectionList
          testID="explore-photo-credits"
          style={styles.screen}
          contentContainerStyle={[styles.content, column.content, foot]}
          onLayout={column.onLayout}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          sections={sections}
          keyExtractor={(p) => p.file}
          ListHeaderComponent={
            <RegionProvider value={column.inner}>
              {column.bar}
              {!record ? (
                read.error ? (
                  <InlineError
                    subject={text.photos}
                    message={text.photosError}
                    onRetry={read.retry}
                    testID="explore-photo-credits-error"
                  />
                ) : (
                  <Skeleton count={8} label={text.loadingPhotos} />
                )
              ) : null}
            </RegionProvider>
          }
          renderSectionHeader={({ section }) => (
            <View
              accessibilityRole="header"
              accessible
              accessibilityLabel={`${section.year}, ${counted(section.data.length, 'photograph')}`}
              style={styles.year}
            >
              <Text wordSafe variant="groupHeader" style={styles.grow}>
                {section.year}
              </Text>
              <Text wordSafe variant="groupHeader" tabular>
                {formatCount(section.data.length)}
              </Text>
            </View>
          )}
          ItemSeparatorComponent={() => <Divider variant="subtle" />}
          renderItem={({ item: p }) => (
            <CreditRow
              title={p.caption}
              detail={`Photo: ${p.author} · ${p.licence}`}
              note={creditShown(p.credit, p.author)}
              url={p.source_url}
              label="Wikimedia Commons"
              testID={`explore-photo-source-${p.file}`}
            />
          )}
          ListEmptyComponent={
            record && search.query ? (
              <NoResults
                query={search.query}
                body={text.tryName}
                testID="explore-photo-credits-empty"
              />
            ) : null
          }
          ListFooterComponent={footer}
          initialNumToRender={12}
        />
      </StatePageProvider>
    </SidebarSafe>
  );
}
export default PhotoCreditsList;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingTop: rhythm.block, paddingBottom: rhythm.section },
  year: {
    flexDirection: 'row',
    gap: rhythm.tight,
    paddingTop: rhythm.group,
    paddingBottom: rhythm.groupHeader,
  },
  grow: { flex: 1 },
  footer: { paddingTop: rhythm.group },
});
