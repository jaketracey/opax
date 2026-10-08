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
            <Section
              title="Newly indexed"
              accent="bills"
              rule={false}
              info={{
                title: 'About indexed dates',
                notes: [
                  'Newly indexed records. The indexed date is when the record entered OPAX, rather than when it was published.',
                ],
                testID: 'recent-info',
              }}
            >
              {error ? (
                <ErrorState
                  message={errorMessage(error)}
                  onRetry={retry}
                  testID="recent-error"
                />
              ) : !value ? (
                <LoadingState label="Loading newly indexed records" />
              ) : value.data.length ? (
                <RowList>
                  {value.data.map((row, index) => (
                    <LinkRow
                      key={row.slug}
                      title={row.title}
                      detail={
                        row.indexed
                          ? `Indexed ${formatDate(row.indexed, 'short')}`
                          : 'Indexed date not published'
                      }
                      onPress={() => router.push(docRoute(row.slug))}
                      testID={`recent-record-${index}`}
                    />
                  ))}
                </RowList>
              ) : (
                <EmptyState message="No newly indexed records are available." />
              )}
            </Section>
          </>
        }
      />
    </>
  );
}
