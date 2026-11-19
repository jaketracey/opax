import {
  ElectionUnavailable,
  electionReads,
  useOverview as useElectionOverview,
} from './vic-election/reads';
import { useElectionNow } from './vic-election/clock';
import { todayEligible, todayWindow } from './vic-election/model';
import VicElectionBlock from './vic-election/TodayBlock';
import * as Router from 'expo-router';
import { useScreenReady, useTodayRendered } from '../analytics/timing';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type { Block, EditionView, Electorate } from '../api/catalogs';
import { apiClient, catalogs } from '../api/runtime';
import { useOffline } from '../api/useOffline';
import { thisDevice } from '../design/device';
import { Screen } from '../design/layout';
import { ContentUnavailable } from '../design/states';
import { rhythm } from '../design/tokens';
import { useColors } from '../design/use-colors';
import { releaseSplash } from '../launch/splash';
import {
  useWelcomeDeclinedAt,
  welcomeDeclinedThisLaunch,
} from '../onboarding/state';
import { EditionSkeleton } from './edition/EditionCard';
import { FeaturedHeading, TodayEditionCard } from './today/FeaturedPeopleCard';
import { FollowingSection } from './follows/FollowingSection';
import { AskBlock } from './today/AskBlock';
import { AustraliaDots, useTodayDotsScroll } from './today/AustraliaDots';
import { electorateDotState } from './today/australia-dots-model';
import { BillsBlock } from './today/BillFeed';
import { DailyPair } from './today/DailyPair';
import { DeclarationsBlock } from './today/DeclarationRow';
import { readCachedEdition, rememberEdition } from './today/edition-store';
import { TodayFoot } from './today/Foot';
import {
  overrideInvitationDates,
  readInvitationDates,
  subscribeInvitation,
} from './today/invitation-store';
import {
  fixtureDeclinedAt,
  fixtureToday,
  todayFixture,
} from './today/launch-fixture';
import { Masthead, useNow } from './today/Masthead';
import { WideSearch, WideSearchBar } from './quick-search/WideSearch';
import { LearnCard, WithLearnCard } from './learn/LearnCard';
import { loadLearnSettings } from './learn/settings';
import { MoreToExplore } from './today/MoreToExplore';
import {
  readTodayShape,
  rememberTodayShape,
  shapeKey,
  type TodayShape,
} from './today/shape-store';
import { SinceLine, useSinceLastVisit } from './today/SinceLastVisit';
import { SittingLine, useSitting } from './today/SittingLine';
import {
  editionInSlot,
  launchCase,
  todayOrder,
  type CachedEdition,
  type InvitationDates,
  type LaunchCase,
  type TodaySlot,
} from './today/order';
import { editionTier, sydneyDay, type SydneyDate } from './today/rules';
import { SeatInvitation } from './today/SeatInvitation';
import { TodayReports, useTodayReports } from './today/TodayBlock';
import { TodayBody } from './today/TodayBody';
import { VotesBlock } from './today/VotesBlock';
import { TodayHeading } from './today/RepsGroup';
import {
  DISSOLVED_STAND_IN,
  NEUTRAL_STAND_IN,
  stateForm as stateRowForm,
} from './today/dissolution';
import {
  repsShape,
  stateLines,
  stateSeatFor,
  YourMPCard,
  YourMPPending,
} from './today/YourMPCard';
import { useSavedDirectory } from './today/saved-directory';
import { useProfilePreload } from './people/profile-preload';
import { keepCatalog } from '../api/kept-catalogs';
import { saveChoice } from './your-mp/choice-store';
import {
  migrateSeatChoice,
  savedSeatDirectory,
  useSavedChoice,
  useSeat,
} from './your-mp/useSeat';

/**
 * Runs `effect` each time Today's screen gains focus. Unit tests that render
 * Today outside a navigator mock expo-router without it: then nothing.
 */
const useScreenFocus: (effect: () => void | (() => void)) => void =
  Router.useFocusEffect
    ? (effect) => Router.useFocusEffect(effect)
    : () => undefined;

