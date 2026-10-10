import { chamberName, jurisdictionName } from '../../design/parliament';
import type {
  Catalogs,
  Electorate,
  PersonProfile,
  PersonId,
  Block,
} from '../../api/catalogs';
import { joinPerson, nameKey, rosterRowFor } from '../../api/catalogs';
import { rosterChambersFor } from '../../api/person-identity';
import { formatCount, formatDate } from '../../design/format';
export type Directory = Awaited<ReturnType<Catalogs['directory']>>;
export type YourMPView = Awaited<ReturnType<Catalogs['yourMP']>>;
type SelectedProfile = Awaited<ReturnType<Catalogs['profileFor']>>;
export type EvidenceBlock<T> = Omit<Block<T>, 'status'> & {
  status: Block<T>['status'] | 'unlinked';
};
export type ProfileView = Omit<SelectedProfile, 'personId' | 'blocks'> & {
  personId: PersonId | null;
  blocks: {
    [K in keyof SelectedProfile['blocks']]: Omit<
      SelectedProfile['blocks'][K],
      'status'
    > & {
      status: SelectedProfile['blocks'][K]['status'] | 'unlinked';
    };
  };
};
export type ElectorateView = Awaited<
  ReturnType<Catalogs['electorateFor']>
>['data'];
export interface SeatChoice {
  version: 1;
  seatId: string;
  stateSeatIds: string[];
}
export function decodeChoice(value: unknown): SeatChoice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<SeatChoice>;
  return v.version === 1 &&
    typeof v.seatId === 'string' &&
    /^el_[a-f0-9]{24}$/.test(v.seatId) &&
    Array.isArray(v.stateSeatIds) &&
    v.stateSeatIds.every(
      (id) => typeof id === 'string' && /^el_[a-f0-9]{24}$/.test(id),
    )
    ? {
        version: 1,
        seatId: v.seatId,
        stateSeatIds: [...new Set(v.stateSeatIds)],
      }
    : null;
}
/** Filter only; no assignment, ranking or inferred representation. */
export function matchingSeats(
  seats: Electorate[],
  query: string,
): Electorate[] {
  const q = nameKey(query.trim());
  return q
    ? seats.filter(
        (s) =>
          s.status !== 'historical' &&
          [s.name, ...s.representatives.map((r) => r.person.name)].some((n) =>
            nameKey(n).includes(q),
          ),
      )
    : [];
}
/** Correct a district/region without retaining the old choice in that chamber. */
export function replaceStateSeat(
  choice: SeatChoice,
  seat: Electorate,
  seats: Electorate[],
): SeatChoice {
  return {
    ...choice,
    stateSeatIds: [
      ...choice.stateSeatIds.filter((id) => {
        const old = seats.find((s) => s.electorate_id === id);
        return (
          old &&
          (old.chamber !== seat.chamber ||
            old.jurisdiction !== seat.jurisdiction)
        );
      }),
      seat.electorate_id,
    ],
  };
}
export function registerCategoryLabel(key: string): string {
  const plain = key.replaceAll('_', ' ');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}
// Who an entry belongs to, as the House register forms name them. The export
// writes "unspecified" where a register (the Senate's, Queensland's) has no
// holder column; that and any unknown value print nothing.
const registerHolders: Record<string, string> = {
  self: 'Member',
  spouse: 'Spouse or partner',
  children: 'Dependent children',
};
type RegisterRow = {
  holder: string;
  description: string;
  kind: string;
  date?: string | null;
  page?: number | null;
  ocr?: number;
};
/**
 * One declared entry in plain words. The export joins a row's printed cells
 * with " · ": the first cell (the item, place or account) is the title and
 * the rest (counterparty, use, role) the detail. The meta line says whose it
 * is and when it entered the register; an absent field adds nothing.
 */
