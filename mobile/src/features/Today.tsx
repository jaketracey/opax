import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import type { Block, EditionView } from '../api/catalogs';
import { catalogs } from '../api/runtime';
import { RowList, Screen, Section, Text } from '../design/primitives';
import { formatDate } from '../design/format';
import { CatalogState } from './CatalogState';
import { EditionSection } from './EditionCard';
import { RecordRow } from './RecordRow';
import {
  billRoute,
  declarationsRoute,
  leadsRoute,
  moneyRoute,
} from '../navigation/routes';
import { TodayDeclaration } from './today/TodayDeclaration';
import { FollowingSection } from './follows/FollowingSection';

export default function Today() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof catalogs.today>
  > | null>(null);
  const [edition, setEdition] = useState<Block<EditionView> | null>(null);
  // CatalogState shows the initial fetch. The native control belongs to a
  // user refresh; starting it on mount moves the large-title scroll offset.
  const [refreshing, setRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    // Each block shows when it arrives; neither loader rejects.
    void Promise.all([
      catalogs.today(6, retry > 0).then((result) => {
        if (active) setData(result);
      }),
      catalogs.todayEdition(retry > 0).then((result) => {
        if (active) setEdition(result);
      }),
    ]).finally(() => {
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
      <EditionSection
        block={edition}
        onRetry={refresh}
        refreshing={refreshing}
      />
      <RecordRow
        title="Money map"
        detail="Political donations & public money map"
        onPress={() => router.push(moneyRoute())}
        testID="today-money-map"
      />
      <FollowingSection
        refresh={retry}
        refreshing={refreshing}
        onRetry={refresh}
      />
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
      {/* Static: the Leads screen loads its export when it opens. */}
      <Section title="Leads" testID="today-leads">
        <Text wordSafe>
          Where recorded contract value or party receipts concentrate, and
          companies that appear in both. Each lead keeps its caveats; a lead is
          not a finding.
        </Text>
        <RecordRow
          title="All leads"
          detail="Government contracts, party funding, companies in both"
          onPress={() => router.push(leadsRoute)}
          testID="today-leads-open"
        />
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
              <RecordRow
                title="All recent declarations"
                detail="By chamber, jurisdiction and member"
                onPress={() => router.push(declarationsRoute)}
                testID="today-declarations-all"
              />
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
