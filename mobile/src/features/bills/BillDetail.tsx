import { RouteOptions } from '../../navigation/preview';
import { useScreenReady } from '../../analytics/timing';
import { Host, Menu, Button as SwiftButton } from '@expo/ui/swift-ui';
import { router, useLocalSearchParams } from 'expo-router';
import {
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle,
  type DimensionValue,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  billDisplay,
  billName,
  billSentenceCase,
  billSourceLabel,
  billStage,
  billTimeline,
  type BillTimelineEntry,
  type BillTimelineStage,
} from '../../api/bill-transforms';
import { billKey } from '../../api/catalogs';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { useReduceMotion } from '../../design/accessibility';
import { ContextMenu } from '../../design/context-menu';
import { copy as words } from '../../design/copy';
import { formatCount, formatDate } from '../../design/format';
import { haptic } from '../../design/haptics';
import { MachinePill } from '../../design/labels';
import { TitleAnchor } from '../../design/layout';
import { showMenu } from '../../design/menu';
import {
  Button,
  ContentUnavailable,
  Disclosure,
  FollowButton,
  Heading,
  Icon,
  IconButton,
  InlineError,
  LinkRow,
  OfflineLine,
  PersonRow,
  Portrait,
  RecordRow,
  Screen,
  Section,
  Skeleton,
  CrossfadeLayers,
  SourceLine,
  StageTimeline,
  StatusCapsule,
  Text,
  VoteSplit,
  useAccessibilitySize,
  useSkeletonCrossfade,
  type SkeletonCrossfadeState,
  type SourceOriginal,
} from '../../design/primitives';
import { HeightReveal } from '../../design/reveal';
import { useRowFollow } from '../../design/row-link';
import { symbols } from '../../design/symbols';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import { sourceLineParts, type SourceDetails } from '../../design/source';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { headerItems, pageMenu, shareItem } from '../../navigation/chrome';
import { canonicalUrl, openSource } from '../../navigation/external';
import {
  billListRoute,
  docRoute,
  partyRoute,
  personRoute,
} from '../../navigation/routes';
import { resultsRoute } from '../../navigation/routes/search';
import { canShare, shareRecord } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { CachedPortrait } from '../CachedPortrait';
import { scopedQuestion } from '../ask/AskAbout';
import { useOpenAsk } from '../ask/open';
import { AddedSinceGroup } from '../follows/AddedSinceGroup';
import { NewDot } from '../follows/NewDot';
import type { Change } from '../follows/changes';
import { followKey } from '../follows/store';
import { useFollowStates } from '../follows/useFollowStates';
import { copyText } from '../records/actions';
import { useIsMyMember } from '../your-mp/useIsMyMember';
import {
  countWords,
  divisionQuestion,
  divisionTitle,
  orderDivisions,
  outcomeWord,
} from './divisions';
import { chamberLabel } from './filters';
import { useBillNavigation } from './navigation';
import {
  Bullet,
  DivisionQuestion,
  MachineSummary,
  PartyVotes,
  ShowMoreButton,
  billMenuItems,
  dateSpan,
  divisionParties,
} from './parts';
import { sponsorRows, type SponsorDirectory } from './sponsors';
import { statusEvent, statusEventText } from './status-event';
import { useSpeechSpeakers } from '../records/speaker';
import { useCatalogRecord } from './useCatalogRecord';
import { memberPosition, useMyMemberVotes } from './your-mp-vote';
import { sydneyDay } from '../today/rules';

type BillRecord = Awaited<ReturnType<typeof catalogs.billFor>>;
type BillView = BillRecord['data'];
type Identity = NonNullable<BillView['identity']['data']>;
type Division = NonNullable<BillView['divisions']['data']>['rows'][number];

/** Notes said once, in each block's source sheet (specs/bills.md 4.9). */
const notes = {
  status: 'The status date is the date the record was last updated.',
  summary:
    'Written by a machine from the explanatory memorandum. Check the original before relying on it.',
  voices: 'Most questions are decided on the voices, without a recorded vote.',
  chosen:
    'Third reading votes come first, then second reading votes and amendments, then other votes, each newest first. Procedural votes (limitation of debate, closure, suspension of standing orders and adjournment) are grouped last under their own heading.',
  stages:
    'Second reading: agreeing to the bill in principle. Consideration in detail: changes debated clause by clause. Third reading: the final vote to pass it in this chamber.',
  speeches:
    'The short summaries under each speech are machine-written. The speeches themselves are the Hansard record.',
  related: 'Relations between bills are as ParlInfo records them.',
};
/** A vote row's disclosure chevron (not yet in the shared vocabulary). */
const chevrons = { open: 'chevron.up', closed: 'chevron.down' } as const;
/** Votes and speeches shown before "Show more". */
const VOTES_SHOWN = 5;
const SPEECHES_SHOWN = 3;

const isBillKey = (key: string) => {
  try {
    billKey(key);
    return true;
  } catch {
    return false;
  }
};
const unique = <T,>(items: readonly T[]) => [...new Set(items)];
const short = (date: string) => formatDate(date, 'short');
const dayMonth = (at: number) => formatDate(at, 'short').replace(/ \d{4}$/, '');

