import { headerItems } from '../../navigation/chrome';
import { Stack } from 'expo-router';
import { reports } from '../../api/runtime';
import { RecordRow } from '../RecordRow';
import {
  KeyValueList,
  Screen,
  Section,
  RowList,
  Text,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import { formatDate } from '../../design/format';
import type { ReadSource } from './parts';
import { ReadState, useRead } from './parts';
import { openRecord } from './open';

type Index = { reports: { slug: string; title: string; updated: string }[] };

/**
 * One "Updated" line for the set: the reports' shared date, or the span when
 * they differ. Each report's own date is in the line's sheet.
 */
export function indexSource(index: Index): ReadSource {
  const dates = index.reports.map((r) => r.updated);
  const days = [...new Set(dates.map((d) => formatDate(d, 'short')))];
  const sorted = [...dates].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  return {
    title: 'About the reports',
    ...(days.length > 1
      ? {
          asOf: sorted.at(-1),
          dateLabel: `Updated ${formatDate(sorted[0]!, 'short')} to ${formatDate(sorted.at(-1)!, 'short')}`,
        }
      : { asOf: sorted.at(-1) ?? null }),
    extra: (
      <KeyValueList
        items={index.reports.map((r) => ({
          label: r.title,
          value: formatDate(r.updated, 'short'),
          accessibilityLabel: `${r.title}, updated ${formatDate(r.updated)}`,
        }))}
      />
    ),
  };
}

export default function ReportsIndex() {
  const read = useRead(reports.index);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Reports',
          ...headerItems(() => [
            shareHeaderItem({ path: '/reports', title: 'Reports' }),
          ]),
        }}
      />
      <Screen column="wide" testID="reports-screen">
        <Text>
          Standing investigations across the public record. Every claim links to
          its sources.
        </Text>
        <ReadState
          read={read}
          citation="OPAX reports"
          sheet={indexSource}
          testID="reports-index"
        >
          {(index) => (
            <Section accent="leads" testID="reports-list">
              <RowList grid>
                {index.reports.map((r) => (
                  <RecordRow
                    key={r.slug}
                    path={`/reports/${r.slug}`}
                    title={r.title}
                    detail={r.blurb}
                    onPress={() => openRecord(`/reports/${r.slug}`, r.title)}
                    testID={`report-open-${r.slug}`}
                  />
                ))}
              </RowList>
            </Section>
          )}
        </ReadState>
        <Section testID="reports-more">
          <RowList>
            <RecordRow
              title="Topics A–Z"
              onPress={() => openRecord('/subject/topic', 'Topics A–Z')}
              testID="reports-topics"
            />
            <RecordRow
              title="Sources & coverage"
              onPress={() => openRecord('/stats', 'Sources & coverage')}
              testID="reports-stats"
            />
            <RecordRow
              title="Methods"
              onPress={() => openRecord('/methods', 'Methods')}
              testID="reports-methods"
            />
          </RowList>
        </Section>
      </Screen>
    </>
  );
}