const house = (s: Electorate) =>
  s.jurisdiction === 'federal' &&
  s.chamber === 'representatives' &&
  s.status !== 'historical';

interface Launch {
  today: SydneyDate;
  launchCase: LaunchCase;
  invitation: InvitationDates;
  /** The lead's shape as the last launch left it (shape-store). */
  shape: TodayShape | null;
  /** The saved edition is a featured parliamentarian's (edition-store). */
  featured: boolean;
}

/**
 * The launch decision (today.md 5.2): read once from what the disk holds
 * (the invitation's dates and the last edition read) before any block
 * draws, and again only when the Sydney date rolls over. E2E captures may
 * pin the edition cache, its age and the welcome's "Not now" day.
 */
function useLaunch(day: SydneyDate): Launch | null {
  const liveDeclinedAt = useWelcomeDeclinedAt();
  const [launch, setLaunch] = useState<Launch | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const fixture = todayFixture();
      let cached: CachedEdition;
      if (fixture.editionCache === 'none') cached = null;
      else if (fixture.editionCache === 'present') {
        const read = await catalogs.todayEdition();
        cached =
          read.status === 'ready' && read.data
            ? { date: read.data.date.slice(0, 10), kind: read.data.kind }
            : read.status === 'missing'
              ? 'missing'
              : null;
      } else cached = await readCachedEdition();
      // An age pin dates Today from the edition's own date, read now when
      // nothing is saved.
      let editionDate = cached && cached !== 'missing' ? cached.date : null;
      if (fixture.editionAge && !editionDate) {
        const read = await catalogs.todayEdition();
        editionDate =
          read.status === 'ready' && read.data ? read.data.date : null;
      }
      const today = fixtureToday(fixture, editionDate) ?? day;
      const declined = fixtureDeclinedAt(fixture, today);
      if (declined !== undefined)
        overrideInvitationDates({ welcomeDeclinedAt: declined });
      // The guide card's setting is read with the dates, so the card is in
      // the page's first frame and is not inserted above the edition later.
      const [invitation, shape] = await Promise.all([
        readInvitationDates(),
        readTodayShape(),
        loadLearnSettings().catch(() => undefined),
      ]);
      if (active)
        setLaunch({
          today,
          launchCase: launchCase(cached, today),
          invitation,
          shape,
          featured:
            !!cached && cached !== 'missing' && cached.kind === 'politician',
        });
    })().catch(() => {
      if (active)
        setLaunch({
          today: day,
          launchCase: 'C',
          invitation: { hiddenUntil: null, welcomeDeclinedAt: null },
          shape: null,
          featured: false,
        });
    });
    return () => {
      active = false;
    };
  }, [day]);
  // The card's own "Not now" takes effect at once; the order stays.
  useEffect(
    () =>
      subscribeInvitation((invitation) =>
        setLaunch((current) =>
          current ? { ...current, invitation } : current,
        ),
      ),
    [],
  );
  // The welcome covers Today while it is up: its "Not now" lands after the
  // launch read, so read the dates again when Today is shown after it
  // (first-launch 4.4). Only after a Not now this launch.
  useScreenFocus(
    useCallback(() => {
      if (!welcomeDeclinedThisLaunch()) return;
      void readInvitationDates()
        .then((invitation) =>
          setLaunch((current) =>
            current &&
            current.invitation.welcomeDeclinedAt !==
              invitation.welcomeDeclinedAt
              ? { ...current, invitation }
              : current,
          ),
        )
        .catch(() => undefined);
    }, []),
  );
  // Closing the welcome does not wait for disk, and a parent modal need not
  // refocus the tab. The live choice wins over any launch/focus read already
  // in flight, including one that started before Today was ready.
  return launch && liveDeclinedAt
    ? {
        ...launch,
        invitation: { ...launch.invitation, welcomeDeclinedAt: liveDeclinedAt },
      }
    : launch;
}

