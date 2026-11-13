import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { catalogs } from '../../api/runtime';
import { BarSeries } from '../../design/charts';
import { PopUpButton, SegmentedPicker } from '../../design/controls';
import { formatMoney, formatMoneyCompact } from '../../design/format';
import { FigureBlock } from '../../design/record';
import { LinkRow, MoneyRow, ValueRow } from '../../design/rows';
import { EmptyState } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import {
  agenciesRoute,
  agencyRoute,
  leadRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useNamedBackTitle } from '../../navigation/useNamedBackOptions';
import { useOpenAsk } from '../ask/open';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { leadsFor } from '../leads/model';
import { CONTRACTS_CAVEAT } from './HubCards';
import {
  askAbout,
  counted,
  ListCaption,
  matches,
  moneyBar,
  moneyCitation,
  MoneyList,
  MoneyStatus,
  readableDates,
  recordSource,
  TitleAlias,
  useDebouncedAnnounce,
  useMoneySearch,
  yearRange,
} from './parts';
import { moneyItemHref } from './routes';
import { money } from './runtime';

const AGENCY_NAMES =
  'Agency names appear as recorded. Renamed departments are separate entries; no succession or combined history is assumed.';
const START_YEARS = (from: string, to: string) =>
  `Years describe the date each contract started. Contracts are counted from notices published ${yearRange(from, to) || 'in the AusTender register'}.`;
const AUSTENDER = { label: 'AusTender', url: 'https://www.tenders.gov.au/' };
/** The chart spans the last 15 calendar years up to the latest start year. */
export const CHART_YEARS = 15;

type Sort = 'total' | 'count' | 'name';
const sortWords: Record<Sort, string> = {
  total: 'by value',
  count: 'by number of contracts',
  name: 'A to Z',
};

/**
 * Government agencies (specs/money.md 2.7, journeys/money.md 4.7). Until
 * the top-suppliers index ships (journey 11 D6) the "Suppliers | Agencies"
 * segment is not drawn: the page is the agency list, its sort a pop-up on
 * the caption line.
 */
