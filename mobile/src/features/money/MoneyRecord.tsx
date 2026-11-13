import {
  associatedLine,
  donorAssociated,
  donorAssociatedTo,
} from '../../api/associated';
import { AssociatedEntityLabel } from '../../design/AssociatedEntityLabel';
import { RouteOptions } from '../../navigation/preview';
import {
  Redirect,
  router,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { copy } from '../../design/copy';
import {
  counted,
  formatCount,
  formatDate,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import {
  BarSeries,
  ContentUnavailable,
  FigureBlock,
  Group,
  Heading,
  InsetGroup,
  LinkRow,
  MoneyRow,
  OfflineLine,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
  ValueRow,
  type FigureSource,
  type SourceOriginal,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { colors, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { moneyRoute } from '../../navigation/routes/money-map';
import { partyRoute } from '../../navigation/routes/people';
import {
  agencyRoute,
  leadRoute,
  moneyItemRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';
import { resultsRoute } from '../../navigation/routes/search';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { isOrganisationDonor } from '../../privacy/donorEntity';
import { leadsAbout } from '../leads/model';
import type {
  MoneyFigures,
  MoneyGraph,
  MoneyNode,
  PublicMoneyBlock,
} from './data';
import { useMoneyRecord } from './hooks';
import { donorNodeFor, partyNodeFor } from './lookup';
import { moneyPageMenu } from './menu';
import {
  notFound,
  useAgencySupplier,
  useGrantRecipient,
  type AgencySupplier,
  type GrantRecipient,
} from './organisation';
import { moneyPartyGroups, PartyDot, PartyMoneyRow } from './parts';
import {
  bothRegistersCaveat,
  filtersFromParams,
  industryDonors,
  industryLabel,
  isAllYears,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyProfile,
  moneyYears,
  param,
  partialYearFrom,
  publicMoneySource,
  receiptSectionWords,
  typedReceiptsScope,
  type MoneyParams,
} from './records';
import { moneyNotes, moneyShortSource, moneySourceDetails } from './sources';
import { moneyView, moneyWindowNodes, type MoneyFilters } from './view';

/** The register caveats, one per section (journeys/money.md 4.10). */
export const grantsCaveat = 'An award is not a payment.';
export const contractsCaveat =
  'Contract values as last published, not amounts paid.';
export const individualsNote = 'OPAX doesn’t name private individuals.';
/**
 * Passed to `moneyItemRoute` from an organisation's own page: the item page
 * leaves out "Open {organisation}", because the reader is already on it.
 */
export const onOrganisationPage = { org: 'self' } as const;

const AEC_REGISTER = 'https://transparency.aec.gov.au/';
const GRANTCONNECT = 'https://www.grants.gov.au/Ga/List';
const AUSTENDER = 'https://www.tenders.gov.au/Cn/Search';

/** A range of graph keys as dates, for a chart's spoken provenance. */
const fyRange = (first: number, last: number) => ({
  start: `${first}-07-01`,
  end: `${last + 1}-06-30`,
});
const byYearBars = (figures: MoneyFigures) =>
  Object.entries(figures.byYear ?? {})
    .map(([year, [value]]) => ({ year: Number(year), value }))
    .sort((a, b) => a.year - b.year);

/**
 * One organisation's money (specs/money.md 2.14, journeys/money.md 4.10):
 * a donor, a party or the public money on the map by `node`; a grant
 * recipient by `rid` and `jur`; a government supplier by `rid` (with the
 * `agency` it holds contracts with). One section per register, each dated
 * and sourced, never summed. Original registers follow the data sections.
 */
export default function MoneyRecordScreen() {
  const params = useLocalSearchParams<MoneyParams>();
  const node = param(params.node);
  const rid = param(params.rid);
  if (node) return <NodeRecord params={params} id={node} />;
  if (rid?.startsWith('s-'))
    return (
      <SupplierRecord
        rid={rid}
        agency={param(params.agency) ?? null}
        name={param(params.name)}
      />
    );
  if (rid)
    return (
      <RecipientRecord
        rid={rid}
        jur={param(params.jur) === 'qld' ? 'qld' : 'federal'}
        name={param(params.name)}
        award={param(params.award)}
      />
    );
  return <Missing name={param(params.name)} register="donation" />;
}

// ---------------------------------------------------------------- layout

const MoneyTitleMeasure = createContext<{
  ref: React.RefObject<View | null>;
  onLayout: React.ComponentProps<typeof View>['onLayout'];
} | null>(null);

function Page({
  title,
  testID = 'money-record-screen',
  share,
  refreshing,
  onRefresh,
  children,
}: {
  title?: string;
  testID?: string;
  share?: { path: string; title: string } | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const titleRef = useRef<View>(null);
  const scrollTitle = useTitleOnScroll(titleRef, title);
  return (
    <>
      <RouteOptions
        options={headerItems(
          share
            ? pageItems({ name: share.title, menu: moneyPageMenu(share) })
            : undefined,
        )}
      />
      <Screen
        onScroll={scrollTitle.onScroll}
        testID={testID}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.navy}
            />
          ) : undefined
        }
      >
        <MoneyTitleMeasure.Provider
          value={{ ref: titleRef, onLayout: scrollTitle.onTitleLayout }}
        >
          {children}
        </MoneyTitleMeasure.Provider>
      </Screen>
    </>
  );
}

function Title({
  meta,
  name,
  party,
}: {
  meta?: string;
  name: string;
  party?: boolean;
}) {
  const measure = useContext(MoneyTitleMeasure);
  return (
    <Group gap={rhythm.tight}>
      {meta ? (
        <Text wordSafe variant="secondary" testID="money-record-meta">
          {meta}
        </Text>
      ) : null}
      <View
        ref={measure?.ref}
        collapsable={false}
        onLayout={measure?.onLayout}
        style={styles.title}
      >
        {party ? <PartyDot party={name} /> : null}
        <Heading
          level={1}
          kind="page"
          testID="money-focus-name"
          style={styles.grow}
        >
          {name}
        </Heading>
      </View>
    </Group>
  );
}

function Originals({ rows }: { rows: SourceOriginal[] }) {
  if (!rows.length) return null;
  return (
    <InsetGroup header="Originals" testID="money-record-originals">
      {rows.map((row, index) => (
        <LinkRow
          key={row.url + row.label}
          title={row.label}
          external={{ url: row.url, label: row.label }}
          accessibilityHint="Opens the original register"
          testID={`money-record-original-${index}`}
        />
      ))}
    </InsetGroup>
  );
}

/** One register's section: its dated figure, its range, its bars and rows. */
function RegisterSection({
  title,
  testID,
  figure,
  allYears,
  bars,
  children,
}: {
  title: string;
  testID: string;
  figure: {
    value: number;
    label: string;
    ink?: 'money';
    caveat: string;
    source: FigureSource;
    testID?: string;
  };
  allYears?: {
    value: number;
    count: number;
    noun: string;
    range: string;
  } | null;
  bars?: {
    data: { label: string; value: number }[];
    ink: 'money' | 'ink';
    tableTitle: string;
    dateRange: { start: string; end: string };
    source: string;
    partialFrom?: number;
  } | null;
  children?: ReactNode;
}) {
  return (
    <View testID={testID} style={styles.section}>
      <SectionHeader title={title} />
      <FigureBlock
        value={formatMoneyCompact(figure.value)}
        ink={figure.ink}
        label={figure.label}
        caveat={figure.caveat}
        citation={figure.source}
        accessibilityLabel={`${moneyAccessibilityLabel(figure.value, true)}, ${figure.label}`}
        testID={figure.testID}
      />
      {allYears ? (
        <ValueRow
          label="All years"
          value={`${formatMoney(allYears.value)} · ${formatCount(allYears.count)} ${allYears.noun} · ${allYears.range}`}
          testID={`${testID}-all-years`}
        />
      ) : null}
      {bars && bars.data.length > 1 ? (
        <BarSeries
          data={bars.data}
          ink={bars.ink}
          format={formatMoneyCompact}
          tableTitle={bars.tableTitle}
          dateRange={bars.dateRange}
          citation={bars.source}
          sourceLine={false}
          partialFrom={bars.partialFrom}
        />
      ) : null}
      {children}
    </View>
  );
}

function Missing({
  name,
  register,
  body,
  action,
}: {
  name?: string;
  register: 'grant' | 'contract' | 'donation';
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const router = useRouter();
  return (
    <Page title={name}>
      <ContentUnavailable
        symbol="magnifyingglass"
        title={`Not in the latest ${register} records`}
        body={body}
        action={
          action ??
          (name
            ? {
                label: `Search for ${name}`,
                onPress: () => router.push(resultsRoute('all', { q: name })),
              }
            : undefined)
        }
        testID="money-node-missing"
      />
    </Page>
  );
}

function LoadState({
  name,
  error,
  retry,
}: {
  name?: string;
  error: unknown;
  retry: () => void;
}) {
  const offline =
    error instanceof ApiError &&
    (error.code === 'offline' || error.code === 'timeout');
  return (
    <Page title={name}>
      {name ? <Title name={name} /> : null}
      {error ? (
        offline ? (
          <ContentUnavailable
            symbol="wifi.slash"
            title={copy.notSaved}
            body={copy.notSavedBody}
            testID="money-record-error"
          />
        ) : (
          <ContentUnavailable
            symbol="exclamationmark.triangle"
            title="This organisation couldn’t be loaded"
            body="Check your connection and try again."
            action={{ label: copy.tryAgain, onPress: retry }}
            testID="money-record-error"
          />
        )
      ) : (
        <Group>
          <Skeleton shape="rows" count={1} label="Loading the money record" />
          <Skeleton shape="figure" count={1} />
          <Skeleton shape="rows" count={3} />
        </Group>
      )}
    </Page>
  );
}

/** Leads whose subject is this organisation, each named by its sentence. */
function useLeadsAbout(name: string | null) {
  const [leads, setLeads] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!name) return;
    let active = true;
    // Optional: absent or failing, the rows are simply not drawn.
    Promise.resolve()
      .then(() => catalogs.discovery())
      .then(
        (record) => {
          if (active) setLeads(leadsAbout(record.data, name));
        },
        () => undefined,
      );
    return () => {
      active = false;
    };
  }, [name]);
  return leads;
}

function LeadRows({ name }: { name: string | null }) {
  const leads = useLeadsAbout(name);
  return (
    <>
      {leads.slice(0, 3).map((lead, index) => (
        <LinkRow
          key={lead.id}
          title={lead.title}
          detail="Lead"
          symbol={symbols.leads}
          href={leadRoute(lead.id)}
          testID={`money-record-lead-${index}`}
        />
      ))}
    </>
  );
}

// ------------------------------------------------------------ graph nodes

function windowNote(filters: MoneyFilters, graph: MoneyGraph) {
  const parts = [
    isAllYears(graph, filters) ? null : moneyYears(filters.from, filters.to),
    filters.industry ? industryDonors(filters.industry) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function roleMeta(node: MoneyNode) {
  if (node.kind === 'party') return 'Party';
  if (node.kind === 'grantor') return 'Public money';
  const roles = [
    'Donor',
    node.grants ? 'grant recipient' : null,
    node.contracts ? 'government supplier' : null,
  ].filter(Boolean) as string[];
  const named =
    roles.length > 1
      ? `${roles.slice(0, -1).join(', ')} and ${roles.at(-1)}`
      : roles[0]!;
  return `${named} · ${industryLabel(node.group)}`;
}

function NodeRecord({ params, id }: { params: MoneyParams; id: string }) {
  const jurisdiction = moneyJurisdiction(params.jurisdiction);
  const { record, error, refreshing, refresh, retry } =
    useMoneyRecord(jurisdiction);
  const navigation = useNavigation();
  const graph = record?.data ?? null;
  const filters = useMemo(
    () => (graph ? filtersFromParams(graph, params) : null),
    [graph, params],
  );
  const view = useMemo(
    () =>
      graph && filters
        ? {
            ...moneyView(graph, filters),
            nodes: moneyWindowNodes(graph, filters),
          }
        : null,
    [graph, filters],
  );
  // A web or shared link names a donor ("/subject/donor/Pratt Holdings Pty
  // Ltd" reads as node "donor:Pratt Holdings Pty Ltd"), but graph ids are
  // normalised ("donor:pratt"). An id the graph doesn't hold is matched by
  // name, exactly or on a recorded spelling (donorNodeFor), and the route
  // takes the real id so back and share carry it. No match: not on the map.
  const named = useMemo(
    () =>
      graph && id.startsWith('donor:') && !graph.nodes.some((n) => n.id === id)
        ? donorNodeFor({ name: id.slice('donor:'.length) }, graph)
        : null,
    [graph, id],
  );
  useEffect(() => {
    if (named)
      navigation.setParams({ node: named.id, name: named.label } as never);
  }, [named, navigation]);
  const nodeId = named?.id ?? id;
  const name = named?.label ?? param(params.name);
  const node =
    graph && view
      ? nodeId.startsWith('party:')
        ? (() => {
            const party = partyNodeFor(graph, nodeId);
            return party
              ? view.nodes.find((n) => n.id === party.id)
              : undefined;
          })()
        : view.nodes.find((n) => n.id === nodeId)
      : undefined;
  if (!record || !graph || !filters || !view)
    return <LoadState name={name} error={error} retry={retry} />;
  if (!node) {
    const narrowed = !isAllYears(graph, filters) || !!filters.industry;
    return (
      <Page title={name}>
        <ContentUnavailable
          symbol="magnifyingglass"
          title={
            name
              ? `${name} isn’t on the map in this view`
              : 'This donor isn’t on the map'
          }
          action={
            narrowed
              ? {
                  label: 'Show all years',
                  onPress: () =>
                    navigation.setParams({
                      from: undefined,
                      to: undefined,
                      industry: undefined,
                    } as never),
                }
              : undefined
          }
          testID="money-node-missing"
        />
      </Page>
    );
  }
  return (
    <NodeBody
      record={record}
      graph={graph}
      filters={filters}
      view={view}
      node={node}
      jurisdiction={jurisdiction}
      fromMap={param(params.via) === 'map'}
      refreshing={refreshing}
      refresh={refresh}
    />
  );
}

function NodeBody({
  record,
  graph,
  filters,
  view,
  node,
  jurisdiction,
  fromMap,
  refreshing,
  refresh,
}: {
  record: RecordResult<MoneyGraph>;
  graph: MoneyGraph;
  filters: MoneyFilters;
  view: MoneyGraph;
  node: MoneyNode;
  jurisdiction: ReturnType<typeof moneyJurisdiction>;
  fromMap: boolean;
  refreshing: boolean;
  refresh: () => void;
}) {
  const associated = node.kind === 'donor' ? donorAssociated(node) : null;
  const full = graph.nodes.find((n) => n.id === node.id) ?? node;
  const narrowed = !isAllYears(graph, filters) || filters.inflation;
  const note = windowNote(filters, graph);
  const shortSource = moneyShortSource(graph);
  const grantsSource = publicMoneySource(graph, 'grants');
  const contractsSource = publicMoneySource(graph, 'contracts');
  const others = new Map(view.nodes.map((n) => [n.id, n]));
  const flows = view.edges
    .filter((e) =>
      node.kind === 'party' ? e.target === node.id : e.source === node.id,
    )
    .flatMap((edge) => {
      const other = others.get(
        edge.source === node.id ? edge.target : edge.source,
      );
      return other ? [{ edge, other }] : [];
    })
    .sort((a, b) => b.edge.total - a.edge.total);
  const pushRecord = (other: MoneyNode) =>
    moneyFocusRoute(
      other.id,
      jurisdiction,
      filters,
      other.label,
      fromMap ? 'map' : null,
    );
  const profile = moneyProfile(node);
  const share = {
    path:
      node.kind === 'grantor'
        ? `/money?node=${encodeURIComponent(node.id)}`
        : profile.path,
    title: node.label,
  };
  const donorSource = (testID: string) =>
    moneySourceDetails(record, {
      citation: shortSource,
      originals: [
        {
          label: 'AEC Transparency Register',
          url: graph.meta.source_url ?? AEC_REGISTER,
        },
      ],
      notes: [
        ...moneyNotes(graph),
        node.undated?.[1]
          ? 'Undated disclosures stay in every year window.'
          : null,
        node.kind === 'party' && filters.industry
          ? 'The party total covers all industries. The donors listed follow the industry filter.'
          : null,
      ],
      testID,
    });
  const publicSource = (kind: 'grants' | 'contracts', testID: string) => {
    const source = kind === 'grants' ? grantsSource : contractsSource;
    return moneySourceDetails(record, {
      citation: source.label,
      returns: false,
      originals: [{ label: source.label, url: source.url }],
      notes: [
        source.citation,
        kind === 'contracts' &&
        typeof graph.meta.contracts_coverage === 'string'
          ? `${graph.meta.contracts_coverage}.`
          : null,
        'Matched to the donor on identity (an ABN where one is recorded). Shown beside donations, never added to them.',
      ],
      testID,
    });
  };
  const allYears = (figures: MoneyFigures, noun: string) =>
    narrowed
      ? {
          value: figures.total,
          count: figures.count,
          noun,
          range: moneyYears(figures.firstYear, figures.lastYear),
        }
      : null;
  const bars = (
    figures: MoneyFigures,
    ink: 'money' | 'ink',
    title: string,
    source: string,
    returns = false,
  ) => {
    const data = byYearBars(figures);
    return data.length
      ? {
          // AEC returns for a year are published the February after it ends.
          partialFrom: returns
            ? partialYearFrom(
                graph,
                data.map((d) => d.year),
              )
            : undefined,
          data: data.map((d) => ({
            label: moneyYears(d.year, d.year),
            value: d.value,
          })),
          ink,
          tableTitle: title,
          dateRange: fyRange(data[0]!.year, data.at(-1)!.year),
          source,
        }
      : null;
  };
  const years = moneyYears(node.firstYear, node.lastYear);
  // ---- party
  if (node.kind === 'party') {
    const donors = flows.slice(0, 15);
    const words = receiptSectionWords('party', graph, false);
    const line = `in ${counted(node.count, words.one, words.many)}, ${years}`;
    return (
      <Page
        title={node.label}
        share={share}
        refreshing={refreshing}
        onRefresh={refresh}
      >
        <Title meta={roleMeta(node)} name={node.label} party />
        {record.stale && !record.staleReason ? (
          <OfflineLine savedAt={record.savedAt} />
        ) : null}
        {note ? (
          <Text wordSafe variant="secondary" testID="money-record-window">
            {note}
          </Text>
        ) : null}
        <RegisterSection
          title={words.title}
          testID="money-record-donations"
          figure={{
            value: node.total,
            label: line,
            ink: 'money',
            caveat: words.caveat,
            source: donorSource('money-source'),
            testID: 'money-focus-amount',
          }}
          allYears={allYears(full, words.many)}
          bars={bars(node, 'money', words.barsTitle, shortSource, true)}
        >
          {donors.length ? (
            <View testID="money-focus-flows">
              <SectionHeader title="Largest donors" level={3} />
              {donors.every(({ edge }) => edge.typed) ? (
                <Text
                  wordSafe
                  variant="footnote"
                  testID="money-focus-flows-scope"
                >
                  {typedReceiptsScope}
                </Text>
              ) : null}
              {donors.map(({ edge, other }, index) => (
                <MoneyRow
                  key={other.id}
                  name={other.label}
                  detail={[
                    associatedLine(donorAssociatedTo(other, node.label)),
                    moneyYears(edge.firstYear, edge.lastYear),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  amount={edge.total}
                  compact
                  href={pushRecord(other)}
                  testID={`money-focus-flow-${index}`}
                />
              ))}
            </View>
          ) : null}
        </RegisterSection>
        <Originals
          rows={[
            {
              label: `AEC Transparency Register · returns for ${node.label}`,
              url: graph.meta.source_url ?? AEC_REGISTER,
            },
          ]}
        />
        <More>
          {profile.native ? (
            <LinkRow
              title={node.label}
              leading={<PartyDot party={node.label} />}
              href={partyRoute(node.label)}
              testID="money-native-profile"
            />
          ) : null}
          <LeadRows name={node.label} />
          {!fromMap ? <MapRow node={node} jurisdiction={jurisdiction} /> : null}
        </More>
      </Page>
    );
  }
  // ---- public money on the map
  if (node.kind === 'grantor') {
    const contracts = node.flow === 'contracts';
    const kind = contracts ? 'contracts' : 'grants';
    const line = `in ${kind} to donors on the map, ${years}`;
    return (
      <Page
        title={node.label}
        share={share}
        refreshing={refreshing}
        onRefresh={refresh}
      >
        <Title meta={roleMeta(node)} name={node.label} />
        {note ? (
          <Text wordSafe variant="secondary" testID="money-record-window">
            {note}
          </Text>
        ) : null}
        <RegisterSection
          title={contracts ? 'Government contracts' : 'Grants received'}
          testID={contracts ? 'money-record-contracts' : 'money-record-grants'}
          figure={{
            value: node.total,
            label: line,
            caveat: contracts ? contractsCaveat : grantsCaveat,
            source: publicSource(kind, 'money-source'),
            testID: 'money-focus-amount',
          }}
          allYears={allYears(full, kind)}
          bars={bars(
            node,
            'ink',
            contracts ? 'Contracts by year' : 'Grants by year',
            contracts ? contractsSource.label : grantsSource.label,
          )}
        >
          <View testID="money-focus-flows">
            <SectionHeader
              title={contracts ? 'Largest suppliers' : 'Largest recipients'}
              level={3}
            />
            {flows.slice(0, 15).map(({ edge, other }, index) => (
              <MoneyRow
                key={other.id}
                name={other.label}
                detail={[
                  associatedLine(donorAssociated(other)),
                  moneyYears(edge.firstYear, edge.lastYear),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                amount={edge.total}
                compact
                href={pushRecord(other)}
                testID={`money-focus-flow-${index}`}
              />
            ))}
          </View>
        </RegisterSection>
        <Originals
          rows={[
            {
              label: contracts ? contractsSource.label : grantsSource.label,
              url: contracts ? contractsSource.url : grantsSource.url,
            },
          ]}
        />
      </Page>
    );
  }
  // ---- a donor
  const parties = moneyPartyGroups(
    flows.filter(({ other }) => other.kind === 'party'),
    ({ other }) => other.label,
  );
  const partyCount = parties.main.length + parties.other.length;
  const donorWords = receiptSectionWords('donor', graph, !!node.typed);
  const grants = filters.grants ? node.grants : undefined;
  const contracts = filters.contracts ? node.contracts : undefined;
  const sections = [filters.donations, !!grants, !!contracts].filter(
    Boolean,
  ).length;
  const originals: SourceOriginal[] = [
    {
      label: `AEC Transparency Register · returns for ${node.label}`,
      url: graph.meta.source_url ?? AEC_REGISTER,
    },
    ...(associated
      ? [
          {
            label: 'AEC register of associated entities',
            url: associated.url,
          },
        ]
      : []),
    ...(grants
      ? [
          {
            label: `GrantConnect · awards to ${node.label}`,
            url: GRANTCONNECT,
          },
        ]
      : []),
    ...(contracts
      ? [
          {
            label: `AusTender · contracts with ${node.label}`,
            url: AUSTENDER,
          },
        ]
      : []),
  ];
  const partyRow = ({ edge, other }: (typeof flows)[number], index: number) => (
    <PartyMoneyRow
      key={other.id}
      name={other.label}
      detail={moneyYears(edge.firstYear, edge.lastYear)}
      amount={edge.total}
      href={pushRecord(other)}
      testID={`money-focus-flow-${index}`}
    />
  );
  const publicSection = (
    kind: 'grants' | 'contracts',
    block: PublicMoneyBlock,
    fullBlock: PublicMoneyBlock | undefined,
  ) => {
    const noun = kind;
    const contractsKind = kind === 'contracts';
    const source = contractsKind ? contractsSource : grantsSource;
    return (
      <RegisterSection
        title={contractsKind ? 'Government contracts' : 'Grants received'}
        testID={
          contractsKind ? 'money-record-contracts' : 'money-record-grants'
        }
        figure={{
          value: block.total,
          label: `in ${formatCount(block.count)} ${noun}, ${moneyYears(block.firstYear, block.lastYear)}`,
          caveat: contractsKind ? contractsCaveat : grantsCaveat,
          source: publicSource(
            kind,
            contractsKind
              ? 'money-record-contracts-source'
              : 'money-record-grants-source',
          ),
          testID: contractsKind
            ? 'money-focus-contracts'
            : 'money-focus-grants',
        }}
        allYears={fullBlock ? allYears(fullBlock, noun) : null}
        bars={bars(
          block,
          'ink',
          contractsKind ? 'Contracts by year' : 'Grants by year',
          source.label,
        )}
      >
        {block.top?.length ? (
          <View>
            {block.top.map(([label, amount], index) => (
              <ValueRow
                key={`${label}-${index}`}
                label={label}
                value={formatMoney(amount)}
                testID={`money-record-${kind}-top-${index}`}
              />
            ))}
          </View>
        ) : null}
      </RegisterSection>
    );
  };
  return (
    <Page
      title={node.label}
      share={share}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Title meta={roleMeta(node)} name={node.label} />
      <AssociatedEntityLabel
        associated={associated}
        testID="money-focus-associated"
      />
      {record.stale && !record.staleReason ? (
        <OfflineLine savedAt={record.savedAt} />
      ) : null}
      {sections > 1 ? (
        <Text wordSafe variant="footnote" testID="money-record-both-caveat">
          {bothRegistersCaveat}
        </Text>
      ) : null}
      {note ? (
        <Text wordSafe variant="secondary" testID="money-record-window">
          {note}
        </Text>
      ) : null}
      {filters.donations ? (
        <RegisterSection
          title={donorWords.title}
          testID="money-record-donations"
          figure={{
            value: node.total,
            label: `disclosed to ${counted(partyCount, 'party', 'parties')}, ${years}`,
            ink: 'money',
            caveat: donorWords.caveat,
            source: donorSource('money-source'),
            testID: 'money-focus-amount',
          }}
          allYears={allYears(full, donorWords.many)}
          bars={bars(node, 'money', donorWords.barsTitle, shortSource, true)}
        >
          {partyCount ? (
            <View testID="money-focus-flows">
              <SectionHeader title="Parties" level={3} />
              {parties.main.map(partyRow)}
              {parties.other.length ? (
                <>
                  <Text wordSafe variant="footnote">
                    Other parties
                  </Text>
                  {parties.other.map((row, i) =>
                    partyRow(row, parties.main.length + i),
                  )}
                </>
              ) : null}
            </View>
          ) : null}
        </RegisterSection>
      ) : null}
      {grants ? publicSection('grants', grants, full.grants) : null}
      {contracts ? publicSection('contracts', contracts, full.contracts) : null}
      <Originals rows={originals} />
      <More>
        {node.kind === 'donor' && isOrganisationDonor(node) ? (
          <LinkRow
            title="Find on Wikipedia"
            external={{
              url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(node.label)}`,
              label: `Find ${node.label} on Wikipedia`,
            }}
            accessibilityLabel={`Find ${node.label} on Wikipedia`}
            accessibilityHint="Opens in the browser"
            testID="money-record-wikipedia"
          />
        ) : null}
        <LeadRows name={node.label} />
        {!fromMap ? <MapRow node={node} jurisdiction={jurisdiction} /> : null}
      </More>
    </Page>
  );
}

function More({ children }: { children: ReactNode }) {
  return (
    <View testID="money-record-more">
      <View>{children}</View>
    </View>
  );
}

function MapRow({
  node,
  jurisdiction,
}: {
  node: MoneyNode;
  jurisdiction: string;
}) {
  const base = moneyRoute(null, jurisdiction);
  return (
    <LinkRow
      title="Open in the money map"
      symbol={symbols.money}
      href={{
        pathname: base.pathname,
        params: {
          ...('params' in base ? base.params : {}),
          select: node.id,
          view: 'map',
        },
      }}
      testID="money-record-map"
    />
  );
}

// ------------------------------------------------------- grant recipients

function RecipientRecord({
  rid,
  jur,
  name,
  award,
}: {
  rid: string;
  jur: 'federal' | 'qld';
  name?: string;
  award?: string;
}) {
  const loaded = useGrantRecipient(rid, jur);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!award || !loaded.recipient?.organisation || opened.current === award)
      return;
    opened.current = award;
    router.push(
      moneyItemRoute({
        kind: 'grant',
        jur,
        rid,
        id: award,
        sheet: '1',
        from: rid,
      }),
    );
  }, [award, rid, jur, loaded.recipient]);
  if (!loaded.record)
    return notFound(loaded.error) ? (
      <Missing name={name} register="grant" />
    ) : (
      <LoadState name={name} error={loaded.error} retry={loaded.retry} />
    );
  const recipient = loaded.recipient;
  if (!recipient || !recipient.organisation)
    return (
      <Missing
        name={recipient && !recipient.organisation ? undefined : name}
        register="grant"
        body={
          recipient && !recipient.organisation ? individualsNote : undefined
        }
      />
    );
  return (
    <RecipientBody
      record={loaded.record}
      recipient={recipient}
      jur={jur}
      refreshing={loaded.refreshing}
      refresh={loaded.refresh}
    />
  );
}

function RecipientBody({
  record,
  recipient,
  jur,
  refreshing,
  refresh,
}: {
  record: RecordResult<{
    generated: string;
    sourceUrl: string;
    licence: string;
  }>;
  recipient: GrantRecipient;
  jur: 'federal' | 'qld';
  refreshing: boolean;
  refresh: () => void;
}) {
  const donor = donorNodeFor({ rid: recipient.id, name: recipient.name });
  const cells = recipient.byYear.filter(([, value]) => value > 0);
  const range = cells.length
    ? cells.length === 1
      ? cells[0]![0].replace('-', '–')
      : `${cells[0]![0].replace('-', '–')} to ${cells.at(-1)![0].replace('-', '–')}`
    : 'year not recorded';
  const source: FigureSource = {
    asOf: record.asOf ?? record.data.generated,
    citation: jur === 'qld' ? 'Queensland Treasury' : 'GrantConnect',
    savedAt: record.stale ? record.savedAt : null,
    originals: [{ label: 'GrantConnect', url: record.data.sourceUrl }],
    notes: [
      'Grant awards as published, by the financial year the grant started. An award is not a payment.',
      record.stale ? copy.savedCopyNote(record.savedAt) : null,
    ],
    licence: record.data.licence || null,
    testID: 'money-record-grants-source',
  };
  const abn = recipient.id.startsWith('abn:') ? recipient.id.slice(4) : null;
  return (
    <Page
      title={recipient.name}
      share={{
        path: `/money/grants?jur=${jur}&recipient=${encodeURIComponent(recipient.id)}`,
        title: recipient.name,
      }}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Title
        meta={[
          donor ? 'Grant recipient and donor' : 'Grant recipient',
          abn
            ? `ABN ${abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        name={recipient.name}
      />
      {record.stale && !record.staleReason ? (
        <OfflineLine savedAt={record.savedAt} />
      ) : null}
      {donor ? (
        <Text wordSafe variant="footnote" testID="money-record-both-caveat">
          {bothRegistersCaveat}
        </Text>
      ) : null}
      <RegisterSection
        title="Grants received"
        testID="money-record-grants"
        figure={{
          value: recipient.total,
          label: `in ${counted(recipient.count, 'grant', 'grants')}, ${range}`,
          caveat: grantsCaveat,
          source,
          testID: 'money-focus-grants',
        }}
        bars={
          cells.length > 1
            ? {
                data: cells.map(([year, value]) => ({
                  label: year.replace('-', '–'),
                  value,
                })),
                ink: 'ink',
                tableTitle: 'Grants by year',
                dateRange: {
                  start: `${cells[0]![0].slice(0, 4)}-07-01`,
                  end: `${Number(cells.at(-1)![0].slice(0, 4)) + 1}-06-30`,
                },
                source: 'GrantConnect',
              }
            : null
        }
      />
      <Originals
        rows={[
          {
            label: `GrantConnect · awards to ${recipient.name}`,
            url: GRANTCONNECT,
          },
        ]}
      />
      <More>
        {donor ? (
          <LinkRow
            title={donor.label}
            detail="Donor on the money map"
            href={moneyRecordRoute({ node: donor.id }, donor.label)}
            testID="money-record-donor"
          />
        ) : null}
        <LeadRows name={recipient.name} />
      </More>
    </Page>
  );
}

// -------------------------------------------------------------- suppliers

function SupplierRecord({
  rid,
  agency,
  name,
}: {
  rid: string;
  agency: string | null;
  name?: string;
}) {
  const loaded = useAgencySupplier(rid, agency);
  if (!agency)
    // The per-supplier files are not on the app's allow-list yet; without
    // the agency the supplier can't be found.
    return <Missing name={name} register="contract" />;
  if (!loaded.record)
    return notFound(loaded.error) ? (
      <Missing name={name} register="contract" />
    ) : (
      <LoadState name={name} error={loaded.error} retry={loaded.retry} />
    );
  const found = loaded.found;
  if (!found) {
    const route = agencyRoute(agency, loaded.record.data.profile.name);
    return (
      <Redirect
        href={{
          ...route,
          params: {
            ...route.params,
            section: 'contracts',
            supplier: rid,
            supplierName: name,
          },
        }}
      />
    );
  }
  if (!found.supplier.organisation)
    return <Missing register="contract" body={individualsNote} />;
  return (
    <SupplierBody
      found={found}
      asOf={loaded.record.asOf}
      savedAt={loaded.record.stale ? loaded.record.savedAt : null}
      refreshing={loaded.refreshing}
      refresh={loaded.refresh}
    />
  );
}

function SupplierBody({
  found,
  asOf,
  savedAt,
  refreshing,
  refresh,
}: {
  found: AgencySupplier;
  asOf: string | null;
  savedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
}) {
  const { supplier, agency, contracts } = found;
  const donor = donorNodeFor({ name: supplier.name });
  const starts = contracts
    .map((c) => Number(c.start.slice(0, 4)))
    .filter((y) => Number.isInteger(y) && y > 1900);
  const range = starts.length
    ? Math.min(...starts) === Math.max(...starts)
      ? `started ${Math.min(...starts)}`
      : `started ${Math.min(...starts)} to ${Math.max(...starts)}`
    : 'start dates not recorded';
  return (
    <Page
      title={supplier.name}
      share={{
        path: `/subject/supplier/${encodeURIComponent(supplier.id)}`,
        title: supplier.name,
      }}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <Title
        meta={donor ? 'Government supplier and donor' : 'Government supplier'}
        name={supplier.name}
      />
      {donor ? (
        <Text wordSafe variant="footnote" testID="money-record-both-caveat">
          {bothRegistersCaveat}
        </Text>
      ) : null}
      <RegisterSection
        title="Government contracts"
        testID="money-record-contracts"
        figure={{
          value: supplier.total,
          label: `in ${counted(supplier.count, 'contract', 'contracts')} with ${agency.name}, ${range}`,
          caveat: contractsCaveat,
          source: {
            asOf,
            citation: 'AusTender',
            savedAt,
            originals: [{ label: 'AusTender', url: AUSTENDER }],
            notes: [
              'Contract years are calendar years of the recorded start date.',
              contractsCaveat,
            ],
            testID: 'money-record-contracts-source',
          },
          testID: 'money-focus-contracts',
        }}
      >
        {contracts.length ? (
          <View testID="money-record-contract-rows">
            {contracts.map((contract, index) => (
              <MoneyRow
                key={contract.id}
                name={contract.title || contract.id}
                detail={[
                  contract.start
                    ? `from ${formatDate(contract.start, 'short')}`
                    : null,
                  contract.id,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                amount={contract.value}
                href={moneyItemRoute(
                  {
                    kind: 'contract',
                    agency: agency.id,
                    id: contract.id,
                    ...onOrganisationPage,
                  },
                  contract.title || contract.id,
                )}
                testID={`money-record-contract-${index}`}
              />
            ))}
          </View>
        ) : null}
      </RegisterSection>
      <Originals
        rows={[
          {
            label: `AusTender · contracts with ${supplier.name}`,
            url: AUSTENDER,
          },
        ]}
      />
      <More>
        <LinkRow
          title={agency.name}
          symbol={symbols.contracts}
          href={agencyRoute(agency.id, agency.name)}
          testID="money-record-agency"
        />
        {donor ? (
          <LinkRow
            title={donor.label}
            detail="Donor on the money map"
            href={moneyRecordRoute({ node: donor.id }, donor.label)}
            testID="money-record-donor"
          />
        ) : null}
        <LeadRows name={supplier.name} />
      </More>
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flexShrink: 1 },
  section: { gap: rhythm.tight },
});