/**
 * E2E captures only: the seat `OPAXSeat` names, chosen once per launch.
 * Answers whether a House seat is still on its way from the launch
 * arguments, so a capture of a first launch lays the page out for the seat
 * it is about to have, as a launch with the seat saved does.
 */
function useSeatFixture(seat: ReturnType<typeof useSeat>): boolean {
  const done = useRef(false);
  useEffect(() => {
    const wanted = todayFixture().seat;
    const directory = savedSeatDirectory();
    if (done.current || !wanted || wanted === 'none') return;
    if (seat.status === 'loading' || !directory) return;
    done.current = true;
    const seats = directory.electorates.data.electorates;
    const named = (name: string, jurisdiction: string) =>
      seats.find(
        (s) =>
          s.name === name &&
          s.jurisdiction === jurisdiction &&
          s.status !== 'historical',
      );
    void (async () => {
      if (wanted === 'legacy-senate-nsw') {
        // Written raw, as 1.0 wrote it: the read migration sets it aside.
        const senate = seats.find(
          (s) =>
            s.jurisdiction === 'federal' &&
            s.chamber === 'senate' &&
            s.state_code.toLowerCase() === 'nsw',
        );
        if (senate)
          await saveChoice({
            version: 1,
            seatId: senate.electorate_id,
            stateSeatIds: [],
          });
        return;
      }
      if (wanted === 'federal') {
        const grayndler = named('Grayndler', 'federal');
        if (grayndler) await seat.choose(grayndler);
        return;
      }
      const melbourne = named('Melbourne', 'federal');
      if (melbourne) await seat.choose(melbourne);
      const district = seats.find(
        (s) =>
          s.jurisdiction === 'vic' &&
          s.status !== 'historical' &&
          !/_lc$|council|region/i.test(s.chamber),
      );
      if (district) await seat.chooseState(district);
    })().catch(() => undefined);
  }, [seat]);
  const wanted = todayFixture().seat;
  return (
    (wanted === 'federal' || wanted === 'federal+state') &&
    (seat.status === 'loading' || seat.status === 'none')
  );
}

/**
 * Today, ordered by the reader's situation (today.md 5): Your MP or the
 * invitation to choose one; the daily edition, Following, Bills, How
 * parliament voted and Just declared; More to explore with the daily pair,
 * and Ask; then a quiet foot. The order is decided once per launch from the
 * disk, so nothing moves above content the reader can see; each block loads
 * on its own, keeps its saved copy and ends in its own dated line.
 *
 * The first frame has the loaded page's layout. The order needs only what
 * the disk holds (the launch read and the saved choice), so the page is
 * drawn in its order while the directory is still on its way, with Your MP's
 * skeleton in the tile's place; the launch cover lifts once that order is
 * known. With no shape kept for the saved choice, the directory the device
 * saved decides it (the migrated choice, and the group's rows), still with
 * no request. Until then the body draws nothing, never a stand-in of another
 * shape (it was the edition's outline, and the edition then landed about
 * 450 pt lower, under Your MP and the guide card).
 */
