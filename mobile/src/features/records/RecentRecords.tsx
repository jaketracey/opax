import { headerItems } from '../../navigation/chrome';
import { useCallback } from 'react';
import { Stack, router } from 'expo-router';
import {
  LinkRow,
  RowList,
  Section,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  SourceLine,
  errorMessage,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
import { docRoute } from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { records } from './runtime';
import { useRead } from './useRead';
import { ReaderList } from './ReaderList';
export default function RecentRecords() {
  const load = useCallback(() => records.recent(), []);
  const { value, error, retry } = useRead(load);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Just added',
          headerTitle: '',
          ...headerItems(() => [
            shareHeaderItem({
              path: '/',
              anchor: 'hp-indexed-title',
              title: 'Just added to the record',
            }),
          ]),
        }}
      />
      <ReaderList
        testID="recent-records"
        parts={[]}
        header={
          <>
            <Heading level={1}>Just added to the record</Heading>
            <Section title="New in OPAX" accent="bills" rule={false}>
              {error ? (
                <ErrorState
                  message={errorMessage(error)}
                  onRetry={retry}
                  testID="recent-error"
                />
              ) : !value ? (
                <LoadingState label="Loading new records" />
              ) : value.data.length ? (
                <RowList>
                  {value.data.map((row, index) => (
                    <LinkRow
                      key={row.slug}
                      dragPath={`/doc/${row.slug}`}
                      title={row.title}
                      detail={
                        row.indexed
                          ? `Added ${formatDate(row.indexed, 'short')}`
                          : 'Date added not recorded'
                      }
                      onPress={() => router.push(docRoute(row.slug))}
                      testID={`recent-record-${index}`}
                    />
                  ))}
                </RowList>
              ) : (
                <EmptyState message="No new records yet." />
              )}
              {value ? (
                <SourceLine
                  title="About dates added"
                  asOf={
                    value.data
                      .map((row) => row.indexed ?? '')
                      .filter(Boolean)
                      .sort()
                      .at(-1) ?? null
                  }
                  citation="OPAX record index"
                  notes={[
                    'Records added recently. The date is when the record was added to OPAX, not when it was published.',
                  ]}
                  testID="recent-source"
                />
              ) : null}
            </Section>
          </>
        }
      />
    </>
  );
}
