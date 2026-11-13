import { PARTY_NOT_RECORDED, isPartyLabel } from '../design/party';
import { RecordNameLink } from '../design/record';
import { RouteOptions } from '../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollView,
} from 'react-native';
import type { Electorate as Seat } from '../api/catalogs';
import { ApiError } from '../api/errors';
import { catalogs } from '../api/runtime';
import { formatDate } from '../design/format';
import { Icon } from '../design/icon';
import { confirmAction } from '../design/menu';
import { chamberName, jurisdictionName } from '../design/parliament';
import {
  ContentUnavailable,
  FollowButton,
  Group,
  Heading,
  IconButton,
  InsetGroup,
  LinkRow,
  PageFoot,
  PartyLabel,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonCrossfade,
  StatStrip,
  Text,
  TitleAnchor,
  ValueRow,
  copy,
} from '../design/primitives';
import { RowLink, rowMenus, type RowMenuAction } from '../design/row-link';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../design/row-padding';
import { symbols } from '../design/symbols';
import { minimumTarget, rhythm } from '../design/tokens';
import { headerItems, pageItems } from '../navigation/chrome';
import { openOnWeb } from '../navigation/external';
import {
  directoryRoute,
  electionRoute,
  electorateDateRoute,
  electorateRoute,
  membersRoute,
  partyRoute,
  personRoute,
} from '../navigation/routes';
import { copyRecordLink, shareRecord } from '../navigation/share';
import { presentSource } from '../navigation/sheets';
import { emptyBarTitle } from '../navigation/useTitleOnScroll';
import { useOpenAsk } from './ask/open';
import { onElectorateDate } from './directories/ElectorateDateSheet';
import {
  DatedMembers,
  ElectorateHistory,
} from './directories/ElectorateHistory';
import { validDate } from './directories/model';
import {
  OutlineMap,
  OutlineSource,
  hasOutline,
  outlineSourceDetails,
} from './electorate-map/OutlineMap';
import { StateLocator } from './electorate-map/StateLocator';
import { AddedSinceGroup } from './follows/AddedSinceGroup';
import { followKey } from './follows/store';
import { useFollowStates } from './follows/useFollowStates';
import { SeatGrants } from './money-public/SeatGrants';
import {
  BlockSource,
  combinedBlock,
  representationBlock,
} from './your-mp/Evidence';
import { FaceStackRow, byFamilyName } from './your-mp/FaceStackRow';
import { RepresentativeRows, sinceLine } from './your-mp/RepresentativeRows';
import {
  censusHeadline,
  censusOtherRows,
  electionSummary,
  electionsNewestFirst,
  winnerResult,
  newestCensus,
  type ElectionRecord,
} from './your-mp/election-summary';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from './your-mp/model';
import { useSetAsMyElectorate } from './your-mp/useSetAsMyElectorate';

export interface LoadedElectorate {
  directory: Directory;
  view: ElectorateView;
  seat: Seat;
  stale: boolean;
  savedAt: number | null;
}

/** The directory row and the seat's file, checked to be the same seat. */
export async function loadElectorate(id: string): Promise<LoadedElectorate> {
  const directory = await catalogs.directory();
  const seat = directory.electorates.data.electorates.find(
    (s) => s.electorate_id === id || s.slug === id,
  );
  if (!seat)
    throw new ApiError('not-found', "We couldn't find this electorate.");
  const result = await catalogs.electorateFor(seat.detail_url);
  if (result.data.identity.data?.id !== seat.electorate_id)
    throw new ApiError('invalid-data', "This electorate couldn't be loaded.");
  return {
    directory,
    view: result.data,
    seat,
    stale: !!result.stale,
    savedAt: result.savedAt ?? null,
  };
}

/** The identity line, said once: where the seat sits. */
export function identityLine(identity: {
  chamber: string;
  jurisdiction: string;
  state: string;
}): string {
  const state =
    jurisdictionName(identity.state) ??
    jurisdictionName(identity.jurisdiction) ??
    '';
  if (identity.jurisdiction === 'federal')
    return identity.chamber === 'senate'
      ? `Senate, ${state}`
      : `House of Representatives, ${state}`;
  const upper = /_(lc|uh)$|council/i.test(identity.chamber);
  if (identity.jurisdiction.toLowerCase() === 'vic')
    return upper
      ? 'Legislative Council region, Victoria'
      : 'Legislative Assembly district, Victoria';
  if (!upper) return `${state} Legislative Assembly district`.trim();
  return [chamberName(identity.chamber, identity.jurisdiction), state]
    .filter(Boolean)
    .join(', ');
}