export default function Today() {
  const colors = useColors();
  useTodayRendered();
  const dots = useTodayDotsScroll();
  const offline = useOffline();
  // Subscribed only: the election block reads the record in its window,
  // and the state row asks for it through one gated, shared read below.
  const election = useElectionOverview(false);
  const electionNow = useElectionNow();
  const now = useNow();
  const day = sydneyDay(now);
  const launch = useLaunch(day);
  const seat = useSeat();
  const savedChoice = useSavedChoice();
  const seatArriving = useSeatFixture(seat);
  const directory = savedSeatDirectory();
  const [attempt, setAttempt] = useState(0);
  const [pulled, setPulled] = useState<number | null>(null);
  const reports = useTodayReports();
  const edition = useEditionRead(attempt);
  const [laidOut, setLaidOut] = useState(false);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const refresh = useCallback(() => {
    setAttempt((n) => {
      setPulled(n + 1);
      return n + 1;
    });
  }, []);
  // The spinner belongs to a pull; it ends when the edition's read answers.
  const refreshing = pulled === attempt && edition.attempt !== attempt;

  const choice = seat.status === 'chosen' ? seat.choice : null;
  const federal =
    choice && directory
      ? (directory.electorates.data.electorates.find(
          (s) => s.electorate_id === choice.seatId,
        ) ?? null)
      : null;
  const home = federal && house(federal) ? federal : null;
  const ready = !!launch && seat.status !== 'loading';
  useScreenReady('/', ready);
  // Once the body is drawn, the profile catalogs are read from their saved
  // copies in idle time while Today has focus (PF2).
  useProfilePreload(apiClient, ready, useScreenFocus, keepCatalog);

  // The lead as the last launch left it for this same saved choice. A
  // choice kept from 1.0 can name a Senate or a state seat, which is not a
  // House seat once the directory has migrated it: the kept shape says so
  // before the directory does, so the page is not reordered each launch.
  const kept =
    savedChoice && launch?.shape?.key === shapeKey(savedChoice)
      ? launch.shape
      : null;
  const overview = election.record?.data ?? null;
  // Nothing kept for this choice (the first launch of a build that keeps
  // the shape, or a new choice): the directory the device saved stands in
  // for the one on its way, so the choice is migrated before the first
  // frame. Read from the disk only, beside the launch reads, used only in
  // this case and let go once the seat has resolved.
  const preview = useSavedDirectory(
    !!launch &&
      !!savedChoice &&
      !kept &&
      seat.status === 'loading' &&
      !seatArriving,
    seat.status !== 'loading',
  );
  const previewSeats = preview?.electorates.data.electorates ?? null;
  const previewChoice =
    previewSeats && savedChoice
      ? migrateSeatChoice(savedChoice, previewSeats)
      : null;
  const previewFederal =
    previewChoice && previewSeats
      ? previewSeats.find((s) => s.electorate_id === previewChoice.seatId)
      : undefined;
  const previewHome =
    previewFederal && house(previewFederal) ? previewFederal : null;
  // Whether the page leads with Your MP: the seat once the directory has
  // answered, and until then the kept shape, or with none the migrated
  // choice from the saved directory, or with neither the choice as the
  // device saved it (null while the disk is being read).
  const seated = seatArriving
    ? true
    : seat.status !== 'loading'
      ? !!home
      : savedChoice === undefined || preview === undefined
        ? null
        : (kept?.house ?? (preview ? !!previewHome : !!savedChoice?.seatId));
  // The group's rows as the saved directory decides them, by the rules the
  // loaded group follows: no state row for a seat outside Victoria or a
  // district with no recorded member, and the state row's own form.
  const previewReps = (() => {
    if (!preview || !previewHome || !previewChoice || !previewSeats)
      return null;
    const ids = previewChoice.stateSeatIds;
    const district = stateSeatFor(preview, ids);
    // The record will be on its way when this row asks for it (below).
    const reading =
      !(election.error instanceof ElectionUnavailable) &&
      (election.loading ||
        !(
          todayWindow(electionNow) &&
          todayEligible(
            previewChoice,
            previewSeats,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          )
        ));
    const form = district
      ? stateRowForm(district, { overview, reading }, electionNow, null)
      : null;
    const shape = repsShape(previewHome, preview, ids, form);
    return {
      state: shape.state,
      senators: shape.senators,
      members: shape.members,
      lines:
        district && form
          ? form.kind === 'held'
            ? (form.lines ?? DISSOLVED_STAND_IN)
            : stateLines(district, preview, form)
          : null,
    };
  })();
  // The representatives group's rows, known before the directory answers:
  // the kept shape, or with none the saved directory's answer, or with
  // neither the choice as the device saved it (a saved state seat has a
  // row; every state has senators). A capture's seat on its way says which
  // seats it will save.
  const keptRow = kept?.stateRow ?? null;
  const pendingReps = seatArriving
    ? {
        state: todayFixture().seat === 'federal+state',
        senators: true,
        lines: DISSOLVED_STAND_IN,
      }
    : kept
      ? {
          state: kept.state,
          senators: kept.senators,
          // The rows' own words, so each held row wraps as its row will.
          members: kept.members,
          // A kept member's row holds a member's row; kept lines hold
          // themselves.
          lines: keptRow && keptRow.kind !== 'member' ? keptRow.lines : null,
        }
      : (previewReps ?? {
          state: !!savedChoice?.stateSeatIds.length,
          senators: true,
          // Nothing kept: the row names no member until the data decides
          // it. The taller stand-in while an election record is at hand
          // or on its way, the neutral row's otherwise.
          lines:
            election.record || election.loading
              ? DISSOLVED_STAND_IN
              : NEUTRAL_STAND_IN,
        });
  const stateSeat =
    home && directory
      ? stateSeatFor(directory, choice?.stateSeatIds ?? [])
      : null;
  // The election block reads the record for this reader while its window
  // runs; Today never adds a second read beside it.
  const electionBlockReads =
    todayWindow(electionNow) &&
    todayEligible(
      choice,
      directory?.electorates.data.electorates ?? [],
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  // The election the data at hand is about: the record's, or the one the
  // index says the seat's house is dissolved for.
  const electionDay =
    overview?.election_day ?? stateSeat?.dissolved_for?.slice(0, 10) ?? null;
  // What the last launch kept was decided for one election. Once the data
  // names another, none of it stands: a new election is decided afresh.
  const keptStands =
    !electionDay || !kept?.electionDay || kept.electionDay === electionDay;
  const keptDecision = keptStands ? keptRow : null;
  // The record was withdrawn (now, or as the last launch kept for this
  // election): it is not asked for again.
  const recordWithdrawn =
    !overview &&
    (election.error instanceof ElectionUnavailable ||
      (keptStands && !!kept?.withdrawn));
  // The new member is decided (or the record never covered the seat):
  // nothing more to ask.
  const rowDecided =
    keptDecision?.kind === 'member' && keptDecision.until === null;
  // The one read Today may start: only for the state seat of the migrated
  // choice (never a stray saved id), only while the electorates index does
  // not say for itself (`dissolved_for`), only until the row is decided or
  // the record withdrawn, and only when no read of the block's will answer.
  const rowUndecided =
    !!stateSeat &&
    stateSeat.dissolved_for === undefined &&
    !overview &&
    !recordWithdrawn &&
    !rowDecided;
  // Kept with the decisions, so the next launch knows which election they
  // were made for.
  const decidedFor =
    electionDay ?? (keptStands ? (kept?.electionDay ?? null) : null);
  const asksRecord = rowUndecided && !electionBlockReads;
  useEffect(() => {
    if (asksRecord) void electionReads.loadOverviewShared();
  }, [asksRecord]);
  // The state row's form, from the election record and the seat's own
  // dates in the electorates index; never a date written here.
  const stateForm = stateSeat
    ? stateRowForm(
        stateSeat,
        { overview, reading: rowUndecided && election.loading },
        electionNow,
        keptDecision,
      )
    : null;
  const stateIdsKey = (choice?.stateSeatIds ?? []).join(',');
  const stateFormKey = JSON.stringify(stateForm);
  const drawnReps = useMemo(
    () =>
      home && directory
        ? repsShape(
            home,
            directory,
            stateIdsKey ? stateIdsKey.split(',') : [],
            JSON.parse(stateFormKey) as typeof stateForm,
          )
        : { state: false, senators: false, stateRow: null, members: null },
    [home, directory, stateIdsKey, stateFormKey],
  );
  const stateRowKept = JSON.stringify(drawnReps.stateRow);
  const membersKept = JSON.stringify(drawnReps.members);
  const rowHeld = stateForm?.kind === 'held';
  const stateSeatDrawn = drawnReps.state;
  const senatorsDrawn = drawnReps.senators;
  const settledKey =
    (seat.status === 'chosen' || seat.status === 'none') &&
    directory &&
    // No saved choice needs no shape: the page has no lead to predict.
    savedChoice
      ? shapeKey(savedChoice)
      : null;
  const launchShape = launch?.shape;
  const launched = !!launch;
  const leads = !!home;
  useEffect(() => {
    // The state row's form is not known until the election record answers.
    if (settledKey === null || !launched || rowHeld) return;
    if (
      launchShape?.key === settledKey &&
      launchShape.house === leads &&
      launchShape.state === stateSeatDrawn &&
      launchShape.senators === senatorsDrawn &&
      launchShape.withdrawn === recordWithdrawn &&
      launchShape.electionDay === decidedFor &&
      JSON.stringify(launchShape.stateRow) === stateRowKept &&
      JSON.stringify(launchShape.members) === membersKept
    )
      return;
    void rememberTodayShape({
      key: settledKey,
      house: leads,
      state: stateSeatDrawn,
      senators: senatorsDrawn,
      stateRow: JSON.parse(stateRowKept) as TodayShape['stateRow'],
      members: JSON.parse(membersKept) as TodayShape['members'],
      withdrawn: recordWithdrawn,
      electionDay: decidedFor,
    });
  }, [
    settledKey,
    leads,
    stateSeatDrawn,
    senatorsDrawn,
    rowHeld,
    stateRowKept,
    membersKept,
    recordWithdrawn,
    decidedFor,
    launched,
    launchShape,
  ]);
  const order =
    launch && seated !== null
      ? todayOrder({
          seat: seated,
          invitation: launch.invitation,
          launchCase: launch.launchCase,
          today: launch.today,
        })
      : null;
  const calendar = useSitting(attempt);
  const sitting = calendar.read;
  // A held, empty sitting line is given back while Today is out of view
  // (another page over it, another tab), where nothing is seen to move.
  const [visit, setVisit] = useState(0);
  useScreenFocus(useCallback(() => () => setVisit((n) => n + 1), []));
  // The cover lifts on the page in its order, not on an empty body, and
  // with the saved sitting line (or its held place) already under the date.
  const shaped = order !== null && calendar.settled;
  useEffect(() => {
    if (laidOut && shaped) releaseSplash('today');
  }, [laidOut, shaped]);
  // "Since your last visit": drawn only if its answer is in hand for the
  // first frame the cover lifts on; the cover never waits for it, and the
  // line is never inserted afterwards.
  const since = useSinceLastVisit(laidOut && shaped);
  const today = launch?.today ?? day;
  const tier =
    edition.block?.status === 'ready' && edition.block.data
      ? editionTier(edition.block.data.date, today)
      : null;
  // Nothing saved and offline: Bills says so once and the blocks that
  // cannot draw step aside. Unmounting them clears their reports, so the
  // condition is held for this attempt; without it the blocks remounted,
  // failed again and looped. A pull, or the device coming back online,
  // starts the next attempt. The hold lasts only while the edition has
  // failed: if its background re-read brings it back, the page draws at
  // once (and cannot loop, since holding again needs the edition failed).
  const nothingSavedNow =
    reports.nothingSaved && edition.block?.status === 'error';
  const [nothingSavedAt, setNothingSavedAt] = useState<number | null>(null);
  // Held while rendering (React's adjust-state-on-change pattern), so the
  // commit that sets the blocks aside already holds it.
  if (nothingSavedNow && nothingSavedAt !== attempt) setNothingSavedAt(attempt);
  const nothingSaved =
    nothingSavedNow ||
    (nothingSavedAt === attempt && edition.block?.status === 'error');
  const wasOffline = useRef(offline);
  useEffect(() => {
    const back = wasOffline.current && !offline;
    wasOffline.current = offline;
    if (back && nothingSavedAt === attempt) retry();
  }, [offline, nothingSavedAt, attempt, retry]);

  const electionSavedAt =
    election.record && electionBlockReads && offline
      ? election.record.savedAt
      : null;

  const offlineAt = [
    electionSavedAt,
    reports.savedAt,
    offline ? reports.cachedAt : null,
    edition.block &&
    (edition.block.stale || (offline && edition.block.status === 'ready'))
      ? edition.block.savedAt
      : null,
    directory?.electorates.stale || (offline && !!home)
      ? directory?.electorates.savedAt
      : null,
  ]
    .filter((d): d is number => typeof d === 'number')
    .sort((a, b) => a - b)[0];

  const slot = (name: TodaySlot): ReactNode => {
    if (!order) return null;
    switch (name) {
      case 'vic-election':
        return <VicElectionBlock key={name} attempt={attempt} />;
      case 'your-mp':
        if (nothingSaved) return null;
        // The directory is on its way: the group's rows hold its place,
        // with the guide card under it as on the loaded page.
        if (!home || !directory)
          return seat.status === 'loading' || seatArriving ? (
            <View key={name} style={styles.seats}>
              <YourMPPending {...pendingReps} />
              <LearnCard />
            </View>
          ) : null;
        return (
          <View key={name} style={styles.seats}>
            <YourMPCard
              seat={home}
              directory={directory}
              stateSeatIds={choice?.stateSeatIds ?? []}
              stateForm={stateForm ?? undefined}
              attempt={attempt}
              onRetry={retry}
            />
            <LearnCard />
          </View>
        );
      case 'invitation':
        return (
          <WithLearnCard key={name}>
            <SeatInvitation />
          </WithLearnCard>
        );
      case 'edition':
      case 'edition-late': {
        if (nothingSaved) return null;
        // The top slot keeps its skeleton until a read answers (cases A
        // and C; case B has no top slot), so the edition is never inserted
        // above the blocks under it.
        // The heading stands over the skeleton too, so the card under it
        // never moves when the edition lands.
        if (name === 'edition' && edition.block === null)
          return (
            <View key={name} style={styles.headed}>
              {/* The saved edition's kind picks the heading it will land
                  under: the carousel's two lines on a featured
                  parliamentarian's day, so the skeleton never moves. */}
              {launch?.featured ? (
                <FeaturedHeading />
              ) : (
                <TodayHeading testID="today-edition-heading">
                  {EDITION_HEADING}
                </TodayHeading>
              )}
              <View testID="today-edition-loading">
                <EditionSkeleton />
              </View>
            </View>
          );
        if (!edition.block || !editionInSlot(name, order.launchCase, tier))
          return null;
        return (
          <View key={name} style={styles.headed}>
            {/* A featured parliamentarian's carousel has its own heading;
                the card standing alone draws this one (`heading`). */}
            {edition.block.status === 'ready' &&
            edition.block.data?.kind === 'politician' ? null : (
              <TodayHeading testID={`today-${name}-heading`}>
                {EDITION_HEADING}
              </TodayHeading>
            )}
            <TodayEditionCard
              heading={
                edition.block.status === 'ready' &&
                edition.block.data?.kind === 'politician' ? (
                  <TodayHeading testID={`today-${name}-heading`}>
                    {EDITION_HEADING}
                  </TodayHeading>
                ) : null
              }
              attempt={attempt}
              edition={edition.block}
              tier={tier ?? undefined}
              today={today}
              held={directory}
              // The late slot sits below the fold: its plate is drawn
              // finished and leaves the timeline's one draw for the story.
              still={name === 'edition-late'}
            />
          </View>
        );
      }
      case 'pair':
        return <DailyPair key={name} today={today} attempt={attempt} />;
      case 'following':
        return nothingSaved ? null : (
          <FollowingSection
            key={name}
            refresh={attempt}
            refreshing={refreshing}
            onRetry={retry}
          />
        );
      case 'bills':
        return nothingSaved ? (
          <ContentUnavailable
            key={name}
            symbol="wifi.slash"
            title={`Not saved on this ${thisDevice()} yet`}
            body="It will load when you’re back online."
            testID="today-unavailable"
          />
        ) : (
          <BillsBlock key={name} attempt={attempt} onRetry={retry} />
        );
      case 'votes':
        return nothingSaved ? null : (
          <VotesBlock key={name} attempt={attempt} onRetry={retry} />
        );
      case 'declarations':
        return nothingSaved ? null : (
          <DeclarationsBlock key={name} attempt={attempt} onRetry={retry} />
        );
      case 'more':
        return (
          <MoreToExplore
            key={name}
            pair={
              order.pairInMore ? (
                <DailyPair today={today} attempt={attempt} />
              ) : null
            }
          />
        );
      case 'ask':
        return (
          <Fragment key={name}>
            <AskBlock today={today} />
          </Fragment>
        );
      case 'foot':
        // The page ends on a sentence only when it shows today's record.
        return (
          <TodayFoot
            key={name}
            ending={
              nothingSaved || offlineAt !== undefined
                ? undefined
                : { now, sitting }
            }
          />
        );
    }
  };

  return (
    <Screen
      testID="today-screen"
      artUnderTitle
      onLayout={() => setLaidOut(true)}
      column="wide"
      grouped
      clampScrollOnContentChange
      // No text field here: the welcome's or the chooser's seat search,
      // over Today, must not move it (keyboardInsets in layout.tsx, b67).
      keyboardInsets={false}
      scrollRef={dots.scrollRef}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          colors={[colors.navy]}
          progressBackgroundColor={colors.raised}
        />
      }
    >
      <Masthead
        now={now}
        search={
          <>
            <WideSearch />
            <WideSearchBar />
          </>
        }
        offlineSavedAt={offlineAt ?? null}
        sitting={
          <SittingLine
            key={visit}
            now={now}
            sitting={sitting}
            reserve={calendar.reserve}
          />
        }
        since={<SinceLine since={since} />}
        // From the first frame, neutral until the seat read answers, so the
        // map's clearance never moves the date (sweep 3, item 1).
        mark={
          <AustraliaDots
            state={electorateDotState(home)}
            neutral={seat.status === 'loading'}
            scroll={dots.scroll}
            expandedHeader={dots.expandedHeader}
          />
        }
      />
      <TodayReports value={reports}>
        {order ? (
          <TodayBody order={order} slot={slot} />
        ) : (
          <View testID="today-launching" />
        )}
      </TodayReports>
    </Screen>
  );
}