/** "Second reading · House of Representatives · over 3 sitting days". */
const stageText = (s: BillTimelineStage) =>
  [
    s.stage,
    s.house ? chamberLabel(s.house) : null,
    s.days > 1 ? `over ${s.days} sitting days` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * A chart's provenance footnote. The charts name the prop `source`, which
 * the transport policy keeps for images, so it is passed as a spread.
 */
const chartSource = (start: string, end: string, citation: string) => ({
  dateRange: { start, end },
  citation,
});

/** Where the page scrolls to, and what it reveals first. */
interface Targets {
  scrollTo: (ref: RefObject<View | null>, focus?: boolean) => void;
}

/** One bill: what it would change, how it moved, and how parliament voted. */
export default function BillDetail({
  recordKey,
  embedded = false,
}: { recordKey?: string; embedded?: boolean } = {}) {
  const params = useLocalSearchParams<{
    key: string;
    name?: string;
    division?: string;
    section?: string;
  }>();
  const key = String(recordKey ?? params.key);
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      catalogs.billFor(key, refresh, signal),
    [key],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  useScreenReady('/bill/[key]', !!record || !!error, !embedded);
  const [directory, setDirectory] = useState<SponsorDirectory | null>();
  const view = record?.data;
  const identity = view?.identity.data ?? null;
  const hasSponsors = !!identity?.sponsorMembers.length;
  // Sponsors link to their profile only where the roster and the directory
  // agree on who they are; otherwise the row stays plain.
  useEffect(() => {
    if (!hasSponsors) return;
    let active = true;
    catalogs
      .directory()
      .then((found) => {
        if (active)
          setDirectory({
            roster: found.roster.data,
            slugs: found.slugs.data,
            people: found.people.data,
            manifest: found.manifest.data,
            electorates: found.electorates.data,
          });
      })
      .catch(() => {
        if (active) setDirectory(null);
      });
    return () => {
      active = false;
    };
  }, [hasSponsors]);

  const name = identity
    ? billName({ title: identity.title, short_title: identity.shortTitle })
    : '';
  // Arrived from a list, Today, Search or Following: the index row is in
  // memory, and the header draws from it while the bill's file loads.
  const seed: IndexRow | null = view ? null : catalogs.billIndexRow(key);
  const title = name || (seed ? billName(seed) : '') || params.name || '';
  // A key the register could never name, or one it does not publish. A file
  // that arrives but cannot be read is an error, not a missing bill.
  const notFound =
    !record &&
    (!isBillKey(key) ||
      (error instanceof ApiError && error.code === 'not-found'));
  const offline = error instanceof ApiError && error.code === 'offline';
  // A saved copy says so in every block's source line ("Saved 3 Oct 2026").
  const savedAt = record?.stale ? record.savedAt : null;
  const home = view?.identity.sources.find(
    (s) => s.label === billSourceLabel('billhome'),
  );

  // Scrolling to a block: under the bar, VoiceOver on it.
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const headerBottom = useHeaderBottom();
  const reduceMotion = useReduceMotion();
  const targets = useMemo<Targets>(
    () => ({
      scrollTo(ref, focus = false) {
        // Wait a frame for revealed rows to lay out.
        setTimeout(() => {
          ref.current?.measureInWindow((_x, y) => {
            scroll.current?.scrollTo({
              y: Math.max(0, offset.current + y - headerBottom),
              animated: !reduceMotion,
            });
            const node =
              focus && ref.current ? findNodeHandle(ref.current) : null;
            if (node) AccessibilityInfo.setAccessibilityFocus(node);
          });
        }, 50);
      },
    }),
    [headerBottom, reduceMotion],
  );

  // Followed bills: what was added since the reader last looked.
  const follow = useBillChanges(identity?.key ?? null);

  const openAsk = useOpenAsk();
  const ask = () => openAsk(scopedQuestion('bill', title), title);
  const share = () =>
    void shareRecord({ path: `/bill/${key}`, title: name || 'Bill' });
  // The bar title is the short name, and its view truncates inside the bar
  // items (Share and ⋯), never under them (bills-07).
  const titleRef = useRef<View>(null);
  const barTitle = useTitleOnScroll(
    embedded ? null : titleRef,
    embedded ? undefined : title || undefined,
    { trailing: Platform.OS === 'ios' && canShare ? 2 : 1 },
  );
  const menu = identity
    ? [
        ...(Platform.OS === 'ios'
          ? []
          : [
              {
                title: 'Ask about this bill',
                symbol: 'text.bubble' as const,
                onPress: ask,
              },
              ...(canShare
                ? [
                    {
                      title: 'Share',
                      symbol: 'square.and.arrow.up' as const,
                      onPress: share,
                    },
                  ]
                : []),
            ]),
        ...billMenuItems({ billKey: identity.key, title: name, home }),
      ]
    : [];
  const failed = notFound || (error && !record);
  // One element per shape: the crossfade keeps the last loading skeleton.
  const seeded = !!seed;
  const skeleton = useMemo(
    () => (seeded ? <SeededBodySkeleton /> : <ColdSkeleton />),
    [seeded],
  );
  const crossfade = useSkeletonCrossfade({
    loading: !view && !failed,
    ready: !!view,
    cached: !!record?.stale,
    cachedAt: record?.savedAt,
    skeleton,
  });
  // Share sits in the bar beside ⋯ and Ask about this bill is a button: iOS 26's
  // floating tab bar stays up on pushes, and covered a bottom toolbar.
  const barShare = Platform.OS === 'ios' && canShare && !failed;
  return (
    <>
      {embedded ? null : (
        <RouteOptions
          stableItems
          options={{
            // The back label for the next screen; the bar title appears by
            // scroll once the H1 passes under the bar.
            title,
            // ⋯ is drawn from the start, and works once the bill loads.
            ...headerItems(
              failed
                ? undefined
                : () => [
                    ...(barShare
                      ? [
                          {
                            ...shareItem({
                              name: title || 'Bill',
                              onPress: share,
                            }),
                            disabled: !identity,
                          },
                        ]
                      : []),
                    {
                      ...pageMenu({ name: title || 'Bill', items: menu }),
                      disabled: !identity,
                    },
                  ],
            ),
          }}
        />
      )}
      <Screen
        centred={notFound}
        testID={view ? 'bill-screen' : 'bill-pending-screen'}
        scrollRef={scroll}
        onScroll={(y) => {
          offset.current = y;
          barTitle.onScroll(y);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
      >
        {seed && crossfade.loading ? <SeededHead row={seed} /> : null}
        {view && identity && record ? (
          <BillPage
            view={view}
            identity={identity}
            name={name}
            titleRef={embedded ? undefined : titleRef}
            onTitleLayout={embedded ? undefined : barTitle.onTitleLayout}
            onAsk={ask}
            directory={directory}
            savedAt={savedAt}
            stale={
              record.stale
                ? record.staleReason
                  ? { kind: 'failed', at: record.savedAt, retry: refresh }
                  : { kind: 'offline', at: record.savedAt }
                : null
            }
            follow={follow}
            targets={targets}
            arrival={
              embedded
                ? {}
                : {
                    division: params.division,
                    section: params.section,
                  }
            }
            crossfade={crossfade}
          />
        ) : (
          <CrossfadeLayers crossfade={crossfade} sectioned>
            {notFound ? (
              <ContentUnavailable
                symbol="doc.text.magnifyingglass"
                title="Bill not found"
                body="This link may be old."
                action={{
                  label: 'Search bills',
                  onPress: () =>
                    router.push(billListRoute({ scope: 'all', focus: '1' })),
                  testID: 'bill-not-found-search',
                }}
                testID="bill-not-found"
              />
            ) : offline && !record ? (
              <ContentUnavailable
                symbol="wifi.slash"
                title={words.notSaved}
                body={words.notSavedBody}
                testID="bill-offline-uncached"
              />
            ) : error && !record ? (
              <ContentUnavailable
                symbol="exclamationmark.triangle"
                title="This bill couldn't be loaded"
                action={{
                  label: words.tryAgain,
                  onPress: retry,
                  testID: 'bill-error-retry',
                }}
                testID="bill-error"
              />
            ) : null}
          </CrossfadeLayers>
        )}
      </Screen>
      {embedded || failed || Platform.OS === 'ios' || !canShare ? null : (
        <BillToolbar onShare={share} canShare={!!identity} />
      )}
    </>
  );
}

/**
 * The menu sheet, where no native menu can be drawn: a vote row's long
 * press, and the pane's ⋯ off iOS.
 */
function openMenu(items: readonly { title: string; onPress: () => void }[]) {
  if (Platform.OS !== 'ios') showMenu('', [...items]);
}

/** The iPad pane's ⋯: a native menu on iOS, the menu sheet elsewhere. */
export function PaneMenu({
  billKey,
  title,
  testID,
}: {
  billKey: string;
  title: string;
  testID?: string;
}) {
  const items = billMenuItems({ billKey, title });
  if (Platform.OS !== 'ios')
    return (
      <IconButton
        symbol={symbols.more}
        accessibilityLabel="More"
        testID={testID}
        onPress={() => openMenu(items)}
      />
    );
  return (
    <View testID={testID} accessibilityLabel="More" style={styles.paneMenu}>
      <Host matchContents>
        <Menu label="" systemImage={symbols.more}>
          {items.map((item) => (
            <SwiftButton
              key={item.title}
              label={item.title}
              systemImage={item.symbol}
              onPress={item.onPress}
            />
          ))}
        </Menu>
      </Host>
    </View>
  );
}

/**
 * Android keeps Share in its bottom bar. Ask follows the summary on every
 * platform; iOS keeps Share in the navigation bar above the floating tab bar.
 */
function BillToolbar({
  onShare,
  canShare: shareReady,
}: {
  onShare: () => void;
  canShare: boolean;
}) {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        styles.toolbar,
        Platform.OS === 'android' ? styles.androidToolbar : null,
      ]}
    >
      {canShare ? (
        <Button
          label="Share"
          onPress={onShare}
          disabled={!shareReady}
          testID="bill-share"
        />
      ) : null}
    </SafeAreaView>
  );
}

