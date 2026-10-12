import { StyleSheet, View, findNodeHandle } from 'react-native';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useListKeys } from '../../design/list-keys';
import type { useCursorReveal } from '../split/cursor';
import type { RecordResult } from '../../api/client';
import type { RecordsPage, SearchSummary } from './decoders';
import {
  Button,
  ChoiceChips,
  EmptyState,
  ErrorState,
  FilterChip,
  Group,
  IconButton,
  LinkRow,
  LoadingState,
  MACHINE_BRIEF_EXPLANATION,
  MachineLabel,
  RowList,
  Section,
  SegmentedControl,
  SourceLine,
  SubSection,
  Text,
  errorMessage,
  useAccessibilitySize,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { Excerpt } from './Excerpt';
import { ResultRow } from './ResultRow';
import { CountLine } from './CountLine';
import { ChoiceSheet } from './ChoiceSheet';
import {
  countLabel,
  resultKindLabel,
  resultMeta,
  resultTitle,
  savedCopy,
} from './present';
import {
  examples,
  filterChips,
  sorts,
  isDocumentKind,
  type SearchFilters,
  type SearchSort,
} from './contracts';
import { formatDate } from '../../design/format';
import { showMenu } from '../../design/menu';

/** Results drawn before the Summarise row, so the first is on the first screen. */
export const SUMMARY_AFTER = 3;

/**
 * Who holds the records on this page, each with its newest record's date
 * ("Hansard · 6 Mar 2023"): the record's own source, or the record search
 * itself only when a record names none (pass 5, P2-11).
 */
export function resultSources(
  results: readonly {
    kind: string;
    source?: string | null;
    date?: string | null;
  }[],
) {
  const newest = new Map<string, string | null>();
  for (const r of results) {
    const named = r.source && !/automated summary/i.test(r.source);
    const label = named
      ? r.source!
      : r.kind === 'speech'
        ? 'Hansard'
        : 'OPAX public record search';
    const date = /^\d{4}-\d{2}-\d{2}/.test(r.date ?? '')
      ? r.date!.slice(0, 10)
      : null;
    const seen = newest.get(label);
    newest.set(
      label,
      seen && (!date || seen > date) ? seen : (date ?? seen ?? null),
    );
  }
  if (!newest.size) return [{ label: 'OPAX public record search' }];
  return [...newest].map(([label, asOf]) => ({ label, asOf }));
}

/** The page's record dates for its source line: one date, or a range. */
export function resultDates(results: readonly { date?: string | null }[]) {
  const days = results
    .map((r) => r.date?.slice(0, 10) ?? '')
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!days.length) return undefined;
  const first = formatDate(days[0]!, 'short');
  const last = formatDate(days.at(-1)!, 'short');
  return first === last ? first : `${first} to ${last}`;
}

export function ResultFilters({
  filters,
  fixedKind = false,
  onRemove,
}: {
  filters: SearchFilters;
  fixedKind?: boolean;
  onRemove: (id: ReturnType<typeof filterChips>[number]['id'] | 'all') => void;
}) {
  const chips = filterChips(filters).filter(
    (c) => !fixedKind || (c.id !== 'kind' && c.id !== 'mode'),
  );
  if (!chips.length) return null;
  return (
    <Group>
      {chips.map((c) => (
        <FilterChip
          key={c.id}
          {...c}
          onRemove={() => onRemove(c.id)}
          testID={`search-chip-${c.id}`}
        />
      ))}
      {chips.length > 1 ? (
        <Button
          label="Clear all"
          testID="search-clear-all"
          onPress={() => onRemove('all')}
        />
      ) : null}
    </Group>
  );
}

/** Register only split results; the phone keeps its existing row tree. */
function ResultCursorRow({
  rowKey,
  reveal,
  children,
}: {
  rowKey: string;
  reveal?: ReturnType<typeof useCursorReveal>;
  children: ReactElement;
}) {
  const row = useRef<View>(null);
  const rows = reveal?.rows;
  useEffect(() => {
    if (!rows) return;
    rows.set(rowKey, row);
    return () => {
      rows.delete(rowKey);
    };
  }, [rows, rowKey]);
  return rows ? (
    <View ref={row} collapsable={false}>
      {children}
    </View>
  ) : (
    children
  );
}

