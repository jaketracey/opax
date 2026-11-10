import { useEffect, useRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import type { Roster } from '../../api/catalog-decoders';
import { counted } from '../../design/format';
import {
  Group,
  InlineError,
  InsetGroup,
  LinkRow,
  RecordRow,
  Skeleton,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { docRoute } from '../../navigation/routes/records';
import type { SearchRecord } from './decoders';
import type { RecoveryHandlers } from './EmptyResults';
import { EmptyResults } from './EmptyResults';
import { excerptFor } from './Excerpt';
import { filtersKey, type SpeechFilters } from './filters';
import { searchPathRoute } from './navigation';
import { resultMeta, resultTitle } from './present';
import { failureRecovery } from './recovery';
import type { SpeechList, SpeechSort } from './speeches';
import { SummaryBlock } from './SummaryBlock';

/** Results drawn before the Summarise row, so the first is on the first screen. */
export const SUMMARY_AFTER = 3;

/** The reader for a result row, with the query for its find bar. */
export function speechRoute(row: SearchRecord, q: string) {
  const slug = /^\/doc\/([^/?#]+)/.exec(row.href ?? '')?.[1];
  if (slug)
    return {
      ...docRoute(decodeURIComponent(slug)),
      params: { slug: decodeURIComponent(slug), q: q.trim() },
    };
  return row.href ? searchPathRoute(row.href) : null;
}

/** A speech or record as a `RecordRow` `compact`, opening the reader. */
export function SpeechRow({
  row,
  q,
  index,
  testID,
}: {
  row: SearchRecord;
  q: string;
  index: number;
  testID?: string;
}) {
  const slug = /^\/doc\/([^/?#]+)/.exec(row.href ?? '')?.[1];
  const route = speechRoute(row, q);
  return (
    <RecordRow
      compact
      meta={resultMeta(row)}
      title={resultTitle(row)}
      excerpt={excerptFor(row.snippet, row.resource, q)}
      speaker={
        row.speaker ? { name: row.speaker, party: row.party ?? null } : null
      }
      href={route ?? undefined}
      external={
        !route && row.url
          ? { url: row.url, label: row.source || 'Original source' }
          : undefined
      }
      menu={slug ? 'record' : undefined}
      testID={testID ?? `records-result-${index}`}
    />
  );
}

/**
 * Speeches: the record search, one paid read per page. In All it is a group
 * of three rows with "See all"; as the Speeches scope (or a pushed list) it
 * pages on tap only ("Show 20 more speeches"), with Summarise after the
 * third result and nowhere else.
 */
export function SpeechResults({
  list,
  q,
  filters,
  sort,
  roster,
  variant,
  recover,
  onRetrySources,
  announce = false,
}: {
  list: SpeechList;
  q: string;
  filters: SpeechFilters;
  sort: SpeechSort;
  roster: Roster | null;
  variant: 'group' | 'list';
  recover: RecoveryHandlers;
  /** The roster failed: speech rows wait on it (eligibility.ts). */
  onRetrySources?: () => void;
  announce?: boolean;
}) {
  const announced = useRef<{ key: string; rows: number } | null>(null);
  const noun = filters.kind !== 'speech' ? 'records' : 'speeches';
  const announcementKey = JSON.stringify([q.trim(), filtersKey(filters), sort]);
  useEffect(() => {
    if (!announce || !list.rows || list.first?.status !== 'ready') return;
    const previous = announced.current;
    if (previous?.key === announcementKey && list.rows.length <= previous.rows)
      return;
    if (previous?.key === announcementKey && list.pages > 1)
      AccessibilityInfo.announceForAccessibility(
        `${counted(list.rows.length - previous.rows, noun === 'records' ? 'more record' : 'more speech', `more ${noun}`)} loaded`,
      );
    else if (list.count)
      AccessibilityInfo.announceForAccessibility(
        `${list.count} for ${q.trim()}`,
      );
    announced.current = { key: announcementKey, rows: list.rows.length };
  }, [
    announce,
    announcementKey,
    list.first?.status,
    list.rows,
    list.count,
    list.pages,
    noun,
    q,
  ]);
  const first = list.first;
  // Speech rows are shown only for roster speakers, so they wait on the
  // roster; when it failed, say so with Try again rather than spin.
  if (first?.status === 'ready' && !list.rows && onRetrySources)
    return (
      <InlineError
        subject="Speeches"
        message="Speeches couldn't load."
        onRetry={onRetrySources}
        testID="search-speeches-error"
      />
    );
  if (
    !first ||
    first.status === 'loading' ||
    (first.status === 'ready' && !list.rows)
  )
    return (
      <Skeleton
        shape="rows"
        count={3}
        label={`Searching ${noun}`}
        testID="search-speeches-loading"
      />
    );
  if (first.status === 'error') {
    const recovery = failureRecovery(first.error, 'speeches');
    return (
      <InlineError
        subject="Speeches"
        message={recovery.sentence}
        onRetry={list.retry}
        testID="search-speeches-error"
      />
    );
  }
  const rows = list.rows ?? [];
  if (!rows.length)
    return variant === 'group' ? null : (
      <EmptyResults
        where="speeches"
        q={q}
        filters={filters}
        recover={recover}
      />
    );
  if (variant === 'group')
    return (
      <InsetGroup>
        {rows.slice(0, 3).map((row, index) => (
          <SpeechRow key={row.slug} row={row} q={q} index={index} />
        ))}
        {list.total > 3 ? (
          <LinkRow
            title={`See all ${list.count}`}
            onPress={recover.onSpeeches}
            testID="search-group-speeches-all"
          />
        ) : null}
      </InsetGroup>
    );
  const head = rows.slice(0, SUMMARY_AFTER);
  const rest = rows.slice(SUMMARY_AFTER);
  const next = list.next;
  return (
    <Group gap={rhythm.block} testID="records-results">
      <InsetGroup>
        {head.map((row, index) => (
          <SpeechRow key={row.slug} row={row} q={q} index={index} />
        ))}
      </InsetGroup>
      {head.length === SUMMARY_AFTER && filters.kind === 'speech' ? (
        <SummaryBlock q={q} filters={filters} sort={sort} roster={roster} />
      ) : null}
      {rest.length ? (
        <InsetGroup>
          {rest.map((row, index) => (
            <SpeechRow
              key={row.slug}
              row={row}
              q={q}
              index={index + SUMMARY_AFTER}
            />
          ))}
        </InsetGroup>
      ) : null}
      {next?.status === 'loading' ? (
        <Skeleton shape="rows" count={1} label={`Loading more ${noun}`} />
      ) : next?.status === 'error' ? (
        <InlineError
          subject={`More ${noun}`}
          message={failureRecovery(next.error, 'more').sentence}
          onRetry={list.retry}
          testID="results-more-error"
        />
      ) : list.more ? (
        <View>
          <InsetGroup>
            <LinkRow
              title={`Show ${counted(list.nextCount, noun === 'records' ? 'more record' : 'more speech', `more ${noun}`)}`}
              accessory="none"
              onPress={list.loadMore}
              testID="results-more"
            />
          </InsetGroup>
        </View>
      ) : null}
    </Group>
  );
}