export function registerEntry(
  row: RegisterRow,
  statementDate?: string | null,
): { title: string | null; detail: string | null; meta: string | null } {
  const [title = '', ...rest] = row.description
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean);
  const when = row.date ? formatDate(row.date, 'short') : '';
  const change =
    row.kind === 'statement'
      ? statementDate && formatDate(statementDate, 'short')
        ? `In the statement of ${formatDate(statementDate, 'short')}`
        : 'In the statement of interests'
      : row.kind === 'addition'
        ? when
          ? `Added ${when}`
          : 'Added after the statement'
        : row.kind === 'deletion'
          ? when
            ? `Removed ${when}`
            : 'Removed after the statement'
          : when
            ? `Recorded ${when}`
            : '';
  const meta = [
    registerHolders[row.holder] ?? '',
    change,
    row.page ? `page ${formatCount(row.page)}` : '',
    row.ocr ? 'OCR transcription' : '',
  ].filter(Boolean);
  return {
    title: title || null,
    detail: rest.length ? rest.join(' · ') : null,
    meta: meta.length ? meta.join(' · ') : null,
  };
}
/**
 * Where a register's entries came from: rows in the opening statement, rows
 * added by later alterations and rows recording a removal. Zero parts are
 * left out.
 */
export function registerTotalsLine(r: {
  total: number;
  statement_date?: string | null;
  alterations: { added: number; deleted: number };
}): string {
  const { added, deleted } = r.alterations;
  const statement = Math.max(0, r.total - added - deleted);
  const dated = r.statement_date ? formatDate(r.statement_date, 'short') : '';
  return [
    statement
      ? `${formatCount(statement)} in the statement of ${dated || 'interests'}`
      : '',
    added ? `${formatCount(added)} added${statement ? ' since' : ''}` : '',
    deleted ? `${formatCount(deleted)} removed` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
export function registerChangeLabel(kind: string): string {
  return (
    (
      {
        addition: 'added',
        deletion: 'deleted',
        amendment: 'changed',
        change: 'changed',
        declaration: 'declared',
      } as Record<string, string>
    )[kind] ?? 'recorded'
  );
}
export function seatContext(seat: Electorate): string {
  return `${chamberName(seat.chamber, seat.jurisdiction) ?? 'Chamber not recorded'} · ${jurisdictionName(seat.state_code) ?? jurisdictionName(seat.jurisdiction) ?? 'Jurisdiction not recorded'}`;
}
export function representativeProfile(
  id: string,
  d: Directory,
): PersonProfile | null {
  const p = d.people.data.people.find((p) => p.person_id === id);
  if (!p) return null;
  for (const name of [p.name, ...p.aliases]) {
    const matches = Object.entries(d.slugs.data.slugs).filter(
      ([, n]) => nameKey(n) === nameKey(name),
    );
    if (matches.length !== 1) continue;
    try {
      const profile = joinPerson(
        matches[0]![0],
        d.slugs.data,
        d.roster.data,
        d.people.data,
        d.manifest.data,
      );
      if (profile.canonicalPersonId === id) return profile;
    } catch {
      /* Ambiguous or non-roster identities have no native page. */
    }
  }
  return null;
}
/** Chamber-only rows need a full identity; committee witnesses are not MPs. */
export function hasParliamentaryMembership(
  identity: PersonProfile,
  directory: Directory,
): boolean {
  if (identity.canonicalPersonId)
    return directory.people.data.people.some(
      (p) => p.person_id === identity.canonicalPersonId,
    );
  const row = rosterRowFor(
    [identity.name],
    directory.roster.data,
    identity.rosterPersonId,
  );
  return (
    rosterChambersFor(row).some(
      (chamber) => !!chamberName(chamber, 'federal'),
    ) ||
    !!row?.representation?.some(
      (r) =>
        r.electorate.trim() &&
        r.chamber !== 'senate_committee' &&
        chamberName(r.chamber, r.jurisdiction),
    )
  );
}

/** Never use another jurisdiction's global latest division date. */
export function votingMetaFor(block: ProfileView['blocks']['votes']) {
  return {
    content_changed_at: block.asAt,
    latest_division_date: null,
    latest_division_date_by_jurisdiction: Object.fromEntries(
      Object.entries(block.data?.latestDivisionDateByJurisdiction ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
  };
}
