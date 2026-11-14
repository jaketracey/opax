import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { formatCount, formatDate } from '../../design/format';
import {
  InlineError,
  InsetGroup,
  LinkRow,
  SectionHeader,
  Skeleton,
  SuggestionRow,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { reportRoute } from '../../navigation/routes/records';
import { resultsRoute } from '../../navigation/routes/search';
import { reportTypeLabel } from '../reports/report-present';
import { useSplitRow } from './split';
import {
  groupKey,
  groupRequest,
  useRead,
  type GroupPage,
  type GroupRow,
  type Read,
} from './requests';

/** Report-only catalogue search has no corpus or model read. Cache by query,
 * debounce typing, and subscribe only to the current key to avoid stale rows. */
export function useReportSearch(q: string, typing = false, enabled = true) {
  const query = q.trim();
  const key =
    enabled && query.length >= (typing ? 2 : 1)
      ? groupKey('reports', query)
      : null;
  const read = useRead<GroupPage>(key);
  useEffect(() => {
    if (!key) return;
    if (!typing) {
      void groupRequest('reports', query);
      return;
    }
    const timer = setTimeout(() => void groupRequest('reports', query), 350);
    return () => clearTimeout(timer);
  }, [key, query, typing]);
  return read;
}

export function ReportRow({
  row,
  suggestion = false,
  q = '',
  testID,
}: {
  row: GroupRow;
  suggestion?: boolean;
  q?: string;
  testID?: string;
}) {
  const href = reportRoute(row.slug, row.title);
  const split = useSplitRow(suggestion ? null : href, row.title);
  const secondary = [
    reportTypeLabel(row.report_type),
    row.body,
    row.date ? formatDate(row.date, 'short') : row.year || 'Date not published',
  ]
    .filter(Boolean)
    .join(' · ');
  return suggestion ? (
    <SuggestionRow
      symbol="doc.text"
      name={row.title}
      secondary={secondary}
      matches={q.trim() ? [q.trim()] : []}
      href={href}
      testID={testID}
    />
  ) : (
    <LinkRow
      title={row.title}
      detail={secondary}
      href={href}
      {...split}
      testID={testID}
    />
  );
}

export function ReportResults({
  q,
  read,
  suggestion = false,
  limit = 3,
}: {
  q: string;
  read: Read<GroupPage> | null;
  suggestion?: boolean;
  limit?: number;
}) {
  if (!q.trim() || (suggestion && (q.trim().length < 2 || !read))) return null;
  const prefix = suggestion
    ? 'search-suggestions-reports'
    : 'search-group-reports';
  if (read?.status === 'ready' && !read.result.data.results.length) return null;
  return (
    <View testID={prefix} style={{ gap: rhythm.heading }}>
      <SectionHeader title="Reports" level={3} />
      {!read || read.status === 'loading' ? (
        <Skeleton shape="rows" count={1} label="Searching reports" />
      ) : read.status === 'error' ? (
        <InlineError
          subject="Reports"
          message="Reports couldn’t be loaded."
          onRetry={() => void groupRequest('reports', q)}
          testID={`${prefix}-error`}
        />
      ) : (
        <InsetGroup>
          {read.result.data.results.slice(0, limit).map((row) => (
            <ReportRow
              key={row.slug}
              row={row}
              q={q}
              suggestion={suggestion}
              testID={`${prefix}-${row.slug}`}
            />
          ))}
          <LinkRow
            title={`See all ${formatCount(read.result.data.total)} reports`}
            onPress={() =>
              router.push(
                resultsRoute('reports', { group: 'reports', q: q.trim() }),
              )
            }
            testID={`${prefix}-all`}
          />
        </InsetGroup>
      )}
    </View>
  );
}