/** "Summarise these records", with the label its summary will carry. */
function SummariseRow({
  onPress,
  busy,
  disabled,
  labelled,
}: {
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  /** Briefs already carry the list's one pill, so the row goes without. */
  labelled: boolean;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View style={[styles.summarise, stacked ? styles.stacked : null]}>
      <Button
        label="Summarise these records"
        variant="quiet"
        icon="text.quote"
        onPress={onPress}
        loading={busy}
        disabled={disabled}
        testID="records-summary"
      />
      {labelled ? (
        <MachineLabel
          explanation="A summary written by a model from the matching records, each point cited; not the record."
          testID="records-summary-machine"
        />
      ) : null}
    </View>
  );
}

export function Results({
  result,
  busy,
  filtered,
  sort,
  onSort,
  onPage,
  onOpen,
  onShare,
  onFilters,
  filterCount = 0,
  readMode,
  onRead,
  briefs,
  briefBusy,
  briefError,
  onBriefRetry,
  summary,
  summaryBusy,
  summaryError,
  onSummary,
  summaryAllowed,
  onRecover,
  onExample,
  selectedPath,
  cursorReveal,
}: {
  result: RecordResult<RecordsPage>;
  busy: boolean;
  filtered: boolean;
  sort: SearchSort;
  onSort: (s: SearchSort) => void;
  onPage: (n: number) => void;
  onOpen: (path: string, title: string) => void;
  /** Shares this search's web address (query, filters, page and sort). */
  onShare: () => void;
  /** Opens Filters from the count line, once the query form has collapsed. */
  onFilters?: () => void;
  /** Applied filters, said on the count line's Filters ("Filters (2)"). */
  filterCount?: number;
  readMode: 'passages' | 'briefs';
  onRead: (mode: 'passages' | 'briefs') => void;
  briefs: Record<string, string>;
  briefBusy: boolean;
  briefError: unknown;
  onBriefRetry: () => void;
  summary: RecordResult<SearchSummary> | null;
  summaryBusy: boolean;
  summaryError: unknown;
  onSummary: () => void;
  summaryAllowed: boolean;
  onRecover: (action: 'unquoted' | 'meaning' | 'unfiltered') => void;
  onExample: (q: string) => void;
  /** iPad split: whether a result is the record in the detail pane. */
  selectedPath?: (path: string) => boolean | undefined;
  cursorReveal?: ReturnType<typeof useCursorReveal>;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const more = useRef<View>(null);
  const p = result.data;
  const money = p.kind === 'grant' || p.kind === 'agency';
  const cursor = useListKeys(
    p.results.map((record) => record.slug),
    (key) => {
      const record = p.results.find((item) => item.slug === key);
      if (record) onOpen(record.href || `/doc/${record.slug}`, record.title);
    },
    (key) => cursorReveal?.reveal(key),
    !!cursorReveal,
  );
  const sortLabel = sorts.find((s) => s.value === sort)!.label;
  const briefing = readMode === 'briefs';
  const anyBrief = p.results.some((r) => briefs[r.resource]);
  const originals = p.results.flatMap((r) =>
    r.url
      ? [
          {
            label: r.source || resultKindLabel(r.kind),
            url: r.url,
            record: [resultTitle(r), r.date ? formatDate(r.date, 'short') : '']
              .filter(Boolean)
              .join(', '),
          },
        ]
      : [],
  );
  const row = (r: (typeof p.results)[number]) => {
    const brief = briefing ? briefs[r.resource] : undefined;
    const path = r.href || `/doc/${r.slug}`;
    return (
      <ResultCursorRow key={r.slug} rowKey={r.slug} reveal={cursorReveal}>
        <ResultRow
          title={resultTitle(r)}
          meta={resultMeta(r)}
          speaker={r.speaker}
          party={r.party}
          accent={money ? 'money' : 'bills'}
          testID={`records-result-${r.slug}`}
          selected={selectedPath?.(path)}
          highlighted={cursorReveal ? cursor === r.slug : undefined}
          onPress={() => onOpen(path, r.title)}
        >
          {/* In Briefs the list's one pill covers every row. */}
          {!briefing && /automated summary/.test(r.source ?? '') ? (
            <MachineLabel explanation={MACHINE_BRIEF_EXPLANATION} />
          ) : null}
          {brief ? (
            // OPAX's words in the sans; the passage is the record's.
            <Text
              wordSafe
              accessibilityLabel={`Machine-written brief: ${brief}`}
              testID={`records-brief-${r.slug}`}
            >
              {brief}
            </Text>
          ) : (
            <Excerpt
              snippet={r.snippet}
              resource={r.resource}
              query={p.query}
              prefix={briefing ? 'From the record' : undefined}
            />
          )}
        </ResultRow>
      </ResultCursorRow>
    );
  };
  // Summarise is a row under the first results, not a control above them
  // (pass 5, P1-1); its summary opens in the same place.
  const summaryBlock = (
    <>
      {summary ? null : (
        <SummariseRow
          onPress={onSummary}
          busy={summaryBusy}
          disabled={!p.results.length || !summaryAllowed}
          labelled={!(briefing && anyBrief)}
        />
      )}
      {summaryError ? (
        <ErrorState
          message={errorMessage(summaryError)}
          onRetry={onSummary}
          testID="records-summary-error"
        />
      ) : null}
      {summary ? (
        <SubSection title="Summary" testID="records-summary-panel">
          {summary.data.status === 'empty' ? (
            <EmptyState message="No matching records are available for a cited summary." />
          ) : (
            <Group>
              <MachineLabel
                explanation="A summary written by a model from the matching records, each point cited; not the record."
                testID="records-summary-label"
              />
              {summary.data.points.map((point, i) => (
                <Group key={i} gap={rhythm.tight}>
                  <Text wordSafe>{point.text}</Text>
                  <RowList>
                    {point.source_ids.map((id) => {
                      const index = summary.data.sources.findIndex(
                        (s) => s.id === id,
                      );
                      const s = summary.data.sources[index]!;
                      const n = index + 1;
                      return (
                        <LinkRow
                          key={id}
                          title={`${n}. ${resultTitle(s)}`}
                          detail={resultMeta(s)}
                          onPress={() => onOpen(s.href, s.title)}
                          testID={`records-citation-${n}`}
                        />
                      );
                    })}
                  </RowList>
                </Group>
              ))}
            </Group>
          )}
          <SourceLine
            title="About this summary"
            asOf={summary.asOf}
            citation="OPAX cited search summary"
            coverage={
              summary.data.status === 'empty'
                ? null
                : `${countLabel(summary.data.reviewed_count, ['record', 'records'])} reviewed`
            }
            state={
              summary.data.partial
                ? 'partial'
                : savedCopy(summary.stale, summary.staleReason).state
            }
            savedAt={summary.stale ? summary.savedAt : null}
            notes={[
              summary.data.partial
                ? 'Some sources were temporarily unavailable when this summary was written.'
                : null,
              savedCopy(summary.stale, summary.staleReason).note,
              ...summary.data.sources.map((s, i) =>
                [`${i + 1}. ${s.title}`, ...s.evidence].join(' '),
              ),
            ]}
            testID="records-summary-sources"
          />
        </SubSection>
      ) : null}
    </>
  );
  const first = p.results.slice(0, SUMMARY_AFTER);
  const rest = p.results.slice(SUMMARY_AFTER);
  return (
    <Section accent={money ? 'money' : 'bills'} testID="records-results">
      <CountLine
        label={
          filtered
            ? countLabel(p.results.length, [
                'eligible record on this page',
                'eligible records on this page',
              ])
            : countLabel(p.total, ['record', 'records'], p.truncated)
        }
        testID="records-count"
      >
        <Button
          label={sortLabel}
          accessibilityLabel={`Sort: ${sortLabel}`}
          variant="quiet"
          size="compact"
          trailingIcon="chevron.down"
          onPress={() => setSortOpen(true)}
          disabled={busy}
          testID="records-sort"
        />
        {onFilters ? (
          <Button
            label={filterCount ? `Filters (${filterCount})` : 'Filters'}
            variant="quiet"
            size="compact"
            onPress={onFilters}
            testID="search-filters"
          />
        ) : null}
        {/* Share lives under ⋯ (P3-14): the count line draws no glyph. */}
        <View ref={more} collapsable={false}>
          <IconButton
            symbol="ellipsis"
            accessibilityLabel="More for this search"
            onPress={() =>
              showMenu(
                `Search: ${p.query}`,
                [{ title: 'Share this search', onPress: onShare }],
                findNodeHandle(more.current) ?? undefined,
              )
            }
            testID="records-more"
          />
        </View>
      </CountLine>
      {sortOpen ? (
        <ChoiceSheet
          title="Sort matches"
          choices={sorts}
          value={sort}
          onChange={(v) => onSort(v as SearchSort)}
          onClose={() => setSortOpen(false)}
          testID="records-sort"
        />
      ) : null}
      {p.results.some((r) => r.resource) ? (
        <SegmentedControl
          segments={[
            {
              value: 'passages',
              label: 'Passages',
              testID: 'records-passages',
            },
            { value: 'briefs', label: 'Briefs', testID: 'records-briefs' },
          ]}
          value={readMode}
          onChange={onRead}
          testID="records-read-mode"
        />
      ) : null}
      {/* One pill for the whole list of briefs (P2-11). */}
      {briefing && anyBrief ? (
        <MachineLabel
          explanation={MACHINE_BRIEF_EXPLANATION}
          testID="records-brief-label"
        />
      ) : null}
      {briefBusy ? (
        <LoadingState label="Reading the available briefs…" />
      ) : null}
      {briefError ? (
        <ErrorState
          message="Briefs are temporarily unavailable. The passages remain available."
          onRetry={onBriefRetry}
        />
      ) : null}
      {!p.results.length ? (
        <Group>
          <EmptyState
            message={`Nothing in the record for “${p.query}”.`}
            testID="records-empty"
          />
          <Text>
            {p.kind === 'speech'
              ? 'No indexed speech uses that phrase. Hansard is literal: a company, a place or a person is usually named in full, and often only once.'
              : 'No matching public records were returned. Try another phrase or remove a filter.'}
          </Text>
          {/["“”]/.test(p.query) ? (
            <Button
              label="Try without the quotes"
              onPress={() => onRecover('unquoted')}
            />
          ) : null}
          {isDocumentKind(p.kind) ? (
            <Button
              label="Match by meaning too"
              onPress={() => onRecover('meaning')}
            />
          ) : null}
          <Button
            label="Search without filters"
            onPress={() => onRecover('unfiltered')}
          />
          <Text variant="strong">Try:</Text>
          <ChoiceChips
            segments={examples.slice(0, 6).map((q) => ({ value: q, label: q }))}
            value=""
            onChange={onExample}
          />
        </Group>
      ) : (
        <>
          <RowList>{first.map(row)}</RowList>
          {summaryBlock}
          {rest.length ? <RowList>{rest.map(row)}</RowList> : null}
        </>
      )}
      <SourceLine
        title="About these results"
        asOf={result.asOf}
        dateLabel={resultDates(p.results)}
        citation={resultSources(p.results)}
        savedAt={result.stale ? result.savedAt : null}
        state={savedCopy(result.stale, result.staleReason).state}
        originals={originals}
        notes={[
          savedCopy(result.stale, result.staleReason).note,
          filtered
            ? 'Results are limited to public records and roster parliamentarians. This page excludes recipient profiles and records without a reliable organisation classification.'
            : null,
          p.truncated
            ? 'The record holds more. Narrow your search to go further.'
            : null,
          !summaryAllowed
            ? 'A program-only summary is not available. The summary service also reviews recipient records.'
            : null,
          ...p.warnings,
          p.coverage,
        ]}
        testID="records-sources"
      />
      {p.page_count > 1 ? (
        <Text variant="metadata" testID="records-page">
          Page {p.page} of {p.page_count}
        </Text>
      ) : null}
      {p.page > 1 ? (
        <Button
          label="Previous results"
          onPress={() => onPage(p.page - 1)}
          disabled={busy}
          testID="records-previous"
        />
      ) : null}
      {p.page < p.page_count ? (
        <Button
          label="More results"
          onPress={() => onPage(p.page + 1)}
          disabled={busy}
          testID="records-next"
        />
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  summarise: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.heading,
  },
  stacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
});
