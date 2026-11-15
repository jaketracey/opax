import { associatedLine, donorAssociated } from '../../api/associated';
import { RouteOptions, useSafeSetOptions } from '../../navigation/preview';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaInsetsContext,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useAdaptiveDevice } from '../../design/adaptive';
import { ReservedRegionArea, useReservedRegions } from '../../design/fold-area';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import { requestFocus } from '../../design/keyboard';
import {
  counted,
  formatCount,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import {
  ContentUnavailable,
  FigureBlock,
  Group,
  Heading,
  Icon,
  MoneyRow,
  OfflineLine,
  PopUpButton,
  Screen,
  SectionHeader,
  SegmentedPicker,
  Skeleton,
  SourceLine,
  StatStrip,
  Text,
  useAccessibilitySize,
  useLayout,
  useScreenColumn,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import {
  colors,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import {
  barBacking,
  fixedPageBar,
  headerItems,
  pageItems,
  usePushedBar,
  useRailBar,
} from '../../navigation/chrome';
import { moneyDonorsRoute } from '../../navigation/routes/public-money';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import {
  moneyCatalogs,
  type MoneyGraph,
  type MoneyJurisdiction,
  type MoneyNode,
} from './data';
import { useFirstScreenReader, useMoneyRecord } from './hooks';
import { loadedMoneyGraph, partyNodeFor } from './lookup';
import { useHeldInset } from './map/band';
import { frameOf } from './map/measure';
import { MoneyMap, type MapCommand, type MapRequest } from './map/MoneyMap';
import { MoneyMapControls } from './map/MoneyMapControls';
import { MoneyMapLegend } from './map/MoneyMapLegend';
import {
  MoneyMapPanel,
  focusFlows,
  focusMetaLine,
  type PanelFocus,
} from './map/MoneyMapPanel';
import { MoneyMapSearch } from './map/MoneyMapSearch';
import { MINI_HEIGHT, MINI_WIDTH } from './map/MiniMap';
import {
  largeTextLimits,
  mapControlLayout,
  phoneSceneFloor,
} from './map/regions';
import { buildModel, nextAlongFlows, type MapModel } from './map/model';
import { moneyPageMenu } from './menu';
import { MoneyTestHooks } from './money-probe';
import { useMoneyFilters } from './MoneyFilters';
import { moneyPartyGroups, PartyMoneyRow } from './parts';
import { moneyMode, type MoneyMode } from './screen-reader';
import {
  donationsCaveat,
  donorDetails,
  filtersFromParams,
  industryDonors,
  isAllYears,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyWindowParams,
  moneyYears,
  param,
  partiesFigureWords,
  partyDonationsTotal,
  publicMoneyCaveat,
  publicMoneySource,
  receiptSectionWords,
  type MoneyParams,
} from './records';
import {
  moneyNotes,
  moneyOriginals,
  moneyShortSource,
  moneySourceDetails,
} from './sources';
import {
  moneyFilterCount,
  moneyView,
  moneyWindowNodes,
  rankedDonors,
  type MoneyFilters,
} from './view';
import { track } from '../../analytics';

const TOP_DONORS = 20;
/** Lines of the card's sentence kept in view when the card is capped. */
const SENTENCE_LINES = 2;
/** Synchronous measuring passes allowed per change of window or state. */
const SETTLE_PASSES = 8;
type Mode = MoneyMode;

/** "Money to parties, 1998–99 to 2025–26, and public money to donors on the map". */
export function moneySummary(graph: MoneyGraph, filters: MoneyFilters) {
  // All years names the returns' own span: public money runs later, and
  // the extent it reaches is not a span of donations.
  const parties = graph.nodes.filter(
    (n) => n.kind === 'party' && n.firstYear !== null && n.lastYear !== null,
  );
  const [from, to] =
    filters.donations && isAllYears(graph, filters) && parties.length
      ? [
          Math.min(...parties.map((n) => n.firstYear!)),
          Math.max(...parties.map((n) => n.lastYear!)),
        ]
      : [filters.from, filters.to];
  return summaryWords(
    partiesFigureWords(graph).title,
    from,
    to,
    filters,
    !isAllYears(graph, filters),
  );
}

function summaryWords(
  title: string,
  from: number,
  to: number,
  filters: Pick<
    MoneyFilters,
    'donations' | 'grants' | 'contracts' | 'industry' | 'min'
  >,
  narrowedYears: boolean,
) {
  const window =
    from === to ? ` in ${moneyYears(from, to)}` : `, ${moneyYears(from, to)}`;
  const industry = filters.industry
    ? `, ${industryDonors(filters.industry)} only`
    : '';
  const minimum =
    filters.min > 0
      ? `, flows of ${formatMoneyCompact(filters.min)} and over`
      : '';
  const publicMoney = filters.grants || filters.contracts;
  const narrowed = narrowedYears || !!filters.industry || filters.min > 0;
  if (!filters.donations)
    return `Public money to donors on the map${window}${industry}${minimum}`;
  return narrowed || !publicMoney
    ? `${title}${window}${industry}${minimum}`
    : `${title}${window}, and public money to donors on the map`;
}

/** The layers a link asks for, known before the graph is in. */
function linkedLayers(params: MoneyParams) {
  const layers = param(params.layers)?.split(',');
  return {
    donations: layers ? layers.includes('donations') : true,
    grants: layers ? layers.includes('grants') : true,
    contracts: layers ? layers.includes('contracts') : true,
  };
}

/**
 * Words of the summary's length, for the space it is kept before the graph
 * is in: the summary itself from a graph already read this session, else
 * the same sentence from the link's filters over a stand-in span of years.
 * It is never shown; it wraps as the summary will, so nothing under it moves
 * when the summary arrives.
 */
export function moneySummaryStandIn(
  jurisdiction: MoneyJurisdiction,
  params: MoneyParams,
) {
  const known = loadedMoneyGraph(jurisdiction);
  if (known) return moneySummary(known, filtersFromParams(known, params));
  const year = (key: string) => {
    const value = Number(param(params[key]));
    return param(params[key]) && Number.isInteger(value) ? value : null;
  };
  const from = year('from'),
    to = year('to');
  const min = Number(param(params.min));
  return summaryWords(
    partiesFigureWords({ meta: { jurisdiction } }).title,
    Math.min(from ?? 1998, to ?? 2025),
    Math.max(from ?? 1998, to ?? 2025),
    {
      ...linkedLayers(params),
      industry: param(params.industry) || null,
      min: Number.isFinite(min) && min > 0 ? Math.floor(min) : 0,
    },
    from !== null || to !== null,
  );
}

/**
 * The donor list's caption states the cut: the map holds the largest donors
 * by lifetime total, so a one-year list is a re-sort of those, not that
 * year's largest donors (journeys/money.md 4.4, D4).
 */
export function donorCaption(graph: MoneyGraph, filters: MoneyFilters) {
  const cut =
    typeof graph.meta.donor_nodes_by_total === 'number'
      ? graph.meta.donor_nodes_by_total
      : null;
  const since = /(\d{4})-(\d{2})/.exec(graph.meta.coverage);
  const start = since ? `${since[1]}–${since[2]}` : null;
  const cohort = cut
    ? `the ${formatCount(cut)} largest donors${start ? ` since ${start}` : ''}`
    : 'the donors on the map';
  if (isAllYears(graph, filters))
    return `${cohort.charAt(0).toLocaleUpperCase('en-AU')}${cohort.slice(1)}, largest first`;
  return `Largest in ${moneyYears(filters.from, filters.to)} among ${cohort}`;
}

/** The stage's one VoiceOver label: what is drawn, and what is focused. */
export function moneyMapLabel(
  model: Pick<MapModel, 'nodes' | 'edges'>,
  focus: string | null,
) {
  const focused = focus ? model.nodes.find((n) => n.id === focus) : null;
  return [
    `Money map: ${formatCount(model.nodes.length)} discs and ${formatCount(model.edges.length)} recorded flows.`,
    focused ? `Focused on ${focused.label}.` : null,
    'The List view has the same data.',
  ]
    .filter(Boolean)
    .join(' ');
}

const jurisdictionOptions = (
  Object.keys(moneyCatalogs) as MoneyJurisdiction[]
).map((value) => ({
  value,
  label: moneyCatalogs[value].label,
  testID: `money-jurisdiction-${value}`,
}));

/** The share path for the map as drawn: its jurisdiction, filters and focus. */
function sharePath(params: MoneyParams) {
  const query = new URLSearchParams();
  const jurisdiction = param(params.jurisdiction);
  if (jurisdiction && jurisdiction !== 'federal')
    query.set('jur', jurisdiction);
  for (const key of [
    'from',
    'to',
    'industry',
    'layers',
    'inflation',
    'min',
    'view',
    'select',
  ])
    if (param(params[key])) query.set(key, param(params[key])!);
  const text = query.toString();
  return text ? `/money?${text}` : '/money';
}

/**
 * The money map (specs/money.md 2.13): pushed in the current tab with a
 * named back button. Map view: the stage fills the screen under a floating
 * card (jurisdiction, one line saying what the map shows, the List | Map
 * picker), a control stack, an overview and the detail panel. List view:
 * Donors, Parties and Public money. Filters are a bar button opening
 * `/filters/money`, which writes this screen's params live.
 */
export default function MoneyScreen() {
  const params = useLocalSearchParams<MoneyParams>();
  const navigation = useNavigation();
  const router = useRouter();
  const jurisdiction = moneyJurisdiction(params.jurisdiction);
  const { record, error, refreshing, refresh, retry } =
    useMoneyRecord(jurisdiction);
  const graph = record?.data ?? null;
  const write = useCallback(
    (next: Record<string, string | undefined>) => {
      // The screen's navigation object supplies its route key, including
      // while a Filters facet or a source sheet owns global focus.
      navigation.setParams(next as never);
    },
    [navigation],
  );
  const sheet = useMoneyFilters(graph, params, write);
  const filters = useMemo(
    () => (graph ? filtersFromParams(graph, params) : null),
    [graph, params],
  );
  const reader = useFirstScreenReader();
  // Null until VoiceOver is known: neither view is drawn before then, so
  // the List is never drawn and then swapped for the Map (screen-reader.ts).
  const [chosen, setMode] = useState<Mode | null>(null);
  const mode = moneyMode(chosen, param(params.view), reader);
  const select = useCallback(
    (id: string, name?: string) => {
      if (filters)
        router.push(moneyFocusRoute(id, jurisdiction, filters, name, 'map'));
    },
    [router, filters, jurisdiction],
  );
  // `focus` (party pages, old links, Maestro): push that record once, after load.
  const consumedFocus = useRef(false);
  useEffect(() => {
    const raw = param(params.focus);
    if (!raw || !graph || consumedFocus.current) return;
    const node = raw.startsWith('party:')
      ? partyNodeFor(graph, raw)
      : graph.nodes.find((n) => n.id === raw);
    if (!node) return;
    consumedFocus.current = true;
    select(node.id, node.label);
  }, [params.focus, graph, select]);

  const view = useMemo(
    () => (graph && filters ? moneyView(graph, filters) : null),
    [graph, filters],
  );
  const path = sharePath(params);
  const title = 'Money map';
  const options = headerItems(
    pageItems({
      name: title,
      filters: { active: sheet.active, href: sheet.href },
      menu: moneyPageMenu({ path, title }),
    }),
  );
  const offline =
    error instanceof ApiError &&
    (error.code === 'offline' || error.code === 'timeout');
  const missingState =
    error instanceof ApiError &&
    error.code === 'not-found' &&
    jurisdiction !== 'federal';
  const picker = (
    <SegmentedPicker
      options={[
        { value: 'list', label: 'List', testID: 'money-mode-list' },
        { value: 'map', label: 'Map', testID: 'money-mode-map' },
      ]}
      value={mode ?? 'list'}
      onChange={(next: Mode) => setMode(next)}
      accessibilityLabel="View"
      testID="money-view-toggle"
    />
  );
  const jurisdictionControl = (
    <PopUpButton
      label="Jurisdiction"
      value={jurisdiction}
      options={jurisdictionOptions}
      onChange={(next) =>
        write({
          jurisdiction: next === 'federal' ? undefined : next,
          from: undefined,
          to: undefined,
          industry: undefined,
          layers: undefined,
          inflation: undefined,
          min: undefined,
          select: undefined,
        })
      }
      testID="money-jurisdiction"
    />
  );
  // The line's height is kept until its words arrive, in the words it is
  // expected to say, so the picker and the map's controls start in place.
  // No words are coming after an error: nothing is kept for them.
  const summary =
    graph && filters ? (
      <Text wordSafe variant="secondary" testID="money-view-summary">
        {moneySummary(graph, filters)}
      </Text>
    ) : error && !record ? null : (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.unseen}
        testID="money-view-summary-space"
      >
        <Text wordSafe variant="secondary">
          {moneySummaryStandIn(jurisdiction, params)}
        </Text>
      </View>
    );
  const reset = () =>
    write({
      from: undefined,
      to: undefined,
      industry: undefined,
      layers: undefined,
      inflation: undefined,
      min: undefined,
    });
  // An error, or filters that match nothing: said in the view's own frame.
  const unavailable =
    error && !record ? (
      missingState ? (
        <ContentUnavailable
          symbol="magnifyingglass"
          title={`${moneyCatalogs[jurisdiction].label} isn’t available yet`}
          action={{
            label: 'Show federal',
            onPress: () => write({ jurisdiction: undefined }),
            testID: 'money-show-federal',
          }}
          testID="money-missing"
        />
      ) : offline ? (
        <ContentUnavailable
          symbol="wifi.slash"
          title={copy.notSaved}
          body={copy.notSavedBody}
          action={{ label: copy.tryAgain, onPress: retry }}
          testID="money-error"
        />
      ) : (
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title="The money map couldn’t be loaded"
          body="Check your connection and try again."
          action={{ label: copy.tryAgain, onPress: retry }}
          testID="money-error"
        />
      )
    ) : record && graph && filters && view && !view.nodes.length ? (
      <ContentUnavailable
        symbol="line.3.horizontal.decrease.circle"
        title="Nothing matches these filters"
        action={{
          label: copy.resetFilters,
          onPress: reset,
          testID: 'money-empty-reset',
        }}
        testID="money-empty"
      />
    ) : null;
  // Journey hooks keep their place in e2e builds before the graph is in.
  const hooks = error ? null : (
    <MoneyTestHooks
      graph={view}
      onYear={(year) => write({ from: String(year), to: String(year) })}
      onFocus={(id) => select(id, graph?.nodes.find((n) => n.id === id)?.label)}
    />
  );
  const offlineLine =
    record?.stale && !record.staleReason ? (
      <OfflineLine savedAt={record.savedAt} testID="money-offline" />
    ) : null;
  if (mode === null) return <PendingMode options={options} />;
  if (mode === 'map')
    return (
      <ReservedRegionArea style={styles.root}>
        <MapMode
          data={
            record && graph && filters && view && !unavailable
              ? { record, graph, view, filters }
              : null
          }
          unavailable={unavailable}
          refreshing={refreshing}
          refresh={refresh}
          jurisdiction={jurisdiction}
          params={params}
          write={write}
          options={{ ...options, title }}
          head={jurisdictionControl}
          summary={summary}
          picker={picker}
          hooks={hooks}
          offline={offlineLine}
        />
      </ReservedRegionArea>
    );
  return (
    <ListMode
      options={options}
      title={title}
      refreshing={refreshing}
      refresh={refresh}
      head={
        <>
          {jurisdictionControl}
          {summary}
        </>
      }
      offline={offlineLine}
      picker={picker}
      body={
        unavailable ??
        (record && graph && filters && view ? (
          <ListBody
            record={record}
            filters={filters}
            view={view}
            jurisdiction={jurisdiction}
          />
        ) : (
          <MoneySkeleton />
        ))
      }
      hooks={hooks}
    />
  );
}

/**
 * VoiceOver not yet known and no view chosen or linked: the page's ground
 * and its bar items only. The app asks as it starts, so this is at most the
 * first frames of a cold start straight onto this page.
 */
function PendingMode({ options }: { options: Record<string, unknown> }) {
  return (
    <View style={styles.root} testID="money-pending">
      <RouteOptions options={options} />
    </View>
  );
}

// ------------------------------------------------------------------ map

/** What the map draws from: absent while it loads or is unavailable. */
type MapData = {
  record: RecordResult<MoneyGraph>;
  graph: MoneyGraph;
  view: MoneyGraph;
  filters: MoneyFilters;
};

/**
 * The map's frame is the same loading and loaded: the solid bar with its
 * title, the card, the controls and the panel hold their final places from
 * the first frame, and the map and the figures arrive inside them.
 */
function MapMode({
  data,
  unavailable,
  refreshing,
  refresh,
  jurisdiction,
  params,
  write,
  options,
  head,
  summary,
  picker,
  hooks,
  offline,
}: {
  data: MapData | null;
  /** An error or an empty result, shown under the card in the map's place. */
  unavailable: React.ReactNode;
  refreshing: boolean;
  refresh: () => void;
  jurisdiction: MoneyJurisdiction;
  params: MoneyParams;
  write: (next: Record<string, string | undefined>) => void;
  options: Record<string, unknown>;
  /** The card's parts: the jurisdiction, the sentence, the List | Map picker. */
  head: React.ReactNode;
  summary: React.ReactNode;
  picker: React.ReactNode;
  hooks: React.ReactNode;
  offline: React.ReactNode;
}) {
  const setOptions = useSafeSetOptions();
  // List mode's title fades in by scroll and is hidden at rest; that hidden
  // title survived the switch to the map, which then had no title at all
  // (sweep 2 item 5.5). The map always names itself.
  const barTitle = typeof options.title === 'string' ? options.title : '';
  // The map does not scroll, so it keeps a solid bar and sits below it even
  // beside a vertical bar (the closed Duo), where the other pushed pages run
  // under a clear one. That bar needs its own ground there; the list sets the
  // stack's bar again when the map hands over to it (ListMode).
  // Off the rail, where pushed pages are clear, it has no hairline either
  // (the hub's ruling); a legibility setting keeps the opaque bar and its
  // hairline (fixedPageBar).
  const rail = useRailBar() !== null;
  // Asked without reading the stack's descriptors: the map would render
  // again whenever any page set options. This route is a pushed card, so
  // the stack's own answer is the route's (as ListMode asks it).
  const plainClear = usePushedBar() === 'clear' && !rail;
  useLayoutEffect(() => {
    setOptions({
      ...fixedPageBar(plainClear, rail, colors.paper),
      headerTitle: barTitle,
    });
  }, [setOptions, barTitle, rail, plainClear]);
  const navigation = useNavigation();
  const router = useRouter();
  const { regular } = useLayout();
  const adaptive = useAdaptiveDevice();
  const regions = useReservedRegions();
  const safe = useContext(SafeAreaInsetsContext);
  const large = useAccessibilitySize();
  // The camera is driven by state: each command runs once, by its seq.
  const [command, setCommand] = useState<MapCommand | null>(null);
  const dispatch = useCallback(
    (next: MapRequest) =>
      setCommand((previous) => ({
        ...next,
        seq: (previous?.seq ?? 0) + 1,
      })),
    [],
  );
  const view = data?.view ?? null;
  const filters = data?.filters ?? null;
  const model = useMemo(() => (view ? buildModel(view) : null), [view]);
  // Map analytics: the action and how many filters are set, never which
  // filters, records or search text.
  const filterCount = data ? moneyFilterCount(data.graph, data.filters) : 0;
  const mapAction = (
    action: 'open' | 'filter' | 'zoom' | 'open_record' | 'search',
  ) => track('opax_map_action', { action, filter_count: filterCount });
  const shown = useRef(false);
  const filterKey = filters ? JSON.stringify(filters) : null;
  useEffect(() => {
    // Nothing is counted until a map is drawn; the next one drawn is `open`.
    if (filterKey === null) {
      shown.current = false;
      return;
    }
    // `open` once as the map is shown; `filter` on each change after that.
    mapAction(shown.current ? 'filter' : 'open');
    shown.current = true;
    // filterKey stands for the filters; the count alone can stay the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  const focus = param(params.select) ?? null;
  const focusIndex =
    focus === null || !model ? null : (model.byId.get(focus) ?? null);
  // The trail Next has walked, as node ids, so Previous retraces it.
  const [trail, setTrail] = useState<string[]>([]);
  const setFocus = useCallback(
    (id: string | null, viaTrail: string[] | null = null) => {
      setTrail(viaTrail ?? (id ? [id] : []));
      write({ select: id ?? undefined });
    },
    [write],
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The frame outlives its map (another jurisdiction, a retry): what was
  // asked of the old map is not asked of the next.
  const loaded = data !== null;
  const [wasLoaded, setWasLoaded] = useState(loaded);
  if (wasLoaded !== loaded) {
    setWasLoaded(loaded);
    if (!loaded) {
      setCommand(null);
      setTrail([]);
      setSearchOpen(false);
      setExpanded(false);
    }
  }
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [topHeight, setTopHeight] = useState(0);
  // Whether that height is the search card's, not the card's.
  const [topIsSearch, setTopIsSearch] = useState(false);
  const [peek, setPeek] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  const window = useWindowDimensions();
  // The stage runs under the tab bar and the home indicator; the panel host
  // sits above them, so the band beneath it is measured from its layout and
  // counted in the map's bottom inset with the panel's peek.
  // On iOS the system's inset is read by a probe and held (map/band.ts);
  // Android's tab bar sits below the stage and its inset is the chrome's own.
  // Where the panel host ends, as it last reported. The band is worked out
  // from it against the stage's height of the moment: worked out once, at
  // the report, it used a stage height a render old, and after Android's
  // tab bar hid for the keyboard and came back the band stayed 104 pt too
  // large, leaving the map almost no room.
  const [hostBottom, setHostBottom] = useState<number | null>(null);
  const [probed, reportInset] = useHeldInset();
  const managed =
    adaptive ||
    [...regions.divisions, ...regions.occlusions].some((r) => r.active);
  const probes = Platform.OS === 'ios' && !managed;
  const hostBelow =
    hostBottom === null || !stage.height
      ? 0
      : Math.max(0, Math.round(stage.height - hostBottom));
  const below = probes ? probed : hostBelow;
  const pose = mapControlLayout(
    {
      x: safe?.left ?? 0,
      y: 0,
      width: Math.max(
        1,
        (stage.width || window.width) - (safe?.left ?? 0) - (safe?.right ?? 0),
      ),
      height: Math.max(
        1,
        (stage.height || window.height) - (safe?.bottom ?? 0),
      ),
    },
    regions,
    topHeight,
    controlsHeight,
    !searchOpen && !expanded,
  );
  // Android's taller Material card can leave less room under it than the
  // vertical stack needs, so Fit ran under the panel's peek. There the
  // controls lie in a row under the card instead. The stack's own height is
  // remembered while it stands, so the row cannot flip it back. iOS keeps
  // its stack.
  const [stackHeight, setStackHeight] = useState(0);
  const rowOnPhone =
    Platform.OS === 'android' &&
    !managed &&
    !pose.folded &&
    stackHeight > 0 &&
    peek > 0 &&
    topHeight + rhythm.block + stackHeight + rhythm.block >
      (stage.height || window.height) - below - peek;
  const horizontalControls = (managed && pose.horizontal) || rowOnPhone;
  // At accessibility sizes a compact card and panel would fill the screen and
  // bury the controls: they share what the band leaves and scroll inside it.
  // Regular layouts keep their own caps, which already leave the band room.
  // The band under the panel is the tab bar and the home indicator. It is
  // measured from the panel host, but a panel taller than its room pushed
  // the host under the tab bar, the gap read as 0 and the room grew to
  // match: the focus figure sat under the tab bar (sweep 2 item 5.4). The
  // safe inset is the floor of that band.
  const band = Math.max(below, managed ? 0 : (safe?.bottom ?? 0));
  const visible = (stage.height || window.height) - band;
  const bandHeight = controlsHeight || (horizontalControls ? 48 : 190);
  // On a phone the map shows in the band the controls stand in. A stack is
  // tall enough to be the map's floor; a row (Android at large text) left
  // the map a sliver, so there the card and the panel give up the rest of
  // a floor between them.
  const phoneFloor = managed
    ? 0
    : Math.max(0, phoneSceneFloor(visible) - bandHeight - rhythm.block * 2);
  const panelState = searchOpen ? 'search' : expanded ? 'expanded' : 'map';
  const largeLimits = (top: number, state: typeof panelState = panelState) =>
    largeTextLimits(
      managed ? pose.controls.height : visible,
      top,
      bandHeight,
      state,
      managed ? pose.sceneFloor : phoneFloor,
    );
  // Until the card reports its height, a capped card (large text on a
  // compact width) is taken to fill its cap, as it does there. The panel's
  // share was worked out from a card of no height on the first frame and
  // shrank when the height came in.
  const top =
    topHeight || (large && !regular ? largeLimits(0).topMaxHeight : 0);
  const caps = large && !regular ? largeLimits(top) : null;
  // The same limits with the panel at rest, whatever it is doing now.
  const restCaps = large && !regular ? largeLimits(top, 'map') : null;
  // The jurisdiction and the List | Map picker never scroll out of a capped
  // card: only its sentence does. Where the two alone need more than the
  // cap (the largest sizes on a small phone) the cap is theirs, and the
  // panel gives the difference back.
  const [pinned, setPinned] = useState({ head: 0, picker: 0 });
  // Two lines of the sentence stay in view, so the card says what the map
  // shows ("Money to parties, 1998–99 to 2025–26") and not one word of it.
  const sentenceNeed = Math.max(
    minimumTarget,
    textStyles.secondary.lineHeight * window.fontScale * SENTENCE_LINES,
  );
  const pinnedBase =
    pinned.head && pinned.picker && !searchOpen
      ? pinned.head +
        pinned.picker +
        rhythm.tight * 3 +
        rhythm.block * 2 +
        hairline * 2
      : 0;
  const pinnedNeed = pinnedBase ? pinnedBase + sentenceNeed : 0;
  // The least the sentence needs: one line's room, as the card always had.
  const pinnedLeast = pinnedBase ? pinnedBase + minimumTarget : 0;
  const limits = caps
    ? (() => {
        // Two lines of the sentence only where the panel keeps its floor
        // (44 pt) once the card has taken them: on the smallest phones at
        // the largest sizes the panel would otherwise run over the search
        // and zoom controls, so the sentence gives up the second line.
        // The choice is made from the room with the panel at rest. An
        // expanded panel hides the controls and frees room, and a choice
        // made from that grew the card as the panel opened and shrank it
        // as it closed (the iPhone SE at the largest sizes).
        const rest = restCaps ?? caps;
        const room =
          rest.topMaxHeight + Math.max(0, rest.panelMaxHeight - minimumTarget);
        const topMaxHeight = Math.max(
          caps.topMaxHeight,
          pinnedNeed <= room ? pinnedNeed : pinnedLeast,
        );
        const over = Math.max(
          0,
          Math.min(top, topMaxHeight) - caps.topMaxHeight,
        );
        return {
          topMaxHeight,
          panelMaxHeight: Math.max(minimumTarget, caps.panelMaxHeight - over),
        };
      })()
    : null;
  // Below accessibility sizes a phone's panel keeps its own height, unless
  // a focus makes it taller than the room under the controls: then it stops
  // at the controls and scrolls, so all four stay whole (item 5.6).
  const phoneRoom =
    !limits && !managed && !searchOpen && !expanded && !horizontalControls
      ? Math.max(
          minimumTarget,
          visible - top - (controlsHeight || 190) - rhythm.block * 2,
        )
      : undefined;
  const panelMaxHeight =
    limits?.panelMaxHeight ??
    (managed
      ? pose.panelMaxHeight
      : phoneRoom !== undefined && peek > phoneRoom
        ? phoneRoom
        : undefined);
  const topMaxHeight =
    limits?.topMaxHeight ?? (managed ? pose.topMaxHeight : undefined);
  // The sentence's room in a capped card is what the pinned parts leave,
  // which is no whole number of lines: its third line was cut through,
  // right above the picker. The room is taken in whole lines, a line being
  // the height of one as it is drawn at this text size (measured, since
  // the system's type ramp is not the font scale). The card is the shorter
  // by the part line, at one height; the rest of the sentence scrolls a
  // line at a time, VoiceOver reads all of it, and the List shows it whole.
  const [sentenceLine, setSentenceLine] = useState(0);
  const sentenceRoom =
    topMaxHeight !== undefined && pinnedBase ? topMaxHeight - pinnedBase : 0;
  const sentenceLines =
    sentenceLine > 0 && sentenceRoom > 0
      ? Math.floor((sentenceRoom + 0.5) / sentenceLine)
      : null;
  const sentenceMax = sentenceLines ? sentenceLines * sentenceLine : undefined;
  // Less than one line of room (the iPhone SE at the largest sizes, where
  // the jurisdiction and the picker fill the cap): asking for a whole line
  // changed nothing, since the card can only shrink, and the line was still
  // cut through. No part of it is drawn. Its room stays, so the card keeps
  // its height, and holds the sentence for VoiceOver; the List shows it.
  // Taking a line from the panel instead would put the panel over the
  // search and zoom controls there, which is why the card gave it up.
  const sentenceUnseen =
    sentenceLines === 0 && data ? moneySummary(data.graph, data.filters) : null;
  // The offline line is set in the sentence's type, so where a line of the
  // sentence does not fit, neither does it. Stale data is still said: the
  // line's own mark is drawn in the room, and its words follow the sentence
  // in the room's label.
  const unseenOffline =
    sentenceUnseen !== null && data?.record.stale && !data.record.staleReason
      ? data.record.savedAt === null
        ? 'You’re offline.'
        : copy.offline(data.record.savedAt)
      : null;
  const insets = useMemo(
    () =>
      pose.folded
        ? {
            top: rhythm.tight,
            bottom: (safe?.bottom ?? 0) + rhythm.tight,
            left: (safe?.left ?? 0) + rhythm.tight,
            right: (safe?.right ?? 0) + rhythm.tight,
          }
        : {
            top:
              top +
              rhythm.tight +
              (managed ? pose.controls.y : 0) +
              (horizontalControls && !searchOpen && !expanded
                ? 48 + rhythm.block
                : 0),
            bottom:
              (managed ? (safe?.bottom ?? 0) : band) +
              Math.min(peek, panelMaxHeight ?? peek) +
              rhythm.tight,
            left: (safe?.left ?? 0) + rhythm.tight,
            right:
              (safe?.right ?? 0) +
              (horizontalControls ? rhythm.tight : 44 + rhythm.block * 2),
          },
    [
      pose.folded,
      safe,
      managed,
      top,
      peek,
      band,
      panelMaxHeight,
      horizontalControls,
      pose.controls.y,
      searchOpen,
      expanded,
    ],
  );
  // The map keeps its frame while Search is open, and until the card that
  // comes back has been measured. The search card is far shorter than the
  // card, so the map's room grew by more than its zoom limits allow: the
  // camera was zoomed in to the new minimum, and stayed zoomed, lower and
  // half under the panel, when Search closed.
  const searching = searchOpen || topIsSearch;
  const [restInsets, setRestInsets] = useState(insets);
  if (!searching && restInsets !== insets) setRestInsets(insets);
  // A turn during Search ends the hold: the insets kept are the other
  // orientation's (its safe sides, its card, its band), and nothing of that
  // frame is left to keep. The map takes the insets of the moment until
  // Search closes. A turn is a new width; a keyboard changes the height.
  const [restWidth, setRestWidth] = useState(window.width);
  if (!searching && restWidth !== window.width) setRestWidth(window.width);
  const turned = searching && restWidth !== window.width;
  // At large text the open Search and its keyboard fill the screen: the
  // panel under them is out of reach, yet it held the map's room to a
  // strip. It is hidden for the while and its room goes to the map (a
  // tall card's room is the keyboard's, not the panel's).
  const hidePanel = searchOpen && large && !regular && !managed;
  const searchBottom = (managed ? (safe?.bottom ?? 0) : band) + rhythm.tight;
  // That strip starts under the search card, which grows and shrinks with
  // its results. The map is fitted to the strip once for each set of
  // results (the card's height as that set was first drawn), never for a
  // keystroke that lists the same ones: the "nothing matches" line can wrap
  // as the query grows. Until the first results the map keeps its view.
  const [resultsKey, setResultsKey] = useState('');
  const [strip, setStrip] = useState<{ key: string; top: number } | null>(null);
  if (!searchOpen && (strip !== null || resultsKey !== '')) {
    setStrip(null);
    setResultsKey('');
  }
  const noteStrip = (height: number) => {
    if (!hidePanel || !model) return;
    // A card that leaves the map no strip is not fitted to.
    const left =
      (stage.height || window.height) - height - rhythm.tight - searchBottom;
    if (left < minimumTarget * 2) return;
    setStrip((previous) =>
      (previous ? previous.key === resultsKey : resultsKey === '')
        ? previous
        : { key: resultsKey, top: height },
    );
  };
  const searchHold = useMemo(() => {
    const top = strip ? strip.top + rhythm.tight : restInsets.top;
    return restInsets.bottom === searchBottom && restInsets.top === top
      ? restInsets
      : { ...restInsets, top, bottom: searchBottom };
  }, [restInsets, searchBottom, strip]);
  const mapInsets =
    !searching || turned ? insets : hidePanel ? searchHold : restInsets;
  // The map is drawn only between the card and the panel: no stroke above
  // the card or under the bar, and no name half under either (item 5.6).
  // A fold gives the map its own side, with nothing over it to clip. A
  // regular width caps the card and panel to a column, so clipping the full
  // width would blank the map beside them: only compact widths clip.
  const clip = useMemo(
    () =>
      pose.folded || regular
        ? null
        : {
            top:
              topHeight > 0 ? (managed ? pose.controls.y : 0) + topHeight : 0,
            bottom: Math.max(
              0,
              (hidePanel ? searchBottom : insets.bottom) - rhythm.tight,
            ),
          },
    [
      pose.folded,
      regular,
      topHeight,
      managed,
      pose.controls.y,
      insets.bottom,
      hidePanel,
      searchBottom,
    ],
  );
  // Android's Back closes the search, then the panel, then the focus.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused()) return false;
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
      if (expanded) {
        setExpanded(false);
        return true;
      }
      if (focus) {
        setFocus(null);
        return true;
      }
      return false;
    });
    return () => back.remove();
  }, [navigation, searchOpen, expanded, focus, setFocus]);
  // Every fly the chrome asks for goes through here: the camera, the focus
  // and the trail move together.
  const go = (id: string, nextTrail: string[]) => {
    setSearchOpen(false);
    dispatch({ type: 'flyTo', id });
    setFocus(id, nextTrail);
  };
  const flyTo = (id: string) => go(id, [id]);
  // Next and Previous keep VoiceOver on the button they were pressed from,
  // so the new subject is said aloud in the panel title's words, after the
  // button's own reply.
  const step = (index: number, nextTrail: string[]) => {
    if (!model) return;
    const node = model.nodes[index]!;
    go(node.id, nextTrail);
    AccessibilityInfo.announceForAccessibilityWithOptions(
      `${focusMetaLine(node)}, ${node.label}`,
      { queue: true },
    );
  };
  /** A search result chosen: the action only, never the text or the result. */
  const chooseSearchResult = (id: string) => {
    mapAction('search');
    flyTo(id);
  };
  const record_ = useCallback(
    (id: string, name?: string) =>
      // Only a drawn map has records to open.
      moneyFocusRoute(id, jurisdiction, filters!, name, 'map'),
    [jurisdiction, filters],
  );
  const panelFocus: PanelFocus | null = (() => {
    if (focusIndex === null || !model) return null;
    const node = model.nodes[focusIndex]!;
    const trailIndices = trail
      .map((id) => model.byId.get(id))
      .filter((i): i is number => i !== undefined);
    const next = nextAlongFlows(model, focusIndex, trailIndices);
    const previousId = trail.length > 1 ? trail[trail.length - 2]! : null;
    const previous = previousId
      ? model.nodes[model.byId.get(previousId) ?? -1]
      : undefined;
    return {
      node,
      flows: focusFlows(model, focusIndex),
      record: record_(node.id, node.label),
      flowRecord: (other) => record_(other.id, other.label),
      next:
        next === null
          ? null
          : {
              label: model.nodes[next]!.label,
              onPress: () => step(next, [...trail, model.nodes[next]!.id]),
            },
      previous: previous
        ? {
            label: previous.label,
            onPress: () => step(previous.index, trail.slice(0, -1)),
          }
        : null,
    };
  })();
  const actions = panelFocus
    ? [
        ...(panelFocus.next
          ? [
              {
                name: 'nextFlow',
                label: `Next flow, ${panelFocus.next.label}`,
                onAction: panelFocus.next.onPress,
              },
            ]
          : []),
        ...(panelFocus.previous
          ? [
              {
                name: 'previousFlow',
                label: `Previous, ${panelFocus.previous.label}`,
                onAction: panelFocus.previous.onPress,
              },
            ]
          : []),
        {
          name: 'openRecord',
          label: `Open the record for ${panelFocus.node.label}`,
          onAction: () => {
            mapAction('open_record');
            router.push(panelFocus.record);
          },
        },
        {
          name: 'clearFocus',
          label: 'Clear the focus',
          onAction: () => {
            setFocus(null);
            setExpanded(false);
          },
        },
      ]
    : [];
  const totals =
    data && model
      ? {
          donations: model.totals.donations,
          publicMoney:
            data.filters.grants || data.filters.contracts
              ? model.totals.grants + model.totals.contracts
              : null,
        }
      : null;
  const layers = linkedLayers(params);
  const sourceLine = data ? (
    <SourceLine
      {...moneySourceDetails(data.record, {
        citation: [
          moneyShortSource(data.graph),
          ...(['grants', 'contracts'] as const)
            .filter(
              (kind) => data.filters[kind] && data.graph.meta[`${kind}_source`],
            )
            .map((kind) => publicMoneySource(data.graph, kind).label),
        ],
        originals: moneyOriginals(data.graph),
        notes: [...moneyNotes(data.graph), donationsCaveat, publicMoneyCaveat],
        testID: 'money-source',
      })}
    />
  ) : null;
  const cardWidth = regular ? { maxWidth: 420 } : null;
  // A capped card says it scrolls: the system indicator flashes once when
  // its content first runs past the cap (item 5.3).
  const topScroll = useRef<ScrollView>(null);
  const flashed = useRef(false);
  const flashOnce = (contentHeight: number, room = topMaxHeight) => {
    if (flashed.current || room === undefined) return;
    if (contentHeight <= room - rhythm.tight) return;
    flashed.current = true;
    topScroll.current?.flashScrollIndicators();
  };
  const topContent =
    searchOpen && model ? (
      <MoneyMapSearch
        model={model}
        // The search card closes either way, taking VoiceOver's place with it:
        // a result moves it to the panel's new subject, Close back to Search.
        onChoose={(id) => {
          requestFocus('money-map-focus');
          chooseSearchResult(id);
        }}
        onClose={() => {
          requestFocus('money-map-search');
          setSearchOpen(false);
        }}
        onResults={setResultsKey}
      />
    ) : null;
  // The sizes the chrome is worked out from are read before the frame is
  // painted (map/measure.ts): onLayout brought them a frame or more late,
  // and at large text the card and the panel then moved after the page had
  // appeared. Each change of window, text size or state gets a few passes
  // to settle; onLayout still follows anything later.
  const stageRef = useRef<View>(null);
  const topRef = useRef<View>(null);
  const controlsRef = useRef<View>(null);
  const headRef = useRef<View>(null);
  const pickerRef = useRef<View>(null);
  const probeRef = useRef<View>(null);
  const lineRef = useRef<View>(null);
  const settleKey = `${window.width}x${window.height}x${window.fontScale}|${searchOpen}|${expanded}|${loaded}|${!!unavailable}|${resultsKey}`;
  const settle = useRef({ key: '', left: 0 });
  // Every commit, on purpose: a frame can change without a dependency
  // changing. It sets state only on a difference, within the budget.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (settle.current.key !== settleKey)
      settle.current = { key: settleKey, left: SETTLE_PASSES };
    if (settle.current.left <= 0) return;
    let changed = false;
    const stageFrame = frameOf(stageRef);
    if (
      stageFrame &&
      stageFrame.height > 0 &&
      (stageFrame.width !== stage.width || stageFrame.height !== stage.height)
    ) {
      setStage(stageFrame);
      changed = true;
    }
    const topFrame = frameOf(topRef);
    if (topFrame) {
      // Whose height it is, even when the height itself is the same.
      setTopIsSearch(searchOpen && !!model);
      noteStrip(Math.ceil(topFrame.height));
      if (Math.ceil(topFrame.height) !== topHeight) {
        setTopHeight(Math.ceil(topFrame.height));
        changed = true;
      }
    }
    const controlsFrame = frameOf(controlsRef);
    if (controlsFrame) {
      const next = Math.ceil(controlsFrame.height);
      if (next !== controlsHeight) {
        setControlsHeight(next);
        changed = true;
      }
      if (!horizontalControls && next !== stackHeight) setStackHeight(next);
    }
    const headFrame = frameOf(headRef);
    const pickerFrame = frameOf(pickerRef);
    if (headFrame && pickerFrame) {
      const next = {
        head: Math.ceil(headFrame.height),
        picker: Math.ceil(pickerFrame.height),
      };
      if (next.head !== pinned.head || next.picker !== pinned.picker) {
        setPinned(next);
        changed = true;
      }
    }
    const lineFrame = frameOf(lineRef);
    if (
      lineFrame &&
      lineFrame.height > 0 &&
      lineFrame.height !== sentenceLine
    ) {
      setSentenceLine(lineFrame.height);
      changed = true;
    }
    const probeFrame = probes ? frameOf(probeRef) : null;
    if (probeFrame) reportInset(Math.round(probeFrame.height));
    if (changed) settle.current.left -= 1;
  });
  const measure =
    (part: 'head' | 'picker') =>
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const height = Math.ceil(event.nativeEvent.layout.height);
      setPinned((previous) =>
        previous[part] === height ? previous : { ...previous, [part]: height },
      );
    };
  return (
    <GestureHandlerRootView style={styles.root}>
      <RouteOptions options={options} />
      <View
        ref={stageRef}
        style={styles.root}
        testID="money-screen"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStage((previous) =>
            previous.width === width && previous.height === height
              ? previous
              : { width, height },
          );
        }}
      >
        {data && model ? (
          <MoneyMap
            command={command}
            graph={data.graph}
            model={model}
            focus={focus}
            onFocus={(id) => setFocus(id)}
            insets={mapInsets}
            holdSize={searching && !turned}
            fitKey={hidePanel && strip && !turned ? strip.key : null}
            clip={clip}
            cacheKey={jurisdiction}
            accessibilityLabel={moneyMapLabel(model, focus)}
            actions={actions}
            overview={
              large ||
              searchOpen ||
              expanded ||
              (managed &&
                pose.controls.width < MINI_WIDTH + rhythm.block * 2) ||
              (managed &&
                pose.controls.height - topHeight - controlsHeight - peek <
                  MINI_HEIGHT + rhythm.block * 2)
                ? null
                : {
                    left:
                      (managed ? pose.controls.x : (safe?.left ?? 0)) +
                      rhythm.block,
                    bottom: managed
                      ? (stage.height || window.height) -
                        pose.controls.y -
                        pose.controls.height +
                        Math.min(peek, panelMaxHeight ?? peek) +
                        rhythm.block
                      : band + peek + rhythm.block,
                  }
            }
          />
        ) : null}
        {probes ? (
          // Reads the band under the panel (the tab bar and the home
          // indicator) and draws nothing: a view of no content at the
          // stage's foot, so its height is the system's bottom inset, with
          // nothing taken from the stage's own measured size.
          <View
            ref={probeRef}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.bandProbe}
            testID="money-map-band"
            onLayout={(event) =>
              reportInset(Math.round(event.nativeEvent.layout.height))
            }
          >
            <SafeAreaView edges={['bottom']} />
          </View>
        ) : null}
        <SafeAreaView
          // The stack's opaque bar already sits above the stage: a top
          // edge here would count the status bar twice and push the card
          // down the map. The frame owns the safe sides so its absolute
          // controls clear a side rail too, without counting padding twice.
          // On iOS the bottom band is the held one, kept by the spacer at
          // the column's foot: the system's own inset moves at a push's end.
          edges={managed || probes ? [] : ['bottom']}
          pointerEvents="box-none"
          style={[
            styles.chrome,
            managed
              ? {
                  left: pose.controls.x,
                  top: pose.controls.y,
                  width: pose.controls.width,
                  height: pose.controls.height,
                  right: undefined,
                  bottom: undefined,
                }
              : { left: safe?.left ?? 0, right: safe?.right ?? 0 },
          ]}
          testID="money-map-chrome"
        >
          <View
            ref={topRef}
            style={[
              styles.top,
              cardWidth,
              topMaxHeight === undefined ? null : { maxHeight: topMaxHeight },
            ]}
            pointerEvents="box-none"
            onLayout={(event) => {
              setTopHeight(Math.ceil(event.nativeEvent.layout.height));
              setTopIsSearch(searchOpen && !!model);
              noteStrip(Math.ceil(event.nativeEvent.layout.height));
            }}
          >
            {topContent ? (
              topMaxHeight !== undefined ? (
                <ScrollView
                  ref={topScroll}
                  style={styles.topScroll}
                  onContentSizeChange={(_w, h) => flashOnce(h)}
                  keyboardShouldPersistTaps="handled"
                  // Android hides the bar at rest; a capped card shows it has more.
                  persistentScrollbar
                >
                  {topContent}
                </ScrollView>
              ) : (
                topContent
              )
            ) : topMaxHeight !== undefined ? (
              // A capped card: the jurisdiction and the picker hold their
              // places and the sentence between them scrolls.
              <View
                style={[styles.card, styles.cardCapped]}
                testID="money-map-card"
              >
                <View
                  ref={headRef}
                  onLayout={measure('head')}
                  testID="money-map-card-head"
                >
                  {head}
                </View>
                {/* One line of the sentence's type, laid out and never seen:
                    its height is the line the sentence's room is cut to. */}
                <View
                  ref={lineRef}
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.lineProbe}
                  onLayout={(event) => {
                    const { height } = event.nativeEvent.layout;
                    if (height > 0) setSentenceLine(height);
                  }}
                  testID="money-map-card-line"
                >
                  <Text wordSafe variant="secondary" numberOfLines={1}>
                    {'\u00a0'}
                  </Text>
                </View>
                <ScrollView
                  ref={topScroll}
                  style={[
                    styles.topScroll,
                    sentenceMax === undefined
                      ? null
                      : { maxHeight: sentenceMax },
                  ]}
                  snapToInterval={
                    sentenceMax === undefined ? undefined : sentenceLine
                  }
                  decelerationRate={
                    sentenceMax === undefined ? undefined : 'fast'
                  }
                  contentContainerStyle={styles.cardScroll}
                  onContentSizeChange={(_w, h) =>
                    // The sentence's room: the cap less the pinned parts.
                    flashOnce(
                      h,
                      topMaxHeight -
                        pinned.head -
                        pinned.picker -
                        rhythm.tight * 3 -
                        rhythm.block * 2,
                    )
                  }
                  keyboardShouldPersistTaps="handled"
                  // Android hides the bar at rest; a capped card shows it has more.
                  persistentScrollbar={sentenceUnseen === null}
                  scrollEnabled={sentenceUnseen === null}
                  testID="money-map-card-scroll"
                >
                  {sentenceUnseen === null ? (
                    summary
                  ) : (
                    <View
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={
                        unseenOffline === null
                          ? sentenceUnseen
                          : `${sentenceUnseen} ${unseenOffline}`
                      }
                      style={[styles.unseenRoom, { height: sentenceRoom }]}
                      testID="money-view-summary-unseen"
                    >
                      {unseenOffline === null ? null : (
                        <View testID="money-offline-mark">
                          <Icon
                            name={symbols.offline}
                            size={Math.min(28, sentenceRoom)}
                            tone="inkSoft"
                          />
                        </View>
                      )}
                    </View>
                  )}
                  {hooks}
                  {sentenceUnseen === null ? offline : null}
                </ScrollView>
                <View
                  ref={pickerRef}
                  onLayout={measure('picker')}
                  testID="money-map-card-picker"
                >
                  {picker}
                </View>
              </View>
            ) : (
              <View style={styles.card} testID="money-map-card">
                {head}
                {summary}
                {picker}
                {hooks}
                {offline}
              </View>
            )}
          </View>
          {/* The controls hang from the card's foot by layout, not from its
              measured height, so they are in place on the first frame. */}
          <View style={styles.grow} pointerEvents="box-none">
            {unavailable ? (
              <ScrollView
                contentContainerStyle={styles.unavailable}
                // The map has no pull; its error and empty states do, as
                // the List's have.
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={refresh}
                    tintColor={colors.navy}
                  />
                }
                testID="money-map-unavailable"
              >
                {unavailable}
              </ScrollView>
            ) : searchOpen || expanded ? null : (
              <View
                ref={controlsRef}
                style={[
                  styles.controls,
                  horizontalControls
                    ? { left: rhythm.block, right: undefined }
                    : null,
                ]}
                pointerEvents="box-none"
                onLayout={(event) => {
                  const next = Math.ceil(event.nativeEvent.layout.height);
                  setControlsHeight(next);
                  if (!horizontalControls) setStackHeight(next);
                }}
              >
                <MoneyMapControls
                  horizontal={horizontalControls}
                  onSearch={() => {
                    if (model) setSearchOpen(true);
                  }}
                  onZoomIn={() => {
                    if (!model) return;
                    mapAction('zoom');
                    dispatch({ type: 'zoom', direction: 1 });
                  }}
                  onZoomOut={() => {
                    if (!model) return;
                    mapAction('zoom');
                    dispatch({ type: 'zoom', direction: -1 });
                  }}
                  onFit={() => {
                    if (!model) return;
                    mapAction('zoom');
                    dispatch({ type: 'fit' });
                  }}
                />
              </View>
            )}
          </View>
          {unavailable ? null : (
            <View
              style={[
                styles.panelHost,
                regular ? styles.panelRegular : null,
                hidePanel ? styles.unseen : null,
              ]}
              pointerEvents={hidePanel ? 'none' : 'box-none'}
              accessibilityElementsHidden={hidePanel}
              importantForAccessibility={
                hidePanel ? 'no-hide-descendants' : 'auto'
              }
              testID="money-map-panel-host"
              onLayout={(event) => {
                if (managed || probes) return;
                const { y, height } = event.nativeEvent.layout;
                const bottom = y + height;
                setHostBottom((previous) =>
                  previous === bottom ? previous : bottom,
                );
              }}
            >
              <MoneyMapPanel
                focus={panelFocus}
                totals={totals}
                publicMoneyExpected={layers.grants || layers.contracts}
                caption={
                  model
                    ? `${formatCount(model.nodes.length)} discs · ${formatCount(model.edges.length)} recorded flows · ${formatMoneyCompact(model.totals.donations)} in donations`
                    : ''
                }
                legend={model ? <MoneyMapLegend model={model} /> : null}
                sourceLine={sourceLine}
                stageHeight={stage.height || window.height}
                maxHeight={panelMaxHeight}
                expanded={expanded}
                onExpanded={(next) => {
                  if (model) setExpanded(next);
                }}
                // Clearing ends the subject: the next focus starts at the peek.
                onClear={() => {
                  setFocus(null);
                  setExpanded(false);
                }}
                onOpenRecord={() => mapAction('open_record')}
                onPeekHeight={setPeek}
              />
            </View>
          )}
          {probes ? (
            <View
              style={{ height: band }}
              pointerEvents="none"
              testID="money-map-band-space"
            />
          ) : null}
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
}

