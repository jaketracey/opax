import type { Catalogs } from '../../api/catalogs';
import { nameKey } from '../../api/ids';
import { formatCount } from '../../design/format';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../../design/parliament';

export type FeedRow = Awaited<
  ReturnType<Catalogs['declarations']>
>['data'] extends (infer R)[] | null
  ? R
  : never;

/** The feed's filters: "all", or one chamber or jurisdiction ID; a name. */
export interface FeedFilters {
  chamber: string;
  jurisdiction: string;
  member: string;
}
export const noFilters: FeedFilters = {
  chamber: 'all',
  jurisdiction: 'all',
  member: '',
};

// A fixed order, whatever order the export's rows come in: the House, then
// the Senate, then state chambers by name; Federal, then states by name.
const chamberRank: Record<string, number> = { house: 0, senate: 1 };
const jurisdictionRank: Record<string, number> = { federal: 0 };
const byRank = (rank: Record<string, number>) => (a: Facet, b: Facet) =>
  (rank[a.id] ?? 9) - (rank[b.id] ?? 9) || a.label.localeCompare(b.label);

export interface Facet {
  id: string;
  label: string;
  count: number;
}
/**
 * The chambers and jurisdictions present in the export, in a fixed order,
 * with their counts. IDs never reach the reader: an unknown chamber reads
 * "Chamber not recorded".
 */
export function feedFacets(rows: readonly FeedRow[]) {
  const chambers = new Map<string, Facet>();
  const jurisdictions = new Map<string, Facet>();
  for (const row of rows) {
    const chamber = chambers.get(row.chamber) ?? {
      id: row.chamber,
      label: chamberName(row.chamber, row.jurisdiction) ?? CHAMBER_NOT_RECORDED,
      count: 0,
    };
    chamber.count += 1;
    chambers.set(row.chamber, chamber);
    const jurisdiction = jurisdictions.get(row.jurisdiction) ?? {
      id: row.jurisdiction,
      label: jurisdictionName(row.jurisdiction) ?? 'Jurisdiction not recorded',
      count: 0,
    };
    jurisdiction.count += 1;
    jurisdictions.set(row.jurisdiction, jurisdiction);
  }
  return {
    chambers: [...chambers.values()].sort(byRank(chamberRank)),
    jurisdictions: [...jurisdictions.values()].sort(byRank(jurisdictionRank)),
  };
}

/** Rows matching every filter; the member filter matches any part of a name. */
export function filterFeed(rows: readonly FeedRow[], filters: FeedFilters) {
  const member = nameKey(filters.member);
  return rows.filter(
    (row) =>
      (filters.chamber === 'all' || row.chamber === filters.chamber) &&
      (filters.jurisdiction === 'all' ||
        row.jurisdiction === filters.jurisdiction) &&
      (!member || nameKey(row.name).includes(member)),
  );
}

/**
 * The Filters row's one summary line: the chamber, then the jurisdiction
 * ("All chambers · Federal"). A single jurisdiction is named, not offered.
 */
export function filterSummary(
  filters: FeedFilters,
  facets: { chambers: Facet[]; jurisdictions: Facet[] },
) {
  const chamber =
    filters.chamber === 'all'
      ? 'All chambers'
      : (facets.chambers.find((f) => f.id === filters.chamber)?.label ??
        CHAMBER_NOT_RECORDED);
  const only =
    facets.jurisdictions.length === 1 ? facets.jurisdictions[0]! : null;
  const jurisdiction =
    filters.jurisdiction !== 'all'
      ? (facets.jurisdictions.find((f) => f.id === filters.jurisdiction)
          ?.label ?? 'Jurisdiction not recorded')
      : only
        ? only.label
        : 'All jurisdictions';
  return `${chamber} · ${jurisdiction}`;
}

const declarations = (n: number) =>
  `${formatCount(n)} ${n === 1 ? 'declaration' : 'declarations'}`;
/** "300 declarations", or "176 of 300 declarations" once filtered. */
export function feedCountLine(shown: number, total: number) {
  return shown === total
    ? declarations(total)
    : `${formatCount(shown)} of ${declarations(total)}`;
}
