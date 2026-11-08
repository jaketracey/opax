import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import {
  Group,
  LinkRow,
  RowList,
  SectionHeader,
  Skeleton,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import type { Roster } from '../../api/catalog-decoders';
import { resultsRoute } from '../../navigation/routes/search';
import { MatchRow, type RowSources } from './rows';
import {
  matchAll,
  orderGroups,
  topHits,
  type GroupKind,
  type Match,
  type MatchSources,
} from './ranking';
import { SpeechResults } from './SpeechResults';
import { SearchInRows } from './GroupResults';
import {
  EmptyResults,
  SourcesError,
  type RecoveryHandlers,
} from './EmptyResults';
import { moneyGroups, registerGroups, type Scope } from './scopes';
import { filtersLine, hasFilters, type SpeechFilters } from './filters';
import { FiltersLine } from './FiltersLine';
import type { SpeechList } from './speeches';
import { formatCount } from '../../design/format';

const seeAllNoun: Record<GroupKind, string> = {
  topics: 'topics',
  people: 'people',
  electorates: 'electorates',
  bills: 'bills',
  parties: 'parties',
};
/** People and Bills are scopes; the other groups are pushed lists. */
const scopeFor: Partial<Record<GroupKind, Scope>> = {
  people: 'people',
  bills: 'bills',
};

/** The on-device part of All: Top hits, then groups by the tier rule. */
export function allLocal(q: string, sources: MatchSources | null) {
  if (!sources) return { top: [] as Match[], groups: [], total: 0 };
  const ordered = orderGroups(matchAll(q, sources));
  const top = topHits(ordered);
  const total = ordered.reduce((n, g) => n + g.rows.length, 0);
  return {
    top,
    total,
    groups: ordered
      .map((g) => ({
        ...g,
        rows: g.rows.filter((row) => !top.includes(row)),
      }))
      .filter((g) => g.rows.length),
  };
}

/**
 * All (journeys/search.md 3.4): Top hits (the first row of up to three
 * groups, not repeated below), the on-device groups by the tier rule, then
 * Speeches (the submit's one read), then tap-to-run rows for Declared
 * interests, Pay, Expenses and Money. Each group shows three rows and
 * "See all {n} {group}".
 */
export function AllResults({
  q,
  sources,
  roster,
  filters,
  speeches,
  onScope,
  recover,
  onOpenFilters,
  onRetrySources,
}: {
  q: string;
  sources: (MatchSources & RowSources) | null;
  roster: Roster | null;
  filters: SpeechFilters;
  speeches: SpeechList;
  onScope: (scope: Scope) => void;
  recover: RecoveryHandlers;
  /** Tapping the Speeches group's filter line opens Filters. */
  onOpenFilters?: () => void;
  onRetrySources?: () => void;
}) {
  const local = allLocal(q, sources);
  const speechRows = speeches.rows;
  const nothing =
    !!sources &&
    !local.total &&
    speeches.first?.status === 'ready' &&
    !!speechRows &&
    !speechRows.length;
  return (
    <Group gap={rhythm.group} testID="search-results">
      {nothing ? (
        <EmptyResults where="all" q={q} filters={filters} recover={recover} />
      ) : null}
      {!sources && onRetrySources ? (
        <SourcesError subject="People" onRetry={onRetrySources} />
      ) : !sources ? (
        <Skeleton shape="people" count={3} label="Searching" />
      ) : null}
      {local.top.length ? (
        <View testID="search-top-hits">
          <SectionHeader title="Top hits" level={3} />
          <View style={styles.rows}>
            <RowList>
              {local.top.map((match) => (
                <ResultSlot key={`${match.kind}:${match.key}`} match={match}>
                  <MatchRow
                    match={match}
                    q={q}
                    sources={sources!}
                    variant="result"
                    testID={resultID(match)}
                  />
                </ResultSlot>
              ))}
            </RowList>
          </View>
        </View>
      ) : null}
      {local.groups.map((group) => (
        <View key={group.kind} testID={`search-group-${group.kind}`}>
          <SectionHeader title={group.label} level={3} />
          <View style={styles.rows}>
            <RowList>
              {group.rows.slice(0, 3).map((match) => (
                <ResultSlot key={`${match.kind}:${match.key}`} match={match}>
                  <MatchRow
                    match={match}
                    q={q}
                    sources={sources!}
                    variant="result"
                    testID={resultID(match)}
                  />
                </ResultSlot>
              ))}
              {group.rows.length > 3 ? (
                <LinkRow
                  title={`See all ${formatCount(group.rows.length)} ${seeAllNoun[group.kind]}`}
                  onPress={() => {
                    const scope = scopeFor[group.kind];
                    if (scope) onScope(scope);
                    else
                      router.push(
                        resultsRoute(group.kind, { group: group.kind, q }),
                      );
                  }}
                  testID={`search-group-${group.kind}-all`}
                />
              ) : null}
            </RowList>
          </View>
        </View>
      ))}
      {speeches.first?.status === 'ready' &&
      speechRows &&
      !speechRows.length ? null : (
        <View testID="search-group-speeches">
          <SectionHeader
            title={filters.kind === 'all' ? 'Records' : 'Speeches'}
            level={3}
          />
          {hasFilters(filters) ? (
            // The group's rows are the filtered rows: say so above them
            // (specs/search.md 2.6.3 item 3). People and Bills ignore the
            // filters, so only this group carries the line.
            <FiltersLine
              text={filtersLine(filters)}
              onClear={recover.onClearFilters}
              onPress={onOpenFilters}
              testID="search-group-speeches-filters"
              clearTestID="search-group-speeches-filters-clear"
            />
          ) : null}
          <View style={styles.rows}>
            <SpeechResults
              list={speeches}
              q={q}
              filters={filters}
              sort="relevance"
              roster={roster}
              variant="group"
              recover={recover}
              onRetrySources={onRetrySources}
            />
          </View>
        </View>
      )}
      <SearchInRows
        q={q}
        include={registerGroups}
        header="Search in"
        testID="search-in"
      />
      <SearchInRows
        q={q}
        include={moneyGroups}
        header="Money"
        testID="search-in-money"
      />
    </Group>
  );
}

/**
 * The result's id on a plain view around its row. A row with an href and
 * a preview or menu is wrapped by expo-router's NativeLinkPreview, a
 * `display: 'contents'` native view (57.0.24 build/link/ExpoLink.js:53,
 * 64-67 and LinkWithPreview.js:101-128). In the 4-fix2 Maestro hierarchy
 * the whole people top hit was absent (row, -portrait, -name, its text)
 * and so were Just declared's entries; both take that path. The listed
 * records-result-0 has no link (its pinned record has no href or url).
 * This view is never flattened, so `search-result-<slug>` reaches the
 * hierarchy whichever host the row uses; the row keeps the same id for
 * its own parts (-portrait, -name).
 */
function ResultSlot({
  match,
  children,
}: {
  match: Match;
  children: ReactNode;
}) {
  return (
    <View testID={resultID(match)} collapsable={false}>
      {children}
    </View>
  );
}

/** Result row ids: people keep `search-result-<slug>` for the flows. */
export function resultID(match: Match) {
  switch (match.kind) {
    case 'people':
      return `search-result-${match.item.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`;
    case 'bills':
      return `search-result-bill-${match.key}`;
    case 'electorates':
      return `search-result-electorate-${match.key}`;
    case 'parties':
      return `search-result-party-${match.key}`;
    case 'topics':
      return `search-result-topic-${match.key}`;
  }
}

const styles = StyleSheet.create({
  rows: { marginTop: rhythm.heading },
});
