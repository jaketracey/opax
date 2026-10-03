import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import {
  ErrorState,
  Heading,
  KeyValueList,
  OpaxWebLink,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../design/primitives';
import { formatDate } from '../design/format';
import { CatalogState } from './CatalogState';
export default function RecentBill() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof catalogs.billFor>
  > | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void catalogs
      .billFor(key)
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [key, retry]);
  const refresh = () => setRetry((value) => value + 1);
  return (
    <>
      <Stack.Screen options={{ title: 'Bill source' }} />
      <Screen testID="recent-bill-screen">
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={refresh} />
        ) : (
          <CatalogState
            block={data?.data.identity ?? null}
            testID="recent-bill"
            onRetry={refresh}
            empty="This bill record is not available."
          >
            {(bill) => (
              <Section>
                <Heading level={1} testID="recent-bill-title">
                  {bill.title}
                </Heading>
                <KeyValueList
                  items={[
                    { label: 'Status', value: bill.status },
                    ...(bill.introduced
                      ? [
                          {
                            label: 'Introduced',
                            value: formatDate(bill.introduced),
                          },
                        ]
                      : []),
                  ]}
                />
                <Text variant="fine">
                  Read the bill and its progress in the source record.
                </Text>
                <OpaxWebLink
                  label="Read the bill on OPAX"
                  path={`/bill/${key}`}
                  testID="recent-bill-web"
                />
              </Section>
            )}
          </CatalogState>
        )}
      </Screen>
    </>
  );
}