/**
 * The edition's read: the cached copy first, revalidated on a pull. What
 * it answers is kept on the device for the next launch's order.
 */
function useEditionRead(attempt: number) {
  const [state, setState] = useState<{
    block: Block<EditionView> | null;
    attempt: number;
  }>({ block: null, attempt: -1 });
  useEffect(() => {
    let active = true;
    const show = (block: Block<EditionView>) => {
      if (!active) return;
      setState((shown) => ({
        // A failed revalidation keeps the edition already drawn.
        block:
          block.status === 'error' && shown.block?.status === 'ready'
            ? shown.block
            : block,
        attempt,
      }));
      void rememberEdition(block);
    };
    // The copy the device saved answers first, with no request, so the
    // edition is in the first frame; it is not kept again, and the read
    // below replaces it.
    if (attempt === 0)
      void Promise.resolve()
        .then(() => catalogs.todayEditionSaved())
        .then((block) => {
          if (active && block)
            setState((shown) => (shown.block ? shown : { ...shown, block }));
        })
        .catch(() => undefined);
    void catalogs
      .todayEdition(attempt > 0)
      .then((block) => {
        show(block);
        if (active && attempt === 0)
          return catalogs.todayEdition('background').then(show);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [attempt]);
  return state;
}

/**
 * The heading over the featured edition card. The card's source line names
 * the "OPAX daily edition"; an edition stays on Today for a few days, so
 * the heading never says "today's".
 */
export const EDITION_HEADING = 'Daily edition';

const styles = StyleSheet.create({
  // A heading to its card, as the Victorian election block: tight (8).
  headed: { gap: rhythm.tight },
  // Top-level blocks: section (36).
  column: { gap: rhythm.section },
  // The guide card sits 16 pt under the representatives' source line.
  seats: { gap: rhythm.block },
});
