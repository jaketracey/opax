import { chamberName, jurisdictionName } from '../../design/parliament';
import type {
  Catalogs,
  Electorate,
  PersonProfile,
  PersonId,
  Block,
} from '../../api/catalogs';
import { joinPerson, nameKey, rosterRowFor } from '../../api/catalogs';
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
/** A roster-only former person retains identity, with explicit coverage states. */
export function uncoveredProfile(identity: PersonProfile): ProfileView {
  const missing = {
    status: 'unlinked' as const,
    data: null,
    asAt: null,
    sources: [
      {
        label: 'Record on opax.com.au',
        url: `/subject/person/${identity.slug}`,
      },
    ],
    stale: false,
    savedAt: null,
  };
  return {
    personId: identity.canonicalPersonId ?? null,
    slug: identity.slug,
    interestKey: null,
    blocks: {
      identity: {
        ...missing,
        status: 'ready',
        data: identity,
        asAt: identity.asOf,
        sources: identity.sources.map((s) => ({
          label: s.label,
          url: s.url,
          licence: s.licence,
        })),
      },
      votes: { ...missing },
      interests: { ...missing },
      ties: { ...missing },
      pay: { ...missing },
      expenses: { ...missing },
      portrait: { ...missing },
      partyReceipts: { ...missing },
    },
  };
}

/** Committee appearances alone do not establish parliamentary membership. */
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
    !!row?.chambers?.some(
      (chamber) =>
        chamber !== 'senate_committee' && !!chamberName(chamber, 'federal'),
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
