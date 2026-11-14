import { RouteOptions } from '../navigation/preview';
import { useScreenReady } from '../analytics/timing';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollView,
} from 'react-native';
import type { Electorate } from '../api/catalogs';
import type { PersonProfile } from '../api/person-identity';
import { catalogs } from '../api/runtime';
import { useReduceMotion } from '../design/accessibility';
import { PadGrid, ReadableColumn } from '../design/adaptive';
import { Disclosure } from '../design/disclosure';
import {
  counted,
  formatCount,
  formatMoney,
  formatYearRange,
} from '../design/format';
import {
  Group,
  Screen,
  SectionHeadingLayoutContext,
  TitleAnchor,
} from '../design/layout';
import { isPartyLabel } from '../design/party';
import { phoneCopy } from '../design/phone-copy';
import { StatStrip, type StatTileProps } from '../design/record';
import { LinkRow } from '../design/rows';
import {
  ContentUnavailable,
  InlineError,
  Skeleton,
  SkeletonCrossfade,
} from '../design/states';
import { Text } from '../design/text';
import { rhythm } from '../design/tokens';
import { useHeaderBottom } from '../design/useHeaderBottom';
import { headerItems, pageItems } from '../navigation/chrome';
import { openOnWeb } from '../navigation/external';
import { billRoute, electorateRoute, partyRoute } from '../navigation/routes';
import { shareRecord } from '../navigation/share';
import { CachedPortrait } from './CachedPortrait';
import { AddedSinceGroup } from './follows/AddedSinceGroup';
import type { Change } from './follows/changes';
import { followKey, useFollows } from './follows/store';
import { useFollowStates } from './follows/useFollowStates';
import { ProfileBlock } from './people/Block';
import { DeclaredInterests, registerNotes } from './people/DeclaredInterests';
import {
  ExpensesBlock,
  PartyReceiptsBlock,
  PayBlock,
} from './people/FinancialBlocks';
import { MemberVoteRow } from './people/MemberVoteRow';
import { PersonNotFound } from './people/NotFound';
import { officialPageItem, usePageActions } from './people/PageActions';
import { ProfileHeader, type IdentityRow } from './people/ProfileHeader';
import { MoreFromRecord, PersonDiary } from './people/Sections';
import {
  annualPay,
  diaryEligible,
  interestsCount,
  PROFILE_SECTIONS,
  profileArrival,
  roleLine,
  seatRows,
  stripSources,
  voteRowKey,
  votesCount,
  formerMemberLine,
  type ProfileArrival,
  type ProfileSection,
} from './people/model';
import { profileGrid } from './split/grid';
import { BlockSource, votesSource } from './your-mp/Evidence';
import { hasParliamentaryMembership, type ProfileView } from './your-mp/model';
import { useIsMyMember } from './your-mp/useIsMyMember';
import { useSetAsMyElectorate } from './your-mp/useSetAsMyElectorate';
import { perfMark, useDrawnMark } from '../perf/probe';
import {
  forgetProfile,
  rememberedProfile,
  rememberProfile,
  sameLoaded,
} from './people/profile-memo';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function Person() {
  const params = useLocalSearchParams<{
    slug: string;
    name?: string;
    section?: string;
  }>();
  const slug = one(params.slug) ?? '';
  return (
    <ProfileScreen
      key={slug}
      slug={slug}
      name={one(params.name)}
      arrival={profileArrival(one(params.section))}
    />
  );
}

/** The member's own page on their parliament's site, from the release. */
export function officialPage(
  url: string | null | undefined,
): { url: string; label: string } | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const label =
    host === 'aph.gov.au'
      ? 'Parliament of Australia page'
      : host === 'parliament.vic.gov.au'
        ? 'Parliament of Victoria page'
        : host === 'parliament.nsw.gov.au'
          ? 'Parliament of New South Wales page'
          : host === 'parliament.qld.gov.au'
            ? 'Queensland Parliament page'
            : host === 'parliament.act.gov.au'
              ? 'ACT Legislative Assembly page'
              : null;
  return label ? { url, label } : null;
}

export type Loaded = {
  profile: ProfileView;
  official: { url: string; label: string } | null;
  /** The sitting House member's seat, for "Set … as my electorate". */
  seat: Electorate | null;
};
type Load =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; offline: boolean }
  | ({ status: 'ready' } & Loaded);

