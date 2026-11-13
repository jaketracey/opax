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
import { colors, hairline, radii, rhythm } from '../../design/tokens';
import { headerItems, opaqueBar, pageItems } from '../../navigation/chrome';
import { moneyDonorsRoute } from '../../navigation/routes/public-money';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import {
  moneyCatalogs,
  type MoneyGraph,
  type MoneyJurisdiction,
  type MoneyNode,
} from './data';
import { useFirstScreenReader, useMoneyRecord } from './hooks';
import { partyNodeFor } from './lookup';
import { MoneyMap, type MapCommand, type MapRequest } from './map/MoneyMap';
import { MoneyMapControls } from './map/MoneyMapControls';
import { MoneyMapLegend } from './map/MoneyMapLegend';
import {
  MoneyMapPanel,
  focusFlows,
  type PanelFocus,
} from './map/MoneyMapPanel';
import { MoneyMapSearch } from './map/MoneyMapSearch';
import { MINI_HEIGHT, MINI_WIDTH } from './map/MiniMap';
import { mapControlLayout } from './map/regions';
import { buildModel, nextAlongFlows, type MapModel } from './map/model';
import { moneyPageMenu } from './menu';
import { MoneyTestHooks } from './money-probe';
import { useMoneyFilters } from './MoneyFilters';
import { moneyPartyGroups, PartyMoneyRow } from './parts';
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
  moneyView,
  moneyWindowNodes,
  rankedDonors,
  type MoneyFilters,
} from './view';

const TOP_DONORS = 20;
type Mode = 'list' | 'map';

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
  const narrowed =
    !isAllYears(graph, filters) || !!filters.industry || filters.min > 0;
  if (!filters.donations)
    return `Public money to donors on the map${window}${industry}${minimum}`;
  const { title } = partiesFigureWords(graph);
  return narrowed || !publicMoney
    ? `${title}${window}${industry}${minimum}`
    : `${title}${window}, and public money to donors on the map`;
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
  // The reader's choice, else the link's view, else List while VoiceOver
  // is on or not yet known (the map draws once it is known to be off).
  const [chosen, setMode] = useState<Mode | null>(null);
  const linked = param(params.view);
  const mode: Mode =
    chosen ??
    (linked === 'list' ? 'list' : linked === 'map' ? 'map' : null) ??
    (reader === false ? 'map' : 'list');
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
      value={mode}
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
  const summary =
    graph && filters ? (
      <Text wordSafe variant="secondary" testID="money-view-summary">
        {moneySummary(graph, filters)}
      </Text>
    ) : null;
  const reset = () =>
    write({
      from: undefined,
      to: undefined,
      industry: undefined,
      layers: undefined,
      inflation: undefined,
      min: undefined,
    });
  const body =
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
    ) : !record || !graph || !filters || !view ? (
      <MoneySkeleton mode={mode} />
    ) : !view.nodes.length ? (
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
  const hooks =
    graph && view && filters ? (
      <MoneyTestHooks
        graph={view}
        onYear={(year) => write({ from: String(year), to: String(year) })}
        onFocus={(id) =>
          select(id, graph.nodes.find((n) => n.id === id)?.label)
        }
      />
    ) : null;
  if (mode === 'map' && record && graph && filters && view && !body)
    return (
      <ReservedRegionArea style={styles.root}>
        <MapMode
          record={record}
          graph={graph}
          view={view}
          filters={filters}
          jurisdiction={jurisdiction}
          params={params}
          write={write}
          options={{ ...options, title }}
          controls={
            <>
              {jurisdictionControl}
              {summary}
              {picker}
              {hooks}
            </>
          }
          offline={
            record.stale && !record.staleReason ? (
              <OfflineLine savedAt={record.savedAt} testID="money-offline" />
            ) : null
          }
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
      offline={
        record?.stale && !record.staleReason ? (
          <OfflineLine savedAt={record.savedAt} testID="money-offline" />
        ) : null
      }
      picker={picker}
      body={
        body ??
        (record && graph && filters && view ? (
          <ListBody
            record={record}
            filters={filters}
            view={view}
            jurisdiction={jurisdiction}
          />
        ) : null)
      }
      hooks={hooks}
    />
  );
}

// ------------------------------------------------------------------ map

