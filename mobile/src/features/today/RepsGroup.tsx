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
import { DISSOLVED_STAND_IN, type Dissolved } from './dissolution';

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
 * The state row while the district's house is dissolved for an election.
 * Nobody is a member then, so the row is not a member's row: no portrait,
 * no party dot and no name as a title. Four plain lines, in this order for
 * the eye and for VoiceOver, which reads the row as one element: the
 * parliament and house, the district, that the house is dissolved for the
 * election, and who the last member was.
 */
export interface DissolvedRep {
  lines: Dissolved['lines'];
  /** The last member's profile, or the electorate. */
  href: Href;
  hint: string;
  menu: RowMenuAction[];
}

/** The four lines as one spoken label, in order. */
export function dissolvedLabel(lines: Dissolved['lines']): string {
  return `${lines.map((line) => line.replace(' · ', ', ')).join('. ')}.`;
}

/** The dissolved row's frame, shared by the row and its held place. */
function DissolvedFrame({
  lines,
  held = false,
}: {
  lines: Dissolved['lines'];
  /** The held place: the same lines, unseen, with a bar over each. */
  held?: boolean;
}) {
  const stacked = useAccessibilitySize();
  useRowInset(stacked ? 16 : 16 + 44 + rhythm.tight);
  const line = (
    index: 0 | 1 | 2 | 3,
    variant: 'name' | 'secondary',
    tone?: 'ink',
  ) => (
    <View key={index}>
      <Text
        wordSafe
        variant={variant}
        tone={tone}
        style={held ? styles.boneLine : undefined}
        testID={`today-rep-state-line-${index + 1}`}
      >
        {lines[index]}
      </Text>
      {held ? <View style={[styles.boneBar, styles.boneWide]} /> : null}
    </View>
  );
  return (
    <View style={[styles.personMain, stacked && styles.personStacked]}>
      <View style={[styles.mark, held && styles.markHeld]}>
        {held ? null : (
          <Icon name={symbols.yourMP} size={22} maxScale={1.5} tone="inkSoft" />
        )}
      </View>
      <View style={[styles.personText, !stacked && styles.personTextInline]}>
        {line(0, 'name')}
        {line(1, 'secondary', 'ink')}
        {line(2, 'secondary')}
        {line(3, 'secondary')}
      </View>
    </View>
  );
}

function DissolvedRow({ rep }: { rep: DissolvedRep }) {
  const cell = useRowCellStyle();
  return (
    <RowLink href={rep.href} menu={menuSections(rep.menu)}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={dissolvedLabel(rep.lines)}
        accessibilityHint={rep.hint}
        onPress={() => router.push(rep.href)}
        testID="today-rep-state-dissolved"
        feedback="wash"
        style={[styles.person, cell]}
      >
        <DissolvedFrame lines={rep.lines} />
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      </Pressable>
    </RowLink>
  );
}

/**
 * The dissolved row's held place: the lines the last launch kept, or the
 * stand-in sized like the longest district and member name, laid out
 * unseen in the row's own text styles so the held row wraps as the row
 * that lands on it does.
 */
function DissolvedBone({ lines }: { lines?: Dissolved['lines'] | null }) {
  const cell = useRowCellStyle();
  return (
    <View
      testID="today-rep-state-dissolved-loading"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.person, cell]}
    >
      <DissolvedFrame lines={lines ?? DISSOLVED_STAND_IN} held />
      <View style={styles.chevronHeld} />
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
  dissolved,
  link,
}: {
  reps: readonly Rep[];
  /** Drawn in a missing federal member's place. */
  vacant?: ReactNode;
  /**
   * The state row for a dissolved house, after the members; `held` while
   * the election record that decides the row's form is still on its way.
   */
  dissolved?: DissolvedRep | 'held' | null;
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
        {dissolved === 'held' ? (
          <DissolvedBone key="state" />
        ) : dissolved ? (
          <DissolvedRow key="state" rep={dissolved} />
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
  dissolved,
  link,
}: {
  rows: 1 | 2;
  /** The state row is a dissolved house's: its lines, or `true` for the stand-in. */
  dissolved?: Dissolved['lines'] | true | null;
  link: boolean;
}) {
  return (
    <InsetGroup testID="today-reps-loading-group">
      <RepBone key="federal" testID="today-rep-federal-loading" />
      {rows === 2 ? (
        dissolved ? (
          <DissolvedBone
            key="state"
            lines={dissolved === true ? null : dissolved}
          />
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
  // The chevron's place in a held row, so the lines wrap at the same width.
  chevronHeld: { width: 13 },
  bonePortrait: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
});
