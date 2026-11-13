import { counted, formatFinancialYear } from '../../design/format';
import { fromWebPath } from '../../navigation/routes';
import { moneyRecordRoute } from '../../navigation/routes/public-money';
import {
  moneyCatalogs,
  type MoneyFigures,
  type MoneyGraph,
  type MoneyJurisdiction,
  type MoneyNode,
} from './data';
import {
  defaultMoneyFilters,
  moneyView,
  windowFigures,
  yearExtent,
  type MoneyFilters,
} from './view';

export type MoneyParams = Record<string, string | string[]>;
export const param = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
export function moneyJurisdiction(
  value: string | string[] | undefined,
): MoneyJurisdiction {
  const key = param(value);
  return key && Object.hasOwn(moneyCatalogs, key)
    ? (key as MoneyJurisdiction)
    : 'federal';
}
export function filtersFromParams(
  graph: MoneyGraph,
  params: MoneyParams,
): MoneyFilters {
  const initial = defaultMoneyFilters(graph);
  const extent = yearExtent(graph);
  const read = (key: string, fallback: number) => {
    const value = Number(param(params[key]));
    return Number.isInteger(value)
      ? Math.max(extent.from, Math.min(extent.to, value))
      : fallback;
  };
  const from = read('from', initial.from),
    to = read('to', initial.to);
  const industry = [
    ...new Set(
      (param(params.industry) ?? '')
        .split(',')
        .filter((group) =>
          graph.nodes.some(
            (n) =>
              n.kind === 'donor' && (n.group === group || n.industry === group),
          ),
        ),
    ),
  ].join(',');
  const layers = param(params.layers)?.split(',');
  const min = Number(param(params.min));
  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
    industry: industry || null,
    donations: layers ? layers.includes('donations') : true,
    grants: layers ? layers.includes('grants') : true,
    contracts: layers ? layers.includes('contracts') : true,
    inflation: param(params.inflation) === '1',
    min: Number.isFinite(min) && min > 0 ? Math.floor(min) : 0,
  };
}
/** The filters as route params, so a pushed page and a shared link rebuild them. */
export function moneyWindowParams(filters: MoneyFilters) {
  return {
    from: String(filters.from),
    to: String(filters.to),
    industry: filters.industry ?? '',
    layers: (['donations', 'grants', 'contracts'] as const)
      .filter((k) => filters[k])
      .join(','),
    inflation: filters.inflation ? '1' : '0',
    min: filters.min > 0 ? String(filters.min) : '',
  };
}
/**
 * A node's money record, pushed in the current tab with the map's window.
 * `via: 'map'` marks a push that started on the map, so the record leaves
 * out "Open in the money map" (journeys/money.md 4.10 item 6).
 */
export function moneyFocusRoute(
  node: string,
  jurisdiction: MoneyJurisdiction,
  filters: MoneyFilters,
  name?: string,
  via?: 'map' | null,
) {
  return moneyRecordRoute(
    {
      node,
      jurisdiction,
      ...moneyWindowParams(filters),
      ...(via ? { via } : {}),
    },
    name,
  );
}
/**
 * Graph `byYear` keys are the first year of a financial year (election
 * returns by polling year, said in the Notes): "1998–99 to 2025–26".
 */
export function moneyYears(first: number | null, last: number | null) {
  if (first === null || last === null) return 'Year not recorded';
  return first === last
    ? formatFinancialYear(first)
    : `${formatFinancialYear(first)} to ${formatFinancialYear(last)}`;
}
export function moneyWindowYears(
  figures: MoneyFigures,
  filters: MoneyFilters,
  awarded = false,
) {
  if (figures.count === 0)
    return `${awarded ? 'nothing awarded' : 'nothing disclosed'} in ${moneyYears(filters.from, filters.to)}`;
  return moneyYears(figures.firstYear, figures.lastYear);
}
/** Said in every money source sheet that shows graph years. */
export const moneyYearNote =
  "Years are financial years. Election returns are counted in the financial year that starts in the election's year.";
/** The one caveat every donations figure carries. */
export const donationsCaveat =
  "Totals are a minimum: donations under the disclosure threshold aren't published.";
/** What a typed figure counts (data.ts typedReceipts), as the web says it. */
export const typedReceiptsScope =
  'All receipt types, as the parties reported them in federal returns.';
/**
 * What a party's own total counts on a graph whose notes say so: the older
 * all-record cells, which add the donor's declaration of a gift to the
 * party's, and the party's internal transfers (meta.party_totals_note).
 */
export const partyRecordsScope =
  'All receipt types in party and donor returns, so one gift can appear twice. Includes transfers within the party.';

