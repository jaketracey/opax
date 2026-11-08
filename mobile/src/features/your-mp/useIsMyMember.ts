import { representativeProfile } from './model';
import { savedSeatDirectory, useSeat } from './useSeat';
/** Resolves a slug locally; the saved seat is never a request parameter. */
export function useIsMyMember(slug: string): boolean {
  const seat = useSeat();
  const directory = savedSeatDirectory();
  if (seat.status !== 'chosen' || !directory) return false;
  const chosen = directory.electorates.data.electorates.find(
    (s) => s.electorate_id === seat.choice.seatId,
  );
  return (
    !!chosen &&
    chosen.status !== 'historical' &&
    chosen.jurisdiction === 'federal' &&
    chosen.chamber === 'representatives' &&
    chosen.representation_status === 'verified' &&
    chosen.representatives.some(
      (r) => representativeProfile(r.person_id, directory)?.slug === slug,
    )
  );
}
