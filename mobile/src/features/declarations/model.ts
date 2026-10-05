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

export interface Facet {
  id: string;
  label: string;
  count: number;
}
/**
 * The chambers and jurisdictions present in the export, in first-seen order
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
    chambers: [...chambers.values()],
    jurisdictions: [...jurisdictions.values()],
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

const declarations = (n: number) =>
  `${formatCount(n)} ${n === 1 ? 'declaration' : 'declarations'}`;
/** "300 declarations", or "176 of 300 declarations" once filtered. */
export function feedCountLine(shown: number, total: number) {
  return shown === total
    ? declarations(total)
    : `${formatCount(shown)} of ${declarations(total)}`;
}
