import { createContext, useContext, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  AsAtLine,
  Field,
  Group,
  Heading,
  Icon,
  IconTile,
  LinkRow,
  MachineWritten,
  PersonRow,
  Portrait,
  Section,
  SplitEmpty,
  Text,
  type SFSymbol,
} from '../design/primitives';
import { SelectedMark, splitRowStyles } from '../design/selection';
import { colors, hairline, rhythm, spacing } from '../design/tokens';
import { RecordRow } from '../features/RecordRow';
import { BillStatus } from '../features/bills/parts';
import { mastheadDate } from '../features/today/Masthead';
import { Chip, TodayCard, useTodayAccent } from '../features/today/parts';
import { billAccent } from '../features/today/tint';
import type { WelcomePage } from './pages';
import { Reveal, SceneContext, noop } from './scenes';

/**
 * The tour's pictures on iPad (regular width): the app's iPad screens at
 * their real size, built from the same components (the sidebar or the top
 * tab bar, split panes, rows, sections, Today's cards). Like the phone's
 * scenes they are pictures: never touchable, one VoiceOver image (the
 * stage's summary), and every record in them is a sample; the stage labels
 * them "Example". No figure appears, and placeholders name roles.
 *
 * A scene fills the box it is given and is cropped at the bottom, as a
 * window onto the screen would be. Below `MIN_SCENE_WIDTH`, and at larger
 * text sizes, it is laid out larger (by the text scale) and scaled down, so
 * it keeps the screen's composition rather than reflowing one word to a
 * line.
 */
export const MIN_SCENE_WIDTH = 560;
/** From this width a split scene keeps the sidebar beside it. */
const SIDEBAR_FRAME = 860;
/**
 * The text scale a scene is laid out at (1 at the default size). Scenes
 * decide by their width at the default size; fixed widths (the sidebar, the
 * list pane, card bases) grow by this, so they keep their proportions to
 * the text.
 */
const SceneScale = createContext(1);

type SectionKey = 'today' | 'your-mp' | 'bills' | 'search' | 'ask';
const sections: readonly {
  key: SectionKey;
  label: string;
  icon: SFSymbol;
  selectedIcon: SFSymbol;
}[] = [
  {
    key: 'today',
    label: 'Today',
    icon: 'newspaper',
    selectedIcon: 'newspaper.fill',
  },
  {
    key: 'your-mp',
    label: 'Your MP',
    icon: 'building.columns',
    selectedIcon: 'building.columns.fill',
  },
  {
    key: 'bills',
    label: 'Bills',
    icon: 'doc.text',
    selectedIcon: 'doc.text.fill',
  },
  {
    key: 'search',
    label: 'Search',
    icon: 'magnifyingglass',
    selectedIcon: 'magnifyingglass',
  },
  {
    key: 'ask',
    label: 'Ask',
    icon: 'text.bubble',
    selectedIcon: 'text.bubble.fill',
  },
];

