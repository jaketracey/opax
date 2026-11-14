import { newcomerOption } from '../newcomer/option';
import { Gloss, TermTip } from '../newcomer/TermTip';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BillIndex, Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { Icon } from '../../design/icon';
import { InsetGroup } from '../../design/layout';
import { PersonRow } from '../../design/people';
import { RowLink, type RowMenuAction } from '../../design/row-link';
import { SourceLine, type SourceCitation } from '../../design/source';
import { InlineError, LoadingStatus, Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import {
  electorateRoute,
  membersRoute,
  personRoute,
  seatRoute,
} from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { CachedPortrait } from '../CachedPortrait';
import { byFamilyName, FaceStackRow } from '../your-mp/FaceStackRow';
import { latelyFor } from '../your-mp/latest';
import { LatestRows } from '../your-mp/LatestRows';
import { MemberHeroRow, officialPageFor } from '../your-mp/MemberHeroRow';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
  type ProfileView,
  type YourMPView,
} from '../your-mp/model';
import { senateSeatFor, tenureYear } from '../your-mp/RepresentativesGroup';
import { RepresentativeRows } from '../your-mp/RepresentativeRows';
import { stateInRunningCopy } from '../your-mp/state-names';
import { isRegion } from '../your-mp/StateMembers';
import type { SydneyDate } from './rules';
import { oldestDate } from './sources';

/** Today's card shows three Latest rows (the Your MP tab shows five). */
export const CARD_LATEST = 3;

type Load<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

interface CardBills {
  data: BillIndex;
  asOf: string | null;
  stale?: boolean;
  savedAt?: number | null;
  partial?: boolean;
}

/**
 * One read for the card, keyed by what it reads, so a new seat never shows
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
 * The seat header (today.md 5.4): the seat's name and its state, one link
 * that pushes the electorate page inside Today. Touch and hold: Change
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

/** The card's skeleton in its final shape: member, three Latest rows, faces, line. */
export function YourMPSkeleton() {
  return (
    // One element for VoiceOver, read once (today.md 5.4); the shapes inside
    // keep the card's layout.
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
        <Skeleton shape="rows" count={CARD_LATEST} label="Loading your MP" />
        <Skeleton shape="rows" count={1} label="Loading your MP" />
        <Skeleton shape="text" count={1} label="Loading your MP" />
      </View>
    </LoadingStatus>
  );
}

