import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/errors';
import {
  decodeReportTranscripts,
  type ReportTranscripts,
  type TranscriptDay,
} from '../../api/report-decoders';
import { recordClient } from '../../api/runtime';
import { Group } from '../../design/primitives';
import { useLoadingAnnouncement } from '../../design/states';
import { formatCount, formatDate } from '../../design/format';
import { Disclosure, Link, RuleGroup, Text } from './report-ui';

export const transcriptTitle = 'Hearing transcripts: evidence, not findings';
export function transcriptMonths(items: TranscriptDay[]) {
  const groups = new Map<string, TranscriptDay[]>();
  for (const item of [...items].sort((a, b) =>
    b.hearing_date.localeCompare(a.hearing_date),
  )) {
    const month = item.hearing_date.slice(0, 7);
    const group = groups.get(month) || [];
    group.push(item);
    groups.set(month, group);
  }
  return [...groups].map(([month, rows]) => ({ month, rows }));
}
/** Page only on request, using the existing public client and origin policy. */
export async function readTranscriptPage(
  slug: string,
  offset: number,
  signal?: AbortSignal,
  previous?: ReportTranscripts,
) {
  const result = await recordClient.get(
    `/api/report/${slug}/transcripts?offset=${offset}`,
    (value) => decodeReportTranscripts(value, offset, previous),
    false,
    { signal, retries: 0 },
  );
  return result.data;
}
export function HearingTranscripts({
  slug,
  summary,
  onMissing,
}: {
  slug: string;
  summary: ReportTranscripts;
  onMissing: () => void;
}) {
  const [page, setPage] = useState(summary);
  const [loading, setLoading] = useState(false);
  useLoadingAnnouncement(loading ? 'Loading hearing days' : null);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const load = async () => {
    if (request.current || page.next_offset === null) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const more = await readTranscriptPage(
        slug,
        page.next_offset,
        controller.signal,
        summary,
      );
      if (controller.signal.aborted) return;
      if (
        more.items.some((row) =>
          page.items.some((item) => item.id === row.id),
        ) ||
        page.items.length + more.items.length > summary.count ||
        !more.items.length
      )
        throw new ApiError(
          'invalid-data',
          'The transcript page does not match this record.',
        );
      setPage({ ...more, items: [...page.items, ...more.items] });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (
        error instanceof ApiError &&
        (error.code === 'not-found' || error.code === 'invalid-data')
      )
        onMissing();
      else setFailed(true);
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  const groups = transcriptMonths(page.items);
  return (
    <Group testID="report-transcripts">
      <Text>{`${formatCount(summary.count)} hearing ${summary.count === 1 ? 'transcript' : 'transcripts'}${summary.first_date && summary.last_date ? ` · ${formatDate(summary.first_date)} to ${formatDate(summary.last_date)}` : ''}`}</Text>
      {groups.map((group, index) => {
        const label = formatDate(`${group.month}-01`).replace(/^1 /, '');
        const days = new Map<string, TranscriptDay[]>();
        for (const row of group.rows)
          days.set(row.hearing_date, [
            ...(days.get(row.hearing_date) || []),
            row,
          ]);
        const rows = [...days].map(([day, entries]) => (
          <RuleGroup key={day} testID={`report-hearing-day-${day}`}>
            {entries.map((row) => (
              <Group key={row.id}>
                <Text>{`${formatDate(row.hearing_date, 'short')} · ${row.title || row.case}`}</Text>
                <Link
                  title={`Transcript PDF${row.pages ? `, ${formatCount(row.pages)} ${row.pages === 1 ? 'page' : 'pages'}` : ''}, ${new URL(row.url).hostname}`}
                  accessibilityLabel={`Transcript PDF${row.pages ? `, ${formatCount(row.pages)} ${row.pages === 1 ? 'page' : 'pages'}` : ''}, ${new URL(row.url).hostname}, ${formatDate(row.hearing_date)}, ${row.title || row.case}`}
                  url={row.url}
                  testID={`report-transcript-${row.id}`}
                />
                {row.page_url ? (
                  <Link
                    title={`Publisher’s hearing page, ${new URL(row.page_url).hostname}`}
                    accessibilityLabel={`Publisher’s hearing page, ${new URL(row.page_url).hostname}, ${formatDate(row.hearing_date)}, ${row.case || row.title}`}
                    url={row.page_url}
                    testID={`report-transcript-page-${row.id}`}
                  />
                ) : null}
                {row.publisher_redacted ? (
                  <Text variant="secondary">Redacted by the publisher.</Text>
                ) : null}
                {row.notes.map((note, i) => (
                  <Text key={i} selectable variant="secondary">
                    {note}
                  </Text>
                ))}
                {row.orders.map((url, i) => (
                  <Link
                    key={i}
                    title="Order"
                    accessibilityLabel={`Order ${i + 1}, ${new URL(url).hostname}, ${formatDate(row.hearing_date)}, ${row.case || row.title}`}
                    url={url}
                    testID={`report-transcript-order-${row.id}-${i}`}
                  />
                ))}
              </Group>
            ))}
          </RuleGroup>
        ));
        return (
          <Disclosure
            key={group.month}
            id={`transcript-month-${group.month}`}
            title={`${label} (${group.rows.length})`}
            initiallyOpen={index === 0}
          >
            {rows}
          </Disclosure>
        );
      })}
      {page.next_offset !== null ? (
        loading ? (
          <Text
            accessibilityRole="progressbar"
            accessibilityLiveRegion="polite"
          >
            Loading hearing days
          </Text>
        ) : (
          <Link
            title={
              failed ? 'Retry loading hearing days' : 'Load more hearing days'
            }
            onPress={() => void load()}
            testID="report-transcripts-more"
          />
        )
      ) : null}
    </Group>
  );
}