/** The iPadOS sidebar, floating at the leading edge, one section selected. */
function Sidebar({ current, width }: { current: SectionKey; width: number }) {
  return (
    <View style={[styles.sidebar, { width }]}>
      <View style={styles.sidebarTop}>
        <Icon name="sidebar.left" size={20} tone="navy" />
      </View>
      {sections.map((item) => {
        const on = item.key === current;
        return (
          <View
            key={item.key}
            style={[styles.sidebarItem, on ? styles.sidebarItemOn : null]}
          >
            <Icon
              name={on ? item.selectedIcon : item.icon}
              size={20}
              tone={on ? 'navy' : 'inkSoft'}
            />
            <Text variant={on ? 'strong' : 'body'} tone={on ? 'navy' : 'ink'}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** The sidebar folded into iPadOS's top tab bar, for narrower pictures. */
function TopTabs({ current }: { current: SectionKey }) {
  return (
    <View style={styles.tabsRow}>
      <View style={styles.tabsToggle}>
        <Icon name="sidebar.left" size={20} tone="navy" />
      </View>
      <View style={styles.tabs}>
        {sections.map((item) => {
          const on = item.key === current;
          return (
            <View key={item.key} style={[styles.tab, on ? styles.tabOn : null]}>
              <Text variant="chip" tone={on ? 'navy' : 'ink'}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Frame({
  current,
  width,
  sidebar,
  children,
}: {
  current: SectionKey;
  width: number;
  sidebar: boolean;
  children: ReactNode;
}) {
  const scale = useContext(SceneScale);
  if (sidebar)
    return (
      <View style={styles.frameRow}>
        <Sidebar current={current} width={sidebarWidth(width) * scale} />
        <View style={styles.grow}>{children}</View>
      </View>
    );
  return (
    <View style={styles.frame}>
      <TopTabs current={current} />
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

const sidebarWidth = (width: number) => (width >= SIDEBAR_FRAME ? 210 : 184);

/** The list pane beside the detail pane, ruled as `SplitLayout` rules it. */
function Split({
  width,
  sidebar,
  list,
  detail,
}: {
  width: number;
  sidebar: boolean;
  list: ReactNode;
  detail: ReactNode;
}) {
  const scale = useContext(SceneScale);
  const room = width - (sidebar ? sidebarWidth(width) : 0);
  const listWidth = Math.round(
    Math.max(240, Math.min(320, room * 0.4)) * scale,
  );
  return (
    <View style={styles.split}>
      <View style={[styles.listPane, { width: listWidth }]}>{list}</View>
      <View style={styles.paneRule} />
      <View style={styles.detailPane}>{detail}</View>
    </View>
  );
}

/** Today's broadsheet masthead: the mark, the date, the independence line. */
function Masthead() {
  const [date] = useState(() =>
    mastheadDate(new Date()).toLocaleUpperCase('en-AU'),
  );
  return (
    <View style={styles.masthead}>
      <View style={styles.mastheadRow}>
        <View style={styles.brand}>
          <Image
            source={require('../../assets/splash/mark.png')}
            style={styles.mark}
          />
          <Text variant="kicker" tone="navy">
            {date}
          </Text>
        </View>
        <Text variant="fine" style={styles.mastheadLine}>
          OPAX is independent and non-partisan. It is not a government app.
        </Text>
      </View>
      <View style={styles.doubleRule}>
        <View style={styles.ruleThick} />
        <View style={styles.ruleThin} />
      </View>
    </View>
  );
}

/** One of Today's bill cards: a band and a chip in the status's colour. */
function BillCard({
  status,
  title,
  introduced,
}: {
  status: string;
  title: string;
  introduced: string;
}) {
  const tone = useTodayAccent(billAccent(status));
  return (
    <TodayCard
      style={[styles.card, { flexBasis: 200 * useContext(SceneScale) }]}
    >
      <View style={[styles.band, { backgroundColor: tone.base }]} />
      <View style={styles.cardInner}>
        <Chip
          label={status}
          ground={tone.wash}
          color={tone.ink}
          dot={tone.base}
        />
        <Text variant="strong" style={styles.cardTitle}>
          {title}
        </Text>
        <Text variant="fine">{introduced}</Text>
      </View>
    </TodayCard>
  );
}

function TodayScene({ width }: { width: number }) {
  const slot = { flexBasis: 220 * useContext(SceneScale) };
  return (
    <Frame current="today" width={width} sidebar>
      <View style={styles.content}>
        <Reveal order={0}>
          <Group gap={rhythm.heading}>
            <Text variant="title">Today</Text>
            <Masthead />
          </Group>
        </Reveal>
        <Reveal order={1}>
          <Section title="Recently introduced bills" accent="bills">
            <View style={styles.cards}>
              <BillCard
                status="Before Parliament"
                title="Example Amendment Bill 2026"
                introduced="Introduced 1 Jul"
              />
              <BillCard
                status="Passed"
                title="Example Bill 2026"
                introduced="Introduced 3 Jun"
              />
            </View>
          </Section>
        </Reveal>
        <Reveal order={2}>
          <View style={styles.cards}>
            <View style={[styles.cardSlot, slot]}>
              <Section title="Recent declarations" accent="interests">
                <TodayCard style={styles.padded}>
                  <PersonRow
                    name="Example member"
                    place="Member for Example"
                    detail="Declared 1 Jul 2026"
                  />
                </TodayCard>
              </Section>
            </View>
            <View style={[styles.cardSlot, slot]}>
              <Section title="Public money" accent="money">
                <TodayCard style={[styles.padded, styles.moneyCard]}>
                  <IconTile
                    name="point.3.connected.trianglepath.dotted"
                    accent="money"
                    size="section"
                  />
                  <View style={styles.grow}>
                    <Text variant="subheading" tone="moneyInk">
                      Money map
                    </Text>
                    <Text variant="metadata" tone="ink">
                      Political donations &amp; public money map
                    </Text>
                  </View>
                </TodayCard>
              </Section>
            </View>
          </View>
        </Reveal>
      </View>
    </Frame>
  );
}

function YourMPScene({ width }: { width: number }) {
  const sidebar = width >= SIDEBAR_FRAME;
  return (
    <Frame current="your-mp" width={width} sidebar={sidebar}>
      <Split
        width={width}
        sidebar={sidebar}
        list={
          <>
            <Reveal order={0}>
              <Field label="Electorate or member’s name" value="Example" />
            </Reveal>
            <Reveal order={1}>
              <View style={styles.rows}>
                <LinkRow
                  title="Example electorate"
                  detail="House of Representatives"
                  icon="map"
                  accent="places"
                  selected
                  onPress={noop}
                />
                <LinkRow
                  title="Another electorate"
                  detail="House of Representatives"
                  icon="map"
                  accent="places"
                  selected={false}
                  onPress={noop}
                />
              </View>
            </Reveal>
          </>
        }
        detail={
          <>
            <Reveal order={2}>
              <Group gap={rhythm.line}>
                <Text variant="kicker" tone="navy">
                  Your electorate
                </Text>
                <Heading level={1}>Example electorate</Heading>
                <Text variant="metadata">House of Representatives</Text>
              </Group>
            </Reveal>
            <Reveal order={3}>
              <Section title="Your member" accent="people">
                <PersonRow
                  name="Your member"
                  place="Member for your electorate"
                />
              </Section>
            </Reveal>
            <Reveal order={4}>
              <Section title="Your senators" accent="people">
                <PersonRow name="Your senator" place="Senator for your state" />
                <PersonRow name="Your senator" place="Senator for your state" />
              </Section>
            </Reveal>
          </>
        }
      />
    </Frame>
  );
}

/** "View original", as a record's small source link draws it. */
function ViewOriginal() {
  return (
    <View style={styles.original}>
      <Icon name="arrow.up.right.square" size={14} tone="bronzeInk" />
      <Text variant="kicker" tone="bronzeInk">
        View original
      </Text>
    </View>
  );
}

function ProfileBlock({
  title,
  accent,
  citation,
}: {
  title: string;
  accent: 'votes' | 'money' | 'interests';
  citation: string;
}) {
  return (
    <View
      style={[styles.blockSlot, { flexBasis: 200 * useContext(SceneScale) }]}
    >
      <Section title={title} accent={accent}>
        <AsAtLine asOf="2026-07-01" citation={citation} />
        <ViewOriginal />
      </Section>
    </View>
  );
}

function ProfileScene({ width }: { width: number }) {
  const sidebar = width >= SIDEBAR_FRAME;
  return (
    <Frame current="search" width={width} sidebar={sidebar}>
      <Split
        width={width}
        sidebar={sidebar}
        list={
          <>
            <Reveal order={0}>
              <Field label="Search parliamentarians by name" />
            </Reveal>
            <Reveal order={1}>
              <View style={styles.rows}>
                <Heading level={3}>Sitting</Heading>
                <PersonRow
                  name="Example member"
                  place="Member for Example"
                  selected
                  onPress={noop}
                />
                <PersonRow
                  name="Example senator"
                  place="Senator for Example"
                  selected={false}
                  onPress={noop}
                />
              </View>
            </Reveal>
          </>
        }
        detail={
          <>
            <Reveal order={2}>
              <Group gap={rhythm.tight}>
                <Portrait size="profile" />
                <Heading level={1}>Example member</Heading>
                <Text variant="metadata">Member for Example</Text>
              </Group>
            </Reveal>
            <Reveal order={3}>
              <View style={styles.blocks}>
                <ProfileBlock
                  title="Voting record"
                  accent="votes"
                  citation="They Vote For You"
                />
                <ProfileBlock
                  title="Pay for the posts held"
                  accent="money"
                  citation="Remuneration Tribunal"
                />
                <ProfileBlock
                  title="Claimed expenses"
                  accent="money"
                  citation="IPEA"
                />
                <ProfileBlock
                  title="Declared interests"
                  accent="interests"
                  citation="Register of Members’ Interests"
                />
              </View>
            </Reveal>
          </>
        }
      />
    </Frame>
  );
}

/** A bill in the Bills list: its status and date, title and chamber. */
function BillListItem({
  status,
  date,
  title,
  where,
  selected,
}: {
  status: string;
  date: string;
  title: string;
  where: string;
  selected: boolean;
}) {
  return (
    <View
      style={[
        styles.billRow,
        splitRowStyles.bleed,
        selected ? { backgroundColor: colors.billsWash } : null,
      ]}
    >
      {selected ? <SelectedMark accent="bills" /> : null}
      <BillStatus status={status} asAt={date} />
      <Text variant="strong">{title}</Text>
      <Text variant="metadata">{where}</Text>
    </View>
  );
}

function BillScene({ width }: { width: number }) {
  const sidebar = width >= SIDEBAR_FRAME;
  return (
    <Frame current="bills" width={width} sidebar={sidebar}>
      <Split
        width={width}
        sidebar={sidebar}
        list={
          <>
            <Reveal order={0}>
              <Field label="Search bills" />
            </Reveal>
            <Reveal order={1}>
              <View style={styles.rows}>
                <BillListItem
                  status="Before Parliament"
                  date="1 Jul 2026"
                  title="Example Amendment Bill 2026"
                  where="House of Representatives"
                  selected
                />
                <View style={styles.rowRule} />
                <BillListItem
                  status="Passed"
                  date="3 Jun 2026"
                  title="Example Bill 2026"
                  where="Senate"
                  selected={false}
                />
              </View>
            </Reveal>
          </>
        }
        detail={
          <>
            <Reveal order={2}>
              <Group gap={rhythm.line}>
                <View style={styles.paneBar}>
                  <Icon name="square.and.arrow.up" size={20} tone="navy" />
                </View>
                <Text variant="kicker" tone="billsInk">
                  Bill
                </Text>
                <Heading level={1}>Example Amendment Bill 2026</Heading>
                <Text variant="metadata">
                  Introduced 1 July 2026 in the House of Representatives
                </Text>
              </Group>
            </Reveal>
            <Reveal order={3}>
              <Section title="In short" accent="bills">
                <MachineWritten
                  label="Machine summary"
                  explanation="Written by a model from the explanatory memorandum; not the record."
                />
              </Section>
            </Reveal>
            <Reveal order={4}>
              <Section title="Key dates" accent="bills">
                <View style={styles.dateRow}>
                  <View style={styles.dateDot} />
                  <View style={styles.grow}>
                    <Text variant="strong">1 July 2026</Text>
                    <Text variant="metadata">Introduced</Text>
                  </View>
                </View>
              </Section>
            </Reveal>
            <Reveal order={5}>
              <Section title="Divisions" accent="votes">
                <AsAtLine
                  asOf="2026-07-01"
                  citation="Parliament of Australia"
                />
              </Section>
            </Reveal>
          </>
        }
      />
    </Frame>
  );
}

function SearchScene({ width }: { width: number }) {
  const sidebar = width >= SIDEBAR_FRAME;
  return (
    <Frame current="search" width={width} sidebar={sidebar}>
      <Split
        width={width}
        sidebar={sidebar}
        list={
          <>
            <Reveal order={0}>
              <Field label="Search people, places and bills" value="Example" />
            </Reveal>
            <Reveal order={1}>
              <Section title="People" accent="people">
                <PersonRow
                  name="Example member"
                  place="Member for Example"
                  selected={false}
                  onPress={noop}
                />
              </Section>
            </Reveal>
            <Reveal order={2}>
              <Section title="Electorates" accent="places">
                <RecordRow
                  title="Example electorate"
                  detail="Example member"
                  selected={false}
                  onPress={noop}
                />
              </Section>
            </Reveal>
            <Reveal order={3}>
              <Section title="Bills" accent="bills">
                <RecordRow
                  title="Example Amendment Bill 2026"
                  detail="Before Parliament"
                  accent="bills"
                  selected={false}
                  onPress={noop}
                />
              </Section>
            </Reveal>
          </>
        }
        detail={
          <Reveal order={4} style={styles.grow}>
            <SplitEmpty icon="magnifyingglass" title="Nothing open" />
          </Reveal>
        }
      />
    </Frame>
  );
}

const SCENES: Record<
  WelcomePage['id'],
  (props: { width: number }) => ReactNode
> = {
  about: TodayScene,
  'your-mp': YourMPScene,
  profiles: ProfileScene,
  'bills-today': BillScene,
  search: SearchScene,
};

/** The layout box and scale for a scene drawn `width` by `height`. */
export function padSceneBox(width: number, height: number, fontScale: number) {
  // The full text scale: panes and the sidebar keep their proportions, so
  // no label in the picture breaks inside a word at any text size.
  const factor = Math.max(fontScale, 1);
  const layoutWidth = Math.max(width, MIN_SCENE_WIDTH) * factor;
  const scale = width / layoutWidth;
  return { layoutWidth, layoutHeight: height / scale, scale };
}

/**
 * A page's picture, `width` by `height`: at real size where it fits,
 * otherwise laid out at `MIN_SCENE_WIDTH` (times the text scale) and scaled
 * to the box. Hidden from VoiceOver; the
 * stage around it carries the picture's summary.
 */
export function PadScene({
  page,
  width,
  height,
  fontScale,
  active,
  reduced,
}: {
  page: WelcomePage;
  width: number;
  height: number;
  fontScale: number;
  active: boolean;
  /** Null until the Reduce Motion setting is known. */
  reduced: boolean | null;
}) {
  const { layoutWidth, layoutHeight, scale } = padSceneBox(
    width,
    height,
    fontScale,
  );
  const Render = SCENES[page.id];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`tour-pad-scene-${page.id}`}
      style={[styles.box, { width, height }]}
    >
      <View
        style={{
          position: 'absolute',
          width: layoutWidth,
          height: layoutHeight,
          left: (width - layoutWidth) / 2,
          top: (height - layoutHeight) / 2,
          transform: [{ scale }],
        }}
      >
        <SceneContext value={{ active, reduced }}>
          <SceneScale value={layoutWidth / Math.max(width, MIN_SCENE_WIDTH)}>
            <Render width={Math.max(width, MIN_SCENE_WIDTH)} />
          </SceneScale>
        </SceneContext>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  grow: { flex: 1 },
  frame: { flex: 1, backgroundColor: colors.paper },
  frameRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.paper,
  },
  sidebar: {
    margin: 10,
    marginRight: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 2,
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderWidth: hairline,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  sidebarTop: { height: 40, justifyContent: 'center', paddingLeft: 8 },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3 + 2,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  sidebarItemOn: { backgroundColor: colors.navyWash },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tabsToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderWidth: hairline,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    gap: 2,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderWidth: hairline,
  },
  tab: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  tabOn: { backgroundColor: colors.navyWash },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: rhythm.block,
  },
  masthead: { gap: spacing.s3 },
  mastheadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.s4,
    rowGap: spacing.s2,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  mark: { width: 26, height: 26 },
  mastheadLine: { flexShrink: 1, textAlign: 'right' },
  doubleRule: { gap: 2 },
  ruleThick: { height: 2, backgroundColor: colors.bronze },
  ruleThin: { height: hairline, backgroundColor: colors.bronze },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.block,
  },
  cardSlot: { flexGrow: 1 },
  card: { flexGrow: 1 },
  band: { height: 4 },
  cardTitle: { flexGrow: 1 },
  cardInner: {
    flexGrow: 1,
    padding: spacing.s4,
    paddingTop: spacing.s3 + spacing.s1,
    gap: spacing.s3,
  },
  padded: { padding: spacing.s4 },
  moneyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    backgroundColor: colors.moneyWash,
  },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { paddingHorizontal: 20, paddingTop: 16, gap: rhythm.block },
  paneRule: { width: hairline, backgroundColor: colors.dividerDefault },
  detailPane: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: rhythm.block,
  },
  rows: { gap: rhythm.tight },
  rowRule: { height: hairline, backgroundColor: colors.dividerSubtle },
  original: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  blocks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.group,
  },
  blockSlot: { flexGrow: 1 },
  billRow: { paddingVertical: 10, gap: rhythm.line },
  paneBar: { alignItems: 'flex-end', minHeight: 28 },
  dateRow: { flexDirection: 'row', gap: spacing.s3 },
  dateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 9,
    backgroundColor: colors.billsInk,
  },
});
