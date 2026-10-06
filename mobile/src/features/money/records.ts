import { fromWebPath } from '../../navigation/routes';
import { formatFinancialYear } from '../../design/format';
import {
  moneyCatalogs,
  type MoneyGraph,
  type MoneyNode,
  type MoneyJurisdiction,
} from './data';
import { defaultMoneyFilters, yearExtent, type MoneyFilters } from './view';

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
  const industry = param(params.industry);
  const layers = param(params.layers)?.split(',');
  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
    industry:
      industry &&
      graph.nodes.some((n) => n.kind === 'donor' && n.group === industry)
        ? industry
        : null,
    donations: layers ? layers.includes('donations') : true,
    grants: layers ? layers.includes('grants') : true,
    contracts: layers ? layers.includes('contracts') : true,
    inflation: param(params.inflation) === '1',
  };
}
export function moneyFocusRoute(
  node: string,
  jurisdiction: MoneyJurisdiction,
  filters: MoneyFilters,
) {
  return {
    pathname: '/money-node' as const,
    params: {
      node,
      jurisdiction,
      from: String(filters.from),
      to: String(filters.to),
      industry: filters.industry ?? '',
      layers: (['donations', 'grants', 'contracts'] as const)
        .filter((k) => filters[k])
        .join(','),
      inflation: filters.inflation ? '1' : '0',
    },
  };
}
export function moneyYears(first: number | null, last: number | null) {
  if (first === null || last === null) return 'Year not recorded';
  return first === last
    ? formatFinancialYear(first)
    : `${formatFinancialYear(first)} to ${formatFinancialYear(last)}`;
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
      'Totals are a floor, not a ceiling.',
      'Gifts to candidates and committees, public funding and internal party transfers are excluded.',
      graph.meta.not_summed ?? '',
    ].filter(Boolean);
  return [
    'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.',
    `Source: Australian Electoral Commission annual and election returns, ${graph.meta.coverage}.`,
    'Public electoral funding and internal party transfers are excluded.',
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
