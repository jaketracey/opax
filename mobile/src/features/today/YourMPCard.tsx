import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { useAccessibilitySize } from '../../design/accessibility';
import { Card } from '../../design/card';
import { Icon } from '../../design/icon';
import { InsetGroup } from '../../design/layout';
import { partyText, type PartyContext } from '../../design/party';
import {
  PartyLabel,
  PersonRow,
  Portrait,
  YourMPMark,
} from '../../design/people';
import {
  RowLink,
  rowMenus,
  useRowFollow,
  type RowMenuAction,
} from '../../design/row-link';
import { SourceLine, type SourceCitation } from '../../design/source';
import { InlineError, LoadingStatus, Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm, textStyles } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import {
  electorateRoute,
  personRoute,
  seatRoute,
} from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { CachedPortrait } from '../CachedPortrait';
import { newcomerOption } from '../newcomer/option';
import { Gloss, TermTip } from '../newcomer/TermTip';
import { useFaceURIs } from '../your-mp/FaceStackRow';
import { officialPageFor, type OfficialPage } from '../your-mp/MemberHeroRow';
import {
  representativeProfile,
  type Directory,
  type YourMPView,
} from '../your-mp/model';
import { stateInRunningCopy } from '../your-mp/state-names';
import { isRegion } from '../your-mp/StateMembers';
import type { SydneyDate } from './rules';
import { oldestDate } from './sources';

type Load<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

/**
 * One read for the tile, keyed by what it reads, so a new seat never shows
 * the old seat's data; a pull to refresh keeps the drawn answer until the
 * next arrives.
 */
function useLoad<T>(
  key: string | null,
  load: () => Promise<T>,
  attempt: number,
): Load<T> {
  const [state, setState] = useState<{ key: string; value: Load<T> } | null>(
    null,
  );
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (!key) return;
    let active = true;
    loader
      .current()
      .then((data) => {
        if (active) setState({ key, value: { status: 'ready', data } });
      })
      .catch(() => {
        if (active)
          setState((shown) =>
            shown?.key === key && shown.value.status === 'ready'
              ? shown
              : { key, value: { status: 'error' } },
          );
      });
    return () => {
      active = false;
    };
  }, [key, attempt]);
  return state?.key === key && key ? state.value : { status: 'loading' };
}

/**
 * The state seat's header: the seat's name and its state, one link that
 * pushes the electorate page inside Today. Touch and hold: Change
 * electorate, Share.
 */
function SeatHeader({
  seat,
  subtitle,
  label,
  testID,
}: {
  seat: Electorate;
  subtitle: string;
  label: string;
  testID: string;
}) {
  const href = electorateRoute(seat.electorate_id, undefined, seat.name);
  const menu: RowMenuAction[] = [
    {
      title: 'Change electorate',
      symbol: 'building.columns',
      onPress: () =>
        router.push(
          seat.jurisdiction === 'federal' ? seatRoute() : seatRoute('vic'),
        ),
    },
    {
      title: 'Share',
      symbol: 'square.and.arrow.up',
      onPress: () => void shareRecord({ title: seat.name, path: seat.url }),
    },
  ];
  return (
    <RowLink href={href} menu={menu}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens the electorate."
        testID={testID}
        onPress={() => router.push(href)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerWords}>
          <Text wordSafe variant="sectionTitle">
            {seat.name}
          </Text>
          <Text wordSafe variant="secondary">
            {subtitle}
          </Text>
        </View>
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      </Pressable>
    </RowLink>
  );
}

/** The tile's skeleton in its final shape: one person and the line. */
export function YourMPSkeleton() {
  return (
    // One element for VoiceOver, read once; the shapes inside keep the
    // tile's layout.
    <LoadingStatus
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your MP"
      accessibilityState={{ busy: true }}
      testID="today-your-mp-loading"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.block}
      >
        <Skeleton shape="people" count={1} label="Loading your MP" />
        <Skeleton shape="text" count={1} label="Loading your MP" />
      </View>
    </LoadingStatus>
  );
}

/**
 * The tile's one plain line: what this person is to the reader, in words a
 * newcomer knows. It comes from the saved seat alone (a federal House of
 * Representatives electorate), so it is true of whoever holds the seat and
 * needs no extra read. Any other kind of seat gets no line rather than a
 * wrong one.
 */
export function yourMPHook(
  seat: Pick<Electorate, 'jurisdiction' | 'chamber'>,
): string | null {
  return seat.jurisdiction === 'federal' && seat.chamber === 'representatives'
    ? 'Represents you in federal parliament'
    : null;
}

/**
 * What VoiceOver says for the tile, built from the record: "Your MP, Jo
 * Briskey, Labor, Maribyrnong. Represents you in federal parliament." The
 * hint says what a tap opens.
 */
