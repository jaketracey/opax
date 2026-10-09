import { PartyDirectoryRow } from './PartyDirectoryRow';
import { directoryNotes } from './notes';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  AsAtLine,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  Group,
  Heading,
  LoadingState,
  LinkRow,
  InfoButton,
  OfflineBanner,
  PersonRow,
  StaleNotice,
  Text,
  errorMessage,
  LayoutRegion,
  SidebarSafe,
  SplitEmpty,
  SplitLayout,
  isPad,
  useLayout,
} from '../../design/primitives';
import {
  encodeEntry,
  decodeEntry,
  entryLabel,
  type RecordEntry,
} from '../split/entry';
import { RecordDetail, RecordShare } from '../split/RecordDetail';
import { colors, layout, rhythm } from '../../design/tokens';
import { formatCount, formatYearRange } from '../../design/format';
import { ApiError } from '../../api/errors';
import type { Electorate } from '../../api/catalog-decoders';
import {
  personRoute,
  electorateRoute,
  partyRoute,
} from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { CachedPortrait } from '../CachedPortrait';
import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { seatContext } from '../your-mp/model';
import { loadDirectory } from './data';
import {
  directorySorts,
  matchingPeople,
  matchingParties,
  matchingElectorates,
  sittingGroupStarts,
  sittingGroupTitles,
  type PeopleRow,
  type PartyRow,
  type SittingGroup,
} from './model';
import { directoryKind, directoryStore, useDirectoryState } from './store';

