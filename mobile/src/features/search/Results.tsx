import { Modal } from 'react-native';
import { useState } from 'react';
import type { RecordResult } from '../../api/client';
import type { RecordsPage, SearchSummary } from './decoders';
import {
  AsAtLine,
  BigFigure,
  ChoiceChips,
  LinkRow,
  ViewOriginal,
  Button,
  EmptyState,
  ErrorState,
  FilterChip,
  Group,
  LoadingState,
  RowList,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../../design/primitives';
import { RecordRow } from '../RecordRow';
import { Excerpt } from './Excerpt';
import { SavedCopyNotice } from '../CatalogNotice';
import {
  examples,
  filterChips,
  sorts,
  typeLabel,
  isDocumentKind,
  type SearchFilters,
  type SearchSort,
} from './contracts';
import { Choices } from './FiltersSheet';
import { useReduceMotion } from '../../design/accessibility';
import { formatCount, formatDate } from '../../design/format';

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
        <Button label="Clear all" onPress={() => onRemove('all')} />
      ) : null}
    </Group>
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
}: {
  result: RecordResult<RecordsPage>;
  busy: boolean;
  filtered: boolean;
  sort: SearchSort;
  onSort: (s: SearchSort) => void;
  onPage: (n: number) => void;
  onOpen: (path: string, title: string) => void;
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
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const reduced = useReduceMotion();
  const p = result.data;
  return (
    <Section
      title="Results"
      icon="magnifyingglass"
      accent={p.kind === 'grant' || p.kind === 'agency' ? 'money' : 'bills'}
      testID="records-results"
      info={{
        title: 'About these results',
        testID: 'records-info',
        notes: [
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
        ],
      }}
    >
      {result.stale ? <SavedCopyNotice reason={result.staleReason} /> : null}
      <BigFigure
        value={`${formatCount(filtered ? p.results.length : p.total)}${!filtered && p.truncated ? '+' : ''}`}
        label={filtered ? 'eligible records on this page' : 'matches'}
        detail={`For “${p.query}”`}
        accent={p.kind === 'grant' || p.kind === 'agency' ? 'money' : 'bills'}
        testID="records-count"
      />
      <LinkRow
        title="Sort matches"
        detail={sorts.find((s) => s.value === sort)!.label}
        onPress={() => setSortOpen(true)}
        testID="records-sort"
        disabled={busy}
      />
      {sortOpen ? (
        <Modal
          visible
          presentationStyle="pageSheet"
          animationType={reduced ? 'none' : 'slide'}
          onRequestClose={() => setSortOpen(false)}
        >
          <Screen>
            <Group accessibilityViewIsModal>
              <Choices
                label="Sort matches"
                closeLabel="Done"
                choices={sorts}
                value={sort}
                onChange={(v) => onSort(v as SearchSort)}
                onClose={() => setSortOpen(false)}
                testID="records-sort"
              />
            </Group>
          </Screen>
        </Modal>
      ) : null}
      {p.results.some((r) => r.resource) ? (
        <ChoiceChips
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
      <Button
        label="Summarise these results"
        onPress={onSummary}
        loading={summaryBusy}
        disabled={!p.results.length || !summaryAllowed}
        testID="records-summary"
      />
      {summaryError ? (
        <ErrorState
          message={errorMessage(summaryError)}
          onRetry={onSummary}
          testID="records-summary-error"
        />
      ) : null}
      {summary ? (
        <Section
          title="Cited summary"
          icon="text.quote"
          accent="bills"
          testID="records-summary-panel"
          info={{
            title: 'Cited records',
            testID: 'records-summary-info',
            notes: summary.data.sources.flatMap((s) => [
              s.title,
              ...s.evidence,
            ]),
          }}
        >
          {summary.stale ? (
            <SavedCopyNotice reason={summary.staleReason} />
          ) : null}
          {summary.data.status === 'empty' ? (
            <EmptyState message="No matching records are available for a cited summary." />
          ) : (
            <>
              <Text wordSafe variant="caption" testID="records-summary-label">
                AI summary of {summary.data.reviewed_count} matching records.
                {summary.data.partial
                  ? ' Some sources are temporarily unavailable.'
                  : ''}
              </Text>
              {summary.data.points.map((point, i) => (
                <Group key={i}>
                  <Text>{point.text}</Text>
                  {point.source_ids.map((id) => {
                    const index = summary.data.sources.findIndex(
                      (s) => s.id === id,
                    );
                    const s = summary.data.sources[index]!;
                    const n = index + 1;
                    return (
                      <LinkRow
                        key={id}
                        title={`${n}. ${s.title}`}
                        onPress={() => onOpen(s.href, s.title)}
                        testID={`records-citation-${n}`}
                      />
                    );
                  })}
                </Group>
              ))}
            </>
          )}
          <AsAtLine
            asOf={summary.asOf}
            citation="OPAX cited search summary"
            savedAt={summary.stale ? summary.savedAt : null}
          />
        </Section>
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
        <RowList>
          {p.results.map((r) => (
            <Group key={r.slug}>
              <RecordRow
                title={r.title}
                detail={[
                  typeLabel(r.kind),
                  r.dateLabel || (r.date ? formatDate(r.date, 'short') : null),
                  r.speaker,
                  r.party,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                testID={`records-result-${r.slug}`}
                onPress={() => onOpen(r.href || `/doc/${r.slug}`, r.title)}
              />
              {readMode === 'briefs' && briefs[r.resource] ? (
                <Group>
                  <Text variant="fine">Machine brief</Text>
                  <Text>{briefs[r.resource]}</Text>
                </Group>
              ) : (
                <Group>
                  {readMode === 'briefs' && r.resource ? (
                    <Text variant="fine">
                      Passage ·{' '}
                      {briefBusy
                        ? 'checking for a brief…'
                        : 'no brief available'}
                    </Text>
                  ) : null}
                  <Excerpt snippet={r.snippet} />
                </Group>
              )}
              {/automated summary/.test(r.source ?? '') ? (
                <Text variant="caption">automated summary</Text>
              ) : null}
              {r.url ? (
                <ViewOriginal
                  sources={[
                    { label: r.source || typeLabel(r.kind), url: r.url },
                  ]}
                />
              ) : null}
            </Group>
          ))}
        </RowList>
      )}
      <AsAtLine
        asOf={result.asOf}
        citation="OPAX public record search"
        savedAt={result.stale ? result.savedAt : null}
      />
      <Text testID="records-page">
        Page {p.page} of {p.page_count}
      </Text>
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
