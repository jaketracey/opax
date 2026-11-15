import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { yourMPFromDirectory, type Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { Icon } from '../../design/icon';
import { chamberName } from '../../design/parliament';
import { RowLink, type RowMenuAction } from '../../design/row-link';
import { LinkRow } from '../../design/rows';
import { SourceLine, type SourceCitation } from '../../design/source';
import { InlineError, LoadingStatus } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import {
  electorateRoute,
  membersRoute,
  personRoute,
  seatRoute,
} from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { officialPageFor } from '../your-mp/MemberHeroRow';
import {
  representativeProfile,
  type Directory,
  type YourMPView,
} from '../your-mp/model';
import { senateSeatFor } from '../your-mp/RepresentativesGroup';
import { stateInRunningCopy } from '../your-mp/state-names';
import { isRegion } from '../your-mp/StateMembers';
import {
  REPS_HEADING,
  RepsBones,
  RepsRows,
  TodayHeading,
  type Rep,
  type RepsLink,
} from './RepsGroup';
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
  /** What is already at hand for this key: drawn until the read answers. */
  held?: T,
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
  if (state?.key === key && key) return state.value;
  return held !== undefined ? { status: 'ready', data: held } : LOADING;
}
const LOADING = { status: 'loading' } as const;

/**
 * A seat's header (the state seat card, and Your MP when its roster fails):
 * the seat's name and its state, one link that pushes the electorate page
 * inside Today. Touch and hold: Change electorate, Share.
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

/** The source line's band while the group loads: its touch height. */
function SourceBone() {
  return (
    <View testID="today-reps-loading-source" style={styles.boneSource}>
      <View style={styles.boneSourceBar} />
    </View>
  );
}

/**
 * The representatives' place while the directory is still being read: the
 * heading, as many rows as the loaded group will draw, and the source
 * line's band. `state` and `senators` come from what the device already
 * holds (the saved choice and the shape store), so the group has its final
 * height on the first frame and no row is added later. Its own id, so a
 * journey waiting on `today-your-mp` waits for the group, not its place.
 */
export function YourMPPending({
  state = false,
  senators = true,
}: {
  /** The state member's row will draw. */
  state?: boolean;
  /** The senators link row will draw. */
  senators?: boolean;
}) {
  return (
    <View testID="today-your-mp-pending" style={styles.section}>
      <TodayHeading testID="today-reps-heading">{REPS_HEADING}</TodayHeading>
      {/* One element for VoiceOver, read once; the shapes keep the layout. */}
      <LoadingStatus
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your representatives"
        accessibilityState={{ busy: true }}
        testID="today-your-mp-loading"
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.block}
        >
          <RepsBones rows={state ? 2 : 1} link={senators} />
          <SourceBone />
        </View>
      </LoadingStatus>
    </View>
  );
}

/**
 * The Victorian Legislative Assembly is dissolved from 3 November 2026 for
 * the 28 November election, so no one is the member for a Victorian
 * district until the new roster is in. From that date the state row names
 * the person who last held the seat, in those words, so OPAX never calls
 * anyone the member of a dissolved house. Remove this window when the
 * roster carries the members elected on 28 November.
 */
export const VIC_DISSOLVED_FROM = '2026-11-03';

/** Whether the state seat's house sits on this Sydney date. */
export function stateHouseSits(
  seat: Pick<Electorate, 'jurisdiction' | 'state_code'>,
  today: SydneyDate,
): boolean {
  const vic =
    seat.jurisdiction === 'vic' || seat.state_code.toLowerCase() === 'vic';
  return !(vic && today >= VIC_DISSOLVED_FROM);
}

/**
 * The state seat whose member Today draws for the reader's saved state
 * seats, or null: the first lower-house district (never a region) the
 * directory knows, and only when the roster records exactly one verified
 * member for it. A seat with no recorded member draws no row: the group
 * shows the federal member alone, never a placeholder.
 */
export function stateSeatFor(
  directory: Directory,
  stateSeatIds: readonly string[],
): Electorate | null {
  const seat =
    stateSeatIds
      .map((id) =>
        directory.electorates.data.electorates.find(
          (s) => s.electorate_id === id,
        ),
      )
      .find((s): s is Electorate => !!s && !isRegion(s)) ?? null;
  return seat &&
    seat.representatives.length === 1 &&
    seat.representation_status === 'verified'
    ? seat
    : null;
}

/** The role lines of a federal House seat, as drawn and as spoken. */
export function federalRole(seat: Pick<Electorate, 'name'>) {
  return {
    role: `Federal · ${seat.name}`,
    spokenRole: `Federal member for ${seat.name}`,
  };
}

/**
 * The role lines of a state lower-house seat: "Victorian Legislative
 * Assembly · Essendon". While the house is dissolved the line says who
 * last held the seat, as the election pages do.
 */
