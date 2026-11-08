import { scopedQuestion } from '../ask/AskAbout';
import { useOpenAsk } from '../ask/open';
import { headerItems, pageMenu } from '../../navigation/chrome';
import {
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
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
import { formatCount, formatDate } from '../../design/format';
import { showMenu } from '../../design/menu';
import { haptic } from '../../design/haptics';
import { copy as words } from '../../design/copy';
import { useReduceMotion } from '../../design/accessibility';
import { animateLayout } from '../../design/disclosure';
import { TitleAnchor } from '../../design/layout';
import { useHeaderBottom } from '../../design/useHeaderBottom';
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
  SourceLine,
  StageTimeline,
  StatusCapsule,
  SubSection,
  Text,
  VoteSplit,
  useAccessibilitySize,
  type SourceOriginal,
} from '../../design/primitives';
import { chrome, colors, minimumTarget, rhythm } from '../../design/tokens';
import { canonicalUrl, openSource } from '../../navigation/external';
import { canShare, shareRecord } from '../../navigation/share';
import { resultsRoute } from '../../navigation/routes/search';
import {
  billListRoute,
  docRoute,
  partyRoute,
  personRoute,
} from '../../navigation/routes';
import { copyText } from '../records/actions';
import { Button as SwiftButton, Host, Menu } from '@expo/ui/swift-ui';
import { symbols } from '../../design/symbols';
import { useRowFollow } from '../../design/row-link';
import { MachinePill } from '../../design/labels';
import { CachedPortrait } from '../CachedPortrait';
import { AddedSinceGroup } from '../follows/AddedSinceGroup';
import { NewDot } from '../follows/NewDot';
import type { Change } from '../follows/changes';
import { followKey } from '../follows/store';
import { useFollowStates } from '../follows/useFollowStates';
import { useIsMyMember } from '../your-mp/useIsMyMember';
import {
  countWords,
  divisionQuestion,
  divisionTitle,
  orderDivisions,
  outcomeWord,
} from './divisions';
import { chamberLabel } from './filters';
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
import { useCatalogRecord } from './useCatalogRecord';
import { useBillNavigation } from './navigation';
import { memberPosition, useMyMemberVotes } from './your-mp-vote';

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
  source: citation,
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
    (refresh: boolean) => catalogs.billFor(key, refresh),
    [key],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
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
  const ask = () => openAsk(scopedQuestion('bill', name));
  const share = () =>
    void shareRecord({ path: `/bill/${key}`, title: name || 'Bill' });
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
  return (
    <>
      {embedded ? null : (
        <Stack.Screen
          options={{
            // The back label for the next screen; the bar title appears by
            // scroll once the H1 passes under the bar.
            title: name || params.name || 'Bill',
            ...headerItems(
              identity ? () => [pageMenu({ name, items: menu })] : undefined,
            ),
          }}
        />
      )}
      <Screen
        testID={view ? 'bill-screen' : 'bill-pending-screen'}
        barTitle={embedded ? undefined : name || undefined}
        scrollRef={scroll}
        onScroll={(y) => {
          offset.current = y;
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={chrome.tint}
          />
        }
      >
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
        ) : !view ? (
          <Skeleton
            shape="text"
            count={5}
            label="Loading the bill"
            testID="bill-loading"
          />
        ) : null}
        {view && identity && record ? (
          <BillPage
            view={view}
            identity={identity}
            name={name}
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
          />
        ) : null}
      </Screen>
      {embedded || notFound || !identity ? null : (
        <BillToolbar onAsk={ask} onShare={share} />
      )}
    </>
  );
}

/**
 * The menu sheet, where no native menu can be drawn: a vote row's long
 * press, and the pane's ⋯ off iOS.
 */
