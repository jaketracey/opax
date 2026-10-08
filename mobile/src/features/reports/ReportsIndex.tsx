import { headerItems } from '../../navigation/chrome';
import { Stack } from 'expo-router';
import { reports } from '../../api/runtime';
import { RecordRow } from '../RecordRow';
import { Screen, Section, RowList, Text } from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import { formatDate } from '../../design/format';
import { ReadState, useRead } from './parts';
import { openRecord } from './open';

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
          citation="OPAX static reports index"
          testID="reports-index"
        >
          {(index) => (
            <Section title="Reports" accent="leads">
              <RowList grid>
                {index.reports.map((r) => (
                  <RecordRow
                    key={r.slug}
                    path={`/reports/${r.slug}`}
                    title={r.title}
                    detail={`${r.blurb} · Updated ${formatDate(r.updated)}`}
                    onPress={() => openRecord(`/reports/${r.slug}`, r.title)}
                    testID={`report-open-${r.slug}`}
                  />
                ))}
              </RowList>
            </Section>
          )}
        </ReadState>
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
      </Screen>
    </>
  );
}
