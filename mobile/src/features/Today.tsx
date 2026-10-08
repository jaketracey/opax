import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Block, EditionView } from '../api/catalogs';
import { catalogs } from '../api/runtime';
import { Button, LinkRow, Screen, Section, Text } from '../design/primitives';
import { colors, hairline, spacing } from '../design/tokens';
import { EditionSection } from './EditionCard';
import { declarationsRoute, recentRecordsRoute } from '../navigation/routes';
import { FollowingSection } from './follows/FollowingSection';
import { FromRecord, ReportsEntry, Spotlight, TodayCoverage } from './reports/TodayReports';
import { BillCarousel } from './today/BillCarousel';
import { DeclarationRow } from './today/DeclarationRow';
import { LeadsCard } from './today/LeadsCard';
import { MoneyMapCard } from './today/MoneyMapCard';
import { Masthead } from './today/Masthead';
import { Entrance, TodayCard } from './today/parts';
import { TodayBlock } from './today/TodayBlock';

/**
 * Today, the app's front page: the dated masthead, the daily edition as its
 * hero, what changed in what you follow, recently introduced bills, the way
 * into Leads, and the newest register declarations. Every block loads on its
 * own and keeps its saved copy offline; a pull to refresh revalidates all.
 */
export default function Today() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof catalogs.today>
  > | null>(null);
  const [edition, setEdition] = useState<Block<EditionView> | null>(null);
  // TodayBlock shows the initial fetch. The native control belongs to a
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
      <View style={styles.front}>
        <Masthead />
        <EditionSection
          block={edition}
          onRetry={refresh}
          refreshing={refreshing}
        />
      </View>
      <FollowingSection
        refresh={retry}
        refreshing={refreshing}
        onRetry={refresh}
      />
      <Section accent="money" icon="banknote" testID="today-money">
        <LinkRow title="Public money" detail="Grants, contracts and agencies" accent="money" icon="banknote" testID="today-public-money" onPress={() => router.push('/public-money')} />
      </Section>
      <ReportsEntry />
      <Section testID="today-explore">
        <LinkRow title="Explore" detail="Play with the parliamentary record" testID="today-explore-open" onPress={() => router.push('/explore')} />
      </Section>
      <Spotlight />
      <FromRecord />
      <TodayCoverage />
      <Section title="Recently introduced bills" testID="today-bills">
        <TodayBlock
          block={data?.bills ?? null}
          empty="No recently introduced bills are available in this snapshot."
          onRetry={refresh}
          refreshing={refreshing}
          testID="today-bills"
        >
          {(bills) => (
            <Entrance>
              <BillCarousel bills={bills} />
            </Entrance>
          )}
        </TodayBlock>
      </Section>
      <Section testID="today-records">
        <LinkRow
          title="Just added to the record"
          detail="Newly indexed records"
          icon="tray.full"
          accent="bills"
          onPress={() => router.push(recentRecordsRoute)}
          testID="today-records-open"
        />
      </Section>
      <MoneyMapCard />
      {/* Static: the Leads screen loads its export when it opens. */}
      <View testID="today-leads">
        <LeadsCard />
      </View>
      <Section
        title="Recent declarations"
        testID="today-declarations"
        action={
          <Button
            label="See all"
            variant="quiet"
            size="compact"
            accessibilityHint="Opens all recent declarations"
            testID="today-declarations-all"
            onPress={() => router.push(declarationsRoute)}
          />
        }
      >
        <TodayBlock
          block={data?.declarations ?? null}
          empty="No recent declarations are available in this snapshot."
          onRetry={refresh}
          refreshing={refreshing}
          testID="today-declarations"
          placeholder="people"
        >
          {(declarations) => (
            <Entrance>
              <TodayCard style={styles.list}>
                {declarations.map((item, i) => (
                  <View key={item.id} style={i > 0 ? styles.divided : null}>
                    <DeclarationRow item={item} index={i} />
                  </View>
                ))}
              </TodayCard>
            </Entrance>
          )}
        </TodayBlock>
      </Section>
      <Text variant="fine" testID="today-screen-footer">
        Patterns in the public record are leads, not findings. Check the linked
        sources.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  front: { gap: spacing.s4 },
  list: { paddingHorizontal: spacing.s4, paddingVertical: spacing.s1 },
  divided: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
});
