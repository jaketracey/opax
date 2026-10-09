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
  AsAtLine,
  useScreenColumn,
  SidebarSafe,
  RegionProvider,
  Button,
  Divider,
  EmptyState,
  Field,
  Group,
  InfoButton,
  ChoiceChips,
  Text,
} from '../../design/primitives';
import { formatCount } from '../../design/format';
import { chrome, colors, layout, spacing } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { RecordStatus } from '../RecordStatus';
import { FeedRow } from './FeedRow';
import {
  feedCountLine,
  feedFacets,
  filterFeed,
  noFilters,
  type FeedFilters,
} from './model';

const coverageNote = (rows: number, available: number) =>
  `This export holds the newest ${formatCount(rows)} of ${formatCount(available)} dated register alterations. Entries are as declared, not verified by OPAX. Additions and deletions carry the date the register records. A gift or trip with no organisation match names one the AEC and lobbyist registers do not list under that spelling. Organisation matches to AEC Transparency Register returns, the lobbyist registers and FITS use exact normalised names.`;

/**
 * The declared-interests feed behind Today's recent declarations: every row
 * of /interests/recent.json, newest first, filtered on the device by
 * chamber, jurisdiction and member. Rows are Today's compact register rows,
 * with the member's profile and any name match the export found.
 */
export default function Declarations() {
  const load = useCallback(
    (refresh: boolean) => catalogs.declarations(refresh),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const [filters, setFilters] = useState<FeedFilters>(noFilters);
  const [text, setText] = useState('');
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

  const header = (
    <Group style={styles.header}>
      <Text wordSafe variant="body">
        The newest additions and deletions recorded in parliamentarians’
        registers of interests, in their own words.
      </Text>
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
          <Group gap={spacing.s3}>
            <Text wordSafe variant="control" accessibilityRole="header">
              Chamber
            </Text>
            <ChoiceChips
              segments={[
                {
                  value: 'all',
                  label: 'All chambers',
                  testID: 'declarations-chamber-all',
                },
                ...facets.chambers.map((facet) => ({
                  value: facet.id,
                  label: facet.label,
                  testID: `declarations-chamber-${facet.id}`,
                })),
              ]}
              value={filters.chamber}
              onChange={(chamber) => setFilters((f) => ({ ...f, chamber }))}
              testID="declarations-chamber"
            />
          </Group>
          <Group gap={spacing.s3}>
            <Text wordSafe variant="control" accessibilityRole="header">
              Jurisdiction
            </Text>
            <ChoiceChips
              segments={[
                {
                  value: 'all',
                  label: 'All jurisdictions',
                  testID: 'declarations-jurisdiction-all',
                },
                ...facets.jurisdictions.map((facet) => ({
                  value: facet.id,
                  label: facet.label,
                  testID: `declarations-jurisdiction-${facet.id}`,
                })),
              ]}
              value={filters.jurisdiction}
              onChange={(jurisdiction) =>
                setFilters((f) => ({ ...f, jurisdiction }))
              }
              testID="declarations-jurisdiction"
            />
          </Group>
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
          <View style={styles.count}>
            <Text
              variant="metadata"
              testID="declarations-count"
              style={styles.grow}
            >
              {feedCountLine(rows.length, all.length)} · newest first
            </Text>
            <InfoButton
              title="About these declarations"
              notes={[coverageNote(record.meta.rows, record.meta.available)]}
              testID="declarations-info"
            />
          </View>
        </>
      ) : null}
    </Group>
  );

  const footer = record ? (
    <Group style={styles.footer}>
      <AsAtLine
        asOf={record.asAt}
        citation={record.meta.source}
        savedAt={record.stale ? record.savedAt : null}
        testID="declarations-as-at"
      />
      <Text wordSafe variant="fine" testID="declarations-coverage">
        Entries are as declared, not verified by OPAX.
      </Text>
    </Group>
  ) : null;

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
        ItemSeparatorComponent={() => (
          <View style={styles.separator}>
            <Divider variant="subtle" />
          </View>
        )}
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
        ListFooterComponent={footer}
        initialNumToRender={8}
      />
    </SidebarSafe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
  },
  header: { paddingBottom: spacing.s4 },
  footer: { paddingTop: spacing.s4 },
  count: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  separator: { paddingVertical: 4 },
  grow: { flex: 1 },
});
