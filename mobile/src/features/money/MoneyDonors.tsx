import { associatedLine, donorAssociated } from '../../api/associated';
import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { SearchBarCommands } from 'react-native-screens';
import { View } from 'react-native';
import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import { counted, formatCount } from '../../design/format';
import {
  ContentUnavailable,
  Group,
  MoneyRow,
  OfflineLine,
  Skeleton,
  SourceLine,
  Text,
} from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import { ListCaption, MoneyList } from '../money-public/parts';
import { useMoneyRecord } from './hooks';
import { normaliseOrganisation } from './lookup';
import {
  donorDetails,
  filtersFromParams,
  industryDonors,
  isAllYears,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyYears,
  param,
  type MoneyParams,
} from './records';
import { moneyNotes, moneyOriginals, moneySourceDetails } from './sources';
import { moneyView, rankedDonors } from './view';

/** "400 donors, largest first"; searching, "12 of 400 donors". */
export function donorsCaption(shown: number, all: number, searching: boolean) {
  return searching
    ? `${formatCount(shown)} of ${counted(all, 'donor', 'donors')}`
    : `${counted(all, 'donor', 'donors')}, largest first`;
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
  // A missing donor record arrives with its name as the search (sweep 2).
  const seeded = (param(params.q) ?? '').trim().slice(0, 120);
  const [query, setQuery] = useState(seeded);
  const search = useListSearchBar({
    placeholder: 'Donors',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  // The bar field opens prefilled with the arriving search.
  useEffect(() => {
    if (!seeded) return;
    (search.ref as RefObject<SearchBarCommands | null>).current?.setText(
      seeded,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const graph = record?.data ?? null;
  const filters = useMemo(
    () => (graph ? filtersFromParams(graph, params) : null),
    [graph, params],
  );
  const view = useMemo(
    () => (graph && filters ? moneyView(graph, filters) : null),
    [graph, filters],
  );
  const donors = useMemo(() => (view ? rankedDonors(view) : []), [view]);
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
          filters.industry ? industryDonors(filters.industry) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  return (
    <>
      <RouteOptions
        options={{
          title: 'Donors',
          headerLargeTitle: true,
          headerSearchBarOptions: search,
        }}
      />
      <View testID="money-donors-screen" style={{ flex: 1 }}>
        <MoneyList
          id="money-donors-list"
          loaded={!!record && !!graph && !!filters && !!detail}
          rows={shown}
          rowKey={(node) => node.id}
          refreshing={refreshing}
          refresh={refresh}
          header={
            !record || !graph || !filters || !detail ? (
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
                {record.stale && !record.staleReason ? (
                  <OfflineLine savedAt={record.savedAt} />
                ) : null}
                {window ? (
                  <Text
                    wordSafe
                    variant="secondary"
                    testID="money-donors-window"
                  >
                    {window}
                  </Text>
                ) : null}
                <ListCaption announce={!!wanted} testID="money-donors-caption">
                  {donorsCaption(shown.length, donors.length, !!wanted)}
                </ListCaption>
              </Group>
            )
          }
          empty={
            <Text
              wordSafe
              variant="body"
              tone="inkSoft"
              accessibilityLiveRegion="polite"
              testID="money-donors-none"
            >
              {wanted
                ? `No donors match “${query.trim()}”.`
                : 'No donors in the selected records.'}
            </Text>
          }
          render={(node, index) => (
            <MoneyRow
              name={node.label}
              detail={[associatedLine(donorAssociated(node)), detail?.(node)]
                .filter(Boolean)
                .join(' · ')}
              amount={node.total}
              href={moneyFocusRoute(
                node.id,
                jurisdiction,
                filters!,
                node.label,
                via,
              )}
              testID={`money-donor-${index}`}
            />
          )}
          sourceLine={
            record && graph ? (
              <SourceLine
                {...moneySourceDetails(record, {
                  originals: moneyOriginals(graph).slice(0, 1),
                  notes: moneyNotes(graph),
                  testID: 'money-donors-source',
                })}
              />
            ) : null
          }
        />
      </View>
    </>
  );
}