function openMenu(items: readonly { title: string; onPress: () => void }[]) {
  showMenu('', [...items]);
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

/** The bottom toolbar: Ask about this bill and Share, never more. */
function BillToolbar({
  onAsk,
  onShare,
}: {
  onAsk: () => void;
  onShare: () => void;
}) {
  if (Platform.OS !== 'ios')
    return (
      <SafeAreaView edges={['bottom']} style={styles.toolbar}>
        <Button label="Ask about this bill" onPress={onAsk} testID="bill-ask" />
        {canShare ? (
          <Button label="Share" onPress={onShare} testID="bill-share" />
        ) : null}
      </SafeAreaView>
    );
  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        icon="text.bubble"
        accessibilityLabel="Ask about this bill"
        onPress={onAsk}
      >
        Ask about this bill
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      {canShare ? (
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel="Share"
          onPress={onShare}
        >
          Share
        </Stack.Toolbar.Button>
      ) : null}
    </Stack.Toolbar>
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
  const signature = keys.join('|');
  const [seen, setSeen] = useState<{
    signature: string;
    keys: ReadonlySet<string>;
  }>({ signature: '', keys: new Set() });
  if (signature && signature !== seen.signature)
    setSeen({ signature, keys: new Set([...seen.keys, ...keys]) });
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
  directory,
  savedAt,
  stale,
  follow,
  targets,
  arrival,
}: {
  view: BillView;
  identity: Identity;
  name: string;
  directory: SponsorDirectory | null | undefined;
  savedAt: number | null;
  stale: Stale;
  follow: FollowInfo;
  targets: Targets;
  arrival: Arrival;
}) {
  const bills = useBillNavigation();
  const changesRef = useRef<View>(null);
  const datesRef = useRef<View>(null);
  const speechesRef = useRef<View>(null);
  const votes = useVotes(view, follow.fresh, arrival);
  const [allStages, setAllStages] = useState(false);
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
  return (
    <>
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
          directory={directory}
          savedAt={savedAt}
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
      <Consultation view={view} />
      <Summary view={view} savedAt={savedAt} />
      <View style={styles.textRow}>
        <LinkRow
          title="Bill text"
          symbol="doc.text"
          accessibilityHint="Opens the bill text"
          onPress={() => bills.openText(identity.key, name)}
          testID="bill-read-text"
        />
      </View>
      <KeyDates
        view={view}
        savedAt={savedAt}
        anchor={datesRef}
        open={allStages}
        onToggle={setAllStages}
        fresh={follow.fresh}
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
      <Related view={view} savedAt={savedAt} />
    </>
  );
}

/**
 * The bill's identity, said once: status and its dated event, the title,
 * the meta line, who brought it, Follow, and the header's source line.
 */
