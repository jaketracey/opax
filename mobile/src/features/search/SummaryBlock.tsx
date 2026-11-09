import { router } from 'expo-router';
import { useState } from 'react';
import type { Roster } from '../../api/catalog-decoders';
import { counted, formatDate } from '../../design/format';
import {
  Group,
  InlineError,
  InsetGroup,
  MachinePill,
  RecordRow,
  SectionHeader,
  Skeleton,
  SourceLine,
  SuggestionRow,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import type { SearchSummary } from './decoders';
import type { SpeechFilters } from './filters';
import { searchPathRoute } from './navigation';
import { resultMeta, resultTitle, savedCopy } from './present';
import { failureRecovery } from './recovery';
import { summaryKey, summaryRequest, useRead } from './requests';
import type { SpeechSort } from './speeches';

const scopeWord: Record<SpeechSort, string> = {
  relevance: 'top',
  newest: 'newest',
  oldest: 'oldest',
};
const machineNote = {
  title: 'Machine-written',
  body: [
    'A summary written by a model from the first 20 matching speeches, each point cited. It is not the record: open a cited speech to read its words.',
  ],
};

/**
 * "Summarise these speeches", the one machine feature in Speeches
 * (journeys/search.md 3.6): a row after the third result. Its tap is the
 * only thing that runs `/api/search-summary`; the summary replaces the row
 * in place.
 */
export function SummaryBlock({
  q,
  filters,
  sort,
  roster,
}: {
  q: string;
  filters: SpeechFilters;
  sort: SpeechSort;
  roster: Roster | null;
}) {
  const [asked, setAsked] = useState(false);
  const read = useRead<SearchSummary>(asked ? summaryKey(q, filters) : null);
  const run = () => {
    setAsked(true);
    void summaryRequest(q, filters, roster);
  };
  if (!asked || !read)
    return (
      <InsetGroup>
        <SuggestionRow
          symbol="sparkles"
          name="Summarise these speeches"
          onPress={run}
          testID="results-summarise"
        />
      </InsetGroup>
    );
  if (read.status === 'loading')
    return (
      <Group gap={rhythm.tight} testID="records-summary">
        <MachinePill note={machineNote} />
        <Skeleton shape="text" count={4} label="Writing a summary" />
      </Group>
    );
  if (read.status === 'error') {
    const recovery = failureRecovery(read.error, 'summary');
    return (
      <InlineError
        subject="The summary"
        message={recovery.sentence}
        onRetry={run}
        testID="records-summary-error"
      />
    );
  }
  const summary = read.result;
  if (summary.data.status === 'empty')
    return (
      <Group gap={rhythm.line}>
        <InsetGroup>
          <SuggestionRow
            symbol="sparkles"
            name="Summarise these speeches"
            testID="results-summarise"
          />
        </InsetGroup>
        <Text variant="secondary">No summary for these results.</Text>
      </Group>
    );
  const sources = summary.data.sources;
  const saved = savedCopy(summary.stale, summary.staleReason);
  return (
    <Group gap={rhythm.block} testID="records-summary">
      <MachinePill note={machineNote} testID="records-summary-machine" />
      <Text variant="secondary" testID="summary-scope-line">
        {`From the ${scopeWord[sort]} ${counted(Math.min(20, summary.data.reviewed_count || 20), 'speech', 'speeches')} for “${q.trim()}”`}
      </Text>
      {summary.data.points.map((point, index) => {
        const numbers = point.source_ids
          .map((id) => sources.findIndex((s) => s.id === id) + 1)
          .filter((n) => n > 0);
        return (
          <Text
            key={index}
            wordSafe
            accessibilityActions={numbers.map((n) => ({
              name: `citation-${n}`,
              label: `Open citation ${n}`,
            }))}
            onAccessibilityAction={(event) => {
              const n = Number(event.nativeEvent.actionName.split('-')[1]);
              const route = sources[n - 1]
                ? searchPathRoute(sources[n - 1]!.href)
                : null;
              if (route) router.push(route);
            }}
          >
            {point.text}
            {numbers.length ? (
              <Text variant="body" tone="navy">
                {' '}
                {numbers.map((n) => `[${n}]`).join('')}
              </Text>
            ) : null}
          </Text>
        );
      })}
      <Group gap={rhythm.heading}>
        <SectionHeader title={`Records cited (${sources.length})`} level={3} />
        <InsetGroup>
          {sources.map((s, index) => {
            const route = searchPathRoute(s.href);
            return (
              <RecordRow
                key={s.id}
                compact
                meta={`${index + 1}. ${resultMeta({ kind: 'speech', date: s.date })}`}
                title={resultTitle({ ...s, kind: 'speech' })}
                speaker={s.speaker ? { name: s.speaker, party: null } : null}
                href={route ?? undefined}
                testID={`records-citation-${index + 1}`}
              />
            );
          })}
        </InsetGroup>
      </Group>
      <SourceLine
        asOf={summary.asOf}
        citation="OPAX"
        dateLabel={`Written ${formatDate(summary.savedAt, 'short')}`}
        state={summary.data.partial ? 'partial' : saved.state}
        savedAt={summary.stale ? summary.savedAt : null}
        notes={[
          summary.data.partial
            ? 'Some sources were temporarily unavailable when this summary was written.'
            : null,
          saved.note,
          ...sources.map((s, i) => `${i + 1}. ${s.title}`),
        ]}
        testID="records-summary-sources"
      />
    </Group>
  );
}
