import type { rosterIdentityFor } from '../../api/selectors';
import { chamberName, jurisdictionName } from '../../design/parliament';
/** Reader-facing context from the roster selector, including historical parties. */
export function personRowContext(
  person: ReturnType<typeof rosterIdentityFor> | null,
) {
  const place = person?.representation.length
    ? person.representation
        .map((r) => {
          const seat = r.electorate.trim();
          const chamber = chamberName(r.chamber, r.jurisdiction);
          const state = jurisdictionName(
            r.state ??
              (r.jurisdiction === 'federal' ? undefined : r.jurisdiction),
          );
          const parts = [
            seat,
            chamber,
            state && state !== seat && !chamber?.startsWith(state)
              ? state
              : null,
          ].filter(Boolean);
          const label = parts.join(' · ');
          return r.current ? label : `Recorded representation: ${label}`;
        })
        .join('; ')
    : person?.chambers.length
      ? [
          ...person.chambers.map((c) => chamberName(c)),
          ...person.states.map((s) => jurisdictionName(s)),
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;
  return {
    party: person?.party,
    partyStatus: person?.partyStatus ?? ('unknown' as const),
    formerly: person?.formerly,
    place: place || undefined,
  };
}
