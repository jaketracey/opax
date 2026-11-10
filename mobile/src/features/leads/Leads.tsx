import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { copy } from '../../design/copy';
import { counted, formatCount } from '../../design/format';
import {
  ContentUnavailable,
  Group,
  OfflineLine,
  Screen,
  SectionHeader,
  SegmentedPicker,
  Skeleton,
  SourceLine,
  Text,
} from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import { colors, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { leadsKindRoute } from '../../navigation/routes/money-map';
import { leadRoute } from '../../navigation/routes/public-money';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { moneyPageMenu } from '../money/menu';
import { LeadFeedCard } from './LeadFeedCard';
import {
  aboutLede,
  categoryFrom,
  categoryLabel,
  categoryNone,
  categorySearch,
  categorySeeAll,
  categorySource,
  discoveryAsOf,
  leadSections,
  leadsHiddenNotes,
  searchLeads,
  type LeadCategory,
  type LeadSort,
  type LeadView,
} from './model';

/** The web's words for what a lead is (direction 6.7). */
export const leadsLede =
  'Patterns in the public record are leads, not findings.';
const SECTION = 3;

const sortOptions = [
  {
    value: 'value' as const,
    label: 'Largest totals',
    testID: 'leads-sort-value',
  },
  {
    value: 'share' as const,
    label: 'Biggest share',
    testID: 'leads-sort-share',
  },
];

/** "28 leads, largest totals first"; searching, "3 of 28 leads". */
export function kindCaption(
  category: LeadCategory,
  sort: LeadSort,
  shown: number,
  all: number,
  searching: boolean,
) {
  const leads = (n: number) => `${counted(n, 'lead', 'leads')}`;
  if (searching) return `${formatCount(shown)} of ${leads(all)}`;
  if (category === 'donor_contract_overlap')
    return `${leads(all)}, largest first`;
  return `${leads(all)}, ${sort === 'share' ? 'biggest share' : 'largest totals'} first`;
}
/** The registers behind the shown cards, once each: "AEC and AusTender". */
export function leadsCitation(leads: readonly LeadView[]) {
  const names = new Set<string>();
  for (const lead of leads)
    for (const name of categorySource(lead.category).split(' and '))
      names.add(name);
  const list = [...names];
  return list.length > 1
    ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
    : (list[0] ?? 'AEC and AusTender');
}

/**
 * Leads (specs/money.md 2.9), absorbing Discover: the root draws one
 * section per kind of lead, three cards each with "See all"; `category`
 * opens one kind's full list, and `item` then pushes a lead on it. The
 * bar search turns either into one flat list of matching cards. Counts of
 * leads not shown live in each source sheet's notes.
 */
export default function Leads() {
  const params = useLocalSearchParams<{ category?: string; item?: string }>();
  const category = useMemo(
    () => categoryFrom(params.category),
    [params.category],
  );
  const router = useRouter();
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      catalogs.discovery(refresh, signal),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LeadSort>('value');
  const search = useListSearchBar({
    placeholder: category
      ? categorySearch(category)
      : 'Agencies, parties and companies',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const discovery = record?.data ?? null;
  // A Discover link with a lead pushes it on its kind list, once.
  const pushed = useRef(false);
  useEffect(() => {
    if (!discovery || pushed.current || !params.item) return;
    pushed.current = true;
    router.push(leadRoute(params.item));
  }, [discovery, params.item, router]);
  const title = category ? categoryLabel(category) : 'Leads';
  const share = {
    path: category
      ? `/discover?${new URLSearchParams({ category })}`
      : '/discover',
    title,
  };
  const searching = !!query.trim();
  const sections = useMemo(
    () => (discovery ? leadSections(discovery) : []),
    [discovery],
  );
  const results = useMemo(
    () =>
      discovery && (searching || category)
        ? searchLeads(discovery, query, category ?? undefined, sort)
        : [],
    [discovery, searching, category, query, sort],
  );
  const kindAll = useMemo(
    () =>
      discovery && category ? searchLeads(discovery, '', category, sort) : [],
    [discovery, category, sort],
  );
  const savedAt = record?.stale ? record.savedAt : null;
  const sourceFor = (citation: string, testID: string) =>
    discovery
      ? {
          title: 'About these numbers',
          asOf: discoveryAsOf(discovery),
          citation,
          savedAt,
          notes: [
            aboutLede(discovery),
            ...discovery.methodology,
            ...leadsHiddenNotes(discovery),
          ],
          testID,
        }
      : null;
  const offline =
    error instanceof ApiError &&
    (error.code === 'offline' || error.code === 'timeout');
  // A search with no matches is one plain line under its caption.
  const none = (
    <Text
      wordSafe
      variant="body"
      tone="inkSoft"
      accessibilityLiveRegion="polite"
      testID="leads-empty"
    >
      {`No leads match “${query.trim()}”.`}
    </Text>
  );
  const cards = (leads: readonly LeadView[], kindMeta: boolean, start = 0) =>
    leads.map((lead, index) => (
      <LeadFeedCard
        key={lead.id}
        lead={lead}
        kindMeta={kindMeta}
        testID={`lead-${start + index}`}
      />
    ));
  let body: React.ReactNode;
  if (!discovery)
    body = error ? (
      offline ? (
        <ContentUnavailable
          symbol="wifi.slash"
          title={copy.notSaved}
          body={copy.notSavedBody}
          testID="leads-error"
        />
      ) : (
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title="Leads couldn’t be loaded"
          body="Check your connection and try again."
          action={{ label: copy.tryAgain, onPress: retry }}
          testID="leads-error"
        />
      )
    ) : (
      <Group testID="leads-loading">
        {Array.from({ length: category ? 1 : 3 }, (_, i) => (
          <Skeleton
            key={i}
            shape="card"
            count={SECTION}
            label={i ? undefined : 'Loading the leads'}
          />
        ))}
      </Group>
    );
  else if (!sections.length)
    body = (
      <ContentUnavailable
        symbol="magnifyingglass"
        title="No leads yet"
        testID="leads-empty"
      />
    );
  else if (category && !kindAll.length)
    // A link to a kind the current export has none of.
    body = (
      <ContentUnavailable
        symbol="magnifyingglass"
        title={categoryNone(category)}
        testID="leads-kind-empty"
      />
    );
  else if (category)
    body = (
      <Group testID="leads">
        {category !== 'donor_contract_overlap' ? (
          <SegmentedPicker
            options={sortOptions}
            value={sort}
            onChange={setSort}
            accessibilityLabel="Order"
            testID="leads-sort"
          />
        ) : null}
        <Text wordSafe variant="footnote" testID="leads-caption">
          {kindCaption(
            category,
            sort,
            results.length,
            kindAll.length,
            searching,
          )}
        </Text>
        {results.length || !searching ? (
          <>
            <View
              style={styles.cards}
              testID={searching ? 'leads-search-results' : undefined}
            >
              {cards(results, false)}
            </View>
            <SourceLine
              {...sourceFor(
                categorySource(category),
                `leads-source-${category}`,
              )!}
            />
          </>
        ) : (
          none
        )}
      </Group>
    );
  else if (searching)
    body = (
      <Group testID="leads-search-results">
        <Text
          wordSafe
          variant="footnote"
          accessibilityLiveRegion="polite"
          testID="leads-search-caption"
        >
          {`${counted(results.length, 'lead matches', 'leads match')}`}
        </Text>
        {results.length ? (
          <>
            <View style={styles.cards}>{cards(results, true)}</View>
            <SourceLine
              {...sourceFor(leadsCitation(results), 'leads-source')!}
            />
          </>
        ) : (
          none
        )}
      </Group>
    );
  else {
    const starts = sections.map((_, i) =>
      sections
        .slice(0, i)
        .reduce((n, section) => n + Math.min(SECTION, section.leads.length), 0),
    );
    body = (
      <Group testID="leads">
        <Text wordSafe variant="body" testID="leads-lede">
          {leadsLede}
        </Text>
        {sections.map(({ category: kind, leads }, sectionIndex) => {
          const first = starts[sectionIndex]!;
          return (
            <View
              key={kind}
              testID={`leads-section-${kind}`}
              style={styles.section}
            >
              <SectionHeader
                title={categoryLabel(kind)}
                action={{
                  label: copy.seeAll,
                  accessibilityLabel: categorySeeAll(kind, leads.length),
                  href: leadsKindRoute(kind),
                  testID: `leads-all-${kind}`,
                }}
              />
              <View style={styles.cards}>
                {cards(leads.slice(0, SECTION), false, first)}
              </View>
              <SourceLine
                {...sourceFor(categorySource(kind), `leads-source-${kind}`)!}
              />
            </View>
          );
        })}
      </Group>
    );
  }
  return (
    <>
      <RouteOptions
        options={{
          title,
          headerLargeTitle: true,
          headerSearchBarOptions: search,
          ...headerItems(
            pageItems({ name: title, menu: moneyPageMenu(share) }),
          ),
        }}
      />
      <Screen
        grouped
        testID="leads-screen"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
      >
        {record?.stale && record.staleReason !== 'unreadable' ? (
          <OfflineLine savedAt={record.savedAt} />
        ) : null}
        {body}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  // Cards stand apart by a block's gap; nothing nests them.
  cards: { gap: rhythm.block },
  section: { gap: rhythm.tight },
});
