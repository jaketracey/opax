import { createContext, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Field,
  Group,
  Heading,
  Icon,
  IconTile,
  LinkRow,
  MachineLabel,
  PersonRow,
  Portrait,
  Section,
  SourceLine,
  StatusLabel,
  Text,
  type SFSymbol,
  Card,
} from '../design/primitives';
import { SelectedMark, splitRowStyles } from '../design/selection';
import { border, colors, hairline, rhythm } from '../design/tokens';
import { RecordRow } from '../features/RecordRow';
import { mastheadDate } from '../features/today/Masthead';
import type { WelcomePage } from './pages';
import { Reveal, SceneContext, noop } from './scenes';

/**
 * The tour's pictures on iPad (regular width): the app's iPad screens at
 * their real size, built from the same components (the sidebar or the top
 * tab bar, split panes, rows, sections, one source line a block, Today's
 * tiles), drawn as the screens are now (design pass 3: no kickers, no
 * uppercase, status as a StatusLabel). Like the phone's scenes they are
 * pictures: never touchable, one VoiceOver image (the stage's summary), and
 * every record in them is a sample; the stage labels them "Example". No
 * figure appears, and placeholders name roles.
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
              <Text variant="label" tone={on ? 'navy' : 'ink'}>
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

/**
 * Today's broadsheet masthead: the date in sentence case over a bronze
 * double rule. The independence line is at the foot of Today (D4).
 */
function Masthead() {
  const [date] = useState(() => mastheadDate(new Date()));
  return (
    <View style={styles.masthead}>
      <Text variant="metadata">{date}</Text>
      <View style={styles.doubleRule}>
        <View style={styles.ruleThick} />
        <View style={styles.ruleThin} />
      </View>
    </View>
  );
}

/** One of Today's new bills: its status and date, then the title. */
function BillLine({
  status,
  introduced,
  title,
}: {
  status: string;
  introduced: string;
  title: string;
}) {
  return (
    <View style={styles.billLine}>
      <View style={styles.billMeta}>
        <StatusLabel label={status} hidden />
        <Text variant="fine">{introduced}</Text>
      </View>
      <Text variant="subheading">{title}</Text>
    </View>
  );
}

/** One of Today's "Explore the record" tiles. */
function Tile({
  icon,
  title,
  detail,
}: {
  icon: SFSymbol;
  title: string;
  detail: string;
}) {
  return (
    <Card style={[styles.tile, { flexBasis: 200 * useContext(SceneScale) }]}>
      <IconTile name={icon} />
      <View style={styles.tileText}>
        <Text variant="strong">{title}</Text>
        <Text variant="metadata">{detail}</Text>
      </View>
    </Card>
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
          <View style={styles.columns}>
            <View style={[styles.columnSlot, slot]}>
              <Section title="New in parliament">
                <View style={styles.rows}>
                  <BillLine
                    status="Before Parliament"
                    introduced="Introduced 1 Jul"
                    title="Example Amendment Bill 2026"
                  />
                  <View style={styles.rowRule} />
                  <BillLine
                    status="Passed"
                    introduced="Introduced 3 Jun"
                    title="Example Bill 2026"
                  />
                </View>
              </Section>
            </View>
            <View style={[styles.columnSlot, slot]}>
              <Section title="Just declared">
                <PersonRow
                  name="Example member"
                  place="Member for Example"
                  detail="Gift · added 1 Jul"
                />
              </Section>
            </View>
          </View>
        </Reveal>
        <Reveal order={2}>
          <Section title="Explore the record">
            <View style={styles.columns}>
              <Tile
                icon="map"
                title="Money map"
                detail="Donations and public money"
              />
              <Tile
                icon="chart.bar.doc.horizontal"
                title="Reports"
                detail="Standing investigations and topics"
              />
            </View>
          </Section>
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
                  accent="people"
                  selected
                  onPress={noop}
                />
                <LinkRow
                  title="Another electorate"
                  detail="House of Representatives"
                  icon="map"
                  accent="people"
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
        <SourceLine asOf="2026-07-01" citation={citation} onPress={noop} />
      </Section>
    </View>
  );
}

/** An opened profile's head: portrait, name and seat. */
function ProfileHead() {
  return (
    <Group gap={rhythm.tight}>
      <Portrait size="profile" />
      <Heading level={1}>Example member</Heading>
      <Text variant="metadata">Member for Example</Text>
    </Group>
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
              <ProfileHead />
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

/** A bill in the Bills list: its status, title and chamber. */
function BillListItem({
  status,
  title,
  where,
  selected,
}: {
  status: string;
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
      <StatusLabel label={status} hidden />
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
                  title="Example Amendment Bill 2026"
                  where="House of Representatives"
                  selected
                />
                <View style={styles.rowRule} />
                <BillListItem
                  status="Passed"
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
                <StatusLabel label="Before Parliament" hidden />
                <Heading level={1}>Example Amendment Bill 2026</Heading>
                <Text variant="metadata">
                  Introduced 1 July 2026 · House of Representatives
                </Text>
              </Group>
            </Reveal>
            <Reveal order={3}>
              <Section title="In short" accent="bills">
                <MachineLabel explanation="Written by a model from the explanatory memorandum; not the record." />
              </Section>
            </Reveal>
            <Reveal order={4}>
              <Section title="How it moved" accent="bills">
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
                <SourceLine
                  asOf="2026-07-01"
                  citation="Parliament of Australia"
                  onPress={noop}
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
                  selected
                  onPress={noop}
                />
              </Section>
            </Reveal>
            <Reveal order={2}>
              <Section title="Electorates" accent="people">
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
          // The member the search opened, beside the suggestions: the head
          // of the profile and two of its sections.
          <>
            <Reveal order={4}>
              <ProfileHead />
            </Reveal>
            <Reveal order={5}>
              <View style={styles.blocks}>
                <ProfileBlock
                  title="Voting record"
                  accent="votes"
                  citation="They Vote For You"
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
  // The iPadOS sidebar and top tab bar are system chrome: their shapes are
  // UIKit's, not the app's.
  sidebar: {
    margin: 10,
    marginRight: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 2,
    backgroundColor: colors.raised,
    borderColor: colors.dividerSubtle,
    borderWidth: hairline,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  sidebarTop: { height: 40, justifyContent: 'center', paddingLeft: 8 },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.row,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  sidebarItemOn: { backgroundColor: colors.navyWash },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
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
    borderColor: colors.dividerSubtle,
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
    borderColor: colors.dividerSubtle,
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
  masthead: { gap: rhythm.heading },
  doubleRule: { gap: 2 },
  ruleThick: { height: border.masthead, backgroundColor: colors.bronze },
  ruleThin: { height: hairline, backgroundColor: colors.bronze },
  columns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.group,
  },
  columnSlot: { flexGrow: 1 },
  billLine: { gap: rhythm.tight, paddingVertical: rhythm.row },
  billMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  tile: { flexGrow: 1, gap: rhythm.heading },
  tileText: { gap: 2 },
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
  blocks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.group,
  },
  blockSlot: { flexGrow: 1 },
  billRow: { paddingVertical: rhythm.row, gap: rhythm.line },
  paneBar: { alignItems: 'flex-end', minHeight: 28 },
  dateRow: { flexDirection: 'row', gap: rhythm.tight },
  dateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 9,
    backgroundColor: colors.billsInk,
  },
});
