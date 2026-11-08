import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ApiError } from '../../api/errors';
import {
  ContentUnavailable,
  Group,
  MoneyRow,
  OfflineLine,
  Screen,
  Skeleton,
  SourceLine,
  Text,
} from '../../design/primitives';
import { copy } from '../../design/copy';
import { formatCount } from '../../design/format';
import { useListSearchBar } from '../../design/search-bar';
import { chrome, rhythm } from '../../design/tokens';
import { useMoneyRecord } from './hooks';
import { normaliseOrganisation } from './lookup';
import {
  donorDetails,
  filtersFromParams,
  industryWords,
  isAllYears,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyYears,
  param,
  type MoneyParams,
} from './records';
import { moneyNotes, moneyOriginals, moneySourceDetails } from './sources';
import { moneyView, moneyWindowNodes, rankedDonors } from './view';

/** "400 donors, largest first"; searching, "12 of 400 donors". */
export function donorsCaption(shown: number, all: number, searching: boolean) {
  return searching
    ? `${formatCount(shown)} of ${formatCount(all)} ${all === 1 ? 'donor' : 'donors'}`
    : `${formatCount(all)} ${all === 1 ? 'donor' : 'donors'}, largest first`;
}

/**
 * Every named donor on the map (specs/money.md 2.13, "Donors"): the map's
 * List rows in full, in the window the map carried here, with a bar search.
 * Private individuals are never rows.
 */
export default function MoneyDonors() {
  const params = useLocalSearchParams<MoneyParams>();
  const jurisdiction = moneyJurisdiction(params.jurisdiction);
  // Opened from the map's "See all": its rows count as coming from the map.
  const via = param(params.via) === 'map' ? 'map' : null;
  const { record, error, refreshing, refresh, retry } =
    useMoneyRecord(jurisdiction);
  const [query, setQuery] = useState('');
  const search = useListSearchBar({
    placeholder: 'Donors',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const graph = record?.data ?? null;
  const filters = useMemo(
    () => (graph ? filtersFromParams(graph, params) : null),
    [graph, params],
  );
  const view = useMemo(
    () =>
      graph && filters
        ? {
            ...moneyView(graph, filters),
            nodes: moneyWindowNodes(graph, filters),
          }
        : null,
    [graph, filters],
  );
  const donors = useMemo(
    () => (view ? rankedDonors(view).filter((n) => !n.withheld) : []),
    [view],
  );
  const detail = useMemo(() => (view ? donorDetails(view) : null), [view]);
  const wanted = normaliseOrganisation(query);
  const shown = wanted
    ? donors.filter((n) =>
        [n.label, ...(n.aliases ?? [])].some((name) =>
          normaliseOrganisation(name).includes(wanted),
        ),
      )
    : donors;
  const offline =
    error instanceof ApiError &&
    (error.code === 'offline' || error.code === 'timeout');
  const window =
    graph && filters
      ? [
          isAllYears(graph, filters)
            ? null
            : moneyYears(filters.from, filters.to),
          filters.industry ? `${industryWords(filters.industry)} donors` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Donors',
          headerLargeTitle: true,
          headerSearchBarOptions: search,
        }}
      />
      <Screen
        testID="money-donors-screen"
        refreshControl={
          record ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={chrome.tint}
            />
          ) : undefined
        }
      >
        {!record || !graph || !filters || !detail ? (
          error ? (
            offline ? (
              <ContentUnavailable
                symbol="wifi.slash"
                title={copy.notSaved}
                body={copy.notSavedBody}
                testID="money-donors-error"
              />
            ) : (
              <ContentUnavailable
                symbol="exclamationmark.triangle"
                title="The donors couldn’t be loaded"
                body="Check your connection and try again."
                action={{ label: copy.tryAgain, onPress: retry }}
                testID="money-donors-error"
              />
            )
          ) : (
            <Skeleton shape="rows" count={8} label="Loading the donors" />
          )
        ) : (
          <Group>
            {record.stale && record.staleReason !== 'unreadable' ? (
              <OfflineLine savedAt={record.savedAt} />
            ) : null}
            {window ? (
              <Text wordSafe variant="secondary" testID="money-donors-window">
                {window}
              </Text>
            ) : null}
            <View style={styles.list}>
              <Text wordSafe variant="footnote" testID="money-donors-caption">
                {donorsCaption(shown.length, donors.length, !!wanted)}
              </Text>
              {shown.length ? (
                <View testID="money-donors-list">
                  {shown.map((node, index) => (
                    <MoneyRow
                      key={node.id}
                      name={node.label}
                      detail={detail(node)}
                      amount={node.total}
                      href={moneyFocusRoute(
                        node.id,
                        jurisdiction,
                        filters,
                        node.label,
                        via,
                      )}
                      testID={`money-donor-${index}`}
                    />
                  ))}
                </View>
              ) : (
                <ContentUnavailable
                  symbol="magnifyingglass"
                  title={`No donors match “${query.trim()}”`}
                  testID="money-donors-none"
                />
              )}
            </View>
            <SourceLine
              {...moneySourceDetails(record, {
                originals: moneyOriginals(graph).slice(0, 1),
                notes: moneyNotes(graph),
                testID: 'money-donors-source',
              })}
            />
          </Group>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: rhythm.tight },
});
