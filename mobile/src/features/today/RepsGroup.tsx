import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { Icon } from '../../design/icon';
import { InsetGroup } from '../../design/layout';
import { partyText, type PartyContext } from '../../design/party';
import { Pressable } from '../../design/pressable';
import { PersonRow } from '../../design/people';
import { useRowCellStyle, useRowInset } from '../../design/row-padding';
import {
  menuSections,
  RowLink,
  rowMenus,
  useRowFollow,
  type RowMenuAction,
} from '../../design/row-link';
import { LinkRow } from '../../design/rows';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import { CachedPortrait } from '../CachedPortrait';
import { MyMemberContext } from '../your-mp/MyMemberContext';

/** The heading over the group, in the Victorian election heading's style. */
export const REPS_HEADING = 'Your representatives';

/**
 * A Today section heading: the one component and token every heading on
 * the page shares ("Victorian election", "Daily edition", "Your
 * representatives"), so two headings side by side sit on one baseline.
 */
export function TodayHeading({
  children,
  testID,
}: {
  children: string;
  testID?: string;
}) {
  return (
    <Text
      wordSafe
      variant="sectionTitle"
      accessibilityRole="header"
      testID={testID}
    >
      {children}
    </Text>
  );
}

/** One representative's row, as the record gives it. */
export interface Rep {
  /** Which parliament the row is for; also its test id. */
  key: 'federal' | 'state';
  name: string;
  personId: string;
  /** Null when the profile cannot be linked. */
  slug: string | null;
  party: string | null;
  partyStatus: PartyContext['status'];
  /** The plain role line: "Federal · Maribyrnong". */
  role: string;
  /** The role as VoiceOver says it: "Federal member for Maribyrnong". */
  spokenRole: string;
  /** The profile, or the electorate when the profile cannot be linked. */
  href: Href;
  /** The seat's own actions, after the person's. */
  menu: RowMenuAction[];
}

/** "Jo Briskey, Labor, Federal member for Maribyrnong". */
export function repLabel(
  rep: Pick<Rep, 'name' | 'party' | 'partyStatus' | 'spokenRole'>,
): string {
  return [
    rep.name,
    rep.party
      ? partyText({ party: rep.party, status: rep.partyStatus }).spoken
      : null,
    rep.spokenRole,
  ]
    .filter(Boolean)
    .join(', ');
}

function RepRow({ rep }: { rep: Rep }) {
  const follow = useRowFollow('person', rep.personId, rep.name);
  return (
    <PersonRow
      name={rep.name}
      portrait={<CachedPortrait name={rep.name} slug={rep.slug ?? undefined} />}
      party={rep.party ?? undefined}
      partyStatus={rep.partyStatus}
      place={rep.role}
      href={rep.href}
      menu={menuSections([
        ...(rep.slug
          ? rowMenus.person({ slug: rep.slug, name: rep.name, ...follow })
          : []),
        ...rep.menu,
      ])}
      accessibilityLabel={repLabel(rep)}
      testID={`today-rep-${rep.key}`}
    />
  );
}

/**
 * The state row when it is not a member's row: a dissolved house (four
 * lines) or a seat whose member cannot be decided on this device (three).
 * Nobody is called the member, so the row is not styled as one: no
 * portrait, no party dot and no name as a title. Plain lines, in the same
 * order for the eye and for VoiceOver, which reads the row as one element.
 */
export interface LinesRep {
  kind: 'dissolved' | 'neutral';
  lines: readonly string[];
  /** The named person's profile, or the electorate. */
  href: Href;
  hint: string;
  menu: RowMenuAction[];
}

/** The lines as one spoken label, in order. */
export function linesLabel(lines: readonly string[]): string {
  return `${lines.map((line) => line.replace(' · ', ', ')).join('. ')}.`;
}

