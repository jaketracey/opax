import { Modal } from 'react-native';
import { useState } from 'react';
import type { RecordResult } from '../../api/client';
import type { RecordsPage, SearchSummary } from './decoders';
import {
  AsAtLine,
  Button,
  EmptyState,
  ErrorState,
  FilterChip,
  Group,
  LoadingState,
  RowList,
  Screen,
  Section,
  SegmentedControl,
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

export function ResultFilters({
  filters,
  onRemove,
}: {
  filters: SearchFilters;
  onRemove: (id: ReturnType<typeof filterChips>[number]['id'] | 'all') => void;
}) {
  const chips = filterChips(filters);
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
    <Section title={`Results for “${p.query}”`} testID="records-results">
      {result.stale ? <SavedCopyNotice reason={result.staleReason} /> : null}
      <Text
        variant="strong"
        testID="records-count"
        accessibilityLiveRegion="polite"
      >
        {filtered
          ? `${p.results.length} eligible records on this page`
          : `${p.total.toLocaleString('en-AU')}${p.truncated ? '+' : ''} matches`}
      </Text>
      {filtered ? (
        <Text variant="fine">
          Results are limited to public records and roster parliamentarians.
          This page excludes recipient profiles and records without a reliable
          organisation classification.
        </Text>
      ) : null}
      {p.truncated ? (
        <Text variant="fine">
          The record holds more. Narrow your search to go further.
        </Text>
      ) : null}
      <Button
        label={`Sort matches: ${sorts.find((s) => s.value === sort)!.label}`}
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
      {!summaryAllowed ? (
        <Text variant="fine">
          A program-only summary is not available. The summary service also
          reviews recipient records.
        </Text>
      ) : null}
      {summaryError ? (
        <ErrorState
          message={errorMessage(summaryError)}
          onRetry={onSummary}
          testID="records-summary-error"
        />
      ) : null}
      {summary ? (
        <Section title="Cited summary" testID="records-summary-panel">
          {summary.stale ? (
            <SavedCopyNotice reason={summary.staleReason} />
          ) : null}
          {summary.data.status === 'empty' ? (
            <EmptyState message="No matching records are available for a cited summary." />
          ) : (
            <>
              <Text variant="fine" testID="records-summary-label">
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
                      <Button
                        key={id}
                        label={`Source ${n}: ${s.title}`}
                        onPress={() => onOpen(s.href, s.title)}
                        testID={`records-citation-${n}`}
                      />
                    );
                  })}
                </Group>
              ))}
              <Section title={`Sources (${summary.data.sources.length})`}>
                {summary.data.sources.map((s) => (
                  <Group key={s.id}>
                    <RecordRow
                      title={s.title}
                      onPress={() => onOpen(s.href, s.title)}
                    />
                    {s.evidence.map((quote, i) => (
                      <Text key={i}>{quote}</Text>
                    ))}
                  </Group>
                ))}
              </Section>
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
          {examples.slice(0, 6).map((q) => (
            <Button key={q} label={q} onPress={() => onExample(q)} />
          ))}
        </Group>
      ) : (
        <RowList>
          {p.results.map((r) => (
            <Group key={r.slug}>
              <RecordRow
                title={r.title}
                detail={[
                  typeLabel(r.kind),
                  r.dateLabel || r.date,
                  r.speaker,
                  r.party,
                  r.source,
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
              <AsAtLine
                asOf={r.date || null}
                citation={r.source || typeLabel(r.kind)}
              />
            </Group>
          ))}
        </RowList>
      )}
      {p.warnings.map((w) => (
        <Text variant="fine" key={w}>
          {w}
        </Text>
      ))}
      {p.coverage ? <Text variant="fine">{p.coverage}</Text> : null}
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