/**
 * Your MP on Today (today.md 5.4): the seat header, then one inset group
 * (the member, the three newest records about them, the state's senators)
 * and its line, dated by the oldest of its four sources. Several links, so
 * an inset group, never one whole-card link. No money figure; the same
 * anatomy for every member.
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
  const electorate = useLoad<ElectorateView>(
    seat.detail_url,
    async () => (await catalogs.electorateFor(seat.detail_url)).data,
    attempt,
  );
  const member =
    view.status === 'ready' && view.data.members.data?.length === 1
      ? view.data.members.data[0]!
      : null;
  const profile = useLoad<ProfileView>(
    member ? member.person_id : null,
    () =>
      catalogs.profileFor(member!.person_id, {
        includeInterests: true,
      }) as Promise<ProfileView>,
    attempt,
  );
  const bills = useLoad<CardBills>(
    member ? 'bills' : null,
    async () => {
      const result = await catalogs.bills();
      return {
        data: result.data,
        stale: result.stale,
        savedAt: result.savedAt,
        partial: result.partial,
        asOf:
          (result.data as { meta?: { generated?: string } }).meta?.generated ??
          null,
      };
    },
    attempt,
  );
  const state = stateInRunningCopy(seat.state_code);
  return (
    <View testID="today-your-mp" style={styles.section}>
      <SeatHeader
        seat={seat}
        subtitle={state}
        label={`${seat.name}, ${state}`}
        testID="today-your-mp-seat"
      />
      {newcomerOption() === 'b' ? (
        <TermTip term="mp" variant="link" />
      ) : (
        <Gloss term="mp" />
      )}
      {view.status === 'error' ? (
        <InlineError
          subject="Your MP"
          message="Your MP couldn’t be loaded."
          onRetry={onRetry}
          testID="today-your-mp-error"
        />
      ) : view.status === 'loading' || electorate.status === 'loading' ? (
        // The member row draws once, at its final height, when both the
        // roster and the electorate file have answered.
        <YourMPSkeleton />
      ) : (
        <YourMPGroup
          seat={seat}
          directory={directory}
          view={view.data}
          electorate={electorate.status === 'ready' ? electorate.data : null}
          profile={profile}
          bills={bills.status === 'ready' ? bills.data : null}
        />
      )}
    </View>
  );
}

function YourMPGroup({
  seat,
  directory,
  view,
  electorate,
  profile,
  bills,
}: {
  seat: Electorate;
  directory: Directory;
  view: YourMPView;
  electorate: ElectorateView | null;
  profile: Load<ProfileView>;
  bills: CardBills | null;
}) {
  const member = view.members.data?.length === 1 ? view.members.data[0]! : null;
  const identity = member
    ? representativeProfile(member.person_id, directory)
    : null;
  const person = member
    ? directory.people.data.people.find((p) => p.person_id === member.person_id)
    : null;
  const year = member ? tenureYear(member.person_id, electorate?.terms) : null;
  const senate = senateSeatFor(seat, directory);
  const senators = [...(senate?.representatives ?? [])].sort(
    byFamilyName((r) => r.person.name),
  );
  const lately =
    profile.status === 'ready'
      ? latelyFor(profile.data, bills?.data, { limit: CARD_LATEST })
      : profile.status === 'error'
        ? ({ status: 'error' } as const)
        : ({ status: 'loading' } as const);
  const source = yourMPSources(view, profile, bills);
  return (
    <View style={styles.block}>
      <InsetGroup testID="today-your-mp-group">
        {member && identity ? (
          <MemberHeroRow
            size="card"
            name={member.person.name}
            slug={identity.slug}
            personId={member.person_id}
            party={identity.party ?? member.party}
            partyStatus={identity.partyStatus ?? 'current'}
            tenure={year ? `Member since ${year}` : null}
            official={officialPageFor(person?.source_url, seat.jurisdiction)}
            testID="today-your-mp-member"
          />
        ) : member ? (
          <RepresentativeRows
            rows={[member]}
            directory={directory}
            id="today-your-mp-member"
            wrap={false}
            detailFor={() => (year ? `Member since ${year}` : null)}
          />
        ) : (
          <Text wordSafe testID="today-your-mp-none" style={styles.none}>
            No member is recorded for this seat yet.
          </Text>
        )}
        {member && lately.status === 'loading' ? (
          <Skeleton
            shape="rows"
            count={CARD_LATEST}
            label="Loading recent records"
            testID="today-your-mp-latest-loading"
          />
        ) : null}
        {lately.status === 'ready' ? (
          <LatestRows
            records={lately.records}
            limit={CARD_LATEST}
            testID="today-your-mp-latest"
          />
        ) : null}
        {senate && senators.length ? (
          <FaceStackRow
            title={`${senators.length} senators for ${stateInRunningCopy(seat.state_code)}`}
            people={senators.map((r) => ({
              name: r.person.name,
              slug: representativeProfile(r.person_id, directory)?.slug,
            }))}
            href={membersRoute(senate.electorate_id)}
            testID="today-senators"
          />
        ) : null}
      </InsetGroup>
      <SourceLine {...source} testID="today-your-mp-sources" />
    </View>
  );
}

/**
 * The Your MP line (today.md 5.4, refinement 2): the roster first (it gives
 * the member's identity), then votes, registers and bills, each with its
 * own date in the sheet; the line's date is the oldest of them, so it never
 * overstates freshness. A source that failed is named in the notes.
 */
export function yourMPSources(
  view: YourMPView,
  profile: Load<ProfileView>,
  bills: Omit<CardBills, 'data'> | null,
) {
  const roster = [view.members, ...view.senators];
  const rosterAsOf = oldestDate(roster.map((b) => b.asAt));
  const originals = roster
    .flatMap((b) => b.sources.map((s) => ({ ...s, asOf: b.asAt })))
    .filter(
      (s, i, all) =>
        all.findIndex((o) => o.url === s.url && o.asOf === s.asOf) === i,
    );
  const rosterName = originals[0]?.label ?? 'Parliament of Australia';
  const citation: SourceCitation[] = [{ label: rosterName, asOf: rosterAsOf }];
  const missing: string[] = [];
  if (profile.status === 'ready') {
    const { votes, interests } = profile.data.blocks;
    if (votes.status === 'error') missing.push('votes');
    else citation.push({ label: 'They Vote For You', asOf: votes.asAt });
    if (interests.status === 'error') missing.push('registers of interests');
    else
      citation.push({ label: 'Registers of interests', asOf: interests.asAt });
  } else if (profile.status === 'error')
    missing.push('votes', 'registers of interests');
  if (bills) citation.push({ label: 'ParlInfo', asOf: bills.asOf });
  const checked = [
    ...roster,
    ...(profile.status === 'ready'
      ? [profile.data.blocks.votes, profile.data.blocks.interests]
      : []),
    ...(bills ? [bills] : []),
  ];
  const saved = checked.filter((b) => b.stale);
  const savedTimes = saved.flatMap((b) =>
    b.savedAt == null ? [] : [b.savedAt],
  );
  return {
    asOf: oldestDate(citation.map((c) => c.asOf as string | null)),
    citation,
    originals,
    notes: [
      'Your member and senators from the parliament roster; their newest dated votes, register changes and bills, newest first.',
      missing.length ? `Not checked: ${missing.join(' and ')}.` : null,
    ],
    savedAt: savedTimes.length ? Math.min(...savedTimes) : null,
    state: saved.length
      ? ('saved' as const)
      : checked.some((b) => b.partial)
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