/** The lines row's frame, shared by the row and its held place. */
function LinesFrame({
  lines,
  held = false,
}: {
  lines: readonly string[];
  /** The held place: the same lines, unseen, with a bar over each. */
  held?: boolean;
}) {
  const stacked = useAccessibilitySize();
  useRowInset(stacked ? 16 : 16 + 44 + rhythm.tight);
  return (
    <View style={[styles.personMain, stacked && styles.personStacked]}>
      <View style={[styles.mark, held && styles.markHeld]}>
        {held ? null : (
          <Icon name={symbols.yourMP} size={22} maxScale={1.5} tone="inkSoft" />
        )}
      </View>
      <View style={[styles.personText, !stacked && styles.personTextInline]}>
        {lines.map((line, index) => (
          <View key={index}>
            <Text
              wordSafe
              variant={index === 0 ? 'name' : 'secondary'}
              tone={index === 1 ? 'ink' : undefined}
              style={held ? styles.boneLine : undefined}
              testID={`today-rep-state-line-${index + 1}`}
            >
              {line}
            </Text>
            {held ? <View style={[styles.boneBar, styles.boneWide]} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The row's chevron; unseen in a held row, so the lines wrap alike. */
function LinesChevron({ held = false }: { held?: boolean }) {
  return (
    <View style={held ? styles.boneLine : undefined}>
      <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
    </View>
  );
}

function LinesRow({ rep }: { rep: LinesRep }) {
  const cell = useRowCellStyle();
  return (
    <RowLink href={rep.href} menu={menuSections(rep.menu)}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={linesLabel(rep.lines)}
        accessibilityHint={rep.hint}
        onPress={() => router.push(rep.href)}
        testID={`today-rep-state-${rep.kind}`}
        feedback="wash"
        style={[styles.person, cell]}
      >
        <LinesFrame lines={rep.lines} />
        <LinesChevron />
      </Pressable>
    </RowLink>
  );
}

/**
 * A lines row's held place: the lines the last launch kept, or a stand-in
 * sized like the longest district and member name, laid out unseen in the
 * row's own text styles (and beside the row's own chevron) so the held row
 * wraps as the row that lands on it does.
 */
function LinesBone({ lines }: { lines: readonly string[] }) {
  const cell = useRowCellStyle();
  return (
    <View
      testID="today-rep-state-lines-loading"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.person, cell]}
    >
      <LinesFrame lines={lines} held />
      <LinesChevron held />
    </View>
  );
}

/** A quiet link row under the members (the state's senators), or none. */
export interface RepsLink {
  title: string;
  href: Href;
}

/**
 * The reader's representatives as one grouped card: a row for each member
 * (the federal MP, then the state lower-house member when the record has
 * one) and at most one link row under them. Every row has the same anatomy
 * and the same treatment, whatever the party. No row carries the "Your MP"
 * mark: the heading over the group says whose they are.
 */
export function RepsRows({
  reps,
  vacant,
  lines,
  link,
}: {
  reps: readonly Rep[];
  /** Drawn in a missing federal member's place. */
  vacant?: ReactNode;
  /**
   * The state row when it is not a member's, after the members: the row,
   * or the lines that hold its place while the election record that
   * decides its form is still on its way.
   */
  lines?: LinesRep | { held: readonly string[] } | null;
  link?: RepsLink | null;
}) {
  return (
    // Null, not the reader's member: a row never adds the mark itself.
    <MyMemberContext.Provider value={null}>
      <InsetGroup testID="today-reps-group">
        {vacant}
        {reps.map((rep) => (
          <RepRow key={rep.key} rep={rep} />
        ))}
        {lines && 'held' in lines ? (
          <LinesBone key="state" lines={lines.held} />
        ) : lines ? (
          <LinesRow key="state" rep={lines} />
        ) : null}
        {link ? (
          <LinkRow
            key="senators"
            title={link.title}
            href={link.href}
            testID="today-reps-senators"
          />
        ) : null}
      </InsetGroup>
    </MyMemberContext.Provider>
  );
}

/**
 * One line of a row while it loads: an unseen line of the real text style,
 * so the line is as tall as the loaded one at every text size, with a bar
 * drawn inside it.
 */
export function Bone({
  variant,
  width,
  testID,
}: {
  variant: 'name' | 'secondary' | 'body' | 'sectionTitle';
  width: `${number}%`;
  testID?: string;
}) {
  return (
    <View testID={testID}>
      <Text variant={variant} numberOfLines={1} style={styles.boneLine}>
        {' '}
      </Text>
      <View style={[styles.boneBar, { width }]} />
    </View>
  );
}

/**
 * A member's row while the directory is read, in the row's own frame: the
 * 44 pt portrait, the name, and the party and role lines in their text
 * styles, in the space PersonRow gives them. The loaded row lands on it.
 */
function RepBone({ testID }: { testID: string }) {
  const stacked = useAccessibilitySize();
  const cell = useRowCellStyle();
  useRowInset(stacked ? 16 : 16 + 44 + rhythm.tight);
  return (
    <View testID={testID} style={[styles.person, cell]}>
      <View style={[styles.personMain, stacked && styles.personStacked]}>
        <View style={styles.bonePortrait} />
        <View style={[styles.personText, !stacked && styles.personTextInline]}>
          <Bone variant="name" width="55%" />
          <View style={styles.personDetails}>
            <Bone variant="secondary" width="30%" />
            <Bone variant="secondary" width="65%" />
          </View>
        </View>
      </View>
    </View>
  );
}

/** The link row's place: one body line in a row's frame. */
function LinkBone() {
  const cell = useRowCellStyle();
  return (
    <View testID="today-reps-loading-senators" style={[styles.link, cell]}>
      <View style={styles.linkText}>
        <Bone variant="body" width="50%" />
      </View>
    </View>
  );
}

/**
 * The group while the directory is read: as many member rows as the loaded
 * group will draw, and the link row when it will draw one. The counts come
 * from what the device already holds, so no row is added later.
 */
export function RepsBones({
  rows,
  lines,
  link,
}: {
  rows: 1 | 2;
  /** The state row is a lines row: the lines that hold its place. */
  lines?: readonly string[] | null;
  link: boolean;
}) {
  return (
    <InsetGroup testID="today-reps-loading-group">
      <RepBone key="federal" testID="today-rep-federal-loading" />
      {rows === 2 ? (
        lines ? (
          <LinesBone key="state" lines={lines} />
        ) : (
          <RepBone key="state" testID="today-rep-state-loading" />
        )
      ) : null}
      {link ? <LinkBone key="senators" /> : null}
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  // PersonRow's frame (design/people), so a bone row has a loaded row's box.
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  personMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.heading,
  },
  personStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  personText: { gap: rhythm.line, alignSelf: 'stretch' },
  personTextInline: { flex: 1 },
  // The party line keeps its 44 pt target; the role line sits inside it.
  personDetails: { gap: rhythm.line, minHeight: minimumTarget },
  // LinkRow's frame (design/rows).
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  linkText: { flex: 1 },
  // The unseen text sets the height, the bar sits in it.
  boneLine: { opacity: 0 },
  boneBar: {
    position: 'absolute',
    left: 0,
    top: 3,
    bottom: 3,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  // The bar covers the whole line's width in a held dissolved row.
  boneWide: { right: 0 },
  // Where a member's portrait would be: the building mark, so the lines
  // start where the names above them do.
  mark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markHeld: {
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  bonePortrait: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
});