export default function Agencies() {
  const load = useCallback(
      (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
        money.agencies(refresh, signal),
      [],
    ),
    status = useCatalogRecord(load),
    data = status.record?.data;
  const search = useMoneySearch('Agencies');
  const [sort, setSort] = useState<Sort>('total');
  const all = useMemo(() => data?.agencies ?? [], [data]);
  const rows = useMemo(
    () =>
      all
        .filter((a) => matches(search.query, a.name))
        .sort((a, b) =>
          sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort],
        ),
    [all, search.query, sort],
  );
  const searching = !!search.query.trim();
  const count = searching
    ? `${rows.length.toLocaleString('en-AU')} of ${counted(all.length, 'agency', 'agencies')}`
    : counted(all.length, 'agency', 'agencies');
  useDebouncedAnnounce(
    searching && data ? `${count}, ${sortWords[sort]}` : null,
  );
  const total = all.reduce((sum, a) => sum + a.total, 0);
  const saved = recordSource(status.record);
  const name = 'Government agencies';
  const backTitle = useNamedBackTitle();
  const titleRef = useRef<View>(null);
  const scrollTitle = useTitleOnScroll(titleRef, name, {
    routeTitle: name,
    backTitle,
  });
  return (
    <>
      <RouteOptions
        options={{
          title: name,
          headerLargeTitleEnabled: true,
          headerLargeTitleShadowVisible: false,
          headerSearchBarOptions: search.options,
          ...moneyBar({ name, path: '/subject/agency' }),
        }}
      />
      <MoneyList
        loaded={!!data}
        id="agencies-list"
        rows={rows}
        rowKey={(a) => a.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        onScroll={scrollTitle.onScroll}
        header={
          <>
            <TitleAlias title={name} testID="agencies-title" />
            <View
              ref={titleRef}
              collapsable={false}
              onLayout={scrollTitle.onTitleLayout}
              style={{ gap: rhythm.block }}
            >
              <MoneyStatus
                status={status}
                name={name}
                testID="agencies-status"
              />
              {data ? (
                <FigureBlock
                  value={formatMoneyCompact(total)}
                  ink="money"
                  label={`in Commonwealth contracts across ${counted(all.length, 'agency', 'agencies')}${
                    data.publishedFrom || data.publishedTo
                      ? `, published ${yearRange(data.publishedFrom, data.publishedTo)}`
                      : ''
                  }`}
                  caveat={CONTRACTS_CAVEAT}
                  citation={{
                    asOf: data.meta.asOf,
                    citation: [moneyCitation(data.meta.source || 'AusTender')],
                    savedAt: saved.savedAt,
                    state: saved.state,
                    originals: [AUSTENDER],
                    notes: [
                      START_YEARS(data.publishedFrom, data.publishedTo),
                      AGENCY_NAMES,
                      ...data.meta.caveats,
                      ...saved.stateNotes,
                    ].map(readableDates),
                    testID: 'agencies-source',
                  }}
                  testID="agencies-total"
                />
              ) : null}
            </View>
            {data ? (
              <>
                <View style={{ alignSelf: 'flex-start' }}>
                  <PopUpButton
                    label="Sort"
                    value={sort}
                    onChange={setSort}
                    options={(['total', 'count', 'name'] as const).map((s) => ({
                      value: s,
                      label: `${count}, ${sortWords[s]}`,
                      shortLabel: sortWords[s],
                      testID: `agencies-sort-${s === 'total' ? 'value' : s === 'count' ? 'contracts' : 'name'}`,
                    }))}
                    testID="agencies-sort"
                  />
                </View>
              </>
            ) : null}
          </>
        }
        empty={
          searching ? (
            <EmptyState
              message={`No agencies match “${search.query.trim()}”.`}
              testID="agencies-empty"
            />
          ) : null
        }
        render={(a, i) => (
          <MoneyRow
            name={a.name}
            nameLines={2}
            detail={`${counted(a.count, 'contract')} · ${counted(a.suppliers, 'supplier')}`}
            amount={a.total}
            href={agencyRoute(a.id, a.name)}
            testID={`agency-row-${i}`}
          />
        )}
      />
    </>
  );
}

type AgencyView = 'years' | 'suppliers' | 'contracts';

/**
 * Agency (specs/money.md 2.8): title, the figure with its start-year range,
 * the agency's own concentration lead when Leads has one, then "Years |
 * Suppliers | Contracts". Years is a chart of calendar years (not
 * interactive, journey 4.7) with a table toggle; supplier rows open the
 * organisation page; contract rows push their money item.
 */
type AgencyParams = {
  id: string;
  section?: string;
  name?: string;
  supplier?: string;
  supplierName?: string;
};

export function Agency() {
  const params = useLocalSearchParams<AgencyParams>();
  return (
    <AgencyRecord
      key={`${params.id}:${params.section ?? ''}:${params.supplier ?? ''}`}
      params={params}
    />
  );
}

function AgencyRecord({ params }: { params: AgencyParams }) {
  const { id, section, name: routeName, supplier, supplierName } = params;
  const load = useCallback(
      (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
        money.agency(id, refresh, signal),
      [id],
    ),
    status = useCatalogRecord(load),
    data = status.record?.data,
    profile = data?.profile;
  const [view, setView] = useState<AgencyView>(
    section === 'contracts' || section === 'suppliers' ? section : 'years',
  );
  const [supplierFilter, setSupplierFilter] = useState(
    supplier ? { id: supplier, name: supplierName } : null,
  );
  const [table, setTable] = useState(false);
  const search = useMoneySearch(
    view === 'contracts' ? 'Contracts' : 'Suppliers',
    'button',
  );
  const { clear } = search;
  useEffect(() => clear(), [view, clear]);
  const titleRef = useRef<View>(null);
  const name = profile?.name ?? routeName ?? '';
  const title = useTitleOnScroll(titleRef, name, {
    trailing: profile && view !== 'years' ? 3 : 2,
  });
  const openAsk = useOpenAsk();
  const lead = useAgencyLead(profile?.name);
  const contracts = useMemo(
    () =>
      (profile?.contracts ?? []).filter(
        (contract) =>
          !supplierFilter ||
          (contract.supplierId
            ? contract.supplierId === supplierFilter.id
            : contract.supplier === supplierFilter.name),
      ),
    [profile, supplierFilter],
  );
  type Row =
    | ({ kind: 'supplier' } & NonNullable<typeof profile>['suppliers'][number])
    | ({ kind: 'contract' } & NonNullable<typeof profile>['contracts'][number]);
  const rows = useMemo((): Row[] => {
    if (!profile || view === 'years') return [];
    if (view === 'suppliers')
      // Individuals are never a row (journeys/money.md 4.7): a footnote
      // counts them; their contracts stay under Contracts.
      return profile.suppliers
        .filter((s) => s.organisation && matches(search.query, s.name))
        .sort((a, b) => b.total - a.total)
        .map((s) => ({ kind: 'supplier' as const, ...s }));
    return contracts
      .filter((c) => matches(search.query, c.supplier, c.title, c.id))
      .sort((a, b) => b.value - a.value)
      .map((c) => ({ kind: 'contract' as const, ...c }));
  }, [profile, contracts, view, search.query]);
  const searching = !!search.query.trim();
  const individualSuppliers = (profile?.suppliers ?? []).filter(
    (s) => !s.organisation,
  );
  const individuals = {
    count: individualSuppliers.length,
    total: individualSuppliers.reduce((sum, s) => sum + s.total, 0),
  };
  const all =
    view === 'suppliers'
      ? (profile?.suppliers.length ?? 0) - individuals.count
      : contracts.length;
  const noun = view === 'suppliers' ? 'supplier' : 'contract';
  const caption = searching
    ? `${rows.length.toLocaleString('en-AU')} of ${counted(all, noun)}`
    : `${counted(all, noun)}, by value`;
  const years = profile?.years ?? [];
  const latest = years.reduce((max, y) => Math.max(max, y.year), 0);
  const chartYears = years
    .filter((y) => y.year > latest - CHART_YEARS)
    .sort((a, b) => a.year - b.year);
  const earlier = chartYears.length < years.length;
  const saved = recordSource(status.record);
  const path = `/subject/agency/${encodeURIComponent(profile?.id ?? id)}`;
  const first = profile?.firstYear ?? chartYears[0]?.year ?? '',
    last = profile?.lastYear ?? latest ?? '';
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title: name,
          headerSearchBarOptions: view !== 'years' ? search.options : undefined,
          ...moneyBar({
            name,
            path: profile ? path : null,
            ask: profile
              ? () => openAsk({ question: askAbout(profile.name) }, name)
              : null,
          }),
        }}
      />
      <MoneyList
        loaded={!!profile}
        id="agency-list"
        rows={rows}
        rowKey={(r) => `${r.kind}-${r.id}`}
        refreshing={status.refreshing}
        refresh={status.refresh}
        onScroll={title.onScroll}
        header={
          <>
            <View
              ref={titleRef}
              collapsable={false}
              onLayout={title.onTitleLayout}
            >
              <Heading level={1} kind="page" testID="agency-title">
                {name}
              </Heading>
            </View>
            <MoneyStatus
              status={status}
              name={name}
              notFound={{
                title: "This agency isn't in the latest contract records",
                action: {
                  label: 'See all agencies',
                  onPress: () => router.push(agenciesRoute),
                },
              }}
              testID="agency"
            />
            {profile && data ? (
              <>
                <FigureBlock
                  value={formatMoneyCompact(profile.total)}
                  ink="money"
                  label={`in ${counted(profile.count, 'contract')}${
                    first && last ? `, started ${yearRange(first, last)}` : ''
                  }`}
                  caveat={
                    profile.undated > 0
                      ? `${formatMoneyCompact(profile.undated)} of this has no start date. ${CONTRACTS_CAVEAT}`
                      : CONTRACTS_CAVEAT
                  }
                  citation={{
                    asOf: data.meta.asOf,
                    citation: [moneyCitation(data.meta.source || 'AusTender')],
                    savedAt: saved.savedAt,
                    state: saved.state,
                    originals: [AUSTENDER],
                    notes: [
                      'Years describe the calendar year each contract started.',
                      AGENCY_NAMES,
                      ...data.meta.caveats,
                      ...saved.stateNotes,
                    ].map(readableDates),
                    testID: 'agency-source',
                  }}
                  testID="agency-total"
                />
                {lead ? (
                  <LinkRow
                    title={lead.title}
                    detail={`Lead · ${lead.categoryLabel}`}
                    symbol={symbols.leads}
                    href={leadRoute(lead.id, lead.title)}
                    testID="agency-lead"
                  />
                ) : null}
                <SegmentedPicker
                  accessibilityLabel="Show"
                  value={view}
                  onChange={(next) => {
                    setSupplierFilter(null);
                    setView(next);
                  }}
                  options={[
                    { value: 'years', label: 'Years', testID: 'agency-years' },
                    {
                      value: 'suppliers',
                      label: 'Suppliers',
                      testID: 'agency-suppliers',
                    },
                    {
                      value: 'contracts',
                      label: 'Contracts',
                      testID: 'agency-contracts',
                    },
                  ]}
                  testID="agency-view"
                />
                {view === 'years' ? (
                  <View testID="agency-chart">
                    <Text wordSafe variant="secondary">
                      {earlier && chartYears.length
                        ? `Contract value by year the contract started, ${yearRange(chartYears[0]!.year, latest)} (earlier years in the table)`
                        : 'Contract value by year the contract started'}
                    </Text>
                    {table ? (
                      <>
                        {[...years]
                          .sort((a, b) => a.year - b.year)
                          .map((y) => (
                            <ValueRow
                              key={y.year}
                              label={String(y.year)}
                              value={`${formatMoneyCompact(y.total)} · ${counted(y.count, 'contract')}`}
                              testID={`agency-year-${y.year}`}
                            />
                          ))}
                        <LinkRow
                          title="Show as chart"
                          onPress={() => setTable(false)}
                          testID="agency-table-toggle"
                        />
                      </>
                    ) : chartYears.length ? (
                      <BarSeries
                        data={chartYears.map((y) => ({
                          label: String(y.year),
                          value: y.total,
                        }))}
                        ink="money"
                        format={formatMoneyCompact}
                        tableTitle="Contract value by year the contract started"
                        onShowTable={() => setTable(true)}
                        labels={{ every: 3 }}
                        sourceLine={false}
                        height={200}
                        dateRange={{
                          start: data.meta.asOf,
                          end: data.meta.asOf,
                        }}
                        citation={'AusTender'}
                      />
                    ) : (
                      <EmptyState message="No contracts in this agency's records have a start date." />
                    )}
                  </View>
                ) : (
                  <>
                    {view === 'contracts' && supplierFilter ? (
                      <LinkRow
                        title="Show all contracts"
                        detail={supplierFilter.name}
                        onPress={() => setSupplierFilter(null)}
                        testID="agency-clear-supplier"
                      />
                    ) : null}
                    <ListCaption announce={searching} testID="agency-caption">
                      {caption}
                    </ListCaption>
                  </>
                )}
              </>
            ) : null}
          </>
        }
        empty={
          view !== 'years' && searching ? (
            <EmptyState
              message={`No ${noun}s match “${search.query.trim()}”.`}
              testID="agency-empty"
            />
          ) : null
        }
        render={(r, i) =>
          r.kind === 'supplier' ? (
            <MoneyRow
              name={r.name}
              detail={counted(r.count, 'contract')}
              amount={r.total}
              href={moneyRecordRoute(
                { rid: r.id, agency: profile!.id },
                r.name,
              )}
              testID={`agency-supplier-${i}`}
            />
          ) : (
            <MoneyRow
              name={r.supplier}
              detail={r.title || r.id}
              amount={r.value}
              href={moneyItemHref(
                { kind: 'contract', agency: profile!.id, id: r.id },
                { name: r.supplier, from: profile!.id },
              )}
              testID={`agency-contract-${i}`}
            />
          )
        }
        footer={
          view === 'suppliers' && individuals.count ? (
            <Text wordSafe variant="footnote" testID="agency-individuals">
              {`${counted(individuals.count, 'individual supplier')}, ${formatMoney(individuals.total)}, not named.`}
            </Text>
          ) : null
        }
      />
    </>
  );
}

/**
 * The agency's own concentration lead, when Leads has one: drawn for every
 * agency that has such a lead, by the same rule. Loads after the page; a
 * failure leaves it out.
 */
function useAgencyLead(name: string | undefined) {
  const [lead, setLead] = useState<ReturnType<typeof leadsFor>[number] | null>(
    null,
  );
  useEffect(() => {
    if (!name) return;
    let active = true;
    catalogs
      .discovery(false)
      .then((record) => {
        if (!active) return;
        setLead(
          leadsFor(record.data, 'procurement_concentration').find(
            (l) => l.entity === name,
          ) ?? null,
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [name]);
  return lead;
}