// ----------------------------------------------------------------- list

function ListMode({
  options,
  title,
  refreshing,
  refresh,
  head,
  offline,
  picker,
  body,
  hooks,
}: {
  options: Record<string, unknown>;
  title: string;
  refreshing: boolean;
  refresh: () => void;
  head: React.ReactNode;
  offline: React.ReactNode;
  picker: React.ReactNode;
  body: React.ReactNode;
  hooks: React.ReactNode;
}) {
  // The bar title fades in by scroll with no width at rest, so the back
  // button keeps its label (money-03), and truncates inside the bar items.
  const barTitleRef = useRef<View>(null);
  const barTitle = useTitleOnScroll(barTitleRef, title || undefined);
  // The map set a solid, backed bar on this route. The list takes the tab
  // stack's bar again, from the same check, so a fold or unfold after the
  // map still follows the other pushed pages.
  const rail = useRailBar();
  // Off the rail the pushed pages' bar is clear too (iOS 26).
  const clear = usePushedBar() === 'clear';
  const setOptions = useSafeSetOptions();
  useLayoutEffect(() => {
    setOptions({
      headerTransparent: clear,
      // Screen below sets the solid bar's ground; this runs after it.
      ...(rail === 'solid'
        ? barBacking(colors.paper)
        : { headerBackground: undefined }),
    });
  }, [setOptions, rail, clear]);
  return (
    <GestureHandlerRootView style={styles.root}>
      <RouteOptions options={options} />
      <Screen
        column="wide"
        testID="money-screen"
        onScroll={barTitle.onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
      >
        <Group gap={rhythm.tight}>
          <View
            ref={barTitleRef}
            collapsable={false}
            onLayout={barTitle.onTitleLayout}
          >
            <Heading level={1} kind="page" testID="money-title">
              {title}
            </Heading>
          </View>
          {head}
        </Group>
        {offline}
        {picker}
        {body}
        {hooks}
      </Screen>
    </GestureHandlerRootView>
  );
}

/** The List view's placeholder; the Map keeps its own frame (MapMode). */
function MoneySkeleton() {
  return (
    <Group>
      <Skeleton
        shape="figure"
        count={1}
        label="Loading the money map"
        testID="money-loading"
      />
      <Skeleton shape="rows" count={5} />
    </Group>
  );
}

function ListBody({
  record,
  filters,
  view,
  jurisdiction,
}: {
  record: RecordResult<MoneyGraph>;
  filters: MoneyFilters;
  view: MoneyGraph;
  jurisdiction: MoneyJurisdiction;
}) {
  const graph = record.data;
  const column = useScreenColumn('wide');
  const donations = useMemo(
    () => partyDonationsTotal(graph, filters),
    [graph, filters],
  );
  const windowNodes = useMemo(
    () => moneyWindowNodes(graph, filters),
    [graph, filters],
  );
  const grantor = (flow: 'grants' | 'contracts') =>
    windowNodes.find(
      (n) =>
        n.kind === 'grantor' &&
        (flow === 'contracts'
          ? n.flow === 'contracts'
          : n.flow !== 'contracts'),
    );
  const grants = filters.grants ? grantor('grants') : undefined;
  const contracts = filters.contracts ? grantor('contracts') : undefined;
  const years = moneyYears(donations.firstYear, donations.lastYear);
  const inflation = filters.inflation ? ', in 2025–26 dollars' : '';
  const donationsLine = donations.subset
    ? `from ${industryDonors(filters.industry!)} on the map, ${years}${inflation}`
    : `${partiesFigureWords(graph).line}, ${years}${inflation}`;
  const shortSource = moneyShortSource(graph);
  const grantsSource = publicMoneySource(graph, 'grants');
  const contractsSource = publicMoneySource(graph, 'contracts');
  const publicCitation = [
    ...(grants ? [grantsSource.label] : []),
    ...(contracts ? [contractsSource.label] : []),
  ];
  const donationsBlock = filters.donations ? (
    <FigureBlock
      value={formatMoneyCompact(donations.total)}
      ink="money"
      label={donationsLine}
      caveat={
        donations.subset
          ? donationsCaveat
          : receiptSectionWords('party', graph, false).caveat
      }
      accessibilityLabel={`${moneyAccessibilityLabel(donations.total, true)}, ${donationsLine}`}
      citation={moneySourceDetails(record, {
        citation: shortSource,
        originals: moneyOriginals(graph).slice(0, 1),
        notes: moneyNotes(graph),
        testID: 'money-source',
      })}
      testID="money-donations"
    />
  ) : null;
  const named = rankedDonors(view);
  const top = named
    .filter((n) => n.via !== 'public_money')
    .slice(0, TOP_DONORS);
  const donorDetail = useMemo(() => donorDetails(view), [view]);
  const partyNodes = moneyPartyGroups(
    view.nodes.filter((n) => n.kind === 'party'),
    (n) => n.label,
  );
  const record_ = (node: MoneyNode) =>
    moneyFocusRoute(node.id, jurisdiction, filters, node.label, 'map');
  const partyWords = receiptSectionWords('party', graph, false);
  const partyRow = (node: MoneyNode, index: number) => (
    <PartyMoneyRow
      key={node.id}
      name={node.label}
      detail={`${counted(node.count, partyWords.one, partyWords.many)} · ${moneyYears(node.firstYear, node.lastYear)}`}
      amount={node.total}
      href={record_(node)}
      testID={`money-party-${index}`}
    />
  );
  void column;
  return (
    <>
      {donationsBlock}
      {filters.donations ? (
        <View testID="money-donors" style={styles.section}>
          <SectionHeader
            title="Donors"
            action={{
              label: copy.seeAll,
              accessibilityLabel: `See all ${counted(named.length, 'donor')}`,
              href: moneyDonorsRoute({
                jurisdiction,
                ...moneyWindowParams(filters),
                via: 'map',
              }),
              testID: 'money-donors-all',
            }}
          />
          <Text wordSafe variant="footnote" testID="money-donor-caption">
            {donorCaption(graph, filters)}
          </Text>
          <View>
            {top.map((node, index) => (
              <MoneyRow
                key={node.id}
                name={node.label}
                detail={[
                  associatedLine(donorAssociated(node)),
                  donorDetail(node),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                amount={node.total}
                compact
                href={record_(node)}
                testID={`money-donor-${index}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      {partyNodes.main.length || partyNodes.other.length ? (
        <View testID="money-parties" style={styles.section}>
          <SectionHeader title="Parties" />
          <View>{partyNodes.main.map(partyRow)}</View>
          {partyNodes.other.length ? (
            <>
              <SectionHeader title="Other parties" level={3} />
              <View>
                {partyNodes.other.map((node, index) =>
                  partyRow(node, partyNodes.main.length + index),
                )}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
      {grants || contracts ? (
        <View testID="money-public" style={styles.section}>
          <SectionHeader title="Public money" />
          <View>
            {[grants, contracts].map((node) =>
              node ? (
                <MoneyRow
                  key={node.id}
                  name={`${node.label} to donors on the map`}
                  detail={moneyYears(node.firstYear, node.lastYear)}
                  amount={node.total}
                  href={record_(node)}
                  testID={`money-public-${node.flow === 'contracts' ? 'contracts' : 'grants'}`}
                />
              ) : null,
            )}
          </View>
          <Text wordSafe variant="footnote">
            {publicMoneyCaveat}
          </Text>
          {grants || contracts ? (
            <StatStrip
              tiles={[
                ...(grants
                  ? [
                      {
                        value: formatMoneyCompact(grants.total),
                        label: 'in grants',
                        testID: 'money-public-grants-total',
                      },
                    ]
                  : []),
                ...(contracts
                  ? [
                      {
                        value: formatMoneyCompact(contracts.total),
                        label: 'in contracts',
                        testID: 'money-public-contracts-total',
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}
        </View>
      ) : null}
      <SourceLine
        {...moneySourceDetails(record, {
          citation: [shortSource, ...publicCitation],
          originals: moneyOriginals(graph),
          notes: moneyNotes(graph),
          testID: 'money-list-source',
        })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  section: { gap: rhythm.tight },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: {
    paddingHorizontal: rhythm.block,
    paddingTop: rhythm.tight,
    width: '100%',
  },
  topScroll: { flexGrow: 0, flexShrink: 1 },
  cardCapped: { flexShrink: 1 },
  cardScroll: { gap: rhythm.tight },
  card: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    padding: rhythm.block,
    gap: rhythm.tight,
  },
  // Floating under the card, at the head of the room between it and the
  // panel, out of the column so the expanded panel keeps its share of the
  // stage.
  controls: { position: 'absolute', top: rhythm.block, right: rhythm.block },
  unavailable: { flexGrow: 1, justifyContent: 'center', padding: rhythm.block },
  // Laid out, never seen or read: it keeps the place of words still to come.
  unseen: { opacity: 0 },
  unseenRoom: { justifyContent: 'center' },
  lineProbe: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  bandProbe: { position: 'absolute', left: 0, bottom: 0, width: 1, opacity: 0 },
  grow: { flex: 1 },
  panelHost: { width: '100%' },
  panelRegular: { maxWidth: 480 },
});
