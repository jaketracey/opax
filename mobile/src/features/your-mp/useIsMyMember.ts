import { createElement, useContext, useMemo, type ReactNode } from 'react';
import { MyMemberContext } from './MyMemberContext';
import { representativeProfile } from './model';
import { savedSeatDirectory, useSeat } from './useSeat';

/** Resolve the saved seat once at the list boundary, never in each row. */
export function useSavedMember() {
  const seat = useSeat();
  const directory = savedSeatDirectory();
  const seatId = seat.status === 'chosen' ? seat.choice.seatId : null;
  return useMemo(() => {
    const chosen = directory?.electorates.data.electorates.find(
      (s) => s.electorate_id === seatId,
    );
    if (
      !directory ||
      !chosen ||
      chosen.status === 'historical' ||
      chosen.jurisdiction !== 'federal' ||
      chosen.chamber !== 'representatives' ||
      chosen.representation_status !== 'verified'
    )
      return null;
    const id = chosen.representatives[0]?.person_id;
    return id ? representativeProfile(id, directory) : null;
  }, [seatId, directory]);
}
function SavedMemberProvider({ children }: { children: ReactNode }) {
  const member = useSavedMember();
  return createElement(MyMemberContext.Provider, { value: member }, children);
}
export function MyMemberProvider({ children }: { children: ReactNode }) {
  const inherited = useContext(MyMemberContext);
  return inherited === undefined
    ? createElement(SavedMemberProvider, null, children)
    : children;
}
/** Profile callers outside a list keep the same local-only lookup. */
export function useIsMyMember(slug: string): boolean {
  const member = useSavedMember();
  return (
    !!member && (slug === member.slug || slug === member.canonicalPersonId)
  );
}
