import { RecordRow } from '../RecordRow';
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
  OfflineBanner,
  PersonRow,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { colors, layout, spacing } from '../../design/tokens';
import { formatCount, formatDate, formatMoney } from '../../design/format';
import { billFoldText } from '../../api/bill-transforms';
import { ApiError } from '../../api/errors';
import type { Electorate } from '../../api/catalog-decoders';
import {
  personRoute,
  partyRoute,
  electorateRoute,
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
            ? `${item.row.first}–${item.row.last ?? item.row.first}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        onPress={() => router.push(personRoute(item.key))}
      />
    );
  if ('money' in item)
    return (
      <RecordRow
        title={item.name}
        testID={`directory-party-${billFoldText(item.name).replace(/ /g, '-')}`}
        detail={[
          `${formatCount(item.speeches)} speeches in the static roster`,
          `${formatCount(item.members)} parliamentary roster members`,
          ...Object.values(item.money).map(
            (m) =>
              `${formatMoney(m.total)} · ${m.source} · as at ${formatDate(m.asAt)}`,
          ),
        ].join('\n')}
        onPress={() => router.push(partyRoute(item.name))}
      />
    );
  return (
    <PersonRow
      name={item.name}
      testID={`directory-electorate-${item.slug}`}
      portrait={
        item.representatives[0] ? (
          <CachedPortrait name={item.representatives[0].person.name} />
        ) : undefined
      }
      place={seatContext(item)}
      detail={[
        item.status === 'historical' ? 'Historical' : null,
        item.representatives.length
          ? item.representatives
              .map((r) => [r.person.name, r.party].filter(Boolean).join(' · '))
              .join('; ')
          : 'Representation not yet verified',
        item.representation_as_of
          ? `Verified ${formatDate(item.representation_as_of)}`
          : null,
        item.election_count
          ? `${item.election_count} elections indexed`
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
  const params = useLocalSearchParams<{ kind: string }>(),
    kind = directoryKind(params.kind),
    title = titles[kind];
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
            {record ? (
              <>
                <Text variant="metadata" testID="directory-count">
                  {count} ·{' '}
                  {
                    directorySorts[kind].find(
                      (s) =>
                        s.value ===
                        (filters.sort || directorySorts[kind][0]!.value),
                    )?.label
                  }
                </Text>
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
                {record.sources.map((s) => (
                  <AsAtLine
                    key={s.label}
                    asOf={s.asAt}
                    citation={s.label}
                    savedAt={record.stale ? record.savedAt : null}
                  />
                ))}
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
            {kind === 'electorate' ? (
              <Text variant="fine">
                Places, representatives and the elections that shaped them.
              </Text>
            ) : null}
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
        ListFooterComponent={
          record ? (
            <Group style={styles.footer}>
              <Text wordSafe variant="fine" testID="directory-caveat">
                {kind === 'person'
                  ? 'Names appear as Hansard prints them. Speech counts follow the site’s corpus rule (speeches since the 1993 election, 200+ characters, procedural rows removed). Verified representatives are included independently of that threshold; their missing speech totals are labelled explicitly. Party is the label the person’s speeches carry, or the members register’s where they carry none; many state Hansard rows record neither. Portraits are official APH, OpenAustralia and credited Wikimedia Commons photos; divisions come from They Vote For You and the NSW, Victorian and Queensland Hansard.'
                  : kind === 'party'
                    ? 'Speech totals and directory membership come from the dated static parliamentary roster. A speech with no party label is not counted. Receipts are per commission and are not summed: AEC totals already include state branches. Party receipts include internal party transfers; donor totals exclude them.'
                    : 'Coverage varies by parliament. A missing representative or result means it has not been verified in this release. ABS state outlines use 2025 statistical geography.'}
              </Text>
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
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
  },
  header: { paddingBottom: spacing.s4 },
  footer: { paddingTop: spacing.s6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3 },
});
