import type { Electorate } from '../../api/catalogs';
import { formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { presidingRole } from '../../design/party';
import { InsetGroup, PersonRow } from '../../design/primitives';
import { personRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { representativeProfile, type Directory } from './model';

/**
 * A seat's members as person rows. The place line ("Member for Grayndler,
 * New South Wales") is left out by default: every screen that lists a
 * seat's members already names the seat. `detailFor` gives each row its one
 * fact ("Since 2 Mar 1996"); without it the row has no detail.
 */
export function RepresentativeRows({
  rows,
  directory,
  id,
  placeLine = false,
  detailFor,
  wrap = true,
}: {
  rows: Electorate['representatives'];
  directory: Directory;
  id: string;
  placeLine?: boolean;
  detailFor?: (personId: string) => string | null | undefined;
  /** False inside an InsetGroup, which owns the separators. */
  wrap?: boolean;
}) {
  const items = rows.map((r) => {
    const profile = representativeProfile(r.person_id, directory);
    const observations =
      directory.people.data.people
        .find((p) => p.person_id === r.person_id)
        ?.electorates.filter((s) => s.current) ?? [];
    const seat = profile?.seats[0] ?? observations[0];
    const state = seat
      ? directory.electorates.data.electorates.find(
          (s) => s.electorate_id === seat.electorate_id,
        )?.state_code
      : undefined;
    const place = jurisdictionName(state ?? seat?.jurisdiction);
    const party = presidingRole(profile?.party)
      ? (r.party ?? profile?.party)
      : (profile?.party ?? r.party);
    const role = presidingRole(party);
    return (
      <PersonRow
        key={r.person_id}
        testDrawnName
        testID={`${id}-${profile?.slug ?? r.person_id}`}
        name={r.person.name}
        portrait={<CachedPortrait name={r.person.name} slug={profile?.slug} />}
        party={role ? undefined : party}
        // A current member's party is the roster's present party, never
        // "unknown" when the roster row names one.
        partyStatus={
          profile?.partyStatus ??
          (observations.length > 0 || r.party ? 'current' : 'unknown')
        }
        formerly={
          presidingRole(profile?.formerly) ? undefined : profile?.formerly
        }
        place={
          placeLine && seat
            ? `${seat.chamber === 'senate' ? 'Senator for' : 'Member for'} ${seat.name}${place && place !== seat.name ? `, ${place}` : ''}`
            : undefined
        }
        detail={role ?? detailFor?.(r.person_id) ?? undefined}
        href={profile ? personRoute(profile.slug) : undefined}
        menu={profile ? 'person' : []}
      />
    );
  });
  return wrap ? <InsetGroup>{items}</InsetGroup> : <>{items}</>;
}

/**
 * "Since 2 Mar 1996" from the member's open term in this seat, at the
 * precision the record gives; nothing when the start is less exact than a
 * year (never guessed from the roster's first appearance).
 */
export function sinceLine(
  terms: readonly {
    person_id: string;
    start: string | null;
    start_precision: string;
    end: string | null;
    end_precision: string;
  }[],
  personId: string,
): string | null {
  const term = terms
    .filter(
      (t) => t.person_id === personId && (t.end_precision === 'open' || !t.end),
    )
    .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))[0];
  const start = term && preciseDate(term.start, term.start_precision);
  return start ? `Since ${start}` : null;
}

/** A date at its stated precision: "2 Mar 1996", "Mar 1996", "1996". */
export function preciseDate(
  date: string | null | undefined,
  precision: string,
): string | null {
  if (!date) return null;
  if (precision === 'day') return formatDate(date, 'short');
  if (precision === 'month') {
    const d = new Date(`${date.slice(0, 7)}-15T12:00:00`);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
      : null;
  }
  if (precision === 'year') return date.slice(0, 4);
  return null;
}
