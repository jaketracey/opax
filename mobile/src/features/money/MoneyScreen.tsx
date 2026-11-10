import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import {
  formatCount,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import {
  Button,
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
  useLayout,
  useScreenColumn,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
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
import { moneyPageMenu } from './menu';
import { MoneyTestHooks } from './money-probe';
import { useMoneyFilters } from './MoneyFilters';
import { NativeMoneyMap, type NativeMoneyMapHandle } from './NativeMoneyMap';
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
  partyDonationsTotal,
  publicMoneyCaveat,
  publicMoneySource,
  type MoneyParams,
} from './records';
import { moneySceneHeight } from './scene-size';
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
type Mode = 'list' | '3d';

/** "Donations to parties, 1998–99 to 2025–26, and public money to donors on the map". */
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
  const publicMoney = filters.grants || filters.contracts;
  const narrowed = !isAllYears(graph, filters) || !!filters.industry;
  if (!filters.donations)
    return `Public money to donors on the map${window}${industry}`;
  return narrowed || !publicMoney
    ? `Donations to parties${window}${industry}`
    : `Donations to parties${window}, and public money to donors on the map`;
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

/** "Individual donors": one footnote under the donor list, never a row. */
export function individualDonorsLine(nodes: readonly MoneyNode[]) {
  const withheld = nodes.filter((n) => n.kind === 'donor' && n.withheld);
  if (!withheld.length) return null;
  const count = withheld.reduce((n, d) => n + (d.withheldCount ?? 1), 0);
  const total = withheld.reduce((n, d) => n + d.total, 0);
  return `${formatCount(count)} individual ${count === 1 ? 'donor' : 'donors'}, ${formatMoneyCompact(total)}, not named.`;
}

const jurisdictionOptions = (
  Object.keys(moneyCatalogs) as MoneyJurisdiction[]
).map((value) => ({
  value,
  label: moneyCatalogs[value].label,
  testID: `money-jurisdiction-${value}`,
}));

/** The share path for the map as drawn: its jurisdiction and filters. */
function sharePath(params: MoneyParams) {
  const query = new URLSearchParams();
  const jurisdiction = param(params.jurisdiction);
  if (jurisdiction && jurisdiction !== 'federal')
    query.set('jur', jurisdiction);
  for (const key of ['from', 'to', 'industry', 'layers', 'inflation', 'view'])
    if (param(params[key])) query.set(key, param(params[key])!);
  const text = query.toString();
  return text ? `/money?${text}` : '/money';
}

/**
 * The money map (specs/money.md 2.13): pushed in the current tab with a
 * named back button. Title, the jurisdiction pop-up and one line saying
 * what the map shows; the List | Map picker; then the scene with two
 * figure blocks under it (donations, and public money beside it, never
 * added), or the list (Donors, Parties, Public money). Filters are a bar
 * button opening `/filters/money`, which writes this screen's params live.
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
    (linked === 'list' ? 'list' : linked === 'map' ? '3d' : null) ??
    (reader === false ? '3d' : 'list');
  const [glFailed, setGLFailed] = useState(false);
  const map = useRef<NativeMoneyMapHandle | null>(null);
  const [plate] = useState(createPlate);
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
    <View>
      <SegmentedPicker
        options={[
          { value: 'list', label: 'List', testID: 'money-mode-list' },
          { value: '3d', label: 'Map', testID: 'money-mode-3d' },
        ]}
        value={mode}
        onChange={(next: Mode) => {
          if (next === '3d') setGLFailed(false);
          setMode(next);
        }}
        accessibilityLabel="View"
        testID="money-view-toggle"
      />
      {glFailed ? (
        <Group gap={rhythm.tight}>
          <Text wordSafe variant="footnote" testID="money-gl-note">
            The map can’t be drawn on this device. The List view has the same
            data.
          </Text>
          <Button
            label={copy.tryAgain}
            size="compact"
            onPress={() => {
              setGLFailed(false);
              setMode('3d');
            }}
            testID="money-gl-retry"
          />
        </Group>
      ) : null}
    </View>
  );
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
        onScroll={(y) => {
          plate.onScroll(y);
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
              })
            }
            testID="money-jurisdiction"
          />
          {graph && filters ? (
            <Text wordSafe variant="secondary" testID="money-view-summary">
              {moneySummary(graph, filters)}
            </Text>
          ) : null}
        </Group>
        {record?.stale && record.staleReason !== 'unreadable' ? (
          <OfflineLine savedAt={record.savedAt} testID="money-offline" />
        ) : null}
        {picker}
        {error && !record ? (
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
              onPress: () =>
                write({
                  from: undefined,
                  to: undefined,
                  industry: undefined,
                  layers: undefined,
                  inflation: undefined,
                }),
              testID: 'money-empty-reset',
            }}
            testID="money-empty"
          />
        ) : (
          <MoneyBody
            record={record}
            filters={filters}
            view={view}
            mode={mode}
            jurisdiction={jurisdiction}
            plate={plate}
            map={map}
            select={select}
            initialFocus={param(params.select) ?? null}
            onUnavailable={() => {
              setGLFailed(true);
              setMode('list');
            }}
          />
        )}
        {graph && view && filters ? (
          <MoneyTestHooks
            graph={view}
            onYear={(year) => write({ from: String(year), to: String(year) })}
            onFocus={(id) =>
              select(id, graph.nodes.find((n) => n.id === id)?.label)
            }
          />
        ) : null}
      </Screen>
    </GestureHandlerRootView>
  );
}

/** Whether the scene is on screen: GL draws only while it is. */
function createPlate() {
  let top = 0,
    bottom = 700,
    offset = 0,
    height = 800;
  const listeners = new Set<(shown: boolean) => void>();
  const shown = () => offset < bottom && offset + height > top;
  const notify = () => listeners.forEach((l) => l(shown()));
  return {
    onScroll(y: number) {
      const before = shown();
      offset = y;
      if (shown() !== before) notify();
    },
    layout(nextTop: number, nextBottom: number, window: number) {
      top = nextTop;
      bottom = nextBottom;
      height = window;
      notify();
    },
    subscribe(listener: (shown: boolean) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    shown,
  };
}
type Plate = ReturnType<typeof createPlate>;

function usePlateVisible(source: Plate) {
  const [visible, setVisible] = useState(source.shown());
  useEffect(() => source.subscribe(setVisible), [source]);
  return visible;
}

function MoneySkeleton({ mode }: { mode: Mode }) {
  const { width } = useWindowDimensions();
  const { regular } = useLayout();
  return (
    <Group>
      {mode === '3d' ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            height: moneySceneHeight(width, regular),
            backgroundColor: colors.sunken,
          }}
        />
      ) : null}
      <Skeleton
        shape="figure"
        count={mode === '3d' ? 2 : 1}
        label="Loading the money map"
        testID="money-loading"
      />
      {mode === 'list' ? <Skeleton shape="rows" count={5} /> : null}
    </Group>
  );
}

