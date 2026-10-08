import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Block, EditionView } from '../api/catalogs';
import { catalogs } from '../api/runtime';
import {
  Button,
  Grid,
  LinkRow,
  Screen,
  Section,
  Text,
  useAccessibilitySize,
  useLayout,
} from '../design/primitives';
import { colors, hairline, rhythm, spacing } from '../design/tokens';
import { EditionSection } from './EditionCard';
import { declarationsRoute, recentRecordsRoute } from '../navigation/routes';
import { FollowingSection } from './follows/FollowingSection';
import {
  FromRecord,
  ReportsEntry,
  Spotlight,
  TodayCoverage,
} from './reports/TodayReports';
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
      column="wide"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <TodayFront
        data={data}
        edition={edition}
        retry={retry}
        refreshing={refreshing}
        refresh={refresh}
      />
    </Screen>
  );
}

interface FrontProps {
  data: Awaited<ReturnType<typeof catalogs.today>> | null;
  edition: Block<EditionView> | null;
  retry: number;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * The front page's blocks. On compact width (every iPhone) they run in one
 * column, in the order above. On iPad regular width the page is laid out as
 * a broadsheet: the masthead across the top over a bronze double rule; the
 * edition beside a rail of what you follow, public money and leads; then
 * the bills, the ways in, the reports and the declarations in columns.
 */
function TodayFront(props: FrontProps) {
  const layout = useLayout();
  return layout.regular ? (
    <TodayRegular {...props} wide={layout.wide} />
  ) : (
    <TodayCompact {...props} />
  );
}

function TodayCompact({
  data,
  edition,
  retry,
  refreshing,
  refresh,
}: FrontProps) {
  return (
    <>
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
      <PublicMoney />
      <Community />
      <ReportsEntry />
      <Explore />
      <Spotlight />
      <FromRecord />
      <TodayCoverage />
      <Section title="Recently introduced bills" testID="today-bills">
        <TodayBills data={data} refresh={refresh} refreshing={refreshing} />
      </Section>
      <JustAdded />
      <MoneyMapCard />
      {/* Static: the Leads screen loads its export when it opens. */}
      <View testID="today-leads">
        <LeadsCard />
      </View>
      <Section
        title="Recent declarations"
        testID="today-declarations"
        action={<DeclarationsAll />}
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
      <Footer />
    </>
  );
}

function TodayRegular({
  data,
  edition,
  retry,
  refreshing,
  refresh,
  wide,
}: FrontProps & { wide: boolean }) {
  // At accessibility sizes the rail would be a narrow column of single
  // words: the edition and the rail stack, each at the full width.
  const large = useAccessibilitySize();
  return (
    <>
      <Masthead broadsheet />
      <View style={large ? styles.heroStack : styles.heroRow}>
        <View style={large ? null : styles.hero}>
          <EditionSection
            block={edition}
            onRetry={refresh}
            refreshing={refreshing}
          />
        </View>
        <View
          style={
            large
              ? styles.railStack
              : [styles.rail, wide ? styles.railWide : null]
          }
        >
          <FollowingSection
            refresh={retry}
            refreshing={refreshing}
            onRetry={refresh}
          />
          <PublicMoney />
          <View testID="today-leads">
            <LeadsCard />
          </View>
          <MoneyMapCard />
        </View>
      </View>
      <Section title="Recently introduced bills" testID="today-bills">
        <TodayBills
          data={data}
          refresh={refresh}
          refreshing={refreshing}
          grid
        />
      </Section>
      <Grid
        columns={{ regular: 3, wide: 3 }}
        minItemWidth={200}
        gap={rhythm.group}
      >
        <JustAdded />
        <Community />
        <Explore />
      </Grid>
      <Grid
        columns={{ regular: 2, wide: 3 }}
        minItemWidth={300}
        gap={rhythm.group}
      >
        <Spotlight />
        <FromRecord />
        <TodayCoverage />
      </Grid>
      <ReportsEntry />
      <Section
        title="Recent declarations"
        testID="today-declarations"
        action={<DeclarationsAll />}
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
              <Grid columns={{ regular: 2, wide: 3 }} minItemWidth={300}>
                {declarations.map((item, i) => (
                  <TodayCard key={item.id} style={styles.tile}>
                    <DeclarationRow item={item} index={i} />
                  </TodayCard>
                ))}
              </Grid>
            </Entrance>
          )}
        </TodayBlock>
      </Section>
      <Footer />
    </>
  );
}

function TodayBills({
  data,
  refresh,
  refreshing,
  grid = false,
}: Pick<FrontProps, 'data' | 'refresh' | 'refreshing'> & { grid?: boolean }) {
  return (
    <TodayBlock
      block={data?.bills ?? null}
      empty="No recently introduced bills are available in this snapshot."
      onRetry={refresh}
      refreshing={refreshing}
      testID="today-bills"
    >
      {(bills) => (
        <Entrance>
          <BillCarousel bills={bills} grid={grid} />
        </Entrance>
      )}
    </TodayBlock>
  );
}

function PublicMoney() {
  return (
    <Section accent="money" testID="today-money">
      <LinkRow
        title="Public money"
        detail="Grants, contracts and agencies"
        accent="money"
        icon="banknote"
        testID="today-public-money"
        onPress={() => router.push('/public-money')}
      />
    </Section>
  );
}

function Community() {
  return (
    <Section accent="people">
      <LinkRow
        title="Community"
        detail="Questions, sources and conversations worth following"
        testID="today-community"
        onPress={() => router.push('/community/home')}
      />
    </Section>
  );
}

function Explore() {
  return (
    <Section testID="today-explore">
      <LinkRow
        title="Explore"
        detail="Play with the parliamentary record"
        testID="today-explore-open"
        onPress={() => router.push('/explore')}
      />
    </Section>
  );
}

function JustAdded() {
  return (
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
  );
}

function DeclarationsAll() {
  return (
    <Button
      label="See all"
      variant="quiet"
      size="compact"
      accessibilityHint="Opens all recent declarations"
      testID="today-declarations-all"
      onPress={() => router.push(declarationsRoute)}
    />
  );
}

function Footer() {
  return (
    <Text variant="fine" testID="today-screen-footer">
      Patterns in the public record are leads, not findings. Check the linked
      sources.
    </Text>
  );
}

const styles = StyleSheet.create({
  front: { gap: spacing.s4 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.group + rhythm.tight,
  },
  hero: { flex: 3, minWidth: 0 },
  rail: { flex: 2, minWidth: 0, gap: rhythm.group },
  railWide: { flex: 1.6 },
  heroStack: { gap: rhythm.section },
  railStack: { gap: rhythm.group },
  tile: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s1,
    flexGrow: 1,
  },
  list: { paddingHorizontal: spacing.s4, paddingVertical: spacing.s1 },
  divided: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
});