/**
 * The words for a money page's AEC section, so the heading, the figure line,
 * the caveat and the bars say what the figure counts. A party's figure is its
 * whole return in disclosure records: loans and other receipts as well as
 * donations. A donor's is money to parties: every receipt type when typed,
 * else the donations register as before.
 */
export function receiptSectionWords(
  kind: 'party' | 'donor',
  graph: MoneyGraph,
  typed: boolean,
) {
  if (kind === 'party') {
    const flagged = graph.meta.receipt_types !== undefined;
    return {
      title: 'Money received',
      one: 'disclosure record',
      many: 'disclosure records',
      caveat: flagged
        ? `${partyRecordsScope} ${thresholdCaveat}`
        : donationsCaveat,
      barsTitle: 'Money received by year',
    };
  }
  return typed
    ? {
        title: 'Money to parties',
        one: 'receipt',
        many: 'receipts',
        caveat: `${typedReceiptsScope} ${thresholdCaveat}`,
        barsTitle: 'Money to parties by year',
      }
    : {
        title: 'Donations to parties',
        one: 'donation',
        many: 'donations',
        caveat: donationsCaveat,
        barsTitle: 'Donations by year',
      };
}
const thresholdCaveat =
  "It's a minimum: amounts under the disclosure threshold aren't published.";

/**
 * The first of `years` (as graph keys, sorted) whose annual returns were not
 * all published by the graph's date, so its bar holds only part of the year;
 * undefined when every year is complete.
 */
export function partialYearFrom(
  graph: MoneyGraph,
  years: number[],
): number | undefined {
  const complete = latestCompleteYear(graph);
  if (complete === null) return undefined;
  const index = years.findIndex((year) => year > complete);
  return index < 0 ? undefined : index;
}

/** Under public money beside donations (the map, a lead). */
export const publicMoneyCaveat =
  "Shown beside donations, never added to them. It doesn't show that one led to the other.";
/** On an organisation page drawn from more than one register. */
export const bothRegistersCaveat =
  "Appearing in both registers doesn't show that one led to the other.";

