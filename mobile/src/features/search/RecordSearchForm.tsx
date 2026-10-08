import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, type View } from 'react-native';
import { recordSearch } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import type { Roster } from '../../api/catalog-decoders';
import {
  Button,
  ErrorState,
  Group,
  LoadingState,
  LinkRow,
  OfflineBanner,
  errorMessage,
} from '../../design/primitives';
import type { RecordsPage, SearchSummary } from './decoders';
import {
  defaultFilters,
  normaliseFilters,
  searchWebPath,
  type SearchFilters,
  type SearchSort,
} from './contracts';
import { eligibleRecord, eligibleSummary } from './eligibility';
import { FiltersSheet } from './FiltersSheet';
import { ResultFilters, Results } from './Results';
import { openSearchPath } from './navigation';
import { shareRecord } from '../../navigation/share';
import { isOffline } from '../CatalogState';

export function RecordSearchForm({
  query,
  scope,
  roster,
  onSubmitted,
  onQuery,
  submitRef,
  submitAction,
  initialFilters,
  initialSort = 'relevance',
  initialPage = 1,
  openInPane,
  selectedPath,
}: {
  query: string;
  scope: string;
  roster: Roster | null;
  onSubmitted: () => void;
  onQuery: (q: string) => void;
  submitRef: React.RefObject<View | null>;
  submitAction: React.RefObject<(() => void) | null>;
  initialFilters?: SearchFilters;
  initialSort?: SearchSort;
  initialPage?: number;
  /**
   * iPad split: opens a record in the detail pane and returns true, or
   * returns false for a record the pane does not draw (it then opens as
   * before).
   */
  openInPane?: (path: string, title: string) => boolean;
  /** iPad split: whether a result's path is the record in the pane. */
  selectedPath?: (path: string) => boolean | undefined;
}) {
  const [filters, setFilters] = useState<SearchFilters>(
    normaliseFilters(
      initialFilters ?? {
        ...defaultFilters,
        kind: scope === 'records' ? 'all' : scope,
        mode: scope === 'records' ? 'hybrid' : 'keyword',
      },
    ),
  );
  const [sheet, setSheet] = useState(false);
  const [result, setResult] = useState<RecordResult<RecordsPage> | null>(null);
  const [filtered, setFiltered] = useState(false);
  const [sort, setSort] = useState<SearchSort>(initialSort);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [openError, setOpenError] = useState<unknown>(null);
  const [readMode, setReadMode] = useState<'passages' | 'briefs'>('passages');
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<unknown>(null);
  const [summary, setSummary] = useState<RecordResult<SearchSummary> | null>(
    null,
  );
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const seq = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQuery = useRef(query);
  const active = useRef(false);
  const summaryActive = useRef(false);
  const briefActive = useRef(false);
  const actionQuery = useRef(query);
  const resetFilters = () =>
    normaliseFilters({
      ...defaultFilters,
      kind: scope === 'records' ? 'all' : scope,
    });
  useEffect(() => {
    if (currentQuery.current === query) return;
    currentQuery.current = query;
    seq.current++;
    if (pending.current) clearTimeout(pending.current);
    active.current = false;
    summaryActive.current = false;
    briefActive.current = false;
    setResult(null);
    setError(null);
    setSummary(null);
    setSummaryError(null);
    setBriefs({});
    setBusy(false);
    setSummaryBusy(false);
    setBriefBusy(false);
    setOpenError(null);
    setReadMode('passages');
  }, [query]);
  useEffect(
    () => () => {
      seq.current++;
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  async function run(q = query, f = filters, page = 1, nextSort = sort) {
    if (!(q.trim() || f.speaker) || !roster) return;
    const token = ++seq.current;
    active.current = true;
    currentQuery.current = q;
    actionQuery.current = q;
    Keyboard.dismiss();
    onSubmitted();
    setBusy(true);
    setError(null);
    setOpenError(null);
    setResult(null);
    setSummary(null);
    setSummaryBusy(false);
    setSummaryError(null);
    summaryActive.current = false;
    setReadMode('passages');
    setBriefs({});
    setBriefBusy(false);
    setBriefError(null);
    briefActive.current = false;
    try {
      const data = await recordSearch.search(q, f, page, nextSort);
      if (token !== seq.current) return;
      const rows = data.data.results.filter((row) =>
        eligibleRecord(row, roster),
      );
      setFiltered(
        rows.length !== data.data.results.length || f.kind === 'grant',
      );
      setResult({ ...data, data: { ...data.data, results: rows } });
      AccessibilityInfo.announceForAccessibility(
        `${rows.length} public records on page ${data.data.page}.`,
      );
    } catch (e) {
      if (token === seq.current) setError(e);
    } finally {
      if (token === seq.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  function submit() {
    if (active.current || !(query.trim() || filters.speaker) || !roster) return;
    active.current = true;
    setBusy(true);
    Keyboard.dismiss();
    pending.current = setTimeout(() => {
      pending.current = null;
      void run(query, filters, result ? 1 : initialPage, sort);
    }, 400);
  }
  useImperativeHandle(submitAction, () => submit);
  function apply(next: SearchFilters) {
    const f = normaliseFilters({
      ...next,
      kind: scope === 'records' ? next.kind : scope,
    });
    setSheet(false);
    setFilters(f);
    if (!query.trim() && !f.speaker) {
      seq.current++;
      if (pending.current) clearTimeout(pending.current);
      setResult(null);
      setSummary(null);
      setBusy(false);
      active.current = false;
      return;
    }
    if (
      JSON.stringify(f) !== JSON.stringify(filters) &&
      (query.trim() || f.speaker)
    ) {
      if (pending.current) clearTimeout(pending.current);
      void run(query, f, 1);
    }
  }
  function remove(
    id: Parameters<typeof ResultFilters>[0]['onRemove'] extends (
      id: infer I,
    ) => void
      ? I
      : never,
  ) {
    const f =
      id === 'all'
        ? resetFilters()
        : id === 'years'
          ? { ...filters, from: '', to: '' }
          : { ...filters, [id]: defaultFilters[id] };
    apply(f);
  }
  async function loadBriefs() {
    if (!result || briefActive.current) return;
    const token = seq.current;
    briefActive.current = true;
    setBriefBusy(true);
    setBriefError(null);
    try {
      const data = await recordSearch.briefs(
        result.data.results.map((r) => r.resource),
      );
      if (token === seq.current) {
        setBriefs(data?.data.briefs ?? {});
        AccessibilityInfo.announceForAccessibility(
          'Available machine briefs are ready.',
        );
      }
    } catch (e) {
      if (token === seq.current) setBriefError(e);
    } finally {
      if (token === seq.current) {
        briefActive.current = false;
        setBriefBusy(false);
      }
    }
  }
  async function summarise() {
    if (!result || !roster || summaryActive.current || filters.kind === 'grant')
      return;
    const token = seq.current;
    summaryActive.current = true;
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const data = await recordSearch.summary(actionQuery.current, filters);
      if (token === seq.current) {
        setSummary({ ...data, data: eligibleSummary(data.data, roster) });
        AccessibilityInfo.announceForAccessibility('Summary ready.');
      }
    } catch (e) {
      if (token === seq.current) setSummaryError(e);
    } finally {
      if (token === seq.current) {
        summaryActive.current = false;
        setSummaryBusy(false);
      }
    }
  }
  async function open(path: string, title: string) {
    const token = seq.current;
    setOpenError(null);
    if (openInPane?.(path, title)) return;
    try {
      await openSearchPath(path, title);
    } catch (e) {
      if (token === seq.current) setOpenError(e);
    }
  }
  return (
    <Group>
      <Button
        label={`Search ${scope === 'records' ? 'records' : scope === 'grant' ? 'grants' : scope === 'party' ? 'parties' : scope === 'agency' ? 'government agencies' : scope === 'bill' ? 'bills' : 'reports'}`}
        variant="primary"
        ref={submitRef}
        testID="search-submit"
        loading={busy}
        disabled={!(query.trim() || filters.speaker) || !roster}
        onPress={submit}
      />
      <LinkRow
        title="Filters"
        icon="slider.horizontal.3"
        accent="people"
        testID="search-filters"
        onPress={() => {
          Keyboard.dismiss();
          setSheet(true);
        }}
      />
      <ResultFilters
        filters={filters}
        fixedKind={scope !== 'records'}
        onRemove={remove}
      />
      {sheet ? (
        <FiltersSheet
          value={filters}
          roster={roster}
          fixedKind={scope === 'records' ? undefined : scope}
          onApply={apply}
          onClose={() => setSheet(false)}
        />
      ) : null}
      {error ? (
        <Group>
          {isOffline(error) ? <OfflineBanner cached={false} /> : null}
          <ErrorState
            message={errorMessage(error, 'search')}
            onRetry={() => void run()}
            testID="records-error"
          />
        </Group>
      ) : null}
      {openError ? (
        <ErrorState
          message={errorMessage(openError)}
          testID="records-open-error"
        />
      ) : null}
      {busy && !result ? <LoadingState label="Searching records" /> : null}
      {result ? (
        <>
          <Button
            label="Share search"
            icon="square.and.arrow.up"
            variant="quiet"
            size="compact"
            testID="records-share"
            onPress={() =>
              void shareRecord({
                path: searchWebPath(
                  result.data.query,
                  filters,
                  result.data.page,
                  sort,
                ),
                title: `Search: ${result.data.query}`,
              }).catch(setOpenError)
            }
          />
          <Results
            result={result}
            busy={busy}
            filtered={filtered}
            sort={sort}
            onSort={(s) => {
              if (s === sort) return;
              setSort(s);
              void run(query, filters, 1, s);
            }}
            onPage={(p) => void run(query, filters, p)}
            onOpen={(p, t) => void open(p, t)}
            selectedPath={selectedPath}
            readMode={readMode}
            onRead={(mode) => {
              setReadMode(mode);
              if (mode === 'briefs') void loadBriefs();
            }}
            briefs={briefs}
            briefBusy={briefBusy}
            briefError={briefError}
            onBriefRetry={() => void loadBriefs()}
            summary={summary}
            summaryBusy={summaryBusy}
            summaryError={summaryError}
            onSummary={() => void summarise()}
            summaryAllowed={filters.kind !== 'grant'}
            onRecover={(action) => {
              const q =
                action === 'unquoted' ? query.replace(/["“”]/g, '') : query;
              const f =
                action === 'meaning'
                  ? { ...filters, mode: 'hybrid' as const }
                  : action === 'unfiltered'
                    ? {
                        ...defaultFilters,
                        kind: filters.kind,
                        mode: filters.mode,
                      }
                    : filters;
              setFilters(f);
              if (q !== query) {
                currentQuery.current = q;
                onQuery(q);
              }
              void run(q, f);
            }}
            onExample={(q) => {
              currentQuery.current = q;
              onQuery(q);
              const f = resetFilters();
              setFilters(f);
              void run(q, f);
            }}
          />
        </>
      ) : null}
    </Group>
  );
}