function BillHead({
  view,
  identity,
  name,
  directory,
  savedAt,
}: {
  view: BillView;
  identity: Identity;
  name: string;
  directory: SponsorDirectory | null | undefined;
  savedAt: number | null;
}) {
  const draft = identity.status === 'exposure_draft';
  const event = statusEvent({
    status: identity.status,
    status_as_of: identity.statusAsOf,
    originating_house: identity.house,
    key_dates: view.keyDates.data ?? [],
  });
  const meta = identity.introduced
    ? [
        `${identity.introducedLabel} ${short(identity.introduced)}`,
        identity.house ? chamberLabel(identity.house) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : draft
      ? 'Exposure draft, not yet introduced'
      : null;
  const sources = view.identity.sources;
  const originals: SourceOriginal[] = sources.map((s) =>
    s.label === billSourceLabel('billhome')
      ? { label: 'Parliament of Australia', url: s.url, record: 'bill home' }
      : { label: s.label, url: s.url },
  );
  const unsponsored = !identity.sponsorMembers.length && !identity.sponsorParty;
  return (
    <View style={styles.headBlock}>
      <View style={styles.titleBlock}>
        <StatusLine identity={identity} event={event} />
        <TitleAnchor>
          <Heading level={1} testID="bill-title">
            {identity.title}
          </Heading>
        </TitleAnchor>
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
      <View style={styles.follow}>
        <FollowButton
          kind="bill"
          id={identity.key}
          title={name}
          testID="bill-follow"
        />
      </View>
      <View style={styles.source}>
        <SourceLine
          asOf={view.identity.asAt}
          citation={draft ? unique(sources.map((s) => s.label)) : 'ParlInfo'}
          savedAt={savedAt}
          originals={originals}
          licence={
            unique(sources.map((s) => s.licence).filter(Boolean)).join(', ') ||
            null
          }
          notes={[
            unsponsored && !draft ? 'Sponsor not recorded.' : null,
            event && !event.resolved ? notes.status : null,
          ]}
          testID="bill-source"
        />
      </View>
    </View>
  );
}

/** "[Passed] Royal Assent 26 Aug 2026": the status and the event that dates it. */
function StatusLine({
  identity,
  event,
}: {
  identity: Identity;
  event: ReturnType<typeof statusEvent>;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${identity.statusLabel}${event ? `. ${event.label}, ${formatDate(event.date)}` : ''}`}
      testID="bill-status"
      style={[styles.status, stacked ? styles.stacked : null]}
    >
      <StatusCapsule status={identity.statusLabel} hidden />
      {event ? (
        <Text variant="secondary" tabular wordSafe>
          {statusEventText(event)}
        </Text>
      ) : null}
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
  const closed =
    !!consultation.closes &&
    consultation.closes < new Date().toISOString().slice(0, 10);
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
    <Section title="In short" testID="bill-summary">
      <MachineSummary
        attribution={summary.attribution}
        sentences={sentences}
        testID="bill-summary"
      />
      {changes.length ? (
        <SubSection title="What it changes">
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
        </SubSection>
      ) : null}
      {summary.affected ? (
        <SubSection title="Who is affected">
          <Text variant="body">{summary.affected}</Text>
        </SubSection>
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

function DateRows({
  entries,
  fresh,
}: {
  entries: readonly BillTimelineEntry[];
  fresh?: ReadonlySet<string>;
}) {
  return (
    <View style={styles.dates}>
      {entries.map((entry, index) => (
        <View
          key={`${entry.from}-${entry.to}-${index}`}
          accessible
          accessibilityLabel={`${dateSpan(entry.from, entry.to, 'long')}: ${entry.stages.map(stageText).join('; ')}`}
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
          {fresh && [...fresh].some((k) => k.includes(entry.from)) ? (
            <NewDot testID={`bill-date-${index}-new`} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function KeyDates({
  view,
  savedAt,
  anchor,
  open,
  onToggle,
  fresh,
}: {
  view: BillView;
  savedAt: number | null;
  anchor: RefObject<View | null>;
  open: boolean;
  onToggle: (open: boolean) => void;
  fresh: ReadonlySet<string>;
}) {
  const timeline = billTimeline(view.keyDates.data ?? []);
  const entries = timeline.entries;
  if (!entries.length) return null;
  const points =
    entries.length > 1 ? rulerPoints(entries, view.identity.data?.status) : [];
  const originals: SourceOriginal[] = unique(
    view.keyDates.sources.map((s) => s.url),
  ).map((url) => ({ label: 'ParlInfo', url, record: 'bill record' }));
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
              {...chartSource(
                entries[0]!.from,
                points.at(-1)!.date,
                'ParlInfo',
              )}
            />
          </View>
        ) : null}
        {entries.length === 1 ? (
          <DateRows entries={entries} fresh={fresh} />
        ) : entries.length > points.length ? (
          <Disclosure
            label={`All ${formatCount(timeline.runs)} stages`}
            open={open}
            onToggle={onToggle}
            testID="bill-dates-all"
          >
            <DateRows entries={entries} fresh={fresh} />
          </Disclosure>
        ) : null}
        <SourceLine
          asOf={view.keyDates.asAt}
          citation="ParlInfo"
          savedAt={savedAt}
          originals={originals}
          notes={[notes.voices]}
          testID="bill-dates-source"
        />
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
  const headerRef = useRef<View>(null);
  useEffect(() => {
    if (votes.sectionFocus) targets.scrollTo(headerRef, true);
  }, [votes.sectionFocus, targets]);
  if (!votes.has) return null;
  const { main, procedural } = votes.order;
  const shown = votes.showAll ? main : main.slice(0, VOTES_SHOWN);
  const hidden = main.length - VOTES_SHOWN;
  const ordered = [...main, ...procedural];
  const all = view.divisions.data!.rows;
  const row = (division: Division) => (
    <BillVoteRow
      key={division.key}
      division={division}
      index={ordered.indexOf(division)}
      bill={identity}
      expanded={votes.expanded.has(division.key)}
      onToggle={() => {
        animateLayout(reduceMotion);
        votes.toggle(division.key);
      }}
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
    animateLayout(reduceMotion);
    votes.setShowAll(false);
    headerRef.current?.measureInWindow((_x, y) => {
      if (y < headerBottom) targets.scrollTo(headerRef);
    });
  };
  return (
    <View ref={headerRef} collapsable={false}>
      <Section
        title="How parliament voted"
        testID="bill-divisions"
        headingTestID="bill-divisions-title"
      >
        {shown.length ? <View>{shown.map(row)}</View> : null}
        {hidden > 0 ? (
          <ShowMoreButton
            hidden={hidden}
            noun={hidden === 1 ? 'vote' : 'votes'}
            open={votes.showAll}
            onToggle={() => {
              if (votes.showAll) collapse();
              else {
                animateLayout(reduceMotion);
                votes.setShowAll(true);
              }
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
        onLongPress={() => openMenu(actions)}
        testID={`${id}-more`}
        style={({ pressed }) => [
          styles.voteRow,
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
      {expanded ? (
        <View style={styles.voteBody} testID={`${id}-body`}>
          <PartyVotes
            splits={[...division.splits.drawn, ...division.splits.folded]}
            paired={division.paired}
            recorded={parties.recorded}
            testID={`${id}-parties`}
          />
          {question ? (
            <SubSection title="The question">
              <DivisionQuestion text={question} testID={`${id}-question`} />
            </SubSection>
          ) : null}
        </View>
      ) : null}
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
  const [all, setAll] = useState(false);
  const speeches = useMemo(
    () =>
      (view.speeches.data ?? [])
        .filter((s) => s.slug)
        .sort((a, b) => b.date.localeCompare(a.date)),
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
                  speaker={{ name: speech.speaker, party: speech.party }}
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
  const acts = (view.acts.data ?? []).filter((a) => a.title);
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

function Related({
  view,
  savedAt,
}: {
  view: BillView;
  savedAt: number | null;
}) {
  const bills = useBillNavigation();
  if (!view.related.length && !view.became) return null;
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
      <SourceLine
        asOf={view.identity.asAt}
        citation="ParlInfo"
        savedAt={savedAt}
        notes={[notes.related]}
        testID="bill-related-source"
      />
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
  follow: { alignItems: 'flex-start' },
  source: { marginTop: rhythm.tight },
  added: { marginTop: rhythm.tight },
  textRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
});
