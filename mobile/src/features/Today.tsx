import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../api/runtime';
import { RowList, Screen, Section, Text } from '../design/primitives';
import { formatDate } from '../design/format';
import { CatalogState } from './CatalogState';
import { RecordRow } from './RecordRow';
import { billRoute } from '../navigation/routes';
import { TodayDeclaration } from './today/TodayDeclaration';

/** W13 seam: no edition request or card until the reviewed endpoint exists. */
export const todayEdition = { enabled: false } as const;
export default function Today() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof catalogs.today>
  > | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void catalogs
      .today(6, retry > 0)
      .then((result) => {
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const refresh = () => {
    setRefreshing(true);
    setRetry((value) => value + 1);
  };
  return (
    <Screen
      testID="today-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Text
        variant="fine"
        testID="today-screen-message"
        wordSafe
        style={{ flexShrink: 0 }}
      >
        OPAX is independent and non-partisan. It is not a government app.
      </Text>
      <Section title="Recently introduced bills" testID="today-bills">
        <CatalogState
          block={data?.bills ?? null}
          empty="No recently introduced bills are available in this snapshot."
          onRetry={refresh}
          refreshing={refreshing}
          testID="today-bills"
        >
          {(bills) => (
            <RowList>
              {bills.map((bill, i) => (
                <RecordRow
                  key={bill.key}
                  title={bill.title}
                  detail={[
                    bill.portfolio,
                    bill.introduced
                      ? `Introduced ${formatDate(bill.introduced, 'short')}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push(billRoute(bill.key))}
                  testID={`today-bill-${i}`}
                />
              ))}
            </RowList>
          )}
        </CatalogState>
      </Section>
      <Section title="Recent declarations" testID="today-declarations">
        <CatalogState
          block={data?.declarations ?? null}
          empty="No recent declarations are available in this snapshot."
          onRetry={refresh}
          refreshing={refreshing}
          testID="today-declarations"
          links={false}
        >
          {(declarations) => (
            <RowList>
              {declarations.map((item, i) => (
                <TodayDeclaration key={item.id} item={item} index={i} />
              ))}
            </RowList>
          )}
        </CatalogState>
      </Section>
      <Text variant="fine" testID="today-screen-footer">
        Patterns in the public record are leads, not findings. Check the linked
        sources.
      </Text>
    </Screen>
  );
}