const sittingFederal = (identity: PersonProfile) =>
  identity.partyStatus !== 'former' &&
  identity.seats.some((s) => s.current && s.jurisdiction === 'federal');

export async function loadProfile(slug: string): Promise<Loaded | null> {
  let person;
  try {
    person = await catalogs.person(slug);
  } catch (e) {
    // The directory was read and holds no such person: a fact, not a fault.
    if ((e as { code?: string }).code === 'not-found') return null;
    throw e;
  }
  // The release joins the official page and the seat; a roster-only person
  // needs it to prove they served, so only then is a failed read fatal.
  const directory = person.data.canonicalPersonId
    ? await Promise.resolve()
        .then(() => catalogs.directory())
        .catch(() => null)
    : await catalogs.directory();
  if (
    !person.data.canonicalPersonId &&
    !hasParliamentaryMembership(person.data, directory!)
  )
    return null;
  // A former member outside the dated release still has the records held
  // by their roster ID and names: votes, party receipts, pay.
  let profile: ProfileView = person.data.canonicalPersonId
    ? await catalogs.profileFor(person.data.canonicalPersonId)
    : await catalogs.rosterProfileFor(person.data);
  if (!person.data.canonicalPersonId) {
    profile.blocks.identity.partial = person.partial;
    profile.blocks.identity.staleReason = person.staleReason;
    profile.blocks.identity.stale = person.stale;
    profile.blocks.identity.savedAt = person.savedAt;
  }
  const released = directory?.people.data.people.find(
    (p) => p.person_id === person.data.canonicalPersonId,
  );
  const profileIdentity = profile.blocks.identity.data;
  if (
    profileIdentity?.partyStatus === 'former' &&
    released?.electorates.length
  ) {
    profile = {
      ...profile,
      blocks: {
        ...profile.blocks,
        identity: {
          ...profile.blocks.identity,
          data: { ...profileIdentity, seats: released.electorates },
        },
      },
    };
  }
  const sitting = person.data.partyStatus !== 'former';
  const house = person.data.seats.find(
    (s) => s.current && s.jurisdiction === 'federal' && s.chamber !== 'senate',
  );
  return {
    profile,
    official: sitting ? officialPage(released?.source_url) : null,
    seat: house
      ? (directory?.electorates.data.electorates.find(
          (e) => e.electorate_id === house.electorate_id,
        ) ?? null)
      : null,
  };
}

/** A stand-in seat the hook reads as not settable. */
const noSeat = {
  electorate_id: '',
  name: '',
  jurisdiction: '',
  chamber: '',
  status: 'historical',
} as unknown as Electorate;

