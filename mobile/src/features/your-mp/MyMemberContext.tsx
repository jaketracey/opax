import { createContext, useContext } from 'react';
import type { PersonProfile } from '../../api/person-identity';

/** List context only: importing a row never starts a saved-seat read. */
export const MyMemberContext = createContext<PersonProfile | null | undefined>(
  undefined,
);
export function useRowIsMyMember(id: string | undefined): boolean {
  const member = useContext(MyMemberContext);
  return (
    !!id && !!member && (id === member.slug || id === member.canonicalPersonId)
  );
}
