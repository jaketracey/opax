import type {
  Catalogs,
  Electorate,
  PersonProfile,
  PersonId,
} from '../../api/catalogs';
import { joinPerson, nameKey } from '../../api/catalogs';
export type Directory = Awaited<ReturnType<Catalogs['directory']>>;
export type YourMPView = Awaited<ReturnType<Catalogs['yourMP']>>;
export type ProfileView = Omit<
  Awaited<ReturnType<Catalogs['profileFor']>>,
  'personId'
> & { personId: PersonId | null };
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
    ? seats.filter((s) =>
        [s.name, ...s.representatives.map((r) => r.person.name)].some((n) =>
          nameKey(n).includes(q),
        ),
      )
    : [];
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
    status: 'missing' as const,
    data: null,
    asAt: null,
    sources: [],
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
