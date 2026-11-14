import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { router } from 'expo-router';
import type { Roster, Slugs } from '../../api/catalog-decoders';
import { catalogs } from '../../api/runtime';
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
import { personRoute } from '../../navigation/routes/people';
import { SpeakerPortrait } from '../records/speaker';
import { openSource } from '../../navigation/external';
import type { SearchRecord } from './decoders';
import type { RecoveryHandlers } from './EmptyResults';
import { EmptyResults } from './EmptyResults';
import { excerptFor } from './Excerpt';
import { filtersKey, type SpeechFilters } from './filters';
import { InterestRow } from './InterestRow';
import { resultMeta, resultTitle, speechSlug, speechSpeaker } from './present';
import { failureRecovery } from './recovery';
import type { SpeechList, SpeechSort } from './speeches';
import { SummaryBlock } from './SummaryBlock';

/** Results drawn before the Summarise row, so the first is on the first screen. */
export const SUMMARY_AFTER = 3;

/** The reader for a result row, with the query for its find bar. */
export function speechRoute(row: SearchRecord, q: string) {
  const slug = speechSlug(row);
  return slug
    ? docRoute(slug, undefined, {
        q: q.replace(/\s+/g, ' ').trim(),
        find: 'auto',
      })
    : null;
}

/** A speech or record as a `RecordRow` `compact`, opening the reader. */
export function SpeechRow({
  row,
  q,
  index,
  testID,
  roster = null,
  slugs = null,
}: {
  row: SearchRecord;
  q: string;
  index: number;
  testID?: string;
  roster?: Roster | null;
  slugs?: Slugs | null;
}) {
  const route = speechRoute(row, q);
  if (row.kind === 'interest')
    return (
      <InterestRow
        row={row}
        testID={testID ?? `records-result-${index}`}
        fallback={() => {
          if (route) router.push(route);
          else if (row.url)
            return openSource(row.url, row.source || 'Original source');
        }}
      />
    );
  const speaker = speechSpeaker(row, roster, slugs);
  return (
    <RecordRow
      compact
      meta={resultMeta(row)}
      title={resultTitle(row)}
      excerpt={excerptFor(row.snippet, row.resource, q)}
      speaker={
        speaker
          ? {
              name: speaker.name,
              party: speaker.party,
              href: speaker.slug
                ? personRoute(speaker.slug, speaker.name)
                : undefined,
              portrait: speaker.slug ? (
                <SpeakerPortrait
                  key={speaker.slug}
                  name={speaker.name}
                  slug={speaker.slug}
                />
              ) : undefined,
            }
          : null
      }
      href={route ?? undefined}
      external={
        !route && row.url
          ? { url: row.url, label: row.source || 'Original source' }
          : undefined
      }
      menu={route ? 'record' : undefined}
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
  const [people, setPeople] = useState<{ roster: Roster; slugs: Slugs } | null>(
    null,
  );
  useEffect(() => {
    if (!roster) return;
    let active = true;
    void (async () => {
      try {
        const result = await catalogs.slugs();
        if (active) setPeople({ roster, slugs: result.data });
      } catch {
        // Speech links remain available if the person catalogue cannot load.
      }
    })();
    return () => {
      active = false;
    };
  }, [roster]);
  const slugs = people?.roster === roster ? people.slugs : null;
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
        message="Speeches couldn’t load."
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
          <SpeechRow
            key={row.slug}
            row={row}
            q={q}
            index={index}
            roster={roster}
            slugs={slugs}
          />
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
          <SpeechRow
            key={row.slug}
            row={row}
            q={q}
            index={index}
            roster={roster}
            slugs={slugs}
          />
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
              roster={roster}
              slugs={slugs}
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
