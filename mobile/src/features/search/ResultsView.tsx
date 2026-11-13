import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { counted, formatCount } from '../../design/format';
import {
  Group,
  InsetGroup,
  SectionHeader,
  Skeleton,
  type SourceDetails,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { AllResults, allLocal, resultID } from './AllResults';
import {
  EmptyResults,
  SourcesError,
  type RecoveryHandlers,
} from './EmptyResults';
import { SearchInRows } from './GroupResults';
import { ResultsHeader } from './ResultsHeader';
import { useReportSearch } from './ReportResults';
import type { GroupPage, Read } from './requests';
import { reportRoute } from '../../navigation/routes/records';
import { ScopeBar } from './ScopeBar';
import { SpeechResults, speechRoute } from './SpeechResults';
import { filtersLine, hasFilters, type SpeechFilters } from './filters';
import { ORDER_RULE, matchAll, type GroupKind, type Match } from './ranking';
import { MatchRow, matchRoute } from './rows';
import { registerGroups, type Scope } from './scopes';
import type { SearchSources } from './sources';
import {
  SPEECH_RULE,
  useSpeechList,
  type SpeechList,
  type SpeechSort,
} from './speeches';

const ALL_RULE = `${ORDER_RULE} ${SPEECH_RULE}`;

/** The on-device source for People and Bills, from the cached files. */
export function localSource(
  sources: SearchSources | null,
  blocks: readonly ('people' | 'electorates' | 'bills')[],
): SourceDetails | null {
  if (!sources) return null;
  const chosen = blocks.map((b) => sources.provenance[b]);
  const stale = chosen.some((b) => b.stale);
  return {
    asOf:
      chosen
        .map((b) => b.asAt)
        .sort()
        .at(-1) ?? null,
    citation: chosen.flatMap((b) =>
      b.sources.map((s) => ({ label: s.label, asOf: b.asAt })),
    ),
    savedAt: stale
      ? Math.min(...chosen.map((b) => Number(b.savedAt) || Date.now()))
      : null,
    state: stale ? 'saved' : null,
    rule: ORDER_RULE,
  };
}

/** One group's matches for a scope (People or Bills), every row, by tier. */
function scopeMatches(
  q: string,
  sources: SearchSources | null,
  kind: GroupKind,
): Match[] {
  if (!sources) return [];
  return matchAll(q, sources)[kind] ?? [];
}

/**
 * The submitted results (journeys/search.md 3.4): the scope control first
 * in the list header, then the count and its one `SourceLine`, then the
 * filter line when filters are on, then the scope's rows. Shared by the
 * Search root and every pushed `/results`.
 */
export function ResultsView({
  q,
  scope,
  onScope,
  filters,
  sort,
  sources,
  recover,
  onOpenFilters,
  onRows,
  onRetrySources,
  onSettled,
  showScopes = true,
}: {
  q: string;
  scope: Scope;
  onScope: (scope: Scope) => void;
  filters: SpeechFilters;
  sort: SpeechSort;
  sources: SearchSources | null;
  recover: RecoveryHandlers;
  onOpenFilters: () => void;
  /** Set when the cached files failed: their rows offer Try again. */
  onRetrySources?: () => void;
  /**
   * iPad: the rows' routes in drawn order, for the pane's first selection
   * and the keyboard's Up and Down.
   */
  onRows?: (rows: PaneRow[]) => void;
  /**
   * Once the count is known, how many results the query found in this
   * scope. Search saves a query to Recent only when it found something
   * (sweep 2, item 8.2).
   */
  onSettled?: (q: string, scope: Scope, total: number) => void;
  showScopes?: boolean;
}) {
  const roster = (sources?.roster ?? null) as Parameters<
    typeof useSpeechList
  >[3];
  // All reads page 1 by relevance: the same key as the Speeches scope's
  // first page, so switching to Speeches costs nothing (session cache).
  const allList = useSpeechList(q, filters, 'relevance', roster, ALL_RULE);
  const scopeList = useSpeechList(q, filters, sort, roster, SPEECH_RULE);
  const speeches = scope === 'all' ? allList : scopeList;
  const reports = useReportSearch(q, false, scope === 'all');
  // Each scope loads only when chosen, and only when not already cached.
  const load = speeches.load;
  useEffect(() => {
    if (scope === 'all' || scope === 'speeches') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q, filtersKeyOf(filters), sort]);
  const rows = onRows ? paneRows(q, scope, sources, speeches, reports) : [];
  const rowsKey = JSON.stringify(rows);
  useEffect(() => {
    onRows?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, onRows]);
  const header = useHeader(q, scope, sources, speeches, reports);
  useAnnounce(scope, q, header.count, header.settled);
  const settledTotal = header.settled ? header.total : null;
  useEffect(() => {
    if (settledTotal !== null) onSettled?.(q, scope, settledTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledTotal, q, scope]);
  return (
    <Group gap={rhythm.block} testID={`search-results-${scope}`}>
      <View style={styles.header} testID="search-results-header">
        {showScopes ? <ScopeBar value={scope} onChange={onScope} /> : null}
        <ResultsHeader
          // With nothing found the block below says "No results"; the
          // source line does not also say "0 results" (sweep 2, 8.4).
          count={header.settled && header.total > 0 ? header.count : null}
          details={header.settled ? header.source : null}
          filters={
            scope === 'speeches' && hasFilters(filters)
              ? filtersLine(filters)
              : undefined
          }
          onClearFilters={recover.onClearFilters}
          onOpenFilters={onOpenFilters}
        />
      </View>
      {scope === 'all' ? (
        <AllResults
          q={q}
          sources={sources}
          roster={roster}
          filters={filters}
          speeches={allList}
          reports={reports}
          onScope={onScope}
          recover={recover}
          onOpenFilters={onOpenFilters}
          onRetrySources={onRetrySources}
        />
      ) : scope === 'speeches' ? (
        <SpeechResults
          list={scopeList}
          q={q}
          filters={filters}
          sort={sort}
          roster={roster}
          variant="list"
          recover={recover}
          onRetrySources={onRetrySources}
          announce
        />
      ) : (
        <LocalScope
          q={q}
          kind={scope === 'people' ? 'people' : 'bills'}
          sources={sources}
          recover={recover}
          onRetrySources={onRetrySources}
        />
      )}
    </Group>
  );
}

type Route = { pathname: string; params?: Record<string, unknown> };
export type PaneRow = { route: Route; title?: string };

/**
 * The rows as drawn, Top hits row 1 first (DIRECTION 3.7): All's Top hits,
 * its groups' first three rows and its first three speeches; a scope's rows.
 */
function paneRows(
  q: string,
  scope: Scope,
  sources: SearchSources | null,
  speeches: SpeechList,
  reports: Read<GroupPage> | null,
): PaneRow[] {
  const local: Match[] = !sources
    ? []
    : scope === 'all'
      ? (() => {
          const all = allLocal(q, sources);
          return [...all.top, ...all.groups.flatMap((g) => g.rows.slice(0, 3))];
        })()
      : scope === 'people' || scope === 'bills'
        ? scopeMatches(q, sources, scope)
        : [];
  const speechRows =
    scope === 'all'
      ? (speeches.rows ?? []).slice(0, 3)
      : scope === 'speeches'
        ? (speeches.rows ?? [])
        : [];
  return [
    ...local.map((match) => (sources ? matchRoute(match, sources) : null)),
    ...(scope === 'all' && reports?.status === 'ready'
      ? reports.result.data.results
          .slice(0, 3)
          .map((r) => reportRoute(r.slug, r.title))
      : []),
    ...speechRows.map((row) => speechRoute(row, q)),
  ].flatMap((route) => (route ? [{ route }] : []));
}

const filtersKeyOf = (f: SpeechFilters) => JSON.stringify(f);

/** People or Bills: every on-device match by the tier rule, no request. */
function LocalScope({
  q,
  kind,
  sources,
  recover,
  onRetrySources,
}: {
  q: string;
  kind: 'people' | 'bills';
  sources: SearchSources | null;
  recover: RecoveryHandlers;
  onRetrySources?: () => void;
}) {
  if (!sources && onRetrySources)
    return (
      <SourcesError
        subject={kind === 'people' ? 'People' : 'Bills'}
        onRetry={onRetrySources}
      />
    );
  if (!sources)
    return (
      <Skeleton
        shape={kind === 'people' ? 'people' : 'rows'}
        count={3}
        label={`Searching ${kind}`}
      />
    );
  const rows = scopeMatches(q, sources, kind);
  return (
    <Group gap={rhythm.group}>
      {rows.length ? (
        <View testID={`search-group-${kind}`}>
          <SectionHeader
            title={kind === 'people' ? 'Parliamentarians' : 'Bills'}
            level={3}
          />
          <View style={styles.rows}>
            <InsetGroup>
              {rows.map((match) => (
                <MatchRow
                  key={`${match.kind}:${match.key}`}
                  match={match}
                  q={q}
                  sources={sources}
                  variant="result"
                  testID={resultID(match)}
                />
              ))}
            </InsetGroup>
          </View>
        </View>
      ) : (
        <EmptyResults where={kind} q={q} recover={recover} />
      )}
      {kind === 'people' ? (
        <SearchInRows
          q={q}
          include={registerGroups}
          header="Search in"
          testID="search-in"
        />
      ) : null}
    </Group>
  );
}

/** The count and source line for the scope shown. */
function useHeader(
  q: string,
  scope: Scope,
  sources: SearchSources | null,
  speeches: SpeechList,
  reports: Read<GroupPage> | null,
) {
  if (scope === 'people' || scope === 'bills') {
    const n = scopeMatches(q, sources, scope).length;
    return {
      settled: !!sources,
      total: n,
      count:
        scope === 'people'
          ? `${counted(n, 'person', 'people')}`
          : `${counted(n, 'bill', 'bills')}`,
      source: localSource(
        sources,
        scope === 'people' ? ['people', 'electorates'] : ['bills'],
      ),
    };
  }
  const settled =
    speeches.first?.status === 'ready' || speeches.first?.status === 'error';
  if (scope === 'speeches')
    return {
      settled,
      total: speeches.first?.status === 'ready' ? speeches.total : 0,
      count: speeches.count,
      source: speeches.source,
    };
  // All: the on-device matches plus the speeches window ("200+ results").
  const local = allLocal(q, sources).total;
  const remote = speeches.first?.status === 'ready' ? speeches.total : 0;
  const capped = !!speeches.count?.includes('+');
  const n =
    local +
    remote +
    (reports?.status === 'ready' ? reports.result.data.total : 0);
  const local_ = localSource(sources, ['people', 'electorates', 'bills']);
  const remoteSource = speeches.source;
  return {
    settled:
      settled &&
      !!sources &&
      (!q.trim() || reports?.status === 'ready' || reports?.status === 'error'),
    total: n,
    count: `${formatCount(n)}${capped ? '+' : ''} ${n === 1 && !capped ? 'result' : 'results'}`,
    source:
      remoteSource || local_
        ? {
            ...(local_ ?? {}),
            ...(remoteSource ?? {}),
            citation: [
              ...(reports?.status === 'ready'
                ? [
                    ...new Set(
                      reports.result.data.results
                        .map((r) => r.body)
                        .filter((body): body is string => !!body),
                    ),
                  ]
                : []),
              ...asList(remoteSource?.citation),
              ...asList(local_?.citation),
            ],
            rule: ALL_RULE,
            notes: [
              ...(remoteSource?.notes ?? []),
              'Reports retain the order returned by the report catalogue.',
              reports?.status === 'error'
                ? 'Reports could not be loaded; the result count is incomplete.'
                : null,
            ],
          }
        : null,
  };
}
const asList = (c: SourceDetails['citation']) =>
  c === undefined ? [] : typeof c === 'string' ? [c] : [...c];

/**
 * Announced once after the first content arrives, on submit and on scope
 * change (3.10): "42 results for housing". Never per page.
 */
function useAnnounce(
  scope: Scope,
  q: string,
  count: string | null,
  settled: boolean,
) {
  const said = useRef<string | null>(null);
  useEffect(() => {
    // Speeches announces from its own list (it also says "20 more loaded").
    if (scope === 'speeches' || !settled || !count) return;
    const key = `${scope}|${q}`;
    if (said.current === key) return;
    said.current = key;
    AccessibilityInfo.announceForAccessibility(`${count} for ${q.trim()}`);
  }, [scope, q, count, settled]);
}

const styles = StyleSheet.create({
  header: { gap: rhythm.line },
  rows: { marginTop: rhythm.heading },
});