export function ProfileScreen({
  slug,
  name: routeName,
  arrival,
  embedded = false,
}: {
  slug: string;
  /** The name a link already knows: the bar's title before the read. */
  name?: string;
  arrival?: ProfileArrival;
  embedded?: boolean;
}) {
  // A profile already read this session draws on the first frame; the read
  // below still runs and redraws only if the record changed (PF4).
  const [load, setLoad] = useState<Load>(() => {
    const remembered = rememberedProfile(slug);
    perfMark('profile-render', remembered ? 'memo' : 'loading');
    return remembered
      ? { status: 'ready', ...remembered }
      : { status: 'loading' };
  });
  useScreenReady('/person/[slug]', load.status !== 'loading', !embedded);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    loadProfile(slug)
      .then((loaded) => {
        if (loaded) rememberProfile(slug, loaded);
        else forgetProfile(slug);
        if (!active) return;
        setLoad((was) =>
          !loaded
            ? { status: 'not-found' }
            : was.status === 'ready' && sameLoaded(was, loaded)
              ? was
              : { status: 'ready', ...loaded },
        );
      })
      .catch((e: { code?: string }) => {
        if (!active) return;
        // A failed refresh keeps the page it has; the source lines say so.
        setLoad((was) =>
          was.status === 'ready'
            ? was
            : {
                status: 'error',
                offline: e?.code === 'offline' || e?.code === 'timeout',
              },
        );
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [slug, attempt]);
  // A block's Try again reads the profile again without clearing the page.
  const retry = () => setAttempt((n) => n + 1);
  const refresh = () => {
    setRefreshing(true);
    retry();
  };
  const ready = load.status === 'ready' ? load : null;
  const identity = ready?.profile.blocks.identity.data ?? null;
  const name = identity?.name ?? routeName;
  const webPath = `/subject/person/${ready?.profile.slug ?? slug}`;
  const setSeat = useSetAsMyElectorate(ready?.seat ?? noSeat);
  const menu = usePageActions({
    kind: 'person',
    name: name ?? 'this person',
    webPath,
    extra: [
      ...(setSeat.visible
        ? [
            {
              title: setSeat.label,
              symbol: 'map' as const,
              onPress: () => void setSeat.run(),
            },
          ]
        : []),
      ...(ready?.official ? [officialPageItem(ready.official)] : []),
    ],
  });
  return (
    <>
      {embedded ? null : (
        <RouteOptions
          stableItems
          options={{
            // The back button on the next page names this one.
            title: name ?? '',
            ...(load.status === 'not-found'
              ? {
                  headerShown: true,
                  headerLargeTitleEnabled: false,
                  headerTitle: 'No profile',
                }
              : {}),
            // A missing profile has only the back button: Done did nothing
            // Back does not (sweep 2, item 2).
            ...headerItems(
              load.status === 'not-found'
                ? undefined
                : identity
                  ? pageItems({
                      name: identity.name,
                      share: () =>
                        void shareRecord({
                          path: webPath,
                          title: identity.name,
                        }),
                      menu,
                    })
                  : undefined,
            ),
          }}
        />
      )}
      <SkeletonCrossfade
        loading={load.status === 'loading'}
        ready={load.status === 'ready'}
        cached={!!ready?.profile.blocks.identity.stale}
        cachedAt={ready?.profile.blocks.identity.savedAt}
        fill
        skeleton={
          <Screen
            column="wide"
            testID="person-pending-screen"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          >
            <PersonSkeleton />
          </Screen>
        }
      >
        {load.status !== 'ready' && load.status !== 'loading' ? (
          <Screen
            column="wide"
            centred={load.status === 'not-found'}
            testID="person-pending-screen"
            barTitle={load.status === 'not-found' ? 'No profile' : undefined}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          >
            {load.status === 'not-found' ? (
              <PersonNotFound
                onSearch={() =>
                  router.navigate({
                    pathname: '/search',
                    params: {
                      q: routeName ?? slug.replace(/-/g, ' '),
                      scope: 'people',
                    },
                  })
                }
              />
            ) : load.status === 'error' ? (
              load.offline ? (
                <ContentUnavailable
                  symbol="wifi.slash"
                  title={phoneCopy('Not saved on this iPhone yet')}
                  body="It will load when you’re back online."
                  action={{ label: 'Try again', onPress: refresh }}
                  testID="person-error"
                />
              ) : (
                <ContentUnavailable
                  symbol="exclamationmark.triangle"
                  title="Couldn’t load this profile"
                  body="Check your connection and try again."
                  action={{
                    label: 'Try again',
                    onPress: refresh,
                    testID: 'person-error-retry',
                  }}
                  testID="person-error"
                />
              )
            ) : (
              <PersonSkeleton />
            )}
          </Screen>
        ) : load.status !== 'ready' || !identity ? null : (
          <ProfileContent
            slug={slug}
            loaded={load}
            identity={identity}
            webPath={webPath}
            arrival={arrival}
            refreshing={refreshing}
            refresh={refresh}
            retry={retry}
            attempt={attempt}
          />
        )}
      </SkeletonCrossfade>
    </>
  );
}

function PersonSkeleton() {
  return (
    <Skeleton
      shape="person-profile"
      label="Loading the profile"
      testID="person-loading"
    />
  );
}

type VoteRowData = NonNullable<
  ProfileView['blocks']['votes']['data']
>['for'][number] & { position: 'for' | 'against' };

const headingSections: Record<string, ProfileSection | undefined> = {
  'person-votes-heading': 'votes',
  'person-interests-heading': 'interests',
  'person-pay-heading': 'pay',
  'person-expenses-heading': 'expenses',
  'person-receipts-heading': 'receipts',
  'person-diary-heading': 'diary',
  'person-more-heading': 'more',
};

function ProfileContent({
  slug,
  loaded,
  identity,
  webPath,
  arrival,
  refreshing,
  refresh,
  retry,
  attempt,
}: {
  slug: string;
  loaded: Loaded;
  identity: PersonProfile;
  webPath: string;
  arrival?: ProfileArrival;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
  attempt: number;
}) {
  const { profile } = loaded;
  const b = profile.blocks;
  useDrawnMark('profile-drawn');
  const scroll = useRef<ScrollView>(null);
  const y = useRef<Partial<Record<ProfileSection | 'changes', number>>>({});
  // Keep native host refs, never the synthetic layout event's target.
  const headings = useRef<
    Partial<Record<ProfileSection | 'changes', View | null>>
  >({});
  const headingY = useRef<Partial<Record<ProfileSection, number>>>({});
  const headingHosts = useRef<
    Partial<Record<ProfileSection, LayoutChangeEvent['currentTarget']>>
  >({});
  const focusAfterScroll = useRef<{ y: number; focus: () => void } | null>(
    null,
  );
  const headerBottom = useHeaderBottom();
  const reduceMotion = useReduceMotion();
  const yourMP = useIsMyMember(slug);
  const formerLine = formerMemberLine(identity);
  const former = identity.partyStatus === 'former';
  const sitting = sittingFederal(identity);

  // A tile, a change row or `?section=` asks for a section; the scroll runs
  // in an effect once its place is known.
  const [goTo, setGoTo] = useState<{
    to: ProfileSection | 'changes';
    animated: boolean;
    at: number;
  } | null>(null);
  const completedJump = useRef<typeof goTo>(null);
  const jump = (to: ProfileSection | 'changes') =>
    setGoTo({ to, animated: !reduceMotion, at: Date.now() });
  useEffect(() => {
    if (!goTo) return;
    const view = scroll.current;
    if (!view) return;
    let active = true;
    let finished = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    let overlay = Platform.OS === 'ios' ? headerBottom : 0;
    const inset = Platform.OS === 'ios' ? rhythm.block : rhythm.heading;
    const finish = (top: number) => {
      if (!active || finished || !Number.isFinite(top)) return;
      finished = true;
      completedJump.current = goTo;
      clearTimeout(fallbackTimer);
      const destination = Math.max(-overlay, top - overlay - inset);
      const focus = () => {
        if (!active || focusAfterScroll.current?.focus !== focus) return;
        const heading = headingHosts.current[goTo.to as ProfileSection];
        if (!heading) return;
        focusAfterScroll.current = null;
        clearTimeout(focusTimer);
        AccessibilityInfo.sendAccessibilityEvent(heading, 'focus');
      };
      focusAfterScroll.current = { y: destination, focus };
      view.scrollTo({
        y: destination,
        animated: goTo.animated,
      });
      // onScroll focuses at arrival. Also cover an unchanged or clamped offset,
      // which need not emit a scroll event, and honour Reduce Motion.
      focusTimer = setTimeout(focus, goTo.animated ? 500 : 0);
    };
    const fallback = () => {
      const top = y.current[goTo.to];
      if (top === undefined) return;
      // Screen's content padding precedes the section's onLayout coordinate.
      finish(
        top + rhythm.block + (headingY.current[goTo.to as ProfileSection] ?? 0),
      );
    };
    // Native measurement callbacks can also disappear while a view remounts.
    const fallbackTimer = setTimeout(fallback, 100);
    const measure = () => {
      if (!active || finished) return;
      try {
        const text = headingHosts.current[goTo.to as ProfileSection];
        const heading = text ?? headings.current[goTo.to];
        // RN exposes the host ref at runtime; its TS declaration omits it.
        const inner =
          (
            view as ScrollView & { getInnerViewRef?: () => View | null }
          ).getInnerViewRef?.() ?? view.getInnerViewNode();
        if (!heading?.measureLayout || inner == null) {
          fallback();
          return;
        }
        heading.measureLayout(
          inner,
          (_x, top) => {
            if (Number.isFinite(top))
              finish(
                top +
                  (text
                    ? 0
                    : (headingY.current[goTo.to as ProfileSection] ?? 0)),
              );
            else fallback();
          },
          fallback,
        );
      } catch {
        fallback();
      }
    };
    try {
      if (Platform.OS === 'ios') {
        const viewport = view.getNativeScrollRef();
        if (viewport?.measureInWindow) {
          viewport.measureInWindow((_x, viewportTop) => {
            if (!active || finished) return;
            // Opaque bars already place the viewport below the bar.
            overlay = Number.isFinite(viewportTop)
              ? Math.max(0, headerBottom - viewportTop)
              : 0;
            measure();
          });
        } else fallback();
      } else measure();
    } catch {
      fallback();
    }
    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      clearTimeout(focusTimer);
      focusAfterScroll.current = null;
    };
  }, [goTo, headerBottom]);
  // Arriving at a section (`?section=`): once, when its place is known.
  const arrived = useRef(false);
  const arrive = (to: ProfileSection | 'changes') => {
    if (arrival && !arrived.current && arrival === to) {
      arrived.current = true;
      setGoTo({ to, animated: false, at: Date.now() });
    }
  };
  const placed = (to: ProfileSection | 'changes', event: LayoutChangeEvent) => {
    y.current[to] = event.nativeEvent.layout.y;
    if (Platform.OS !== 'ios' || to === 'changes') arrive(to);
    // A tap can arrive before the section has completed its first layout.
    setGoTo((pending) =>
      pending?.to === to && pending !== completedJump.current
        ? { ...pending }
        : pending,
    );
  };
  const headingPlaced = (testID: string, event: LayoutChangeEvent) => {
    const section = headingSections[testID];
    if (!section) return;
    headingY.current[section] = event.nativeEvent.layout.y;
    // Capture the native heading during dispatch, not the pooled event or its
    // numeric target. This also accounts for nested iPad grid containers.
    const host = event.currentTarget;
    const firstHeading =
      !headingHosts.current[section] &&
      host &&
      typeof host.measureLayout === 'function';
    if (host && typeof host.measureLayout === 'function')
      headingHosts.current[section] = host;
    arrive(section);
    // The heading can mount after the wrapper or the measurement timeout,
    // including after a fallback scroll which is still waiting to focus it.
    setGoTo((pending) =>
      pending?.to === section &&
      (pending !== completedJump.current ||
        (firstHeading && focusAfterScroll.current !== null))
        ? { ...pending }
        : pending,
    );
  };

  // What changed since the reader last looked, for a followed person.
  const follows = useFollows();
  const { states } = useFollowStates(attempt);
  const follow = profile.personId
    ? (follows ?? []).find(
        (f) =>
          followKey(f) === followKey({ kind: 'person', id: profile.personId! }),
      )
    : undefined;
  const state = follow ? states.get(followKey(follow)) : undefined;
  const changes = useMemo<readonly Change[]>(
    () => (state?.status === 'ready' ? state.changes : []),
    [state],
  );
  const fresh = useMemo(
    () =>
      new Set(
        changes.flatMap((c) => [
          ...(c.key ? [c.key] : []),
          ...(c.record?.key ? [c.record.key] : []),
        ]),
      ),
    [changes],
  );
  const freshTitles = useMemo(
    () =>
      new Set(
        changes
          .filter((c) => c.record?.kind === 'register')
          .map((c) => c.record?.title ?? ''),
      ),
    [changes],
  );

  // Header: party, seats, the member's official page.
  const party = identity.party;
  const identityRows: IdentityRow[] = [
    ...(party
      ? [
          {
            kind: 'party' as const,
            title: party,
            dot: party,
            detail: identity.formerly
              ? `Formerly ${identity.formerly}`
              : undefined,
            href: isPartyLabel(party) ? partyRoute(party) : undefined,
            accessibilityLabel: `Party, ${party}${identity.formerly ? `, formerly ${identity.formerly}` : ''}`,
            accessibilityHint: isPartyLabel(party)
              ? 'Opens the party page'
              : undefined,
            testID: 'person-party',
          },
        ]
      : []),
    ...(formerLine ? [] : seatRows(identity)).map((seat, i) => ({
      kind: 'seat' as const,
      title: seat.title,
      detail: seat.detail,
      href: seat.electorateId ? electorateRoute(seat.electorateId) : undefined,
      accessibilityHint: seat.electorateId ? 'Opens the electorate' : undefined,
      testID: i ? `person-seat-${i}` : 'person-electorate',
    })),
    ...(loaded.official
      ? [
          {
            kind: 'official' as const,
            title: loaded.official.label,
            external: loaded.official,
            testID: 'person-official',
          },
        ]
      : []),
  ];

  // The strip: each tile reads its section's selector and jumps there.
  const tiles: StatTileProps[] = [];
  const votes = votesCount(profile);
  if (votes !== null && b.votes.status !== 'error')
    tiles.push({
      value: formatCount(votes),
      // One line at Large, the chevron after the last word (sweep 1, item 9).
      label: votes === 1 ? 'division' : 'divisions',
      term: 'division',
      onPress: b.votes.status !== 'unlinked' ? () => jump('votes') : undefined,
      testID: 'person-figure-votes',
    });
  const interests = interestsCount(profile);
  if (interests !== null && b.interests.status !== 'error')
    tiles.push({
      value: formatCount(interests),
      label: interests === 1 ? 'interest' : 'interests',
      onPress:
        b.interests.status !== 'unlinked' ? () => jump('interests') : undefined,
      testID: 'person-figure-interests',
    });
  const pay = annualPay(profile);
  if (pay !== null && b.pay.status !== 'error')
    tiles.push({
      value: formatMoney(pay),
      label: 'a year in pay',
      onPress: b.pay.status !== 'unlinked' ? () => jump('pay') : undefined,
      testID: 'person-figure-pay',
    });
  const strip = stripSources(profile);
  const stripPartial = [b.identity, b.votes, b.interests, b.pay].some(
    (block) => block.partial,
  );

  const unlinked = Object.values(b).some(
    (block) => block.status === 'unlinked',
  );
  const footRow = unlinked || profile.personId === null;

  const shows = (section: ProfileSection): boolean => {
    switch (section) {
      case 'votes':
        return (
          b.votes.status !== 'unlinked' &&
          (b.votes.data !== null ||
            b.votes.status === 'loading' ||
            b.votes.status === 'error' ||
            sitting)
        );
      case 'interests':
        return (
          b.interests.status !== 'unlinked' &&
          (b.interests.data !== null ||
            b.interests.status === 'loading' ||
            b.interests.status === 'error' ||
            sitting)
        );
      case 'pay':
        return [b.pay, b.expenses].some(
          (block) =>
            block.status !== 'unlinked' &&
            (block.data !== null ||
              block.status === 'loading' ||
              block.status === 'error'),
        );
      case 'expenses':
        // Drawn beside Pay (one pair on iPad).
        return false;
      case 'receipts':
        return (
          b.partyReceipts.status === 'error' ||
          b.partyReceipts.status === 'loading' ||
          (!!b.partyReceipts.data?.party &&
            isPartyLabel(b.partyReceipts.data.party))
        );
      case 'diary':
        return diaryEligible(identity);
      case 'more':
        return true;
    }
  };

  const voteRows = (v: NonNullable<typeof b.votes.data>): VoteRowData[] =>
    [
      ...v.for.map((r) => ({ ...r, position: 'for' as const })),
      ...v.against.map((r) => ({ ...r, position: 'against' as const })),
    ].sort((a, c) => (c.date ?? '').localeCompare(a.date ?? ''));
  const voteRow = (row: VoteRowData, i: number) => {
    const raw = row as VoteRowData & {
      key?: string;
      division_key?: string;
      url?: string;
    };
    return (
      <MemberVoteRow
        key={`${row.position}-${row.name}-${row.stage}-${row.date}-${i}`}
        position={row.position}
        name={row.name}
        stage={row.stage}
        date={row.date}
        url={
          raw.url ??
          `https://theyvoteforyou.org.au/search?query=${encodeURIComponent(row.name)}`
        }
        href={
          row.billKey
            ? billRoute(row.billKey, undefined, {
                section: 'divisions',
                ...(raw.division_key ? { division: raw.division_key } : {}),
              })
            : undefined
        }
        isNew={fresh.has(raw.key ?? raw.division_key ?? voteRowKey(row))}
        testID={`person-vote-${i}`}
      />
    );
  };

  const sections: Record<ProfileSection, () => ReactNode> = {
    votes: () => (
      <ProfileBlock
        title="Voting record"
        id="person-votes"
        block={b.votes}
        retry={retry}
        errorSubject="Votes"
        keepWhenEmpty={
          sitting ? (
            <Text wordSafe variant="body">
              No recorded votes yet.
            </Text>
          ) : undefined
        }
        licenceDataset="tvfy"
        line={() => votesSource(b.votes)}
        about={(v) =>
          v
            ? {
                title: 'Voting record',
                notes: [
                  `Of these divisions, voted for ${formatCount(v.ayes)} and voted against ${formatCount(v.noes)}. Most divisions are on procedural motions and amendments.`,
                  'A division is a recorded vote: each member’s choice is counted and published.',
                  v.method,
                ],
              }
            : null
        }
      >
        {(v) => {
          if (!v.total)
            return (
              <Text wordSafe variant="body">
                No recorded votes yet.
              </Text>
            );
          const rows = voteRows(v);
          const [from, to] = v.years;
          return (
            <Group gap={rhythm.tight}>
              <Text wordSafe variant="secondary" testID="person-votes-summary">
                {`Voted in ${counted(v.total, 'division')}${from && to ? `, ${from === to ? from : `${from} to ${to}`}` : ''}`}
              </Text>
              {rows.length ? (
                <View testID="person-bill-votes">
                  {rows.slice(0, 5).map(voteRow)}
                  {rows.length > 5 ? (
                    <Disclosure
                      label={`Show all ${formatCount(rows.length)}`}
                      testID="person-votes-all"
                    >
                      {() => rows.slice(5).map((row, i) => voteRow(row, i + 5))}
                    </Disclosure>
                  ) : null}
                </View>
              ) : null}
            </Group>
          );
        }}
      </ProfileBlock>
    ),
    interests: () => (
      <ProfileBlock
        title="Declared interests"
        id="person-interests"
        block={b.interests}
        retry={retry}
        keepWhenEmpty={
          sitting &&
          identity.seats.some((s) => s.jurisdiction === 'federal') ? (
            <Text wordSafe variant="body" testID="person-interests-empty">
              No interests declared in the current register.
            </Text>
          ) : undefined
        }
        licenceDataset="interests"
        about={(r) =>
          r
            ? {
                title: 'Declared interests',
                notes: [
                  ...registerNotes(r),
                  b.ties.data?.length
                    ? 'Organisations named are public disclosures, not findings of wrongdoing.'
                    : null,
                ],
              }
            : null
        }
        line={(r) => ({ partial: !!r?.unread_pages })}
      >
        {(r) =>
          r.total ? (
            <Group gap={rhythm.tight}>
              <DeclaredInterests
                register={r}
                isNew={(row) =>
                  freshTitles.has(row.description.split(' · ')[0]!.trim())
                }
              />
              <Ties block={b.ties} retry={retry} />
            </Group>
          ) : sitting ? (
            <Text wordSafe variant="body" testID="person-interests-empty">
              No interests declared in the current register.
            </Text>
          ) : null
        }
      </ProfileBlock>
    ),
    pay: () => (
      <Group gap={rhythm.section}>
        <PadGrid {...profileGrid}>
          <PayBlock block={b.pay} retry={retry} id="person-pay" />
          <ExpensesBlock
            block={b.expenses}
            retry={retry}
            id="person-expenses"
            person={identity.name}
            newYear={changes.some((c) => c.marker === 'expenses')}
          />
        </PadGrid>
      </Group>
    ),
    expenses: () => null,
    receipts: () => (
      <PartyReceiptsBlock
        block={b.partyReceipts}
        retry={retry}
        id="person-receipts"
        jurisdiction={identity.seats[0]?.jurisdiction}
      />
    ),
    diary: () => <PersonDiary identity={identity} />,
    more: () => (
      <MoreFromRecord
        subject={{ person: slug, name: identity.name }}
        kinds={['speeches', 'mentions']}
        topics
        testID="person-more"
      />
    ),
  };

  return (
    <Screen
      column="wide"
      barTitle={identity.name}
      scrollRef={scroll}
      onScroll={(offset) => {
        const pending = focusAfterScroll.current;
        if (pending && Math.abs(offset - pending.y) <= 1) pending.focus();
      }}
      testID="person-screen"
      offline={
        b.identity.stale && b.identity.savedAt != null
          ? { savedAt: b.identity.savedAt }
          : null
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <ReadableColumn style={styles.top} testID="person">
        <TitleAnchor>
          <ProfileHeader
            name={identity.name}
            portrait={
              <CachedPortrait
                name={identity.name}
                slug={slug}
                size="profile"
                testID="person-portrait"
                retryKey={attempt}
              />
            }
            role={formerLine ?? roleLine(profile, former)}
            yourMP={yourMP}
            identityRows={identityRows}
            follow={
              profile.personId ? { kind: 'person', id: profile.personId } : null
            }
            testID="person"
            titleTestID="person-screen-title"
          />
        </TitleAnchor>
        {tiles.length === 1 ? (
          <LinkRow
            title={`${tiles[0]!.value} ${tiles[0]!.label}${tiles[0]!.testID === 'person-figure-votes' && b.votes.data?.years.length ? `, ${formatYearRange(b.votes.data.years[0]!, b.votes.data.years.at(-1)!)}` : ''}`}
            onPress={tiles[0]!.onPress}
            accessory={tiles[0]!.onPress ? 'chevron' : 'none'}
            testID={tiles[0]!.testID}
          />
        ) : tiles.length ? (
          <StatStrip tiles={tiles} testID="person-figures" />
        ) : null}
      </ReadableColumn>
      {follow && changes.length ? (
        <View
          ref={(view) => {
            headings.current.changes = view;
          }}
          collapsable={false}
          onLayout={(e) => placed('changes', e)}
        >
          <AddedSinceGroup
            follow={follow}
            changes={changes}
            current={state?.status === 'ready' ? state.current : undefined}
            stale={state?.status === 'ready' ? state.stale : undefined}
            savedAt={state?.status === 'ready' ? state.savedAt : undefined}
            testID="person-added-since"
            onRowPress={(change) => {
              const kind = change.record?.kind;
              if (kind === 'vote') jump('votes');
              else if (kind === 'register') jump('interests');
              else if (change.marker === 'expenses' || change.marker === 'pay')
                jump('pay');
            }}
          />
        </View>
      ) : null}
      <SectionHeadingLayoutContext.Provider value={headingPlaced}>
        {PROFILE_SECTIONS.filter(shows).map((section) => (
          <View
            key={section}
            ref={(view) => {
              headings.current[section] = view;
            }}
            collapsable={false}
            testID={`person-${section}-anchor`}
            onLayout={(e) => placed(section, e)}
          >
            {sections[section]()}
          </View>
        ))}
      </SectionHeadingLayoutContext.Provider>
      {footRow ? (
        <LinkRow
          title={`${identity.name} on opax.com.au`}
          external
          onPress={() => void openOnWeb(webPath, identity.name)}
          accessibilityHint="Opens in the in-app browser"
          testID="person-web-foot"
        />
      ) : null}
      {tiles.length ? (
        <ReadableColumn>
          <BlockSource
            block={b.identity}
            title="Profile sources"
            citation={strip.citation}
            line={{ asOf: strip.asOf, partial: stripPartial }}
            notes={[
              stripPartial
                ? 'Some records for this person could not be read.'
                : null,
              profile.personId === null
                ? 'This person is matched by the parliamentary roster’s ID and name. More records may be on opax.com.au.'
                : null,
              'These are dated public records. Representation may have changed since collection.',
            ]}
            testID="person-figures-source"
          />
        </ReadableColumn>
      ) : null}
      {/* The page's end, for journeys that scroll to it; nothing drawn. */}
      <View testID="person-end" collapsable={false} style={styles.end} />
    </Screen>
  );
}

/**
 * Organisations named, inside Declared interests: a disclosure with the
 * count; no line when there are none. Its caveat is in the sheet's Notes.
 */
function Ties({
  block,
  retry,
}: {
  block: ProfileView['blocks']['ties'];
  retry: () => void;
}) {
  if (block.status === 'unlinked' || block.status === 'loading') return null;
  if (block.status === 'error')
    return (
      <InlineError
        subject="Organisations named"
        onRetry={retry}
        testID="person-ties-error"
      />
    );
  const ties = block.data;
  if (!ties?.length) return null;
  return (
    <View testID="person-ties">
      <Disclosure
        label="Organisations named"
        value={formatCount(ties.length)}
        testID="person-ties-detail"
      >
        {() =>
          ties.map((tie, i) => (
            <View key={i} style={styles.tie}>
              <Text wordSafe variant="body">
                {tie.organisation}
              </Text>
              <Text wordSafe variant="secondary">
                {tie.kinds.join('; ')}
              </Text>
            </View>
          ))
        }
      </Disclosure>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: rhythm.block },
  tie: { paddingVertical: rhythm.tight, gap: rhythm.line },
  // One point, at the foot of the last section rather than a section below.
  end: { height: 1, marginTop: -rhythm.section },
});
