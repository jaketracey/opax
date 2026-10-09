import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { Block, EditionView } from '../api/catalogs';
import { catalogs } from '../api/runtime';
import {
  Button,
  RowList,
  Screen,
  Section,
  useAccessibilitySize,
  useLayout,
} from '../design/primitives';
import { rhythm } from '../design/tokens';
import { EditionSection } from './EditionCard';
import { declarationsRoute } from '../navigation/routes';
import { FollowingSection } from './follows/FollowingSection';
import { useFollows } from './follows/store';
import { BillFeed } from './today/BillFeed';
import { DeclarationRow } from './today/DeclarationRow';
import { ExploreGrid } from './today/ExploreGrid';
import { TodayFoot } from './today/Foot';
import { Masthead } from './today/Masthead';
import { Entrance } from './today/parts';
import { TodayBlock } from './today/TodayBlock';

/**
 * Today, the app's front page, in six blocks: the dated masthead; the daily
 * edition, the page's one colour moment; what changed in what you follow
 * (only when you follow something); the newest bills and the newest
 * declarations, as rows on the paper; and one tile grid of every other way
 * into the record. One source line and the independence line close the
 * page. Every block loads on its own and keeps its saved copy offline; a
 * pull to refresh revalidates all.
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
 * The front page's blocks. On compact width (every iPhone, and Android) they
 * run in one column, in the order above. On iPad regular width the page is
 * a broadsheet: the date over a bronze double rule; the edition beside a
 * rail of Following and the tile grid; then the two feeds side by side.
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
        <EditionSection block={edition} onRetry={refresh} />
      </View>
      <Following retry={retry} refreshing={refreshing} refresh={refresh} />
      <BillsSection data={data} refresh={refresh} />
      <DeclarationsSection data={data} refresh={refresh} />
      <ExploreGrid />
      <TodayFoot feeds={data} edition={edition} />
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
  // At accessibility sizes the rail and the feed columns would be narrow
  // columns of single words: everything stacks, each at the full width.
  const large = useAccessibilitySize();
  const rail = (
    <>
      <Following retry={retry} refreshing={refreshing} refresh={refresh} />
      <ExploreGrid />
    </>
  );
  return (
    <>
      <Masthead broadsheet />
      {edition?.status === 'missing' ? (
        // No edition published: the rail's blocks take the page's width.
        rail
      ) : (
        <View style={large ? styles.stack : styles.heroRow}>
          <View style={large ? null : styles.hero}>
            <EditionSection block={edition} onRetry={refresh} />
          </View>
          <View
            style={
              large
                ? styles.stack
                : [styles.rail, wide ? styles.railWide : null]
            }
          >
            {rail}
          </View>
        </View>
      )}
      <View style={large ? styles.stack : styles.columns}>
        <View style={large ? null : styles.column}>
          <BillsSection data={data} refresh={refresh} />
        </View>
        <View style={large ? null : styles.column}>
          <DeclarationsSection data={data} refresh={refresh} />
        </View>
      </View>
      <TodayFoot feeds={data} edition={edition} />
    </>
  );
}

/** Following, only when the reader follows something. */
function Following({
  retry,
  refreshing,
  refresh,
}: Pick<FrontProps, 'retry' | 'refreshing' | 'refresh'>) {
  const follows = useFollows();
  if (!follows?.length) return null;
  return (
    <FollowingSection
      refresh={retry}
      refreshing={refreshing}
      onRetry={refresh}
    />
  );
}

function BillsSection({ data, refresh }: Pick<FrontProps, 'data' | 'refresh'>) {
  return (
    <Section
      title="New in parliament"
      testID="today-bills"
      action={
        <Button
          label="All bills"
          variant="quiet"
          size="compact"
          accessibilityHint="Opens Bills"
          testID="today-bills-all"
          onPress={() => router.navigate('/bills' as Href)}
        />
      }
    >
      <TodayBlock
        block={data?.bills ?? null}
        empty="No recently introduced bills are available in this snapshot."
        onRetry={refresh}
        testID="today-bills"
      >
        {(bills) => (
          <Entrance>
            <BillFeed bills={bills} />
          </Entrance>
        )}
      </TodayBlock>
    </Section>
  );
}

function DeclarationsSection({
  data,
  refresh,
}: Pick<FrontProps, 'data' | 'refresh'>) {
  return (
    <Section
      title="Just declared"
      testID="today-declarations"
      action={
        <Button
          label="All declarations"
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
        testID="today-declarations"
        placeholder="people"
      >
        {(declarations) => (
          <Entrance>
            <RowList>
              {declarations.map((item, i) => (
                <DeclarationRow key={item.id} item={item} index={i} />
              ))}
            </RowList>
          </Entrance>
        )}
      </TodayBlock>
    </Section>
  );
}

const styles = StyleSheet.create({
  front: { gap: rhythm.heading },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.section,
  },
  hero: { flex: 3, minWidth: 0 },
  rail: { flex: 2, minWidth: 0, gap: rhythm.section },
  railWide: { flex: 1.6 },
  stack: { gap: rhythm.section },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.section,
  },
  column: { flex: 1, minWidth: 0 },
});