const titles = {
  person: 'Parliamentarians',
  party: 'Parties',
  electorate: 'Electorates',
};
type Row = PeopleRow | PartyRow | Electorate;
/** The record a directory row opens: a profile, a party, an electorate. */
function entryFor(item: Row): RecordEntry {
  if ('profile' in item)
    return { kind: 'person', key: item.key, title: item.name };
  if ('money' in item)
    return { kind: 'party', key: item.name, title: item.name };
  return { kind: 'electorate', key: item.electorate_id, title: item.name };
}
type GroupStart = { group: SittingGroup; count: number };
/** Heads the first row of Sitting, status not recorded, and Former. */
function GroupHeading({ group, count }: GroupStart) {
  return (
    <View style={styles.groupHeading}>
      <Heading level={3} testID={`directory-group-${group}`}>
        {`${sittingGroupTitles[group]} · ${formatCount(count)}`}
      </Heading>
    </View>
  );
}
const DirectoryRow = memo(function DirectoryRow({
  item,
  selected,
  onSelect,
  group,
}: {
  item: Row;
  /** iPad split: whether this row is in the detail pane (see LinkRow). */
  selected?: boolean;
  onSelect?: (entry: RecordEntry) => void;
  /** The person directory's group this row starts, if any. */
  group?: GroupStart;
}) {
  if ('profile' in item)
    return (
      <>
        {group ? <GroupHeading {...group} /> : null}
        <PersonRow
          name={item.name}
          testID={`directory-person-${item.key}`}
          testDrawnName
          portrait={<CachedPortrait name={item.name} slug={item.key} />}
          party={item.profile.party}
          partyStatus={item.profile.partyStatus}
          formerly={item.profile.formerly}
          place={
            item.row?.full && item.row.full !== item.name
              ? item.row.full
              : undefined
          }
          detail={[
            item.row?.roster_only || item.row?.speeches === undefined
              ? 'From the member roster. Speech total not yet indexed'
              : `${formatCount(item.row.speeches)} speeches`,
            item.divisions ? `${formatCount(item.divisions)} divisions` : null,
            item.row?.first
              ? formatYearRange(item.row.first, item.row.last ?? item.row.first)
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          selected={selected}
          onPress={() =>
            onSelect
              ? onSelect(entryFor(item))
              : router.push(personRoute(item.key))
          }
        />
      </>
    );
  if ('money' in item)
    return (
      <PartyDirectoryRow
        item={item}
        selected={selected}
        onPress={
          onSelect
            ? () => onSelect(entryFor(item))
            : () => router.push(partyRoute(item.name))
        }
      />
    );
  return (
    <LinkRow
      title={item.name}
      icon="map"
      accent="places"
      testID={`directory-electorate-${item.slug}`}
      detail={[
        seatContext(item),
        item.status === 'historical' ? 'Historical' : null,
        item.representatives.length
          ? item.representatives
              .map((r) => [r.person.name, r.party].filter(Boolean).join(' · '))
              .join('; ')
          : 'Representation not yet verified',
        item.election_count
          ? `${formatCount(item.election_count)} elections indexed`
          : 'Results not yet indexed',
      ]
        .filter(Boolean)
        .join('\n')}
      selected={selected}
      onPress={() =>
        onSelect
          ? onSelect(entryFor(item))
          : router.push(electorateRoute(item.electorate_id))
      }
    />
  );
});
const separator = () => <Divider variant="subtle" />;
const rowKey = (item: Row) => ('key' in item ? item.key : item.electorate_id);
export default function DirectoryScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = directoryKind(params.kind);
  // A directory deep link can replace kind on this same route. Keep each view’s
  // query and record local, so the previous kind never filters or flashes here.
  if (!isPad) return <DirectoryView key={kind} kind={kind} />;
  // iPad: the region a split measures (list left, profile right).
  return (
    <SidebarSafe style={styles.screen}>
      <LayoutRegion style={styles.screen}>
        <DirectoryView key={kind} kind={kind} />
      </LayoutRegion>
    </SidebarSafe>
  );
}
function DirectoryView({ kind }: { kind: keyof typeof titles }) {
  const title = titles[kind];
  const load = useCallback(
    (refresh: boolean) => loadDirectory(kind, refresh),
    [kind],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const { filters, facets } = useDirectoryState(kind);
  const [text, setText] = useState(''),
    [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 120);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    if (record) directoryStore.facets(kind, record.facets);
  }, [kind, record]);
  const rows = useMemo<Row[]>(
    () =>
      !record
        ? []
        : kind === 'person'
          ? matchingPeople(record.people, filters, query)
          : kind === 'party'
            ? matchingParties(record.parties, filters, query)
            : matchingElectorates(record.electorates, filters, query),
    [kind, record, filters, query],
  );
  const total = record
    ? kind === 'person'
      ? record.people.length
      : kind === 'party'
        ? record.parties.length
        : record.electorates.length
    : 0;
  const count = `${rows.length === total ? '' : `${formatCount(rows.length)} of `}${formatCount(total)} ${title.toLowerCase()}`;
  useEffect(() => {
    if (record) AccessibilityInfo.announceForAccessibility(count);
  }, [count, record]);
  const clear = () => {
    directoryStore.set(kind, {});
    setText('');
    setQuery('');
  };
  const chips = Object.entries(filters).filter(([k, v]) => k !== 'sort' && v);

  // iPad regular width: list left, the record right, the selection in the
  // route (`/directory?kind=person&open=person:…`), as Bills does.
  const split = useLayout().regular;
  const params = useLocalSearchParams<{ open?: string }>();
  const selected = split ? decodeEntry(params.open) : null;
  const selectedKey = selected ? encodeEntry(selected) : null;
  const groups = useMemo(
    () =>
      kind === 'person'
        ? sittingGroupStarts(rows as PeopleRow[])
        : new Map<string, GroupStart>(),
    [kind, rows],
  );
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => (
      <DirectoryRow item={item} group={groups.get(rowKey(item))} />
    ),
    [groups],
  );
  const listRef = useRef<FlatList<Row>>(null);
  const visible = useRef(new Set<string>());
  // FlatList needs one stable callback for its whole life.
  const [onViewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        visible.current = new Set(
          viewableItems.map((item) => String(item.key)),
        );
      },
  );
  const select = useCallback(
    (entry: RecordEntry | null) => {
      Keyboard.dismiss();
      router.setParams({ open: entry ? encodeEntry(entry) : '' });
      // A keyboard step past the visible rows brings the row into view.
      const at = entry
        ? rows.findIndex(
            (row) => encodeEntry(entryFor(row)) === encodeEntry(entry),
          )
        : -1;
      if (at >= 0 && !visible.current.has(rowKey(rows[at]!)))
        listRef.current?.scrollToIndex({
          index: at,
          viewPosition: 0.5,
          animated: true,
        });
    },
    [rows],
  );
  const renderSplitRow = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => (
      <DirectoryRow
        item={item}
        selected={encodeEntry(entryFor(item)) === selectedKey}
        onSelect={select}
        group={groups.get(rowKey(item))}
      />
    ),
    [selectedKey, select, groups],
  );
  const entries = useMemo(
    () =>
      new Map(rows.map((row) => [encodeEntry(entryFor(row)), entryFor(row)])),
    [rows],
  );
  const list = (
    <FlatList<Row>
      ref={listRef}
      testID={`directory-${kind}-screen`}
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
      data={rows}
      keyExtractor={rowKey}
      renderItem={split ? renderSplitRow : renderRow}
      extraData={split ? selectedKey : undefined}
      onViewableItemsChanged={split ? onViewable : undefined}
      onScrollToIndexFailed={({ index: at, averageItemLength }) =>
        listRef.current?.scrollToOffset({
          offset: averageItemLength * at,
          animated: true,
        })
      }
      ItemSeparatorComponent={separator}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={false}
      ListHeaderComponent={
        <Group>
          <Field
            label={`Search ${title.toLowerCase()} by name`}
            testID="directory-search"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => {
              setQuery(text.trim());
              Keyboard.dismiss();
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <Button
            label={
              chips.length ? `Filters (${chips.length})` : 'Filters and sort'
            }
            icon="line.3.horizontal.decrease.circle"
            size="compact"
            testID="directory-filters"
            disabled={!record}
            onPress={() => {
              Keyboard.dismiss();
              router.push({
                pathname: '/directory-filters',
                params: { kind },
              });
            }}
          />
          {chips.length ? (
            <View style={styles.chips}>
              {chips.map(([key, value]) => (
                <FilterChip
                  key={key}
                  filter={facets.find((f) => f.key === key)?.label ?? key}
                  value={
                    facets
                      .find((f) => f.key === key)
                      ?.choices?.find((c) => c.value === value)?.label ?? 'Yes'
                  }
                  onRemove={() => {
                    const next = { ...filters };
                    delete next[key];
                    directoryStore.set(kind, next);
                  }}
                />
              ))}
            </View>
          ) : null}
          {record ? (
            <>
              <View style={styles.summary}>
                <Text
                  variant="metadata"
                  testID="directory-count"
                  style={styles.grow}
                >
                  {count} ·{' '}
                  {
                    directorySorts[kind].find(
                      (s) =>
                        s.value ===
                        (filters.sort || directorySorts[kind][0]!.value),
                    )?.label
                  }
                </Text>
                <InfoButton
                  title={`About ${title.toLowerCase()}`}
                  notes={directoryNotes[kind]}
                  testID="directory-info"
                />
              </View>
              {record.stale ? (
                <>
                  <SavedCopyNotice reason={record.staleReason} />
                  <StaleNotice
                    savedAt={record.savedAt}
                    refreshing={refreshing}
                  />
                  <Button label="Try again" onPress={refresh} />
                </>
              ) : null}
              {record.partial ? <PartialNotice /> : null}
              <AsAtLine
                asOf={
                  record.sources
                    .map((s) => s.asAt)
                    .filter((date): date is string => !!date)
                    .sort()[0] ?? null
                }
                citation={record.sources.map((s) => s.label)}
                savedAt={record.stale ? record.savedAt : null}
              />
            </>
          ) : error ? (
            <>
              {error instanceof ApiError && error.code === 'offline' ? (
                <OfflineBanner cached={false} />
              ) : null}
              <ErrorState message={errorMessage(error)} onRetry={retry} />
            </>
          ) : (
            <LoadingState
              shape="people"
              label={`Loading ${title.toLowerCase()}`}
            />
          )}
        </Group>
      }
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={
        record ? (
          <Group>
            <EmptyState
              message={`Nothing in the ${title.toLowerCase()} directory matches that.`}
            />
            <Button
              label="Clear filters"
              testID="directory-clear"
              onPress={clear}
            />
          </Group>
        ) : null
      }
    />
  );
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLargeTitleEnabled: false,
          unstable_headerRightItems: () => [
            shareHeaderItem({ path: `/subject/${kind}`, title }),
          ],
        }}
      />
      {isPad ? (
        <SplitLayout<RecordEntry>
          id="directory"
          testID="directory-split"
          list={list}
          selected={selected}
          onSelect={select}
          entryKey={encodeEntry}
          entryTitle={entryLabel}
          renderDetail={(entry) => <RecordDetail entry={entry} />}
          detailActions={(entry) => <RecordShare entry={entry} />}
          keys={[...entries.keys()]}
          entryForKey={(key) => entries.get(key)!}
          empty={
            <SplitEmpty
              icon={kind === 'electorate' ? 'map' : 'person.2'}
              accent={kind === 'electorate' ? 'places' : 'people'}
              title={`No ${kind === 'person' ? 'parliamentarian' : kind} selected`}
              message={record ? count : undefined}
              testID="directory-split-empty"
            />
          }
        />
      ) : (
        list
      )}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
  },
  header: { paddingBottom: rhythm.block },
  summary: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.tight },
  groupHeading: { paddingTop: rhythm.block, paddingBottom: rhythm.tight },
});