/** "mining & energy" → "Mining and energy": the group's name, never the raw key. */
export function industryLabel(group: string) {
  const words = group
    .replace(/_/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .trim();
  return words
    ? `${words.charAt(0).toLocaleUpperCase('en-AU')}${words.slice(1)}`
    : words;
}
/** In a sentence: "mining and energy". */
export const industryWords = (group: string) =>
  group
    .split(',')
    .map((value) => industryLabel(value).toLocaleLowerCase('en-AU'))
    .join(' and ');
/** The donors of a group in a sentence: "union donors", "finance donors". */
const singular: Record<string, string> = {
  unions: 'union',
  individuals: 'individual',
};
export const industryDonors = (group: string) => {
  const words = industryWords(group);
  return `${singular[words] ?? words} donors`;
};

/** The window is every year the graph holds and nothing is adjusted. */
export function isAllYears(graph: MoneyGraph, filters: MoneyFilters) {
  const extent = yearExtent(graph);
  return filters.from <= extent.from && filters.to >= extent.to;
}

/**
 * The latest complete financial year, as the first year ("2024" for
 * 2024–25). The data lane's `meta.latestCompleteYear` wins when published
 * (journeys/money.md D1). Until then it is the newest year whose annual
 * returns the AEC has published by the export's date: a financial year's
 * returns are published the February after it ends, so 2024–25 is complete
 * from February 2026. Only a year the data holds is returned.
 */
export function latestCompleteYear(graph: MoneyGraph): number | null {
  const years = new Set(
    graph.nodes
      .filter((n) => n.kind === 'party')
      .flatMap((n) => Object.keys(n.byYear ?? {}).map(Number)),
  );
  const declared =
    graph.meta.latestCompleteYear ?? graph.meta.latest_complete_year;
  const published =
    typeof declared === 'number'
      ? declared
      : typeof declared === 'string' && /^\d{4}/.test(declared)
        ? Number(declared.slice(0, 4))
        : null;
  if (published !== null) return years.has(published) ? published : null;
  const generated = /^(\d{4})-(\d{2})/.exec(graph.meta.generated);
  if (!generated) return null;
  const year = Number(generated[1]),
    month = Number(generated[2]);
  // Returns for the year starting Y are out from February of Y + 2.
  const newest = month >= 2 ? year - 2 : year - 3;
  const held = [...years].filter((y) => y <= newest).sort((a, b) => b - a);
  return held[0] ?? null;
}

/**
 * Donations to parties in a window: the party nodes' own receipts (every
 * cleaned row but public funding), one computation shared with the hub's
 * Parties card. Party receipts cannot be split by industry, so with an
 * industry filter the figure is the donor-to-party flows from that
 * industry's donors on the map, and `subset` says so.
 */
export function partyDonationsTotal(
  graph: MoneyGraph,
  window: Pick<MoneyFilters, 'from' | 'to'> &
    Partial<Pick<MoneyFilters, 'inflation' | 'industry'>>,
): MoneyFigures & { subset: boolean } {
  const parts: MoneyFigures[] = window.industry
    ? moneyView(graph, {
        ...defaultMoneyFilters(graph),
        from: window.from,
        to: window.to,
        inflation: !!window.inflation,
        industry: window.industry,
        grants: false,
        contracts: false,
      }).edges
    : graph.nodes
        .filter((n) => n.kind === 'party')
        .map((n) =>
          windowFigures(n, window.from, window.to, !!window.inflation),
        );
  const first = parts.flatMap((p) =>
    p.firstYear === null ? [] : [p.firstYear],
  );
  const last = parts.flatMap((p) => (p.lastYear === null ? [] : [p.lastYear]));
  return {
    total: parts.reduce((sum, p) => sum + p.total, 0),
    count: parts.reduce((sum, p) => sum + p.count, 0),
    firstYear: first.length ? Math.min(...first) : null,
    lastYear: last.length ? Math.max(...last) : null,
    subset: !!window.industry,
  };
}
export function moneySource(graph: MoneyGraph) {
  const federal =
    !graph.meta.jurisdiction || graph.meta.jurisdiction === 'federal';
  return {
    citation: federal
      ? 'AEC disclosure returns as aggregated in the money map'
      : (graph.meta.commission ?? graph.meta.sourceShort ?? graph.meta.source),
    label: federal
      ? 'Australian Electoral Commission'
      : (graph.meta.sourceShort ?? graph.meta.commission ?? graph.meta.source),
    url: graph.meta.source_url ?? 'https://transparency.aec.gov.au/',
    licence: graph.meta.licence ?? (federal ? 'CC BY 4.0' : undefined),
  };
}
export function publicMoneySource(
  graph: MoneyGraph,
  kind: 'grants' | 'contracts',
) {
  const qld = graph.meta.jurisdiction === 'qld';
  return {
    label: qld
      ? kind === 'grants'
        ? 'Queensland Government Investment Portal'
        : 'Queensland contract disclosure reports'
      : kind === 'grants'
        ? 'GrantConnect'
        : 'AusTender',
    url: qld
      ? kind === 'grants'
        ? 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964'
        : 'https://www.data.qld.gov.au/'
      : kind === 'grants'
        ? 'https://www.grants.gov.au/'
        : 'https://www.tenders.gov.au/',
    citation: graph.meta[`${kind}_source`],
  };
}
export function moneyCaveats(graph: MoneyGraph): string[] {
  if (graph.meta.jurisdiction && graph.meta.jurisdiction !== 'federal')
    return [
      `Source: ${graph.meta.commission ?? graph.meta.sourceShort ?? graph.meta.source}, ${graph.meta.coverage}.`,
      graph.meta.threshold ?? '',
      donationsCaveat,
      'Donor totals exclude gifts to candidates and committees, public funding and internal party transfers. Party receipts exclude public funding and include internal party transfers.',
      graph.meta.not_summed ?? '',
    ].filter(Boolean);
  return [
    donationsCaveat,
    `Source: Australian Electoral Commission annual and election returns, ${graph.meta.coverage}.`,
    'Donor totals exclude public electoral funding and internal party transfers. Party receipts exclude public electoral funding and include internal party transfers.',
    'State and federal returns are not summed: AEC returns already include state branch receipts.',
  ];
}
/** Only published profile paths can lead to a native person page. */
export function moneyProfile(node: MoneyNode) {
  const path =
    typeof node.profileUrl === 'string'
      ? node.profileUrl
      : node.kind === 'party' || node.kind === 'donor'
        ? `/subject/${node.kind}/${encodeURIComponent(node.label)}`
        : '/money';
  return { path, native: fromWebPath(path) };
}

/**
 * A donor row's detail line in a view: its years, then how many parties it
 * gave to ("2004–05 to 2024–25 · 5 parties").
 */
export function donorDetails(view: MoneyGraph) {
  const nodes = new Map(view.nodes.map((n) => [n.id, n]));
  const byDonor = new Map<string, Set<string>>();
  for (const edge of view.edges)
    if (nodes.get(edge.target)?.kind === 'party') {
      const set = byDonor.get(edge.source) ?? new Set<string>();
      set.add(edge.target);
      byDonor.set(edge.source, set);
    }
  return (node: MoneyNode) => {
    const count = byDonor.get(node.id)?.size ?? 0;
    return [
      moneyYears(node.firstYear, node.lastYear),
      count ? `${counted(count, 'party', 'parties')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };
}