function MoneyBody({
  record,
  filters,
  view,
  mode,
  jurisdiction,
  plate: source,
  map,
  select,
  initialFocus,
  onUnavailable,
}: {
  record: RecordResult<MoneyGraph>;
  filters: MoneyFilters;
  view: MoneyGraph;
  mode: Mode;
  jurisdiction: MoneyJurisdiction;
  plate: Plate;
  map: RefObject<NativeMoneyMapHandle | null>;
  select: (id: string, name?: string) => void;
  initialFocus: string | null;
  onUnavailable: () => void;
}) {
  const graph = record.data;
  const visible = usePlateVisible(source);
  const { height } = useWindowDimensions();
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
    : `disclosed to parties, ${years}${inflation}`;
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
      caveat={donationsCaveat}
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
  const publicNotes = [
    typeof graph.meta.donor_nodes_by_total === 'number' &&
    typeof graph.meta.donors_via_public_money === 'number'
      ? `The map holds the ${formatCount(graph.meta.donor_nodes_by_total)} largest donors by lifetime donations, plus ${formatCount(graph.meta.donors_via_public_money)} smaller donors that hold at least $50 million in Commonwealth grants and contracts.`
      : null,
    grants ? grantsSource.citation : null,
    contracts ? contractsSource.citation : null,
    contracts ? 'Contract values as last published, not amounts paid.' : null,
  ];
  // --- List view rows ---
  const named = rankedDonors(view).filter((n) => !n.withheld);
  const top = named
    .filter((n) => n.via !== 'public_money')
    .slice(0, TOP_DONORS);
  const donorDetail = useMemo(() => donorDetails(view), [view]);
  const partyNodes = moneyPartyGroups(
    view.nodes.filter((n) => n.kind === 'party'),
    (n) => n.label,
  );
  const individuals = individualDonorsLine(view.nodes);
  const record_ = (node: MoneyNode) =>
    moneyFocusRoute(node.id, jurisdiction, filters, node.label, 'map');
  const partyRow = (node: MoneyNode, index: number) => (
    <PartyMoneyRow
      key={node.id}
      name={node.label}
      detail={`${formatCount(node.count)} receipts · ${moneyYears(node.firstYear, node.lastYear)}`}
      amount={node.total}
      href={record_(node)}
      testID={`money-party-${index}`}
    />
  );
  return (
    <>
      {mode === '3d' ? (
        <Group>
          <View
            style={{
              marginHorizontal: column.regular
                ? 0
                : -column.content.paddingHorizontal,
            }}
            onLayout={(event) => {
              const { y, height: h } = event.nativeEvent.layout;
              source.layout(y, y + h, height);
            }}
          >
            <NativeMoneyMap
              ref={map}
              graph={graph}
              view={view}
              active={visible}
              onSelect={(id) =>
                select(id, view.nodes.find((n) => n.id === id)?.label)
              }
              onUnavailable={onUnavailable}
              initialFocus={initialFocus}
            />
          </View>
          {donationsBlock}
          {grants || contracts ? (
            <View testID="money-public-money" style={styles.block}>
              <Heading level={3}>Public money to donors on the map</Heading>
              <StatStrip
                tiles={[
                  ...(grants
                    ? [
                        {
                          value: formatMoneyCompact(grants.total),
                          label: 'in grants',
                          testID: 'money-public-grants',
                        },
                      ]
                    : []),
                  ...(contracts
                    ? [
                        {
                          value: formatMoneyCompact(contracts.total),
                          label: 'in contracts',
                          testID: 'money-public-contracts',
                        },
                      ]
                    : []),
                ]}
              />
              <Text wordSafe variant="footnote">
                {publicMoneyCaveat}
              </Text>
              <SourceLine
                {...moneySourceDetails(record, {
                  citation: publicCitation,
                  returns: false,
                  originals: moneyOriginals(graph).slice(1),
                  notes: publicNotes,
                  testID: 'money-public-money-source',
                })}
              />
            </View>
          ) : null}
        </Group>
      ) : (
        <>
          {donationsBlock}
          {filters.donations ? (
            <View testID="money-donors" style={styles.section}>
              <SectionHeader
                title="Donors"
                action={{
                  label: copy.seeAll,
                  accessibilityLabel: `See all ${formatCount(named.length)} donors`,
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
                    detail={donorDetail(node)}
                    amount={node.total}
                    href={record_(node)}
                    testID={`money-donor-${index}`}
                  />
                ))}
              </View>
              {individuals ? (
                <Text
                  wordSafe
                  variant="footnote"
                  testID="money-individual-donors"
                >
                  {individuals}
                </Text>
              ) : null}
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
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  section: { gap: rhythm.tight },
  block: { gap: rhythm.tight },
});