export function stateRole(
  seat: Pick<Electorate, 'name' | 'chamber' | 'jurisdiction' | 'state_code'>,
  today: SydneyDate,
) {
  const house =
    chamberName(seat.chamber, seat.jurisdiction) ??
    `${stateInRunningCopy(seat.state_code)} Parliament`;
  return stateHouseSits(seat, today)
    ? {
        role: `${house} · ${seat.name}`,
        spokenRole: `${house} member for ${seat.name}`,
      }
    : {
        role: `${house} · last held ${seat.name}`,
        spokenRole: `last held ${seat.name} in the ${house}`,
      };
}

/**
 * What the device keeps of the group's shape for the next launch
 * (shape-store): whether the state row and the senators row draw.
 */
export function repsShape(
  home: Electorate,
  directory: Directory,
  stateSeatIds: readonly string[],
): { state: boolean; senators: boolean } {
  return {
    state: !!stateSeatFor(directory, stateSeatIds),
    senators: !!senatorsLink(home, directory),
  };
}

/**
 * The one quiet row for the upper house: the existing list of the state's
 * senators. Senators get no rows of their own on Today.
 */
function senatorsLink(home: Electorate, directory: Directory): RepsLink | null {
  const senate = senateSeatFor(home, directory);
  return senate && senate.representatives.length
    ? {
        title: `Senators for ${stateInRunningCopy(home.state_code)}`,
        href: membersRoute(senate.electorate_id),
      }
    : null;
}

/**
 * Your representatives on Today: one heading, one grouped card and one
 * source line. The card has a row for the federal member and, when the
 * device has a saved state district whose member the roster records, a row
 * for the state lower-house member; then one link to the state's senators.
 * Each member's row opens their profile. Touch and hold: Follow, Share, the
 * electorate and Change electorate.
 */
