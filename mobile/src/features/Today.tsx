import { useOverview as useElectionOverview } from './vic-election/reads';
import { useElectionNow } from './vic-election/clock';
import { todayEligible, todayWindow } from './vic-election/model';
import VicElectionBlock from './vic-election/TodayBlock';
import * as Router from 'expo-router';
import { useScreenReady, useTodayRendered } from '../analytics/timing';
import {
  Fragment,
  useCallback,
  useEffect,
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
import { releaseSplash } from '../launch/splash';
import {
  useWelcomeDeclinedAt,
  welcomeDeclinedThisLaunch,
} from '../onboarding/state';
import { EditionSkeleton } from './edition/EditionCard';
import { TodayEditionCard } from './today/FeaturedPeopleCard';
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
import { MoreToExplore } from './today/MoreToExplore';
import { SittingLine, useSittingRead } from './today/SittingLine';
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
import { SurfaceGrid } from './today/SurfaceGrid';
import { SeatInvitation } from './today/SeatInvitation';
import { TodayReports, useTodayReports } from './today/TodayBlock';
import { TodayBody } from './today/TodayBody';
import { VotesBlock } from './today/VotesBlock';
import { StateSeatCard, stateSeatFor, YourMPCard } from './today/YourMPCard';
import { useProfilePreload } from './people/profile-preload';
import { saveChoice } from './your-mp/choice-store';
import { savedSeatDirectory, useSeat } from './your-mp/useSeat';

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
            ? { date: read.data.date.slice(0, 10) }
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
      const invitation = await readInvitationDates();
      if (active)
        setLaunch({ today, launchCase: launchCase(cached, today), invitation });
    })().catch(() => {
      if (active)
        setLaunch({
          today: day,
          launchCase: 'C',
          invitation: { hiddenUntil: null, welcomeDeclinedAt: null },
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

/** E2E captures only: the seat `OPAXSeat` names, chosen once per launch. */
function useSeatFixture(seat: ReturnType<typeof useSeat>) {
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
}

/**
 * Today, ordered by the reader's situation (today.md 5): Your MP or the
 * invitation to choose one; the daily edition, Following, Bills, How
 * parliament voted and Just declared; More to explore with the daily pair,
 * and Ask; then a quiet foot. The order is decided once per launch from the
 * disk, so nothing moves above content the reader can see; each block loads
 * on its own, keeps its saved copy and ends in its own dated line.
 */
export default function Today() {
  useTodayRendered();
  const dots = useTodayDotsScroll();
  const offline = useOffline();
  const election = useElectionOverview(false);
  const electionNow = useElectionNow();
  const now = useNow();
  const day = sydneyDay(now);
  const launch = useLaunch(day);
  const seat = useSeat();
  useSeatFixture(seat);
  const directory = savedSeatDirectory();
  const [attempt, setAttempt] = useState(0);
  const [pulled, setPulled] = useState<number | null>(null);
  const reports = useTodayReports();
  const edition = useEditionRead(attempt);
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
  // The launch cover goes once Today has laid out and its rest geometry is
  // final (useTodayDotsScroll: the large title's height on an iPhone), so
  // nothing moves as the cover fades.
  const [laidOut, setLaidOut] = useState(false);
  const onLayout = useCallback(() => setLaidOut(true), []);
  useEffect(() => {
    if (laidOut && dots.headerSettled) releaseSplash('today');
  }, [laidOut, dots.headerSettled]);
  const ready = !!launch && seat.status !== 'loading';
  useScreenReady('/', ready);
  // Once the body is drawn, the profile catalogs are read from their saved
  // copies in idle time while Today has focus (PF2).
  useProfilePreload(apiClient, ready, useScreenFocus);

  const order = launch
    ? todayOrder({
        seat: !!home,
        invitation: launch.invitation,
        launchCase: launch.launchCase,
        today: launch.today,
      })
    : null;
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
  const sitting = useSittingRead(attempt);

  const electionSavedAt =
    election.record &&
    todayWindow(electionNow) &&
    todayEligible(
      choice,
      directory?.electorates.data.electorates ?? [],
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ) &&
    offline
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
        if (!home || !directory) return null;
        if (nothingSaved) return null;
        return (
          <View key={name} style={styles.seats}>
            <SurfaceGrid testID="today-seat-grid">
              <YourMPCard
                seat={home}
                directory={directory}
                stateSeatIds={choice?.stateSeatIds ?? []}
                attempt={attempt}
                onRetry={retry}
              />
              {stateSeatFor(directory, choice?.stateSeatIds ?? [], today) ? (
                <StateSeatCard
                  directory={directory}
                  stateSeatIds={choice?.stateSeatIds ?? []}
                  today={today}
                />
              ) : null}
            </SurfaceGrid>
          </View>
        );
      case 'invitation':
        return <SeatInvitation key={name} />;
      case 'edition':
      case 'edition-late': {
        if (nothingSaved) return null;
        // Case C keeps the slot's skeleton until the read answers.
        if (
          name === 'edition' &&
          order.launchCase === 'C' &&
          edition.block === null
        )
          return (
            <View key={name} testID="today-edition-loading">
              <EditionSkeleton />
            </View>
          );
        if (!edition.block || !editionInSlot(name, order.launchCase, tier))
          return null;
        return (
          <TodayEditionCard
            key={name}
            attempt={attempt}
            edition={edition.block}
            tier={tier ?? undefined}
            today={today}
            // The late slot sits below the fold: its plate is drawn
            // finished and leaves the timeline's one draw for the story.
            still={name === 'edition-late'}
          />
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
            body="It will load when you're back online."
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
      onLayout={onLayout}
      column="wide"
      grouped
      clampScrollOnContentChange
      scrollRef={dots.scrollRef}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Masthead
        now={now}
        offlineSavedAt={offlineAt ?? null}
        sitting={<SittingLine now={now} sitting={sitting} />}
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
        {order && ready ? (
          <TodayBody order={order} slot={slot} />
        ) : (
          <View testID="today-launching">
            <EditionSkeleton />
          </View>
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

const styles = StyleSheet.create({
  // Top-level blocks: section (36).
  column: { gap: rhythm.section },
  // The state seat block sits 16 pt under the federal block's line.
  seats: { gap: rhythm.block },
});
