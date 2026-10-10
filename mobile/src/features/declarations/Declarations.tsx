import { useRefreshCommand } from '../../design/keyboard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  useAccessibilitySize,
  useScreenColumn,
  SidebarSafe,
  RegionProvider,
  Button,
  Divider,
  EmptyState,
  Field,
  Group,
  SourceLine,
  Text,
} from '../../design/primitives';
import { formatCount } from '../../design/format';
import { chrome, colors, layout, rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordStatus } from '../RecordStatus';
import { FeedRow } from './FeedRow';
import { FilterSheet } from './FilterSheet';
import {
  feedCountLine,
  feedFacets,
  filterFeed,
  filterSummary,
  noFilters,
  type FeedFilters,
} from './model';

const coverageNote = (rows: number, available: number) =>
  `This export holds the newest ${formatCount(rows)} of ${formatCount(available)} dated register alterations. Entries are as declared, not verified by OPAX. Additions and deletions carry the date the register records. A gift or trip with no organisation match names one the AEC and lobbyist registers do not list under that spelling. Organisation matches to AEC Transparency Register returns, the lobbyist registers and FITS use exact normalised names.`;

/**
 * The declared-interests feed behind Today's recent declarations: every row
 * of /interests/recent.json, newest first, filtered on the device by member
 * and, in a Filters sheet, by chamber and jurisdiction, with one summary
 * line ("300 declarations · All chambers · Federal"). One source line under
 * the lede dates the export and holds its coverage note. Rows are Today's
 * register rows on the paper, with the member's profile and any name match
 * the export found.
 */
export default function Declarations() {
  const load = useCallback(
    (refresh: boolean) => catalogs.declarations(refresh),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const [filters, setFilters] = useState<FeedFilters>(noFilters);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(false);
  const stacked = useAccessibilitySize();
  // Filter as the reader types, a beat behind the keyboard.
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => ({ ...f, member: text.trim() })),
      150,
    );
    return () => clearTimeout(timer);
  }, [text]);
  const column = useScreenColumn();
  useRefreshCommand(refresh, refreshing);
  const all = useMemo(() => record?.data ?? [], [record]);
  const facets = useMemo(() => feedFacets(all), [all]);
  const rows = useMemo(() => filterFeed(all, filters), [all, filters]);
  const filtered =
    filters.chamber !== 'all' ||
    filters.jurisdiction !== 'all' ||
    !!filters.member;
  const summary = filterSummary(filters, facets);

  const header = (
    <Group style={styles.header}>
      <Group gap={rhythm.tight}>
        <Text wordSafe variant="body" testID="declarations-lede">
          The newest additions and deletions recorded in parliamentarians’
          registers of interests, in their own words. Entries are as declared,
          not verified by OPAX.
        </Text>
        {record ? (
          <SourceLine
            title="About these declarations"
            asOf={record.asAt}
            citation={record.meta.source}
            savedAt={record.stale ? record.savedAt : null}
            notes={[coverageNote(record.meta.rows, record.meta.available)]}
            testID="declarations-source"
          />
        ) : null}
      </Group>
      <RecordStatus
        record={record}
        error={error}
        refreshing={refreshing}
        refresh={refresh}
        retry={retry}
        label="Loading the declarations"
        testID="declarations"
      />
      {record ? (
        <>
          <Field
            label="Member"
            placeholder="Name"
            testID="declarations-member"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => {
              setFilters((f) => ({ ...f, member: text.trim() }));
              Keyboard.dismiss();
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="words"
            clearButtonMode="while-editing"
          />
          <View style={[styles.filters, stacked ? styles.stacked : null]}>
            <Button
              label="Filters"
              icon="slider.horizontal.3"
              size="compact"
              accessibilityLabel={`Filters: ${summary}`}
              accessibilityHint="Opens the chamber and jurisdiction filters"
              testID="declarations-filters"
              onPress={() => {
                Keyboard.dismiss();
                setSheet(true);
              }}
            />
            <Text
              wordSafe
              variant="metadata"
              testID="declarations-count"
              style={stacked ? null : styles.grow}
            >
              {feedCountLine(rows.length, all.length)} · {summary}
            </Text>
          </View>
          <FilterSheet
            visible={sheet}
            filters={filters}
            facets={facets}
            onChange={setFilters}
            onClear={() =>
              setFilters((f) => ({ ...f, chamber: 'all', jurisdiction: 'all' }))
            }
            onClose={() => setSheet(false)}
          />
        </>
      ) : null}
    </Group>
  );

  return (
    <SidebarSafe style={styles.screen}>
      <FlatList
        testID="declarations-screen"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={chrome.tint}
          />
        }
        style={styles.screen}
        contentContainerStyle={[styles.content, column.content]}
        onLayout={column.onLayout}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        data={rows}
        keyExtractor={(row) => String(row.id)}
        renderItem={({ item, index }) => (
          <FeedRow
            item={item}
            index={index}
            onOpenPerson={
              item.profileSlug
                ? () => router.push(personRoute(item.profileSlug!))
                : undefined
            }
          />
        )}
        ItemSeparatorComponent={() => <Divider variant="subtle" />}
        ListHeaderComponent={
          <RegionProvider value={column.inner}>
            {column.bar}
            {header}
          </RegionProvider>
        }
        ListEmptyComponent={
          record ? (
            <Group>
              <EmptyState
                message="No alterations match these filters."
                testID="declarations-empty"
              />
              {filtered ? (
                <Button
                  label="Clear filters"
                  onPress={() => {
                    setText('');
                    setFilters(noFilters);
                  }}
                  testID="declarations-clear"
                />
              ) : null}
            </Group>
          ) : null
        }
        initialNumToRender={8}
      />
    </SidebarSafe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section + rhythm.block,
  },
  header: { paddingBottom: rhythm.tight },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
  },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  grow: { flex: 1 },
});
