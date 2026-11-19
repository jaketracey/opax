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
import { minimumTarget, radii, rhythm } from '../../design/tokens';
import { makeStyles } from '../../design/use-colors';
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
  type LinesRep,
  type Rep,
  type RepsLink,
  type RepsWords,
  type RepWords,
} from './RepsGroup';
import {
  DISSOLVED_STAND_IN,
  dissolvedLines,
  neutralLines,
  type KeptStateRow,
  type StateForm,
} from './dissolution';
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
  const styles = useStyles();

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
  const styles = useStyles();

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
  lines = null,
  members = null,
}: {
  /**
   * The member rows' words (the ones the last launch kept, or the saved
   * directory's), so each held row wraps as its row will. Null holds words
   * of a usual length.
   */
  members?: RepsWords | null;
  /** The state row will draw. */
  state?: boolean;
  /**
   * The state row is not a member's row: the lines that hold its place
   * (the ones the last launch kept, or a stand-in sized like the longest
   * real lines). Null holds a member's row.
   */
  lines?: readonly string[] | null;
  /** The senators link row will draw. */
  senators?: boolean;
}) {
  const styles = useStyles();

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
          <RepsBones
            rows={state ? 2 : 1}
            lines={state ? lines : null}
            link={senators}
            members={members}
          />
          <SourceBone />
        </View>
      </LoadingStatus>
    </View>
  );
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
 * The role lines of a sitting state lower-house member: "Victorian
 * Legislative Assembly · Essendon". A dissolved house has no members and
 * draws its own row (`dissolvedRow`), never this one.
 */
export function stateRole(
  seat: Pick<Electorate, 'name' | 'chamber' | 'jurisdiction' | 'state_code'>,
) {
  const house =
    chamberName(seat.chamber, seat.jurisdiction) ??
    `${stateInRunningCopy(seat.state_code)} Parliament`;
  return {
    role: `${house} · ${seat.name}`,
    spokenRole: `${house} member for ${seat.name}`,
  };
}

/** The state seat's recorded person, with their party as the roster has it. */
function stateMember(seat: Electorate, directory: Directory) {
  const member = seat.representatives[0]!;
  const identity = representativeProfile(member.person_id, directory);
  return {
    name: member.person.name,
    personId: member.person_id,
    slug: identity?.slug ?? null,
    party: identity?.party ?? member.party ?? null,
    partyStatus: identity?.partyStatus ?? ('current' as const),
  };
}

/** The state seat's recorded person, as the lines name them. */
function recordedPerson(seat: Electorate, directory: Directory) {
  const person = stateMember(seat, directory);
  return { name: person.name, party: person.party, status: person.partyStatus };
}

/**
 * The lines of a state row that is not a member's: the dissolved house's
 * four, or the neutral row's three. Null for a member's row.
 */
export function stateLines(
  seat: Electorate,
  directory: Directory,
  form: StateForm,
): readonly string[] | null {
  if (form.kind === 'dissolved')
    return dissolvedLines(
      seat,
      recordedPerson(seat, directory),
      form.electionDay,
    );
  if (form.kind === 'neutral')
    return neutralLines(seat, recordedPerson(seat, directory));
  return null;
}

/** What the device keeps of a decided state row for the next launch. */
export function keptStateRow(
  seat: Electorate,
  directory: Directory,
  form: StateForm,
): KeptStateRow | null {
  const lines = stateLines(seat, directory, form);
  if (form.kind === 'member') return form;
  if (form.kind === 'dissolved' && lines)
    return { kind: 'dissolved', electionDay: form.electionDay, lines };
  if (form.kind === 'neutral' && lines) return { kind: 'neutral', lines };
  return null;
}

/**
 * What the device keeps of the group's shape for the next launch
 * (shape-store): whether the state row and the senators row draw, and the
 * state row's decided form with its lines.
 */
export function repsShape(
  home: Electorate,
  directory: Directory,
  stateSeatIds: readonly string[],
  form: StateForm | null = null,
): {
  state: boolean;
  senators: boolean;
  stateRow: KeptStateRow | null;
  members: RepsWords;
} {
  const seat = stateSeatFor(directory, stateSeatIds);
  let federal: Rep | null = null;
  try {
    federal = federalRep(
      home,
      directory,
      yourMPFromDirectory(directory, home.electorate_id, stateSeatIds),
    );
  } catch {
    // The roster cannot say: the held row keeps words of a usual length.
  }
  return {
    state: !!seat,
    senators: !!senatorsLink(home, directory),
    stateRow: seat && form ? keptStateRow(seat, directory, form) : null,
    members: {
      federal: repWords(federal),
      // Only a member's row has a member's words.
      state:
        seat && (!form || form.kind === 'member')
          ? repWords(stateRep(seat, directory))
          : null,
    },
  };
}

/**
 * The federal row's words from the seat's own record in the directory, for
 * the held row while the tile's view is still out: the one recorded
 * member, as `recordedMember` picks them from the view. Null with no one
 * member, where the held row keeps words of a usual length.
 */
function seatWords(seat: Electorate, directory: Directory): RepWords | null {
  if (seat.representatives.length !== 1) return null;
  const member = seat.representatives[0]!;
  let identity: ReturnType<typeof representativeProfile> = null;
  try {
    identity = representativeProfile(member.person_id, directory);
  } catch {
    // An incomplete directory: the roster's own party stands.
  }
  return {
    name: member.person.name,
    party: identity?.party ?? member.party ?? null,
    partyStatus: identity?.partyStatus ?? 'current',
    role: federalRole(seat).role,
  };
}

