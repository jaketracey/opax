import { PartyDirectoryRow } from './PartyDirectoryRow';
import { directoryNotes } from './notes';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
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
  LoadingState,
  LinkRow,
  InfoButton,
  OfflineBanner,
  PersonRow,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { colors, layout, rhythm } from '../../design/tokens';
import { formatCount, formatYearRange } from '../../design/format';
import { ApiError } from '../../api/errors';
import type { Electorate } from '../../api/catalog-decoders';
import { personRoute, electorateRoute } from '../../navigation/routes';
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
  type PeopleRow,
  type PartyRow,
} from './model';
import { directoryKind, directoryStore, useDirectoryState } from './store';

const titles = {
  person: 'Parliamentarians',
  party: 'Parties',
  electorate: 'Electorates',
};
type Row = PeopleRow | PartyRow | Electorate;
const DirectoryRow = memo(function DirectoryRow({ item }: { item: Row }) {
  if ('profile' in item)
    return (
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
        onPress={() => router.push(personRoute(item.key))}
      />
    );
  if ('money' in item) return <PartyDirectoryRow item={item} />;
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
      onPress={() => router.push(electorateRoute(item.electorate_id))}
    />
  );
});
const separator = () => <Divider variant="subtle" />;
const renderRow = ({ item }: ListRenderItemInfo<Row>) => (
  <DirectoryRow item={item} />
);
const rowKey = (item: Row) => ('key' in item ? item.key : item.electorate_id);
export default function DirectoryScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = directoryKind(params.kind);
  // A directory deep link can replace kind on this same route. Keep each view’s
  // query and record local, so the previous kind never filters or flashes here.
  return <DirectoryView key={kind} kind={kind} />;
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
      <FlatList<Row>
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
        renderItem={renderRow}
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
                        ?.choices?.find((c) => c.value === value)?.label ??
                      'Yes'
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
});