interface BillFollow {
  follow: Parameters<typeof AddedSinceGroup>[0]['follow'];
  changes: readonly Change[];
  stale: boolean;
}
/** A followed bill's changes, and every key that is new for this visit. */
function useBillChanges(key: string | null) {
  const { follows, states } = useFollowStates();
  const follow = key
    ? follows?.find((f) => f.kind === 'bill' && f.id === key)
    : undefined;
  const state = follow ? states.get(followKey(follow)) : undefined;
  const changes = state?.status === 'ready' ? state.changes : [];
  // New for the whole visit, even after the group marks them seen.
  const keys = changes
    .flatMap((c) => [c.record?.divisionKey, c.record?.key, c.key])
    .filter((k): k is string => !!k);
  // Stage rows match stage changes by date, never a vote or speech that
  // happens to carry the same day in its key.
  const stageDates = changes
    .filter((c) => c.record?.kind === 'stage' && !!c.record.date)
    .map((c) => c.record!.date.slice(0, 10));
  const signature = [...keys, ...stageDates.map((d) => `stage@${d}`)].join('|');
  const [seen, setSeen] = useState<{
    signature: string;
    keys: ReadonlySet<string>;
    stageDates: ReadonlySet<string>;
  }>({ signature: '', keys: new Set(), stageDates: new Set() });
  if (signature && signature !== seen.signature)
    setSeen({
      signature,
      keys: new Set([...seen.keys, ...keys]),
      stageDates: new Set([...seen.stageDates, ...stageDates]),
    });
  const fresh = seen.keys;
  return {
    group:
      follow && changes.length
        ? ({
            follow,
            changes,
            stale: !!state && 'stale' in state && !!state.stale,
          } as BillFollow)
        : null,
    fresh,
    freshStages: seen.stageDates,
  };
}
type FollowInfo = ReturnType<typeof useBillChanges>;

interface Arrival {
  division?: string;
  section?: string;
}
type Stale =
  | { kind: 'offline'; at: number }
  | { kind: 'failed'; at: number; retry: () => void }
  | null;

/** The page below the bar, in the spec's order; empty blocks are hidden. */
function BillPage({
  view,
  identity,
  name,
  titleRef,
  onTitleLayout,
  onAsk,
  directory,
  savedAt,
  stale,
  follow,
  targets,
  arrival,
  crossfade,
}: {
  view: BillView;
  identity: Identity;
  name: string;
  titleRef?: RefObject<View | null>;
  onTitleLayout?: (event: LayoutChangeEvent) => void;
  onAsk?: () => void;
  directory: SponsorDirectory | null | undefined;
  savedAt: number | null;
  stale: Stale;
  follow: FollowInfo;
  targets: Targets;
  arrival: Arrival;
  crossfade: SkeletonCrossfadeState;
}) {
  const bills = useBillNavigation();
  const changesRef = useRef<View>(null);
  const datesRef = useRef<View>(null);
  const speechesRef = useRef<View>(null);
  const votes = useVotes(view, follow.fresh, arrival);
  const [allStages, setAllStages] = useState(false);
  // The page's own source line, and the last section's when it would say
  // the same words just above it ("Updated 17 Sep 2026 · ParlInfo" twice,
  // build 61 bug 5): that section then carries the page's line, with both
  // sheets' originals and notes, and the page draws no second one.
  const pageSource = billSourceDetails(view, identity, savedAt);
  const foot = footSection(view, votes.has);
  const footSource =
    foot === 'related'
      ? relatedSource(view, savedAt)
      : foot === 'dates'
        ? keyDatesSource(view, savedAt)
        : null;
  const sharedSource =
    footSource && sameSourceLine(footSource, pageSource)
      ? shareSourceLine(pageSource, footSource)
      : null;
  // "?section=changes" scrolls once the followed bill's changes are in.
  const arrived = useRef(false);
  const hasChanges = !!follow.group;
  useEffect(() => {
    if (arrived.current || arrival.section !== 'changes' || !hasChanges) return;
    arrived.current = true;
    targets.scrollTo(changesRef, true);
  }, [arrival.section, hasChanges, targets]);
  const onChange = (change: Change) => {
    const record = change.record;
    if (!record) return;
    if (record.kind === 'division' || record.kind === 'vote') {
      if (!votes.reveal(record.divisionKey ?? record.key)) votes.showSection();
    } else if (record.kind === 'stage') {
      setAllStages(true);
      targets.scrollTo(datesRef);
    } else if (record.kind === 'speech') targets.scrollTo(speechesRef);
  };
  const head = (
    <View style={styles.head}>
      {stale?.kind === 'offline' ? (
        <OfflineLine savedAt={stale.at} testID="bill-offline" />
      ) : stale?.kind === 'failed' ? (
        <InlineError
          subject="the latest version of this bill"
          message={`The latest version of this bill couldn't be loaded. Showing the copy saved on ${dayMonth(stale.at)}.`}
          onRetry={stale.retry}
          testID="bill-stale"
        />
      ) : null}
      <BillHead
        view={view}
        identity={identity}
        name={name}
        titleRef={titleRef}
        onTitleLayout={onTitleLayout}
        directory={directory}
      />
      {follow.group ? (
        <View ref={changesRef} collapsable={false} style={styles.added}>
          <AddedSinceGroup
            follow={follow.group.follow}
            changes={follow.group.changes}
            stale={follow.group.stale}
            testID="bill-added-since"
            onRowPress={onChange}
          />
        </View>
      ) : null}
    </View>
  );
  const body = (
    <>
      <Consultation view={view} />
      <Summary view={view} savedAt={savedAt} />
      {/* Ask and the bill text are one group: a single rule between them
          and none around (sweep 1, item 9). */}
      <View testID="bill-ask-and-text">
        {onAsk ? (
          <View style={styles.askRow}>
            <Button
              label="Ask about this bill"
              variant="primary"
              symbol={symbols.ask}
              accessibilityLabel={`Ask about this bill: ${name}`}
              accessibilityHint="Opens Ask with a question drafted"
              onPress={onAsk}
              testID="bill-ask"
            />
          </View>
        ) : null}
        <View style={onAsk ? styles.textRow : null} testID="bill-read-text-row">
          <LinkRow
            title="Bill text"
            symbol="doc.text"
            accessibilityHint="Opens the bill text"
            onPress={() => bills.openText(identity.key, name)}
            testID="bill-read-text"
          />
        </View>
      </View>
      <KeyDates
        view={view}
        savedAt={savedAt}
        anchor={datesRef}
        open={allStages}
        onToggle={setAllStages}
        freshStages={follow.freshStages}
        pageSource={foot === 'dates' ? sharedSource : null}
      />
      <Votes view={view} votes={votes} savedAt={savedAt} targets={targets} />
      <Speeches
        view={view}
        name={name}
        savedAt={savedAt}
        anchor={speechesRef}
        fresh={follow.fresh}
      />
      <Acts view={view} savedAt={savedAt} />
      <Related
        view={view}
        savedAt={savedAt}
        pageSource={foot === 'related' ? sharedSource : null}
      />
      {sharedSource ? null : (
        <SourceLine {...pageSource} testID="bill-source" />
      )}
    </>
  );
  // The header seeded from the tapped row is real data: it stays still, in
  // place, while only the body below it fades in from its skeleton.
  const steadyHead =
    isValidElement(crossfade.skeleton) &&
    crossfade.skeleton.type === SeededBodySkeleton;
  return steadyHead ? (
    <>
      {head}
      <CrossfadeLayers crossfade={crossfade} sectioned>
        {body}
      </CrossfadeLayers>
    </>
  ) : (
    <CrossfadeLayers crossfade={crossfade} sectioned>
      {head}
      {body}
    </CrossfadeLayers>
  );
}

/**
 * The bill's identity, said once: status and its dated event, the title,
 * the meta line, who brought it, and Follow.
 */