export function yourMPLabel({
  name,
  party,
  electorate,
  hook,
}: {
  name: string;
  party: string | null;
  electorate: string;
  hook: string | null;
}): string {
  const identity = ['Your MP', name, party, electorate]
    .filter(Boolean)
    .join(', ');
  return hook ? `${identity}. ${hook}.` : `${identity}.`;
}

/** The tile never grows past a card's reading width (iPad, one column). */
export const TILE_MAX_WIDTH = 560;

/**
 * Your MP on Today: one compact tile a newcomer can read. The portrait, the
 * name, the party and the electorate, then one plain line saying why this
 * person matters to the reader. The whole tile opens the profile, where the
 * votes, declared interests and bills live; none of them draw on Today.
 * Touch and hold: Follow, Share, the electorate and Change electorate.
 */
export function YourMPCard({
  seat,
  directory,
  stateSeatIds,
  attempt,
  onRetry,
}: {
  seat: Electorate;
  directory: Directory;
  stateSeatIds: readonly string[];
  attempt: number;
  onRetry: () => void;
}) {
  const seatKey = `${seat.electorate_id}|${stateSeatIds.join(',')}`;
  const view = useLoad<YourMPView>(
    seatKey,
    () => catalogs.yourMP(seat.electorate_id, [...stateSeatIds]),
    attempt,
  );
  return (
    <View testID="today-your-mp" style={styles.tileColumn}>
      {view.status === 'error' ? (
        <InlineError
          subject="Your MP"
          message="Your MP couldn’t be loaded."
          onRetry={onRetry}
          testID="today-your-mp-error"
        />
      ) : view.status === 'loading' ? (
        <YourMPSkeleton />
      ) : (
        <View style={styles.block}>
          <YourMPTile seat={seat} directory={directory} view={view.data} />
          {/* Newcomer design pass (prototype): outside the tile's one tap
              target. B: the term's question; C: one plain line. */}
          {newcomerOption() === 'b' ? (
            <TermTip term="mp" variant="link" />
          ) : (
            <Gloss term="mp" />
          )}
          <SourceLine
            {...yourMPSources(view.data)}
            testID="today-your-mp-sources"
          />
        </View>
      )}
    </View>
  );
}

/** The seat's own actions, shared by every form of the tile. */
function seatActions(seat: Electorate, linked: boolean): RowMenuAction[] {
  return [
    ...(linked
      ? [
          {
            title: `Open ${seat.name}`,
            symbol: symbols.electorate,
            onPress: () =>
              router.push(
                electorateRoute(seat.electorate_id, undefined, seat.name),
              ),
          },
        ]
      : []),
    {
      title: 'Change electorate',
      symbol: symbols.yourMP,
      onPress: () => router.push(seatRoute()),
    },
  ];
}

function YourMPTile({
  seat,
  directory,
  view,
}: {
  seat: Electorate;
  directory: Directory;
  view: YourMPView;
}) {
  const member = view.members.data?.length === 1 ? view.members.data[0]! : null;
  if (!member) return <VacantTile seat={seat} />;
  const identity = representativeProfile(member.person_id, directory);
  const person = directory.people.data.people.find(
    (p) => p.person_id === member.person_id,
  );
  return (
    <MemberTile
      seat={seat}
      name={member.person.name}
      personId={member.person_id}
      slug={identity?.slug ?? null}
      party={identity?.party ?? member.party ?? null}
      partyStatus={identity?.partyStatus ?? 'current'}
      official={officialPageFor(person?.source_url, seat.jurisdiction)}
    />
  );
}

/**
 * The member's tile. One element: the whole tile opens the profile (the
 * electorate when the profile cannot be linked, so the tile always leads
 * somewhere). The name is a link label, never a heading.
 */