function MapMode({
  record,
  graph,
  view,
  filters,
  jurisdiction,
  params,
  write,
  options,
  controls,
  offline,
}: {
  record: RecordResult<MoneyGraph>;
  graph: MoneyGraph;
  view: MoneyGraph;
  filters: MoneyFilters;
  jurisdiction: MoneyJurisdiction;
  params: MoneyParams;
  write: (next: Record<string, string | undefined>) => void;
  options: Record<string, unknown>;
  controls: React.ReactNode;
  offline: React.ReactNode;
}) {
  const setOptions = useSafeSetOptions();
  useLayoutEffect(() => {
    setOptions({ ...opaqueBar(colors.paper), headerTransparent: false });
  }, [setOptions]);
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
  const model = useMemo(() => buildModel(view), [view]);
  const focus = param(params.select) ?? null;
  const focusIndex = focus === null ? null : (model.byId.get(focus) ?? null);
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
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [topHeight, setTopHeight] = useState(0);
  const [peek, setPeek] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  const window = useWindowDimensions();
  // The stage runs under the tab bar and the home indicator; the panel host
  // sits above them, so the band beneath it is measured from its layout and
  // counted in the map's bottom inset with the panel's peek.
  const [below, setBelow] = useState(0);
  const managed =
    adaptive ||
    [...regions.divisions, ...regions.occlusions].some((r) => r.active);
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
  const horizontalControls = managed && pose.horizontal;
  const panelMaxHeight = managed ? pose.panelMaxHeight : undefined;
  const topMaxHeight = managed ? pose.topMaxHeight : undefined;
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
              topHeight +
              rhythm.tight +
              (managed
                ? pose.controls.y +
                  (horizontalControls && !searchOpen && !expanded
                    ? 48 + rhythm.block
                    : 0)
                : 0),
            bottom: managed
              ? (safe?.bottom ?? 0) +
                Math.min(peek, panelMaxHeight ?? peek) +
                rhythm.tight
              : below + peek + rhythm.tight,
            left: (safe?.left ?? 0) + rhythm.tight,
            right:
              (safe?.right ?? 0) +
              (horizontalControls ? rhythm.tight : 44 + rhythm.block * 2),
          },
    [
      pose.folded,
      safe,
      managed,
      topHeight,
      peek,
      below,
      panelMaxHeight,
      horizontalControls,
      pose.controls.y,
      searchOpen,
      expanded,
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
  const record_ = useCallback(
    (id: string, name?: string) =>
      moneyFocusRoute(id, jurisdiction, filters, name, 'map'),
    [jurisdiction, filters],
  );
  const panelFocus: PanelFocus | null = (() => {
    if (focusIndex === null) return null;
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
              onPress: () => {
                const id = model.nodes[next]!.id;
                go(id, [...trail, id]);
              },
            },
      previous: previous
        ? {
            label: previous.label,
            onPress: () => go(previous.id, trail.slice(0, -1)),
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
          onAction: () => router.push(panelFocus.record),
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
  const totals = {
    donations: model.totals.donations,
    publicMoney:
      filters.grants || filters.contracts
        ? model.totals.grants + model.totals.contracts
        : null,
  };
  const shortSource = moneyShortSource(graph);
  const sourceLine = (
    <SourceLine
      {...moneySourceDetails(record, {
        citation: [
          shortSource,
          ...(['grants', 'contracts'] as const)
            .filter((kind) => filters[kind] && graph.meta[`${kind}_source`])
            .map((kind) => publicMoneySource(graph, kind).label),
        ],
        originals: moneyOriginals(graph),
        notes: [...moneyNotes(graph), donationsCaveat, publicMoneyCaveat],
        testID: 'money-source',
      })}
    />
  );
  const cardWidth = regular ? { maxWidth: 420 } : null;
  const topContent = searchOpen ? (
    <MoneyMapSearch
      model={model}
      onChoose={flyTo}
      onClose={() => setSearchOpen(false)}
    />
  ) : (
    <View style={styles.card} testID="money-map-card">
      {controls}
      {offline}
    </View>
  );
  return (
    <GestureHandlerRootView style={styles.root}>
      <RouteOptions options={options} />
      <View
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
        <MoneyMap
          command={command}
          graph={graph}
          model={model}
          focus={focus}
          onFocus={(id) => setFocus(id)}
          insets={insets}
          cacheKey={jurisdiction}
          accessibilityLabel={moneyMapLabel(model, focus)}
          actions={actions}
          overview={
            large ||
            searchOpen ||
            expanded ||
            (managed && pose.controls.width < MINI_WIDTH + rhythm.block * 2) ||
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
                    : below + peek + rhythm.block,
                }
          }
        />
        <SafeAreaView
          // The stack's opaque bar already sits above the stage: a top
          // edge here would count the status bar twice and push the card
          // down the map. The frame owns the safe sides so its absolute
          // controls clear a side rail too, without counting padding twice.
          edges={managed ? [] : ['bottom']}
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
            style={[
              styles.top,
              cardWidth,
              managed ? { maxHeight: topMaxHeight } : null,
            ]}
            pointerEvents="box-none"
            onLayout={(event) =>
              setTopHeight(Math.ceil(event.nativeEvent.layout.height))
            }
          >
            {managed ? (
              <ScrollView
                scrollEnabled={managed}
                style={{ flexGrow: 0 }}
                keyboardShouldPersistTaps="handled"
              >
                {topContent}
              </ScrollView>
            ) : (
              topContent
            )}
          </View>
          {searchOpen || expanded ? null : (
            <View
              style={[
                styles.controls,
                { top: topHeight + rhythm.block },
                horizontalControls
                  ? { left: rhythm.block, right: undefined }
                  : null,
              ]}
              pointerEvents="box-none"
              onLayout={(event) =>
                setControlsHeight(Math.ceil(event.nativeEvent.layout.height))
              }
            >
              <MoneyMapControls
                horizontal={horizontalControls}
                onSearch={() => setSearchOpen(true)}
                onZoomIn={() => dispatch({ type: 'zoom', direction: 1 })}
                onZoomOut={() => dispatch({ type: 'zoom', direction: -1 })}
                onFit={() => dispatch({ type: 'fit' })}
              />
            </View>
          )}
          <View style={styles.grow} pointerEvents="box-none" />
          <View
            style={[styles.panelHost, regular ? styles.panelRegular : null]}
            pointerEvents="box-none"
            onLayout={(event) => {
              if (managed) return;
              const { y, height } = event.nativeEvent.layout;
              const gap = Math.max(0, Math.round(stage.height - (y + height)));
              setBelow((previous) => (previous === gap ? previous : gap));
            }}
          >
            <MoneyMapPanel
              focus={panelFocus}
              totals={totals}
              caption={`${formatCount(model.nodes.length)} discs · ${formatCount(model.edges.length)} recorded flows · ${formatMoneyCompact(model.totals.donations)} in donations`}
              legend={<MoneyMapLegend model={model} />}
              sourceLine={sourceLine}
              stageHeight={stage.height || window.height}
              maxHeight={panelMaxHeight}
              expanded={expanded}
              onExpanded={setExpanded}
              // Clearing ends the subject: the next focus starts at the peek.
              onClear={() => {
                setFocus(null);
                setExpanded(false);
              }}
              onPeekHeight={setPeek}
            />
          </View>
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

function MoneySkeleton({ mode }: { mode: Mode }) {
  const { width } = useWindowDimensions();
  const { regular } = useLayout();
  return (
    <Group>
      {mode === 'map' ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            height: regular ? 560 : Math.min(Math.round(width), 440),
            backgroundColor: colors.sunken,
          }}
        />
      ) : null}
      <Skeleton
        shape="figure"
        count={mode === 'map' ? 2 : 1}
        label="Loading the money map"
        testID="money-loading"
      />
      {mode === 'list' ? <Skeleton shape="rows" count={5} /> : null}
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
  const partyRow = (node: MoneyNode, index: number) => (
    <PartyMoneyRow
      key={node.id}
      name={node.label}
      detail={`${counted(node.count, 'receipt')} · ${moneyYears(node.firstYear, node.lastYear)}`}
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
  card: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    padding: rhythm.block,
    gap: rhythm.tight,
  },
  // Floating under the card (its `top` is the card's measured height), out
  // of the column so the expanded panel keeps its share of the stage.
  controls: { position: 'absolute', right: rhythm.block },
  grow: { flex: 1 },
  panelHost: { width: '100%' },
  panelRegular: { maxWidth: 480 },
});
