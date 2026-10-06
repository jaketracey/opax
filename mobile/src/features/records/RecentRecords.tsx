import { useCallback } from 'react';
import { Stack, router } from 'expo-router';
import {
  AsAtLine,
  Button,
  Group,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Text,
  errorMessage,
} from '../../design/primitives';
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
          unstable_headerRightItems: () => [
            shareHeaderItem({
              path: '/',
              anchor: 'hp-indexed-title',
              title: 'Just added to the record',
            }),
          ],
        }}
      />
      <ReaderList
        testID="recent-records"
        parts={[]}
        header={
          <>
            <Heading level={1}>Just added to the record</Heading>
            <Text variant="fine">
              Newly indexed records. The indexed date is when the record entered
              OPAX, rather than when it was published.
            </Text>
            {error ? (
              <ErrorState
                message={errorMessage(error)}
                onRetry={retry}
                testID="recent-error"
              />
            ) : !value ? (
              <LoadingState label="Loading newly indexed records" />
            ) : value.data.length ? (
              value.data.map((row, index) => (
                <Group key={row.slug}>
                  <Button
                    label={row.title}
                    onPress={() => router.push(docRoute(row.slug))}
                    testID={`recent-record-${index}`}
                  />
                  <AsAtLine
                    asOf={row.indexed}
                    citation="OPAX index · indexed date"
                  />
                </Group>
              ))
            ) : (
              <EmptyState message="No newly indexed records are available." />
            )}
          </>
        }
      />
    </>
  );
}