function BillHead({
  view,
  identity,
  name,
  titleRef,
  onTitleLayout,
  directory,
}: {
  view: BillView;
  identity: Identity;
  name: string;
  titleRef?: RefObject<View | null>;
  onTitleLayout?: (event: LayoutChangeEvent) => void;
  directory: SponsorDirectory | null | undefined;
}) {
  const event = statusEvent({
    status: identity.status,
    status_as_of: identity.statusAsOf,
    originating_house: identity.house,
    key_dates: view.keyDates.data ?? [],
  });
  const meta = metaLine(identity);
  return (
    <View style={styles.headBlock}>
      <View style={styles.titleBlock}>
        <StatusLine
          status={identity.statusLabel}
          event={headerEvent(event, identity)}
        />
        <View ref={titleRef} collapsable={false} onLayout={onTitleLayout}>
          <Heading level={1} testID="bill-title">
            {identity.title}
          </Heading>
        </View>
        {identity.shortTitle && identity.shortTitle !== identity.title ? (
          <Text variant="secondary" wordSafe>
            Known as the {identity.shortTitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="secondary" wordSafe testID="bill-introduced">
            {meta}
          </Text>
        ) : null}
      </View>
      <Sponsors identity={identity} directory={directory} />
      <FollowButton
        kind="bill"
        id={identity.key}
        title={name}
        testID="bill-follow"
      />
    </View>
  );
}

/** Page provenance follows the last content section, including related bills. */
/** The page's own source line: the bill's identity record (testID bill-source). */
function billSourceDetails(
  view: BillView,
  identity: Identity,
  savedAt: number | null,
): SourceDetails {
  const draft = identity.status === 'exposure_draft';
  const event = statusEvent({
    status: identity.status,
    status_as_of: identity.statusAsOf,
    originating_house: identity.house,
    key_dates: view.keyDates.data ?? [],
  });
  const sources = view.identity.sources;
  const originals: SourceOriginal[] = sources.map((s) =>
    s.label === billSourceLabel('billhome')
      ? { label: 'Parliament of Australia', url: s.url, record: 'bill home' }
      : { label: s.label, url: s.url },
  );
  const unsponsored = !identity.sponsorMembers.length && !identity.sponsorParty;
  return {
    asOf: view.identity.asAt,
    citation: draft ? unique(sources.map((s) => s.label)) : 'ParlInfo',
    savedAt,
    originals,
    licence:
      unique(sources.map((s) => s.licence).filter(Boolean)).join(', ') || null,
    notes: [
      unsponsored && !draft ? 'Sponsor not recorded.' : null,
      event && !event.resolved ? notes.status : null,
    ],
  };
}

/** The sections after Bill text, in page order, as each decides to draw. */
const hasKeyDates = (view: BillView) =>
  billTimeline(view.keyDates.data ?? []).entries.length > 0;
const shownSpeeches = (view: BillView) =>
  (view.speeches.data ?? []).filter((s) => s.slug);
const shownActs = (view: BillView) =>
  (view.acts.data ?? []).filter((a) => a.title);
const hasRelated = (view: BillView) => view.related.length > 0 || !!view.became;
/** The last section drawn above the page's own source line. */
export function footSection(view: BillView, hasVotes: boolean) {
  if (hasRelated(view)) return 'related' as const;
  if (shownActs(view).length) return 'acts' as const;
  if (shownSpeeches(view).length) return 'speeches' as const;
  if (hasVotes) return 'votes' as const;
  if (hasKeyDates(view)) return 'dates' as const;
  return null;
}
/** True when two source lines draw the same words. */
export function sameSourceLine(a: SourceDetails, b: SourceDetails) {
  return (
    JSON.stringify(sourceLineParts(a)) === JSON.stringify(sourceLineParts(b))
  );
}
/**
 * The page's line carrying a section's sheet as well: the page's originals
 * in their order, then the section's that are not already there, and both
 * sets of notes.
 */
export function shareSourceLine(
  page: SourceDetails,
  section: SourceDetails,
): SourceDetails {
  const originals = [...(page.originals ?? [])];
  for (const original of section.originals ?? [])
    if (!originals.some((o) => o.url === original.url))
      originals.push(original);
  return {
    ...page,
    originals,
    notes: [...(page.notes ?? []), ...(section.notes ?? [])],
  };
}

/** The meta line already dates introduction; later status events still show. */
function headerEvent(
  event: ReturnType<typeof statusEvent>,
  bill: { introduced: string | null; introducedLabel: string },
) {
  return event?.label === bill.introducedLabel && event.date === bill.introduced
    ? null
    : event;
}

/**
 * "[Passed] Royal Assent 26 Aug 2026": the status and the event that dates
 * it. While the event is unresolved (`pending`) a date skeleton stands in:
 * the status word is never drawn beside a bare date.
 */
function StatusLine({
  status,
  event,
  pending = false,
}: {
  status: string;
  event: ReturnType<typeof statusEvent>;
  pending?: boolean;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${status}${event ? `. ${event.label}, ${formatDate(event.date)}` : ''}`}
      testID="bill-status"
      style={[styles.status, stacked ? styles.stacked : null]}
    >
      {/* At accessibility sizes the capsule fills its parent; this keeps it
          to its word (w4-bill-ax5-01). */}
      <View style={styles.capsule}>
        <StatusCapsule status={status} hidden />
      </View>
      {event ? (
        <Text variant="secondary" tabular wordSafe>
          {statusEventText(event)}
        </Text>
      ) : pending ? (
        <Bone width={120} height={15} />
      ) : null}
    </View>
  );
}

/** A skeleton bar in the `Skeleton` primitive's look. */
function Bone({
  width,
  height,
  round = false,
}: {
  width: DimensionValue;
  height: number;
  round?: boolean;
}) {
  return (
    <View
      style={[styles.bone, { width, height }, round ? styles.boneRound : null]}
    />
  );
}

type IndexRow = NonNullable<ReturnType<typeof catalogs.billIndexRow>> & {
  status_stage?: string | null;
};

/** The meta line: "Introduced 17 Sep 2026 · House of Representatives". */
function metaLine(bill: {
  status: string;
  introduced: string | null;
  introducedLabel: string;
  house: string | null;
}) {
  if (bill.introduced)
    return [
      `${bill.introducedLabel} ${short(bill.introduced)}`,
      bill.house ? chamberLabel(bill.house) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  return bill.status === 'exposure_draft'
    ? 'Exposure draft, not yet introduced'
    : null;
}

/**
 * The header from the bills index row, drawn at once while the bill's own
 * file loads (specs/bills.md 4.3): the same title in the same place, the
 * sponsor's name without a portrait, and a live Follow. The status event
 * waits for the key dates unless the row names its stage.
 */
function SeededHead({ row }: { row: IndexRow }) {
  const display = billDisplay(row);
  const name = billName(row);
  const status = billSentenceCase(row.status) || 'Status not recorded';
  const event = row.status_stage ? statusEvent(row) : null;
  const meta = metaLine({
    status: row.status,
    introduced: row.introduced,
    introducedLabel: display.introducedLabel,
    house: row.originating_house,
  });
  const members = display.sponsorMembers;
  return (
    <View style={styles.headBlock} testID="bill-seed">
      <View style={styles.titleBlock}>
        <StatusLine
          status={status}
          event={headerEvent(event, {
            introduced: row.introduced,
            introducedLabel: display.introducedLabel,
          })}
          pending={!event && !!row.status_as_of}
        />
        <TitleAnchor>
          <Heading level={1} testID="bill-title">
            {row.title}
          </Heading>
        </TitleAnchor>
        {row.short_title && row.short_title !== row.title ? (
          <Text variant="secondary" wordSafe>
            Known as the {row.short_title}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="secondary" wordSafe testID="bill-introduced">
            {meta}
          </Text>
        ) : null}
      </View>
      {members.length || display.sponsor_party ? (
        <View
          accessible
          accessibilityLabel={`${members.map((m) => m.name).join(', ') || display.sponsor_party}, ${members.length > 1 ? 'Sponsors' : 'Sponsor'}`}
          style={styles.seedSponsor}
        >
          <Text wordSafe>
            {members.map((m) => m.name).join(', ') || display.sponsor_party}
          </Text>
          <Text variant="secondary" wordSafe>
            {members.length > 1 ? 'Sponsors' : 'Sponsor'}
          </Text>
        </View>
      ) : display.portfolio ? (
        <Text variant="secondary" wordSafe testID="bill-portfolio">
          {`${display.portfolio} portfolio`}
        </Text>
      ) : null}
      <FollowButton
        kind="bill"
        id={row.key}
        title={name}
        testID="bill-follow"
      />
    </View>
  );
}

/** Below a seeded header: one element, "Loading the bill". */
function SeededBodySkeleton() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the bill"
      accessibilityState={{ busy: true }}
      testID="bill-loading"
    >
      <BodySkeleton />
    </View>
  );
}

/** In short and How it moved, in their final shapes, while they load. */
function BodySkeleton() {
  return (
    <View style={styles.seedBody}>
      <View style={styles.seedBlock}>
        <Bone width="40%" height={22} />
        <Bone width={96} height={20} round />
        <Skeleton shape="text" count={4} label="Loading In short" />
      </View>
      <View style={styles.seedBlock}>
        <Bone width="40%" height={22} />
        <Bone width="100%" height={2} />
        <Skeleton shape="rows" count={3} label="Loading How it moved" />
      </View>
    </View>
  );
}

/**
 * A cold load (a deep link or an Ask source): the whole page in the
 * header's final shape, then In short. One element, "Loading the bill".
 */
function ColdSkeleton() {
  return (
    <View style={styles.headBlock}>
      <Skeleton
        shape="bill-header"
        label="Loading the bill"
        testID="bill-loading"
      />
      <View style={styles.seedBlock}>
        <Bone width="40%" height={22} />
        <Bone width={96} height={20} round />
        <Skeleton shape="text" count={4} label="Loading In short" />
      </View>
    </View>
  );
}

/** Who brought it: people rows with "Sponsor", a party, or a portfolio line. */
function Sponsors({
  identity,
  directory,
}: {
  identity: Identity;
  directory: SponsorDirectory | null | undefined;
}) {
  const sponsors = useMemo(
    () =>
      sponsorRows(
        identity.sponsorMembers,
        identity.sponsorParty,
        identity.sponsorPersonId,
        directory ?? null,
      ),
    [identity, directory],
  );
  if (identity.sponsorMembers.length)
    return (
      <View testID="bill-sponsor">
        {sponsors.map((sponsor, index) => (
          <SponsorRow
            key={`${index}-${sponsor.name}`}
            sponsor={sponsor}
            index={index}
            detail={
              index === 0
                ? sponsors.length === 1
                  ? 'Sponsor'
                  : 'Sponsors'
                : undefined
            }
            loading={directory === undefined}
          />
        ))}
      </View>
    );
  if (identity.sponsorParty)
    return (
      <View testID="bill-sponsor">
        <LinkRow
          title={identity.sponsorParty}
          detail="Sponsor"
          accessibilityHint="Opens the party"
          onPress={() => router.push(partyRoute(identity.sponsorParty!))}
          testID="bill-sponsor-party"
        />
      </View>
    );
  if (identity.portfolio)
    return (
      <Text variant="secondary" wordSafe testID="bill-portfolio">
        {`${identity.portfolio} portfolio`}
      </Text>
    );
  return null;
}

function SponsorRow({
  sponsor,
  index,
  detail,
  loading,
}: {
  sponsor: ReturnType<typeof sponsorRows>[number];
  index: number;
  detail?: string;
  loading: boolean;
}) {
  const slug = sponsor.slug;
  const yourMP = useIsMyMember(slug ?? '');
  return (
    <PersonRow
      name={sponsor.name}
      portrait={
        slug ? (
          <CachedPortrait name={sponsor.name} slug={slug} />
        ) : (
          <Portrait loading={loading} />
        )
      }
      {...(sponsor.party
        ? {
            party: sponsor.party.party,
            partyStatus: sponsor.party.status,
            formerly: sponsor.party.formerly,
          }
        : { party: undefined })}
      place={sponsor.place}
      detail={detail}
      yourMP={!!slug && yourMP}
      statusShown={!!sponsor.place?.startsWith('Formerly ')}
      href={slug ? personRoute(slug, sponsor.name) : undefined}
      testID={slug ? `bill-sponsor-${slug}` : `bill-sponsor-unlinked-${index}`}
    />
  );
}

/** An exposure draft's consultation, with one source line. */
function Consultation({ view }: { view: BillView }) {
  const consultation = view.consultation.data;
  if (view.identity.data?.status !== 'exposure_draft' || !consultation)
    return null;
  // Closing dates are Australian calendar days; the UTC date lags a day
  // every Australian morning.
  const closed = !!consultation.closes && consultation.closes < sydneyDay();
  return (
    <Section title="Consultation" testID="bill-consultation">
      <Text variant="body">
        {consultation.closes
          ? `Consultation opened ${short(consultation.opens)} and ${closed ? 'closed' : 'closes'} ${short(consultation.closes)}.`
          : `Consultation opened ${short(consultation.opens)}.`}
      </Text>
      {consultation.note ? (
        <Text variant="secondary">{consultation.note}</Text>
      ) : null}
      <LinkRow
        title="Consultation page"
        external
        onPress={() => void openSource(consultation.url, 'Consultation page')}
        testID="bill-consultation-page"
      />
      <SourceLine
        asOf={consultation.opens}
        citation="Consultation page"
        originals={[{ label: 'Consultation page', url: consultation.url }]}
        testID="bill-consultation-source"
      />
    </Section>
  );
}

function Summary({
  view,
  savedAt,
}: {
  view: BillView;
  savedAt: number | null;
}) {
  const summary = view.summary.data;
  if (!summary) return null;
  const sentences = summary.sentences.filter(Boolean);
  const changes = summary.changes.filter(Boolean);
  const shown = changes.length > 3 ? changes.slice(0, 3) : changes;
  const more = changes.slice(shown.length);
  const sources = view.summary.sources;
  return (
    <Section testID="bill-summary">
      <MachineSummary
        attribution={summary.attribution}
        sentences={sentences}
        testID="bill-summary"
      />
      {changes.length ? (
        <Section title="What it changes">
          {shown.map((change, index) => (
            <Bullet key={index}>{change}</Bullet>
          ))}
          {more.length ? (
            <Disclosure
              label={`${more.length} more ${more.length === 1 ? 'change' : 'changes'}`}
              testID="bill-summary-changes-more"
            >
              {more.map((change, index) => (
                <Bullet key={index}>{change}</Bullet>
              ))}
            </Disclosure>
          ) : null}
        </Section>
      ) : null}
      {summary.affected ? (
        <Section title="Who is affected">
          <Text variant="body">{summary.affected}</Text>
        </Section>
      ) : null}
      <SourceLine
        asOf={summary.as_of ?? summary.generated_at}
        citation={unique(sources.map((s) => s.label))}
        savedAt={savedAt}
        originals={sources.map((s) => ({ label: s.label, url: s.url }))}
        notes={[
          notes.summary,
          summary.describes_version
            ? `Describes the bill ${summary.describes_version}.`
            : null,
        ]}
        licence={
          unique(sources.map((s) => s.licence).filter(Boolean)).join(', ') ||
          null
        }
        testID="bill-summary-source"
      />
    </Section>
  );
}

// Statuses that end a bill's passage. The register files the day a bill
// lapsed, was withdrawn or was negatived as a stage called "other".
const TERMINAL_STATUS =
  /^(?:lapsed|withdrawn|negatived|defeated|discharged|failed|not passed|not proceeded with|removed from the notice paper)\b/i;

/**
 * The timeline's labelled points: where the bill began, where it crossed
 * to the other house ("Senate" or "House"), and where it ended ("Royal
 * Assent", or the terminal status for a bill that ended on "Other").
 */
export function rulerPoints(
  entries: readonly BillTimelineEntry[],
  status?: string | null,
) {
  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  const home = first.stages.find((s) => s.house)?.house ?? null;
  const crossed = home
    ? entries.findIndex(
        (entry, i) =>
          i > 0 &&
          i < entries.length - 1 &&
          entry.stages.some((s) => s.house && s.house !== home),
      )
    : -1;
  const house = (h: string) =>
    h === 'senate'
      ? 'Senate'
      : h === 'representatives'
        ? 'House'
        : chamberLabel(h);
  const points = [{ at: 0, label: first.stages[0]!.stage, date: first.from }];
  if (crossed > 0) {
    const entry = entries[crossed]!;
    const stage = entry.stages.find((s) => s.house && s.house !== home)!;
    points.push({ at: crossed, label: house(stage.house!), date: entry.from });
  }
  const ended = last.stages[last.stages.length - 1]!.stage;
  const terminal = status ? billSentenceCase(status) : '';
  points.push({
    at: entries.length - 1,
    label:
      /^other$/i.test(ended.trim()) && TERMINAL_STATUS.test(terminal)
        ? terminal
        : /^royal assent$/i.test(ended.trim())
          ? 'Royal Assent'
          : ended,
    date: last.to ?? last.from,
  });
  return points;
}

/** Whether a stage change dated `date` falls on this entry's day or span. */
function entryHas(entry: BillTimelineEntry, dates: ReadonlySet<string>) {
  const to = entry.to ?? entry.from;
  for (const date of dates) if (date >= entry.from && date <= to) return true;
  return false;
}

function DateRows({
  entries,
  freshStages,
}: {
  entries: readonly BillTimelineEntry[];
  freshStages: ReadonlySet<string>;
}) {
  return (
    <View style={styles.dates}>
      {entries.map((entry, index) => (
        <View
          key={`${entry.from}-${entry.to}-${index}`}
          accessible
          // The row's label replaces its children's: the dot's "New" is said here.
          accessibilityLabel={`${dateSpan(entry.from, entry.to, 'long')}: ${entry.stages.map(stageText).join('; ')}${entryHas(entry, freshStages) ? '. New' : ''}`}
          testID={`bill-date-${index}`}
          style={styles.date}
        >
          <View style={styles.dot} />
          <View style={styles.dateText}>
            <Text variant="strong" tabular>
              {dateSpan(entry.from, entry.to)}
            </Text>
            {entry.stages.map((stage, i) => (
              <Text key={i} variant="secondary" wordSafe>
                {stageText(stage)}
              </Text>
            ))}
          </View>
          {entryHas(entry, freshStages) ? (
            <NewDot testID={`bill-date-${index}-new`} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** How it moved's own source line: ParlInfo's key dates. */
function keyDatesSource(view: BillView, savedAt: number | null): SourceDetails {
  const originals: SourceOriginal[] = unique(
    view.keyDates.sources.map((s) => s.url),
  ).map((url) => ({ label: 'ParlInfo', url, record: 'bill record' }));
  return {
    asOf: view.keyDates.asAt,
    citation: 'ParlInfo',
    savedAt,
    originals,
    notes: [notes.voices],
  };
}

function KeyDates({
  view,
  savedAt,
  anchor,
  open,
  onToggle,
  freshStages,
  pageSource,
}: {
  view: BillView;
  savedAt: number | null;
  anchor: RefObject<View | null>;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** Dates of the follow's stage changes. */
  freshStages: ReadonlySet<string>;
  /** The page's own line, drawn here in place of this section's. */
  pageSource?: SourceDetails | null;
}) {
  const timeline = billTimeline(view.keyDates.data ?? []);
  const entries = timeline.entries;
  if (!entries.length) return null;
  const points =
    entries.length > 1 ? rulerPoints(entries, view.identity.data?.status) : [];
  return (
    <View ref={anchor} collapsable={false}>
      <Section title="How it moved" testID="bill-key-dates">
        {points.length ? (
          <View
            testID="bill-dates-ruler"
            accessibilityLabel={points
              .map((p) => `${p.label}, ${formatDate(p.date)}`)
              .join('; ')}
          >
            <StageTimeline
              stages={points.map((p) => ({
                label: p.label,
                date: short(p.date),
              }))}
              latestIndex={points.length - 1}
              // The section's own "Updated · ParlInfo" line sources it; a
              // second, differently written line is not drawn (sweep 1,
              // item 9). The ruler's label still says every stage and date.
              caption={false}
              {...chartSource(
                entries[0]!.from,
                points.at(-1)!.date,
                'ParlInfo',
              )}
            />
          </View>
        ) : null}
        {entries.length === 1 ? (
          <DateRows entries={entries} freshStages={freshStages} />
        ) : timeline.runs > points.length ||
          entries.some((entry) => entry.to) ? (
          <Disclosure
            label={`All ${formatCount(timeline.runs)} stages`}
            open={open}
            onToggle={onToggle}
            testID="bill-dates-all"
          >
            <DateRows entries={entries} freshStages={freshStages} />
          </Disclosure>
        ) : null}
        {pageSource ? (
          <SourceLine {...pageSource} testID="bill-source" />
        ) : (
          <SourceLine
            {...keyDatesSource(view, savedAt)}
            testID="bill-dates-source"
          />
        )}
      </Section>
    </View>
  );
}

/** The votes section's state: order, what is revealed, and where each row is. */
/** A link's key, or the shown row a collapsed duplicate folded into. */
function findDivision(view: BillView, key: string | undefined) {
  if (!key) return undefined;
  const rows = view.divisions.data?.rows ?? [];
  const direct = rows.find((d) => d.key === key);
  if (direct) return direct;
  const dup = (view.divisions.data?.rawRows ?? []).find((d) => d.key === key);
  return dup
    ? rows.find(
        (d) =>
          d.date === dup.date &&
          d.house === dup.house &&
          d.ayes === dup.ayes &&
          d.noes === dup.noes &&
          (d.stage ?? '') === (dup.stage ?? ''),
      )
    : undefined;
}

/**
 * The votes section's state: order, what is revealed and expanded, and the
 * vote (or the section) to scroll to next. A `?division=` arrival starts
 * revealed and expanded, so the row lays out where the scroll expects it.
 */
function useVotes(
  view: BillView,
  fresh: ReadonlySet<string>,
  arrival: Arrival,
) {
  const rows = useMemo(() => view.divisions.data?.rows ?? [], [view]);
  const order = useMemo(() => orderDivisions(rows), [rows]);
  const [start] = useState(() => {
    const target = findDivision(view, arrival.division);
    const main = target ? order.main.indexOf(target) : -1;
    return { target, main };
  });
  const [showAll, setShowAll] = useState(start.main >= VOTES_SHOWN);
  const [proceduralOpen, setProceduralOpen] = useState(
    (!!start.target && start.main < 0) ||
      (order.main.length === 0 && order.procedural.length > 0),
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(start.target ? [start.target.key] : []),
  );
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(
    start.target ? { key: start.target.key, n: 1 } : null,
  );
  const [sectionFocus, setSectionFocus] = useState(
    !start.target && arrival.section === 'divisions' && rows.length ? 1 : 0,
  );
  return {
    has: rows.length > 0,
    order,
    showAll,
    setShowAll,
    proceduralOpen,
    setProceduralOpen,
    expanded,
    fresh,
    focus,
    sectionFocus,
    toggle(key: string) {
      setExpanded((old) => {
        const next = new Set(old);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    showSection: () => setSectionFocus((n) => n + 1),
    /** Reveal, expand and scroll to a vote; false when no vote matches. */
    reveal(key: string) {
      const division = findDivision(view, key);
      if (!division) return false;
      const main = order.main.indexOf(division);
      if (main >= VOTES_SHOWN) setShowAll(true);
      if (main < 0) setProceduralOpen(true);
      setExpanded((old) => new Set([...old, division.key]));
      setFocus((old) => ({ key: division.key, n: (old?.n ?? 0) + 1 }));
      return true;
    },
  };
}
type VotesState = ReturnType<typeof useVotes>;

function Votes({
  view,
  votes,
  savedAt,
  targets,
}: {
  view: BillView;
  votes: VotesState;
  savedAt: number | null;
  targets: Targets;
}) {
  const identity = view.identity.data!;
  const reduceMotion = useReduceMotion();
  const headerBottom = useHeaderBottom();
  const member = useMyMemberVotes(votes.has);
  const [rowWidth, setRowWidth] = useState<number>();
  const headerRef = useRef<View>(null);
  useEffect(() => {
    if (votes.sectionFocus) targets.scrollTo(headerRef, true);
  }, [votes.sectionFocus, targets]);
  if (!votes.has) return null;
  const { main, procedural } = votes.order;
  const hidden = main.length - VOTES_SHOWN;
  const ordered = [...main, ...procedural];
  const all = view.divisions.data!.rows;
  const row = (division: Division) => (
    <BillVoteRow
      key={division.key}
      division={division}
      width={rowWidth}
      index={ordered.indexOf(division)}
      bill={identity}
      expanded={votes.expanded.has(division.key)}
      onToggle={() => votes.toggle(division.key)}
      focus={votes.focus?.key === division.key ? votes.focus.n : 0}
      targets={targets}
      isNew={votes.fresh.has(division.key)}
      memberVote={
        member
          ? (() => {
              const position = memberPosition(
                member,
                { title: identity.title, shortTitle: identity.shortTitle },
                division,
                all,
              );
              return position
                ? { name: member.name, slug: member.slug, position }
                : null;
            })()
          : null
      }
    />
  );
  // Collapsing keeps the reader in the section: a header already above the
  // bar lands just under it.
  const collapse = () => {
    votes.setShowAll(false);
    headerRef.current?.measureInWindow((_x, y) => {
      if (y < headerBottom) targets.scrollTo(headerRef);
    });
  };
  return (
    <View
      ref={headerRef}
      collapsable={false}
      testID="bill-divisions-layout"
      onLayout={({ nativeEvent: { layout } }) => {
        if (layout.width > 0) setRowWidth(layout.width);
      }}
    >
      <Section
        title="How parliament voted"
        testID="bill-divisions"
        headingTestID="bill-divisions-title"
      >
        {main.length ? (
          <View>
            {main.slice(0, VOTES_SHOWN).map(row)}
            {/* The further votes ease open and closed below the first. */}
            <HeightReveal reduceMotion={reduceMotion}>
              {votes.showAll && hidden > 0 ? (
                <View>{main.slice(VOTES_SHOWN).map(row)}</View>
              ) : null}
            </HeightReveal>
          </View>
        ) : null}
        {hidden > 0 ? (
          <ShowMoreButton
            hidden={hidden}
            noun={hidden === 1 ? 'vote' : 'votes'}
            open={votes.showAll}
            onToggle={() => {
              if (votes.showAll) collapse();
              else votes.setShowAll(true);
            }}
            testID="bill-divisions-more"
          />
        ) : null}
        {procedural.length ? (
          <Disclosure
            label={`Procedural votes (${formatCount(procedural.length)})`}
            open={votes.proceduralOpen}
            onToggle={votes.setProceduralOpen}
            testID="bill-divisions-procedural"
          >
            <View>{procedural.map(row)}</View>
          </Disclosure>
        ) : null}
        <SourceLine
          asOf={view.divisions.asAt}
          citation="They Vote For You"
          licence="ODbL"
          savedAt={savedAt}
          rule={notes.chosen}
          originals={ordered.map((d) => ({
            label: 'They Vote For You',
            url: d.url,
            record: `division, ${short(d.date)}`,
          }))}
          notes={[view.divisions.data!.partyBasisNote || null, notes.stages]}
          testID="bill-divisions-source"
        />
      </Section>
    </View>
  );
}

/**
 * One vote on the bill page: the recorded stage, chamber and date, the
 * outcome, the split in words. It expands in place to the party votes and
 * the question; its long press holds the vote's original.
 */
function BillVoteRow({
  division,
  width,
  index,
  bill,
  expanded,
  onToggle,
  focus,
  targets,
  isNew,
  memberVote,
}: {
  division: Division;
  /** The list's width also constrains the intrinsically sized iOS menu trigger. */
  width: number | undefined;
  index: number;
  bill: Identity;
  expanded: boolean;
  onToggle: () => void;
  /** Changes each time this vote is the scroll target. */
  focus: number;
  targets: Targets;
  isNew: boolean;
  memberVote: {
    name: string;
    slug: string;
    position: 'for' | 'against';
  } | null;
}) {
  const id = `bill-division-${index}`;
  const stacked = useAccessibilitySize();
  const reduceMotion = useReduceMotion();
  const anchor = useRef<View>(null);
  useEffect(() => {
    if (focus) targets.scrollTo(anchor, true);
  }, [focus, targets]);
  const title = divisionTitle(division);
  const meta = [chamberLabel(division.house), short(division.date)].join(' · ');
  const outcome = outcomeWord(division.outcome, division);
  const parties = divisionParties(division.splits);
  const question = divisionQuestion(division.question, division.stage, {
    title: bill.title,
    short_title: bill.shortTitle,
  });
  const link = canonicalUrl(
    `/bill/${bill.key}?division=${encodeURIComponent(division.key)}`,
  );
  const name = billName({ title: bill.title, short_title: bill.shortTitle });
  const follow = useRowFollow('bill', bill.key, name);
  const actions = [
    {
      title: 'Open on They Vote For You',
      onPress: () => void openSource(division.url, 'They Vote For You'),
    },
    {
      title: follow.following ? 'Unfollow bill' : 'Follow bill',
      onPress: () => {
        follow.onFollow();
        if (!follow.following) haptic('success');
      },
    },
    {
      title: 'Copy link',
      onPress: () => {
        void copyText(link).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
    ...(canShare
      ? [
          {
            title: 'Share',
            onPress: () =>
              void shareRecord({
                path: `/bill/${bill.key}?division=${encodeURIComponent(division.key)}`,
                title: `${title}, ${name}`,
              }),
          },
        ]
      : []),
  ];
  return (
    <View ref={anchor} collapsable={false} testID={id} style={styles.vote}>
      <ContextMenu items={actions}>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={[
            title,
            meta,
            outcome,
            countWords(division.ayes, division.noes, { spoken: true }),
            isNew ? 'New' : null,
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityHint="Shows the party votes and the question"
          accessibilityState={{ expanded }}
          accessibilityActions={actions.map((a) => ({
            name: a.title,
            label: a.title,
          }))}
          onAccessibilityAction={(event) =>
            actions
              .find((a) => a.title === event.nativeEvent.actionName)
              ?.onPress()
          }
          onPress={onToggle}
          testID={`${id}-more`}
          style={({ pressed }) => [
            styles.voteRow,
            { width },
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.voteMain}>
            <View style={styles.voteTitle}>
              {isNew ? <NewDot testID={`${id}-new`} /> : null}
              <Text
                variant="rowRecord"
                wordSafe
                testID={`${id}-title`}
                style={styles.grow}
              >
                {title}
              </Text>
            </View>
            <Text variant="secondary" wordSafe>
              {meta}
            </Text>
            <View style={[styles.outcome, stacked ? styles.stacked : null]}>
              <StatusCapsule status={outcome} testID={`${id}-outcome`} hidden />
              <View style={stacked ? null : styles.grow}>
                <VoteSplit
                  ayes={division.ayes}
                  noes={division.noes}
                  countsStyle="ayesNoes"
                  {...chartSource(
                    division.date,
                    division.date,
                    'They Vote For You',
                  )}
                />
              </View>
            </View>
          </View>
          <Icon
            name={expanded ? chevrons.open : chevrons.closed}
            size={13}
            maxScale={1.5}
            tone="inkFaint"
          />
        </Pressable>
      </ContextMenu>
      {memberVote ? (
        <LinkRow
          title={`${memberVote.name}, your MP, voted ${memberVote.position}`}
          leading={
            <CachedPortrait name={memberVote.name} slug={memberVote.slug} />
          }
          onPress={() =>
            router.push(personRoute(memberVote.slug, memberVote.name))
          }
          testID={`${id}-your-mp`}
        />
      ) : null}
      <HeightReveal reduceMotion={reduceMotion}>
        {expanded ? (
          <View style={styles.voteBody} testID={`${id}-body`}>
            <View
              collapsable={false}
              testID={`bill-division-${division.key}-expanded`}
            />
            <PartyVotes
              splits={[...division.splits.drawn, ...division.splits.folded]}
              paired={division.paired}
              // Pairs have their own line.
              notes={parties.notes.filter((note) => !/ paired$/.test(note))}
              recorded={parties.recorded}
              testID={`${id}-parties`}
            />
            {question ? (
              <Section title="The question">
                <DivisionQuestion text={question} testID={`${id}-question`} />
              </Section>
            ) : null}
          </View>
        ) : null}
      </HeightReveal>
    </View>
  );
}

function Speeches({
  view,
  name,
  savedAt,
  anchor,
  fresh,
}: {
  view: BillView;
  name: string;
  savedAt: number | null;
  anchor: RefObject<View | null>;
  fresh: ReadonlySet<string>;
}) {
  const speakerFor = useSpeechSpeakers();
  const [all, setAll] = useState(false);
  const speeches = useMemo(
    () => shownSpeeches(view).sort((a, b) => b.date.localeCompare(a.date)),
    [view],
  );
  if (!speeches.length) return null;
  const shown = all ? speeches : speeches.slice(0, SPEECHES_SHOWN);
  const hidden = speeches.length - SPEECHES_SHOWN;
  return (
    <View ref={anchor} collapsable={false}>
      <Section title="Speeches" testID="bill-speeches">
        <MachinePillFor />
        <View>
          {shown.map((speech, index) => (
            <View key={speech.slug} style={styles.speech}>
              {fresh.has(speech.slug) ? (
                <NewDot testID={`bill-speech-${index}-new`} />
              ) : null}
              <View style={styles.grow}>
                <RecordRow
                  meta={`${speech.stage_hint ? billStage(speech.stage_hint) : 'Speech'} · ${short(speech.date)}`}
                  showTitle={false}
                  compact
                  speaker={speakerFor(speech)}
                  excerpt={speech.brief ? { text: speech.brief } : null}
                  href={docRoute(speech.slug, speech.speaker)}
                  testID={`bill-speech-${index}`}
                />
              </View>
            </View>
          ))}
        </View>
        {hidden > 0 ? (
          <ShowMoreButton
            hidden={hidden}
            noun={hidden === 1 ? 'speech' : 'speeches'}
            open={all}
            onToggle={() => setAll(!all)}
            testID="bill-speeches-more"
          />
        ) : null}
        {/* Every speech that names the bill, not only the linked ones. */}
        <LinkRow
          title={`Search speeches for "${name}"`}
          symbol="magnifyingglass"
          onPress={() =>
            router.push(resultsRoute('all', { scope: 'speeches', q: name }))
          }
          testID="bill-speeches-search"
        />
        <SourceLine
          asOf={view.speeches.asAt}
          citation="Hansard"
          savedAt={savedAt}
          originals={[
            {
              label: 'Hansard',
              url: 'https://www.aph.gov.au/Parliamentary_Business/Hansard',
              record: 'Parliament of Australia',
            },
          ]}
          notes={[notes.speeches]}
          testID="bill-speeches-source"
        />
      </Section>
    </View>
  );
}
/** One pill for every speech brief in the block. */
function MachinePillFor() {
  return (
    <View style={styles.pill}>
      <MachineNotePill />
    </View>
  );
}
function MachineNotePill() {
  return (
    <MachinePill
      note={{ title: 'Machine-written', body: [notes.speeches] }}
      testID="bill-speeches-label"
    />
  );
}

function Acts({ view, savedAt }: { view: BillView; savedAt: number | null }) {
  const acts = shownActs(view);
  if (!acts.length) return null;
  return (
    <Section title="What became law" testID="bill-acts">
      <View>
        {acts.map((act, index) => (
          <LinkRow
            key={act.frl_uri}
            title={act.title}
            detail={
              act.assent_date ? `Assented ${short(act.assent_date)}` : undefined
            }
            external
            onPress={() => void openSource(act.frl_uri, act.title)}
            testID={`bill-acts-${index}`}
          />
        ))}
      </View>
      <SourceLine
        asOf={view.acts.asAt}
        citation="Federal Register of Legislation"
        savedAt={savedAt}
        originals={acts.map((act) => ({
          label: 'Federal Register of Legislation',
          url: act.frl_uri,
          record: act.title,
        }))}
        testID="bill-acts-source"
      />
    </Section>
  );
}

/**
 * Related bills' own source line. The links come from this bill's own
 * record: ParlInfo's for a bill in parliament, the draft's own pages for an
 * exposure draft.
 */
function relatedSource(view: BillView, savedAt: number | null): SourceDetails {
  const asAt = view.identity.asAt;
  const sources = view.identity.sources;
  const home = sources.filter((s) => s.label === billSourceLabel('billhome'));
  const originals: SourceOriginal[] = home.length
    ? home.map((s) => ({
        label: 'ParlInfo',
        url: s.url,
        record: asAt ? `bill record, ${short(asAt)}` : 'bill record',
      }))
    : sources.map((s) => ({ label: s.label, url: s.url, asOf: asAt }));
  return {
    asOf: asAt,
    citation: home.length ? 'ParlInfo' : unique(sources.map((s) => s.label)),
    savedAt,
    originals,
    notes: [notes.related],
  };
}

function Related({
  view,
  savedAt,
  pageSource,
}: {
  view: BillView;
  savedAt: number | null;
  /** The page's own line, drawn here in place of this section's. */
  pageSource?: SourceDetails | null;
}) {
  const bills = useBillNavigation();
  if (!hasRelated(view)) return null;
  return (
    <Section title="Related bills" testID="bill-related">
      <View>
        {view.related.map((related) => (
          <LinkRow
            key={related.key}
            title={related.title}
            detail={
              related.relation === 'predecessor'
                ? 'Builds on this bill'
                : billSentenceCase(related.relation)
            }
            onPress={() => bills.openBill(related.key, related.title)}
            testID={`bill-related-${related.key}`}
          />
        ))}
        {view.became ? (
          <LinkRow
            title="Introduced to Parliament"
            onPress={() => bills.openBill(view.became!)}
            testID="bill-became"
          />
        ) : null}
      </View>
      {pageSource ? (
        <SourceLine {...pageSource} testID="bill-source" />
      ) : (
        <SourceLine
          {...relatedSource(view, savedAt)}
          testID="bill-related-source"
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  head: { gap: rhythm.block },
  headBlock: { gap: rhythm.block },
  titleBlock: { gap: rhythm.line },
  status: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
    marginBottom: rhythm.line,
  },
  stacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  capsule: { alignSelf: 'flex-start', maxWidth: '100%' },
  added: { marginTop: rhythm.tight },
  bone: {
    backgroundColor: colors.sunken,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
  },
  boneRound: { borderRadius: radii.round, borderCurve: 'continuous' },
  seedSponsor: { gap: rhythm.tight },
  seedBody: { gap: rhythm.group, marginTop: rhythm.group },
  seedBlock: { gap: rhythm.line },
  seedPerson: { flexDirection: 'row', alignItems: 'center', gap: rhythm.line },
  seedPersonText: { flex: 1, gap: rhythm.tight },
  askRow: { paddingBottom: rhythm.row },
  textRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dividerSubtle,
  },
  dates: { gap: rhythm.tight },
  date: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
  dateText: { flex: 1, gap: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: colors.ink,
    borderCurve: 'continuous',
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  vote: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dividerSubtle,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  voteMain: { flex: 1, gap: rhythm.line },
  voteTitle: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  outcome: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  voteBody: { gap: rhythm.block, paddingBottom: rhythm.block },
  pressed: { backgroundColor: colors.sunken },
  speech: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  pill: { alignItems: 'flex-start' },
  paneMenu: {
    minWidth: minimumTarget,
    minHeight: minimumTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.tight,
    backgroundColor: colors.paper,
  },
  androidToolbar: { flexWrap: 'wrap', gap: rhythm.tight },
});