export default function Electorate() {
  const { id, asof, section } = useLocalSearchParams<{
    id: string;
    asof?: string;
    section?: string;
  }>();
  return (
    <ElectorateScreen
      key={id}
      id={id}
      initialDate={asof}
      section={section === 'changes' ? 'changes' : undefined}
    />
  );
}

interface ElectorateScreenProps {
  id: string;
  embedded?: boolean;
  initialDate?: string;
  section?: 'changes';
}

/** Embedded panes can reuse this component for a different electorate. */
export function ElectorateScreen(props: ElectorateScreenProps) {
  return <ElectorateContent key={props.id} {...props} />;
}

function ElectorateContent({
  id,
  embedded = false,
  initialDate = '',
  section,
}: ElectorateScreenProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const asof =
    chosen ?? (initialDate && validDate(initialDate) ? initialDate : '');
  const [loaded, setLoaded] = useState<LoadedElectorate | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    loadElectorate(id)
      .then((value) => {
        if (active) {
          setLoaded(value);
          setFailure(null);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setFailure(
            error instanceof ApiError
              ? error
              : new ApiError('http', "This electorate couldn't be loaded."),
          );
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  useEffect(
    () =>
      onElectorateDate((seatId, date) => {
        if (
          seatId === id ||
          seatId === loaded?.seat.electorate_id ||
          seatId === loaded?.seat.slug
        )
          setChosen(date);
      }),
    [id, loaded],
  );
  const refresh = () => {
    setRefreshing(true);
    setAttempt((n) => n + 1);
  };
  const scroll = useRef<ScrollView>(null);
  const identity = loaded?.view.identity.data;
  const offline = failure?.code === 'offline' || failure?.code === 'timeout';
  // A missing seat takes the shared not-found pattern (sweep 2, item 2):
  // centred on the paper ground like every other missing record.
  const missing = !loaded && failure?.code === 'not-found';
  return (
    <>
      {embedded ? null : <ElectorateBar loaded={loaded} asof={asof} />}
      <Screen
        grouped={!missing}
        centred={missing}
        column="readable"
        testID="electorate-screen"
        scrollRef={scroll}
        offline={loaded?.stale ? { savedAt: loaded.savedAt } : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <SkeletonCrossfade
          loading={!loaded && !failure}
          ready={!!loaded}
          cached={!!loaded?.stale}
          cachedAt={loaded?.savedAt}
          sectioned
          skeleton={<ElectorateSkeleton />}
        >
          {failure && !loaded ? (
            failure.code === 'not-found' ? (
              <ContentUnavailable
                symbol="map"
                title="This electorate isn’t in OPAX"
                body="It may have been renamed or abolished."
                action={{
                  label: 'Search electorates',
                  onPress: () => router.navigate(directoryRoute('electorate')),
                  testID: 'electorate-not-found-search',
                }}
                testID="electorate-error"
              />
            ) : (
              <ContentUnavailable
                symbol={offline ? 'wifi.slash' : 'exclamationmark.triangle'}
                title={
                  offline
                    ? copy.notSaved
                    : "This electorate couldn't be loaded."
                }
                body={offline ? copy.notSavedBody : undefined}
                action={
                  offline
                    ? undefined
                    : {
                        label: copy.tryAgain,
                        onPress: refresh,
                        testID: 'electorate-retry',
                      }
                }
                testID="electorate-error"
              />
            )
          ) : null}
          {loaded && identity ? (
            <ElectoratePage
              loaded={loaded}
              asof={asof}
              embedded={embedded}
              section={section}
              scroll={scroll}
              onDate={setChosen}
            />
          ) : null}
        </SkeletonCrossfade>
      </Screen>
    </>
  );
}

function ElectorateSkeleton() {
  return (
    <Skeleton
      shape="electorate-profile"
      label="Loading the electorate"
      testID="electorate-loading"
      onSunken
    />
  );
}

/** The centre stays blank; the content heading names this screen. */
function ElectorateBar({
  loaded,
  asof,
}: {
  loaded: LoadedElectorate | null;
  asof: string;
}) {
  const { share, menu } = useElectorateMenu(loaded?.seat ?? pendingSeat, asof);
  return (
    <RouteOptions
      stableItems
      options={{
        // Route metadata names subsequent Back buttons without drawing a title.
        title: loaded?.seat.name ?? '',
        headerTitle: emptyBarTitle,
        ...headerItems(
          loaded
            ? pageItems({ name: loaded.seat.name, share, menu })
            : undefined,
        ),
      }}
    />
  );
}

/** The menu hook cannot offer to save a seat until its identity is known. */
const pendingSeat = {
  electorate_id: '',
  name: '',
  jurisdiction: '',
  chamber: '',
  status: 'historical',
} as Seat;

/** The ⋯ items in order; a hidden item is left out, never disabled. */
export function useElectorateMenu(
  seat: Seat,
  asof: string,
  onViewDate?: () => void,
): { share: () => void; menu: RowMenuAction[] } {
  const setMine = useSetAsMyElectorate(seat);
  const openAsk = useOpenAsk();
  const path = `${seat.url}${asof ? `?asof=${asof}` : ''}`;
  const target = { path, title: seat.name };
  const menu: RowMenuAction[] = [
    ...(setMine.visible
      ? [
          {
            title: setMine.label,
            symbol: 'building.columns' as const,
            onPress: () => {
              void setMine.run();
            },
          },
        ]
      : []),
    {
      title: 'View on a date',
      symbol: 'calendar',
      onPress:
        onViewDate ??
        (() =>
          router.push(
            electorateDateRoute(seat.electorate_id, asof || undefined),
          )),
    },
    {
      title: `Ask about ${seat.name}`,
      symbol: 'text.bubble',
      onPress: () =>
        openAsk(
          { question: `What has parliament said about ${seat.name}?` },
          seat.name,
        ),
    },
    {
      title: copy.copyLink,
      symbol: 'link',
      onPress: () => {
        void copyRecordLink(path);
      },
    },
    {
      title: copy.openOnWeb,
      symbol: 'arrow.up.right.square',
      onPress: () => {
        void openOnWeb(path, seat.name, { preferNative: false });
      },
    },
  ];
  return {
    share: () => {
      void shareRecord(target);
    },
    menu,
  };
}

/** Embedded panes (iPad, Talk) have no bar: the ⋯ items as one button. */
function EmbeddedMenu({ seat, asof }: { seat: Seat; asof: string }) {
  const { share, menu } = useElectorateMenu(seat, asof);
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <IconButton
        symbol="ellipsis.circle"
        accessibilityLabel={`More for ${seat.name}`}
        testID="electorate-more"
        onPress={() =>
          confirmAction(seat.name, [
            { title: copy.share, onPress: share },
            ...menu.flatMap((item) =>
              'items' in item
                ? []
                : [{ title: item.title, onPress: item.onPress }],
            ),
          ])
        }
      />
    </View>
  );
}

/** The follow's "Added since" group, when the reader follows this seat. */
function useElectorateChanges(seatId: string) {
  const { follows, states } = useFollowStates();
  const follow = follows?.find(
    (f) => f.kind === 'electorate' && f.id === seatId,
  );
  const state = follow ? states.get(followKey(follow)) : undefined;
  return follow && state?.status === 'ready' ? { follow, state } : null;
}

function ElectoratePage({
  loaded,
  asof,
  embedded,
  section,
  scroll,
  onDate,
}: {
  loaded: LoadedElectorate;
  asof: string;
  embedded: boolean;
  section?: 'changes';
  scroll: RefObject<ScrollView | null>;
  onDate: (date: string) => void;
}) {
  const { view, seat } = loaded;
  const identity = view.identity.data!;
  const changes = useElectorateChanges(identity.id);
  const { height: windowHeight } = useWindowDimensions();
  const scrolled = useRef(false);
  const outline = hasOutline(view.boundaries);
  const abolished = identity.status === 'historical';
  const victorian = identity.jurisdiction.toLowerCase() === 'vic';
  const upper = /_(lc|uh)$/i.test(identity.chamber);
  const region =
    victorian && !upper
      ? view.related.find((r) => r.kind === 'within_upper_house')
      : undefined;
  const districts =
    victorian && upper
      ? view.related
          .filter(
            (r) =>
              r.related.jurisdiction === identity.jurisdiction &&
              r.related.chamber !== identity.chamber,
          )
          .sort((a, b) => a.related.name.localeCompare(b.related.name))
      : [];
  const sourceDetails = outlineSourceDetails(
    view.boundaries,
    identity.jurisdiction,
  );
  const page: ReactNode[] = [];
  // 1, 2. The outline with its source as its caption.
  if (outline)
    page.push(
      <Group key="outline" gap={rhythm.heading} testID="electorate-map">
        {/* The state locator takes the block's top trailing corner, beside
            the outline, never over it (sweep 1 item 8). */}
        <View style={styles.mapRow}>
          <View style={styles.mapMain}>
            <OutlineMap
              boundaries={view.boundaries}
              name={identity.name}
              state={identity.state}
              variant="header"
              ground="sunken"
              onSources={
                sourceDetails ? () => presentSource(sourceDetails) : undefined
              }
            />
          </View>
          <StateLocator boundaries={view.boundaries} state={identity.state} />
        </View>
        <OutlineSource
          boundaries={view.boundaries}
          jurisdiction={identity.jurisdiction}
        />
      </Group>,
    );
  // 3. Title block.
  page.push(
    <Group key="title" gap={rhythm.tight}>
      <Group gap={rhythm.line}>
        <TitleAnchor>
          <Heading level={1} kind="page" testID="electorate-name">
            {identity.name}
          </Heading>
        </TitleAnchor>
        <Text wordSafe variant="secondary" testID="electorate-identity">
          {identityLine(identity)}
        </Text>
        {abolished ? (
          <Text wordSafe variant="secondary" testID="electorate-abolished">
            Abolished.
          </Text>
        ) : null}
      </Group>
      <View style={{ alignItems: 'flex-start' }}>
        <FollowButton
          kind="electorate"
          id={identity.id}
          title={identity.name}
          testID="electorate-follow"
        />
      </View>
      {embedded ? <EmbeddedMenu seat={seat} asof={asof} /> : null}
    </Group>,
  );
  // Added since, after the title block (follow.md 13.2).
  if (
    changes &&
    changes.state.status === 'ready' &&
    changes.state.changes.length
  )
    page.push(
      <View
        key="changes"
        collapsable={false}
        onLayout={(e) => {
          const { y } = e.nativeEvent.layout;
          if (section === 'changes' && !scrolled.current) {
            scrolled.current = true;
            // Only when the group would start below the first screen.
            if (y > windowHeight * 0.6)
              scroll.current?.scrollTo({
                y: Math.max(0, y - rhythm.block),
                animated: false,
              });
          }
        }}
      >
        <AddedSinceGroup
          follow={changes.follow}
          changes={changes.state.changes}
          current={changes.state.current}
          stale={changes.state.stale}
          savedAt={changes.state.savedAt}
          testID="electorate-added-since"
          onRowPress={(change) => {
            if (change.record?.kind === 'member' && change.record.slug) return;
            const key = change.record?.key;
            const record = view.elections.find(
              (b) => b.data?.election_id === key,
            );
            if (record?.data)
              router.push(electionRoute(identity.id, record.data.election_id));
          }}
        />
      </View>,
    );
  // 4. Region row or a region's districts.
  if (region)
    page.push(
      <InsetGroup key="region" testID="electorate-region">
        <LinkRow
          title={`In ${region.related.name}`}
          href={electorateRoute(region.related.electorate_id)}
          testID="electorate-region-row"
        />
      </InsetGroup>,
    );
  if (districts.length)
    page.push(
      <View key="districts" style={{ gap: rhythm.heading }}>
        <SectionHeader title="Districts" />
        <InsetGroup testID="electorate-districts">
          {districts.map((d) => (
            <LinkRow
              key={d.related.electorate_id}
              title={d.related.name}
              href={electorateRoute(d.related.electorate_id)}
              testID={`electorate-district-${d.related.slug}`}
            />
          ))}
        </InsetGroup>
      </View>,
    );
  // 5. Members, past members and the dated view, under one source line.
  page.push(
    <MembersSection
      key="members"
      loaded={loaded}
      asof={asof}
      onBackToToday={() => onDate('')}
    />,
  );
  // 6. Elections.
  const elections = electionsNewestFirst(
    view.elections.map((b) => b.data).filter((e): e is ElectionRecord => !!e),
  );
  if (elections.length)
    page.push(
      <View
        key="elections"
        testID="electorate-elections"
        style={{ gap: rhythm.heading }}
      >
        <SectionHeader title="Elections" />
        <InsetGroup>
          {elections.map((e, i) => (
            <ElectionRow
              key={e.election_id}
              record={e}
              directory={loaded.directory}
              seatId={identity.id}
              jurisdiction={identity.jurisdiction}
              testID={`election-row-${i}`}
            />
          ))}
        </InsetGroup>
        <BlockSource
          block={combinedBlock(view.elections)}
          title="About these elections"
          testID="electorate-elections-source"
        />
      </View>,
    );
  // 7. Census.
  const census = newestCensus(view);
  const headline = censusHeadline(census);
  const censusBlock = view.census.find((b) => b.data === census);
  if (census && headline && censusBlock) {
    const others = censusOtherRows(census);
    page.push(
      <View
        key="census"
        testID="electorate-census"
        style={{ gap: rhythm.heading }}
      >
        <SectionHeader title={headline.label} />
        <StatStrip
          tiles={headline.rows.map((r) => ({
            value: r.value,
            label:
              r.key === 'population'
                ? 'people'
                : r.label.toLocaleLowerCase('en-AU'),
          }))}
          testID="electorate-census-strip"
        />
        <Text wordSafe variant="footnote" tone="inkSoft">
          Not adjusted for boundary changes since the Census.
        </Text>
        {others.length ? (
          <InsetGroup>
            {others.map((r) => (
              <ValueRow key={r.key} label={r.label} value={r.value} />
            ))}
          </InsetGroup>
        ) : null}
        <BlockSource
          block={censusBlock}
          title="About the Census figures"
          notes={[
            `Census figures are for the electorate's boundaries at the ${census.year} Census. Not adjusted for boundary changes since the Census.`,
          ]}
          testID="electorate-census-source"
        />
      </View>,
    );
  }
  // 8. Grants: federal House seats that still exist.
  if (
    identity.jurisdiction === 'federal' &&
    identity.chamber === 'representatives' &&
    !abolished
  )
    page.push(
      <SeatGrants
        variant="seat-home"
        key="grants"
        name={identity.name}
        state={identity.state}
        eligible
      />,
    );
  // 9. Authorisation on state electorates.
  if (identity.jurisdiction !== 'federal')
    page.push(
      <View key="authorisation" testID="electorate-authorisation">
        <PageFoot variant="authorised" />
      </View>,
    );
  // 10. The page's end, for journeys that scroll to it.
  page.push(
    <View
      key="end"
      testID="electorate-end"
      collapsable={false}
      style={styles.end}
    />,
  );
  return <>{page}</>;
}

function MembersSection({
  loaded,
  asof,
  onBackToToday,
}: {
  loaded: LoadedElectorate;
  asof: string;
  onBackToToday: () => void;
}) {
  const { view, directory } = loaded;
  const identity = view.identity.data!;
  const abolished = identity.status === 'historical';
  const rows = [...(view.representatives.data ?? [])].sort(
    byFamilyName((r) => r.person.name),
  );
  const many = view.capacity > 1 || rows.length > 1;
  const senate = identity.chamber === 'senate';
  const shown = rows.length > 6 ? rows.slice(0, 6) : rows;
  const header = asof
    ? `${many ? 'Members' : 'Member'} on ${formatDate(asof)}`
    : abolished
      ? 'Past members'
      : many
        ? 'Members'
        : 'Member';
  const observed =
    view.terms
      .map((t) => t.observed_through)
      .sort()
      .at(-1) ?? null;
  const block = representationBlock({
    ...combinedBlock([view.identity, view.representatives]),
    asAt: observed ?? view.representatives.asAt ?? view.identity.asAt,
  });
  return (
    <View testID="electorate-members" style={{ gap: rhythm.heading }}>
      <SectionHeader title={header} testID="electorate-members-heading" />
      {asof ? (
        <DatedMembers
          view={view}
          directory={directory}
          asof={asof}
          onBackToToday={onBackToToday}
        />
      ) : abolished ? null : rows.length ? (
        <InsetGroup>
          <RepresentativeRows
            rows={shown}
            directory={directory}
            id="electorate-member"
            wrap={false}
            detailFor={(personId) => sinceLine(view.terms, personId)}
          />
          {rows.length > shown.length ? (
            <FaceStackRow
              title={`All ${rows.length} ${senate ? 'senators' : 'members'}`}
              people={rows.map((r) => ({
                name: r.person.name,
                slug: representativeProfile(r.person_id, directory)?.slug,
              }))}
              href={membersRoute(identity.id)}
              testID="electorate-members-all"
            />
          ) : null}
        </InsetGroup>
      ) : (
        <Text wordSafe testID="electorate-no-member">
          No member is recorded for this seat yet.
        </Text>
      )}
      <ElectorateHistory
        view={view}
        directory={directory}
        header={!abolished || !!asof}
      />
      <BlockSource
        block={block}
        title="About the members"
        notes={[
          'Election winners and present-day representation can differ.',
          'A date with no recorded member does not establish a vacancy.',
          'Gaps in the history mean the records do not cover that time.',
        ]}
        testID="electorate-representatives-source"
      />
    </View>
  );
}

/**
 * One election, closed: its title and date on one line, then the winner and
 * party, then the two-candidate result when the record carries it.
 */
function ElectionRow({
  record,
  directory,
  seatId,
  jurisdiction,
  testID,
}: {
  record: ElectionRecord;
  directory: Directory;
  seatId: string;
  jurisdiction: string;
  testID: string;
}) {
  const cellStyle = useRowCellStyle();
  const highlight = useRowHighlight();
  useRowInset(0);
  const summary = electionSummary(record, jurisdiction);
  const winner = summary.winner;
  const profile = winner?.personId
    ? representativeProfile(winner.personId, directory)
    : null;
  const winnerHref = profile
    ? personRoute(profile.slug, winner!.name)
    : undefined;
  const href = electionRoute(seatId, summary.key);
  // The date joins the title's line and never breaks inside itself.
  const date = formatDate(summary.date, 'short').replace(/ /g, '\u00a0');
  const result = winnerResult(record);
  const label = [
    summary.title,
    formatDate(summary.date),
    summary.winner
      ? `${summary.winner.name}, ${summary.winner.party ?? PARTY_NOT_RECORDED}`
      : null,
    result,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <RowLink
      href={href}
      menu={rowMenus.record({
        title: summary.title,
        path: `/subject/electorate/${seatId}`,
      })}
      preview={false}
    >
      <Pressable
        testID={testID}
        accessible
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint="Opens the election"
        accessibilityActions={[
          ...(winnerHref
            ? [{ name: 'winner', label: `Open ${winner!.name}` }]
            : []),
          ...(isPartyLabel(winner?.party)
            ? [{ name: 'party', label: `Open ${winner!.party} party page` }]
            : []),
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'winner' && winnerHref)
            router.push(winnerHref);
          if (event.nativeEvent.actionName === 'party' && winner?.party)
            router.push(partyRoute(winner.party));
        }}
        onPress={() => router.push(href)}
        style={({ pressed }) => [
          styles.electionRow,
          cellStyle,
          pressed && { backgroundColor: highlight },
        ]}
      >
        <View style={styles.electionWords}>
          <Text wordSafe variant="subsectionTitle" testID={`${testID}-title`}>
            {date ? `${summary.title} · ${date}` : summary.title}
          </Text>
          {summary.winner ? (
            <>
              <RecordNameLink
                name={summary.winner.name}
                href={winnerHref}
                testID={`${testID}-winner`}
              />
              <View style={styles.party}>
                <PartyLabel
                  party={summary.winner.party}
                  status="unknown"
                  nested
                  linked
                  compact
                />
              </View>
            </>
          ) : null}
          {result ? (
            <Text wordSafe variant="secondary" testID={`${testID}-result`}>
              {result}
            </Text>
          ) : null}
        </View>
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      </Pressable>
    </RowLink>
  );
}
ownsRowPadding(ElectionRow);

const styles = StyleSheet.create({
  electionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingVertical: rhythm.row,
    minHeight: minimumTarget,
  },
  electionWords: { flex: 1, gap: rhythm.line },
  mapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  mapMain: { flex: 1, minWidth: 0 },
  party: { minHeight: minimumTarget },
  end: { height: 1 },
});