export function YourMPCard({
  seat,
  directory,
  stateSeatIds,
  today,
  attempt,
  onRetry,
}: {
  seat: Electorate;
  directory: Directory;
  stateSeatIds: readonly string[];
  today: SydneyDate;
  attempt: number;
  onRetry: () => void;
}) {
  const seatKey = `${seat.electorate_id}|${stateSeatIds.join(',')}`;
  // The directory Today already holds answers the group at once: the read
  // below asks the same directory again, so its answer lands on rows
  // already drawn and no skeleton stands in for them.
  const held = useMemo(() => {
    try {
      return yourMPFromDirectory(directory, seat.electorate_id, stateSeatIds);
    } catch {
      return undefined;
    }
    // Keyed by the seats' ids: the list itself is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, seatKey]);
  const view = useLoad<YourMPView>(
    seatKey,
    () => catalogs.yourMP(seat.electorate_id, [...stateSeatIds]),
    attempt,
    held,
  );
  const shape = repsShape(seat, directory, stateSeatIds);
  if (view.status === 'loading')
    return (
      <View testID="today-your-mp">
        <YourMPPending {...shape} />
      </View>
    );
  if (view.status === 'error')
    return (
      <View testID="today-your-mp" style={styles.section}>
        <TodayHeading testID="today-reps-heading">{REPS_HEADING}</TodayHeading>
        <YourMPError seat={seat} onRetry={onRetry} />
      </View>
    );
  const stateSeat = stateSeatFor(directory, stateSeatIds);
  const federal = federalRep(seat, directory, view.data);
  const state = stateSeat ? stateRep(stateSeat, directory, today) : null;
  return (
    <View testID="today-your-mp" style={styles.section}>
      <TodayHeading testID="today-reps-heading">{REPS_HEADING}</TodayHeading>
      <View style={styles.block}>
        <RepsRows
          reps={[federal, state].filter((rep): rep is Rep => !!rep)}
          vacant={federal ? null : <VacantRow key="vacant" seat={seat} />}
          link={senatorsLink(seat, directory)}
        />
        <SourceLine
          {...yourMPSources(view.data, state ? stateSeat : null)}
          testID="today-your-mp-sources"
        />
      </View>
    </View>
  );
}

/**
 * The roster could not be read: the seat still shows, as a header, so the
 * reader keeps its name, the electorate link and Change electorate on
 * touch and hold.
 */
function YourMPError({
  seat,
  onRetry,
}: {
  seat: Electorate;
  onRetry: () => void;
}) {
  const state = stateInRunningCopy(seat.state_code);
  return (
    <View style={styles.section}>
      <SeatHeader
        seat={seat}
        subtitle={state}
        label={`${seat.name}, ${state}`}
        testID="today-your-mp-error-seat"
      />
      <InlineError
        subject="Your representatives"
        message="Your representatives couldn’t be loaded."
        onRetry={onRetry}
        testID="today-your-mp-error"
      />
    </View>
  );
}

/** The federal member the group draws: one recorded member, or none. */
function recordedMember(view: YourMPView) {
  return view.members.data?.length === 1 ? view.members.data[0]! : null;
}

/** A seat's own actions, after the person's, on touch and hold. */
function seatActions(seat: Electorate, linked: boolean): RowMenuAction[] {
  const federal = seat.jurisdiction === 'federal';
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
    ...(federal
      ? [
          {
            title: 'Change electorate',
            symbol: symbols.yourMP,
            onPress: () => router.push(seatRoute()),
          },
        ]
      : // Only a Victorian state electorate can be chosen on the device.
        seat.jurisdiction === 'vic'
        ? [
            {
              title: 'Change state electorate',
              symbol: symbols.yourMP,
              onPress: () => router.push(seatRoute('vic')),
            },
          ]
        : []),
  ];
}

/** The federal member's row, or null when the seat records no one member. */
function federalRep(
  seat: Electorate,
  directory: Directory,
  view: YourMPView,
): Rep | null {
  const member = recordedMember(view);
  if (!member) return null;
  const identity = representativeProfile(member.person_id, directory);
  const person = directory.people.data.people.find(
    (p) => p.person_id === member.person_id,
  );
  const official = officialPageFor(person?.source_url, seat.jurisdiction);
  const slug = identity?.slug ?? null;
  const name = member.person.name;
  return {
    key: 'federal',
    name,
    personId: member.person_id,
    slug,
    party: identity?.party ?? member.party ?? null,
    partyStatus: identity?.partyStatus ?? 'current',
    ...federalRole(seat),
    // The row always leads somewhere: the electorate when the profile
    // cannot be linked.
    href: slug
      ? personRoute(slug, name)
      : electorateRoute(seat.electorate_id, undefined, seat.name),
    menu: [
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
    ],
  };
}

/** The state member's row, from the seat `stateSeatFor` answered. */
function stateRep(
  seat: Electorate,
  directory: Directory,
  today: SydneyDate,
): Rep {
  const member = seat.representatives[0]!;
  const identity = representativeProfile(member.person_id, directory);
  const slug = identity?.slug ?? null;
  const name = member.person.name;
  return {
    key: 'state',
    name,
    personId: member.person_id,
    slug,
    party: identity?.party ?? member.party ?? null,
    partyStatus: identity?.partyStatus ?? 'current',
    ...stateRole(seat, today),
    href: slug
      ? personRoute(slug, name)
      : electorateRoute(seat.electorate_id, undefined, seat.name),
    menu: seatActions(seat, !!slug),
  };
}

/** A federal seat with no recorded member: the row says so and opens it. */
function VacantRow({ seat }: { seat: Electorate }) {
  const none = 'No member is recorded for this seat yet.';
  return (
    <LinkRow
      title={seat.name}
      titleRole="strong"
      detail={none}
      href={electorateRoute(seat.electorate_id, undefined, seat.name)}
      menu={seatActions(seat, false)}
      accessibilityLabel={`Your federal electorate, ${seat.name}. ${none}`}
      accessibilityHint="Opens the electorate"
      testID="today-your-mp-vacant"
    />
  );
}

/**
 * The group's line names each source it used: the parliament roster for
 * the federal member, and the state parliament's roster when the state
 * member's row draws. Nothing else draws in the group, so nothing else is
 * cited. The notes name the members' details, so each is there only when
 * its row is.
 */
export function yourMPSources(view: YourMPView, stateSeat?: Electorate | null) {
  const roster = view.members;
  const state = stateSeat
    ? {
        label: `Parliament of ${stateInRunningCopy(stateSeat.state_code)}`,
        asOf: stateSeat.representation_as_of ?? null,
      }
    : null;
  const citation: SourceCitation[] = [
    {
      label: roster.sources[0]?.label ?? 'Parliament of Australia',
      asOf: oldestDate([roster.asAt]),
    },
    ...(state ? [state] : []),
  ];
  return {
    asOf: oldestDate([roster.asAt, state?.asOf]),
    citation,
    originals: [
      ...roster.sources.map((s) => ({ ...s, asOf: roster.asAt })),
      ...(stateSeat
        ? [
            {
              label: stateSeat.name,
              url: stateSeat.url,
              asOf: stateSeat.representation_as_of,
            },
          ]
        : []),
    ],
    notes: [
      recordedMember(view)
        ? 'Your federal member, their party and their seat from the parliament roster.'
        : null,
      stateSeat
        ? 'Your state member, their party and their district from the state parliament’s roster.'
        : null,
    ].filter((note): note is string => !!note),
    savedAt: roster.stale ? (roster.savedAt ?? null) : null,
    state: roster.stale
      ? ('saved' as const)
      : roster.partial
        ? ('partial' as const)
        : null,
  };
}

const styles = StyleSheet.create({
  // The heading to its group, as the Victorian election block: tight (8).
  section: { gap: rhythm.tight },
  // The group to its line: group (24).
  block: { gap: rhythm.group },
  // The source line's band: its touch height, the bar where its text draws.
  boneSource: { minHeight: minimumTarget, justifyContent: 'center' },
  boneSourceBar: {
    width: '70%',
    height: 12,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
  },
  headerWords: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
});