/** The words a member's row draws, for its held place. */
const repWords = (rep: Rep | null): RepWords | null =>
  rep && {
    name: rep.name,
    party: rep.party,
    partyStatus: rep.partyStatus,
    role: rep.role,
  };

/** A sitting member with nothing to end it: the form with no state seat. */
const MEMBER: StateForm = { kind: 'member', until: null };

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
  stateForm = MEMBER,
  attempt,
  onRetry,
}: {
  seat: Electorate;
  directory: Directory;
  stateSeatIds: readonly string[];
  /**
   * The state row's form (`stateForm` in today/dissolution): a member's
   * row only when the data at hand decides the person is the member.
   */
  stateForm?: StateForm;
  attempt: number;
  onRetry: () => void;
}) {
  const styles = useStyles();

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
  const stateSeat = stateSeatFor(directory, stateSeatIds);
  // The lines of a state row that names no member, or that hold its place.
  const lines = stateSeat
    ? stateForm.kind === 'held'
      ? (stateForm.lines ?? DISSOLVED_STAND_IN)
      : stateLines(stateSeat, directory, stateForm)
    : null;
  if (view.status === 'loading')
    return (
      <View testID="today-your-mp">
        <YourMPPending
          state={!!stateSeat}
          senators={!!senatorsLink(seat, directory)}
          lines={lines}
          members={{
            // The directory is at hand though the tile's view is not: the
            // seat's own recorded member gives the held row its words.
            federal: seatWords(seat, directory),
            state:
              stateSeat && stateForm.kind === 'member'
                ? repWords(stateRep(stateSeat, directory))
                : null,
          }}
        />
      </View>
    );
  if (view.status === 'error')
    return (
      <View testID="today-your-mp" style={styles.section}>
        <TodayHeading testID="today-reps-heading">{REPS_HEADING}</TodayHeading>
        <YourMPError seat={seat} onRetry={onRetry} />
      </View>
    );
  const federal = federalRep(seat, directory, view.data);
  // Only a decided member is drawn as one.
  const state =
    stateSeat && stateForm.kind === 'member'
      ? stateRep(stateSeat, directory)
      : null;
  const linesRep =
    stateSeat &&
    lines &&
    (stateForm.kind === 'dissolved' || stateForm.kind === 'neutral')
      ? linesRepFor(stateSeat, directory, stateForm.kind, lines)
      : null;
  return (
    <View testID="today-your-mp" style={styles.section}>
      <TodayHeading testID="today-reps-heading">{REPS_HEADING}</TodayHeading>
      <View style={styles.block}>
        <RepsRows
          reps={[federal, state].filter((rep): rep is Rep => !!rep)}
          vacant={federal ? null : <VacantRow key="vacant" seat={seat} />}
          lines={
            linesRep ??
            (stateSeat && lines && stateForm.kind === 'held'
              ? { held: lines }
              : null)
          }
          link={senatorsLink(seat, directory)}
        />
        <SourceLine
          {...yourMPSources(
            view.data,
            state || linesRep ? stateSeat : null,
            linesRep?.kind ?? 'member',
          )}
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
  const styles = useStyles();

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
function stateRep(seat: Electorate, directory: Directory): Rep {
  const { name, personId, slug, party, partyStatus } = stateMember(
    seat,
    directory,
  );
  return {
    key: 'state',
    name,
    personId,
    slug,
    party,
    partyStatus,
    ...stateRole(seat),
    href: slug
      ? personRoute(slug, name)
      : electorateRoute(seat.electorate_id, undefined, seat.name),
    menu: seatActions(seat, !!slug),
  };
}

/** A lines row for the state seat: its lines, and where a tap leads. */
function linesRepFor(
  seat: Electorate,
  directory: Directory,
  kind: LinesRep['kind'],
  lines: readonly string[],
): LinesRep {
  const { name, slug } = stateMember(seat, directory);
  return {
    kind,
    lines,
    href: slug
      ? personRoute(slug, name)
      : electorateRoute(seat.electorate_id, undefined, seat.name),
    hint: slug
      ? kind === 'dissolved'
        ? 'Opens the last member’s profile'
        : 'Opens that person’s profile'
      : 'Opens the electorate',
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
export function yourMPSources(
  view: YourMPView,
  stateSeat?: Electorate | null,
  /** The state row's kind: a dissolved house cites the election record. */
  stateKind: 'member' | 'dissolved' | 'neutral' = 'member',
) {
  const dissolved = stateKind === 'dissolved';
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
    ...(state && dissolved
      ? [{ label: 'Victorian Electoral Commission' }]
      : []),
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
        ? dissolved
          ? 'The Parliament’s term has ended for the election, so the district has no member until the result is declared. The last member and their party are from the state parliament’s roster; the election day is from the Victorian Electoral Commission.'
          : stateKind === 'neutral'
            ? 'The state row shows what the state parliament’s roster recorded on that date. This device has no election record to say whether the house is sitting, so the row names nobody as the member.'
            : 'Your state member, their party and their district from the state parliament’s roster.'
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

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
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
  }),
);