function MemberTile({
  seat,
  name,
  personId,
  slug,
  party,
  partyStatus,
  official,
}: {
  seat: Electorate;
  name: string;
  personId: string;
  slug: string | null;
  party: string | null;
  partyStatus: PartyContext['status'];
  official: OfficialPage | null;
}) {
  const stacked = useAccessibilitySize();
  const follow = useRowFollow('person', personId, name);
  const [face] = useFaceURIs([{ name, slug: slug ?? undefined }], 1);
  const hook = yourMPHook(seat);
  const context = party ? { party, status: partyStatus } : null;
  const menu: RowMenuAction[] = [
    ...(slug ? rowMenus.person({ slug, name, ...follow }) : []),
    ...(official
      ? [
          {
            title: official.label,
            symbol: 'arrow.up.right.square' as const,
            onPress: () => void openSource(official.url, official.label),
          },
        ]
      : []),
    ...seatActions(seat, !!slug),
  ];
  return (
    <Card
      href={
        slug
          ? personRoute(slug, name)
          : electorateRoute(seat.electorate_id, undefined, seat.name)
      }
      zoom={!!slug}
      menu={menu}
      accessibilityLabel={yourMPLabel({
        name,
        party: context ? partyText(context).spoken : null,
        electorate: seat.name,
        hook,
      })}
      accessibilityHint={slug ? 'Opens the profile' : 'Opens the electorate'}
      accessibilityActions={[
        ...(slug
          ? [
              {
                name: 'follow',
                label: follow.following ? 'Unfollow' : 'Follow',
                onAction: follow.onFollow,
              },
              {
                name: 'electorate',
                label: `Open ${seat.name}`,
                onAction: () =>
                  router.push(
                    electorateRoute(seat.electorate_id, undefined, seat.name),
                  ),
              },
            ]
          : []),
        {
          name: 'change',
          label: 'Change electorate',
          onAction: () => router.push(seatRoute()),
        },
      ]}
      testID="today-your-mp-member"
    >
      <View style={styles.tile}>
        <View style={[styles.tileMain, stacked && styles.tileStacked]}>
          <Portrait
            size={56}
            localURI={face ?? undefined}
            name={name}
            nameBeside
            testID="today-your-mp-portrait"
          />
          <View style={[styles.tileWords, !stacked && styles.tileWordsInline]}>
            <YourMPMark testID="today-your-mp-mark" />
            <View style={styles.tileTitle}>
              <Text
                wordSafe
                variant="subsectionTitle"
                accessibilityRole="text"
                style={styles.tileHeading}
                testID="today-your-mp-name"
              >
                {name}
              </Text>
              <TileChevron />
            </View>
            <View
              style={[styles.tileIdentity, stacked && styles.tileIdentityStack]}
            >
              {context ? (
                <PartyLabel
                  {...context}
                  linked={false}
                  nested
                  compact
                  testID="today-your-mp-party"
                />
              ) : null}
              <Text wordSafe variant="secondary" testID="today-your-mp-seat">
                {context && !stacked ? `· ${seat.name}` : seat.name}
              </Text>
            </View>
            {hook ? (
              <Text
                wordSafe
                variant="secondary"
                tone="ink"
                style={styles.tileHook}
                testID="today-your-mp-hook"
              >
                {hook}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * The tile's chevron sits on the name's line (as design Tile does), so the
 * lines under the name run the tile's full width and the plain line fits
 * one line on a phone at Large.
 */
function TileChevron() {
  return (
    <View style={styles.tileChevron}>
      <Icon
        name={symbols.chevron}
        size={13}
        maxScale={1.5}
        tone="inkFaint"
        weight="semibold"
      />
    </View>
  );
}

/** A seat with no recorded member: the tile says so and opens the electorate. */
function VacantTile({ seat }: { seat: Electorate }) {
  const stacked = useAccessibilitySize();
  const none = 'No member is recorded for this seat yet.';
  return (
    <Card
      href={electorateRoute(seat.electorate_id, undefined, seat.name)}
      menu={seatActions(seat, false)}
      accessibilityLabel={`Your electorate, ${seat.name}. ${none}`}
      accessibilityHint="Opens the electorate"
      accessibilityActions={[
        {
          name: 'change',
          label: 'Change electorate',
          onAction: () => router.push(seatRoute()),
        },
      ]}
      testID="today-your-mp-vacant"
    >
      <View style={styles.tile}>
        <View style={[styles.tileMain, stacked && styles.tileStacked]}>
          <Portrait size={56} nameBeside />
          <View style={[styles.tileWords, !stacked && styles.tileWordsInline]}>
            <Text wordSafe variant="footnote">
              Your electorate
            </Text>
            <View style={styles.tileTitle}>
              <Text
                wordSafe
                variant="subsectionTitle"
                accessibilityRole="text"
                style={styles.tileHeading}
                testID="today-your-mp-seat"
              >
                {seat.name}
              </Text>
              <TileChevron />
            </View>
            <Text wordSafe variant="secondary" testID="today-your-mp-none">
              {none}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * The tile's line: the parliament roster, which gives the member's name,
 * party and seat. Nothing else draws on the tile, so nothing else is cited.
 */
export function yourMPSources(view: YourMPView) {
  const roster = view.members;
  const originals = roster.sources.map((s) => ({ ...s, asOf: roster.asAt }));
  const citation: SourceCitation[] = [
    {
      label: originals[0]?.label ?? 'Parliament of Australia',
      asOf: oldestDate([roster.asAt]),
    },
  ];
  return {
    asOf: oldestDate([roster.asAt]),
    citation,
    originals,
    notes: [
      'Your member, their party and their seat from the parliament roster.',
    ],
    savedAt: roster.stale ? (roster.savedAt ?? null) : null,
    state: roster.stale
      ? ('saved' as const)
      : roster.partial
        ? ('partial' as const)
        : null,
  };
}

/**
 * The Victorian Parliament is dissolved from 3 November 2026 (today.md
 * 5.4). Until the roster carries a dated election-timetable record from the
 * VEC, Today draws no state seat card for a Victorian seat from the
 * dissolution, so OPAX never calls anyone the member of a dissolved house.
 * Remove this window when the timetable record ships.
 */
export const VIC_DISSOLVED_FROM = '2026-11-03';

/** Whether Today may draw the state seat card on this Sydney date. */
export function stateSeatShown(
  seat: Pick<Electorate, 'jurisdiction' | 'state_code'>,
  today: SydneyDate,
): boolean {
  const vic =
    seat.jurisdiction === 'vic' || seat.state_code.toLowerCase() === 'vic';
  return !(vic && today >= VIC_DISSOLVED_FROM);
}

/**
 * The state seat Today draws for the reader's saved state seats, or null:
 * the first district (never a region) the directory knows, while
 * `stateSeatShown` allows it. Callers lay out by it, so a card that draws
 * nothing never holds an empty grid cell.
 */
export function stateSeatFor(
  directory: Directory,
  stateSeatIds: readonly string[],
  today: SydneyDate,
): Electorate | null {
  const seat =
    stateSeatIds
      .map((id) =>
        directory.electorates.data.electorates.find(
          (s) => s.electorate_id === id,
        ),
      )
      .find((s): s is Electorate => !!s && !isRegion(s)) ?? null;
  return seat && stateSeatShown(seat, today) ? seat : null;
}

/**
 * The state seat (today.md 5.4): its header, one inset group with the
 * district member's row (no Latest) and the state roster's line. No
 * authorisation line and no campaign content on Today.
 */
export function StateSeatCard({
  directory,
  stateSeatIds,
  today,
}: {
  directory: Directory;
  stateSeatIds: readonly string[];
  today: SydneyDate;
}) {
  const seat = useMemo(
    () => stateSeatFor(directory, stateSeatIds, today),
    [directory, stateSeatIds, today],
  );
  if (!seat) return null;
  const state = stateInRunningCopy(seat.state_code);
  const member =
    seat.representatives.length === 1 &&
    seat.representation_status === 'verified'
      ? seat.representatives[0]!
      : null;
  const profile = member
    ? representativeProfile(member.person_id, directory)
    : null;
  return (
    <View testID="today-state-seat" style={styles.section}>
      <SeatHeader
        seat={seat}
        subtitle={`${state} · state electorate`}
        label={`${seat.name}, ${state} state electorate`}
        testID="today-state-seat-header"
      />
      <View style={styles.block}>
        <InsetGroup>
          {member ? (
            <PersonRow
              name={member.person.name}
              portrait={
                <CachedPortrait
                  name={member.person.name}
                  slug={profile?.slug}
                />
              }
              party={profile?.party ?? member.party ?? undefined}
              href={
                profile
                  ? personRoute(profile.slug, member.person.name)
                  : undefined
              }
              menu={profile ? 'person' : []}
              testID="today-state-member"
            />
          ) : (
            <Text wordSafe testID="today-state-member" style={styles.none}>
              No member is recorded for this seat yet.
            </Text>
          )}
        </InsetGroup>
        <SourceLine
          asOf={seat.representation_as_of}
          citation="Parliament of Victoria"
          originals={[
            {
              label: seat.name,
              url: seat.url,
              asOf: seat.representation_as_of,
            },
          ]}
          testID="today-state-sources"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Seat header to its group: heading (8).
  section: { gap: rhythm.heading },
  // The group to its line: group (24).
  block: { gap: rhythm.group },
  // Capped so one column never stretches the tile (iPad, a Duo at AX sizes).
  tileColumn: { width: '100%', maxWidth: TILE_MAX_WIDTH },
  tile: { flexDirection: 'row', alignItems: 'center' },
  tileTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  tileHeading: { flex: 1 },
  // The name's line height, so the chevron centres on its first line.
  tileChevron: {
    height: textStyles.subsectionTitle.lineHeight,
    justifyContent: 'center',
  },
  tileMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.block,
  },
  tileStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  tileWords: { gap: rhythm.line, alignSelf: 'stretch' },
  tileWordsInline: { flex: 1, alignSelf: 'center' },
  tileIdentity: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.line,
  },
  tileIdentityStack: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  // The hook sits a step under the identity, as the tile's own sentence.
  tileHook: { marginTop: rhythm.line },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
  },
  headerWords: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
  none: { padding: rhythm.block, color: colors.ink },
});
