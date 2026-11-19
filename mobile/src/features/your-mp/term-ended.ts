import type { Electorate } from '../../api/catalogs';
import { formFromIndex, termEndDate, termLine } from '../today/dissolution';

type IndexRow = Pick<
  Electorate,
  'jurisdiction' | 'chamber' | 'state_code' | 'dissolved_for'
> & { electorate_id?: string };
/**
 * A seat as any record names it: the parliament and the house. An index row
 * also carries its own `dissolved_for`; a people-catalogue seat carries the
 * `electorate_id` of its index row.
 */
type Seat = {
  jurisdiction: string;
  chamber: string;
  electorate_id?: string;
  dissolved_for?: string | null;
  state_code?: string;
};

/** A state upper house, by its chamber code ("vic_lc", "nsw_lc"). */
export const isCouncil = (chamber: string) =>
  /_lc$|upper|council/i.test(chamber);

/**
 * Whether a parliament's upper house ends on the day its lower house does.
 *
 * Victoria only. Constitution Act 1975 (Vic) s 28(2): the Council "shall
 * exist and continue until the dissolution or other lawful determination of
 * the Assembly". The electorates index marks only the Assembly's rows
 * (`dissolved_for`), so the Council's rows take the Assembly's answer
 * through this rule. Remove it, or narrow it, once the index marks the
 * Council's rows itself; no other state's Council is assumed to end.
 */
export function councilEndsWithAssembly(jurisdiction: string): boolean {
  return jurisdiction.toLowerCase() === 'vic';
}

/** The election day and state code of a parliament whose term has ended. */
export type EndedTerm = { electionDay: string; stateCode: string };

/**
 * The parliaments whose term has ended, by jurisdiction. `resumed` is the
 * seats of those parliaments whose own index row says otherwise: a district
 * whose `dissolved_for` is already null while other rows still carry the
 * election day. Empty for an index whose rows all agree.
 */
export type EndedTerms = ReadonlyMap<string, EndedTerm> & {
  readonly resumed?: ReadonlySet<string>;
};

/**
 * The parliaments whose term has ended for an election, by jurisdiction,
 * as the electorates index says it (`formFromIndex`): one entry while any
 * lower-house row of the jurisdiction carries an election day, none once
 * the result is loaded and the field is null, none from an index without
 * the field.
 */
export function endedParliaments(electorates: readonly IndexRow[]): EndedTerms {
  const ended = new Map<string, EndedTerm>();
  for (const row of electorates) {
    if (row.dissolved_for == null || ended.has(row.jurisdiction)) continue;
    const form = formFromIndex(row);
    if (form?.kind === 'dissolved')
      ended.set(row.jurisdiction, {
        electionDay: form.electionDay,
        stateCode: row.state_code,
      });
  }
  const resumed = new Set<string>();
  if (ended.size)
    for (const row of electorates)
      if (
        row.electorate_id &&
        ended.has(row.jurisdiction) &&
        ownAnswer(row) === false
      )
        resumed.add(row.electorate_id);
  return Object.assign(ended, { resumed });
}

/**
 * What a seat's own index row says of its house: true while it carries an
 * election day, false once it is null, undefined where the row has no field
 * and so borrows its parliament's answer. A Council row whose Council ends
 * with the Assembly always borrows: its null cannot mean its house sits
 * while the Assembly's term has ended (`councilEndsWithAssembly`).
 */
function ownAnswer(seat: Seat): boolean | undefined {
  if (seat.dissolved_for === undefined) return undefined;
  if (formFromIndex(seat)?.kind === 'dissolved') return true;
  return isCouncil(seat.chamber) && councilEndsWithAssembly(seat.jurisdiction)
    ? undefined
    : false;
}

/**
 * The ended term a seat belongs to, or null while its house has members: a
 * lower-house seat of an ended parliament, and a Council seat where the
 * Council ends with the Assembly (`councilEndsWithAssembly`).
 *
 * A seat's own index row decides where it speaks: the row passed in, by its
 * `dissolved_for`, or the row a people-catalogue seat names by
 * `electorate_id` (`resumed`). So a district whose result is loaded has a
 * member again while other districts' rows still carry the election day.
 * Only a row with no field of its own (the Council's) borrows the
 * parliament's answer.
 */
export function termEndedFor(seat: Seat, ended: EndedTerms): EndedTerm | null {
  if (seat.jurisdiction === 'federal') return null;
  const term = ended.get(seat.jurisdiction);
  const own = ownAnswer(seat);
  if (own === false) return null;
  if (own) {
    const form = formFromIndex(seat);
    // The parliament's own entry where the row agrees with it, as before.
    if (form?.kind === 'dissolved' && term?.electionDay === form.electionDay)
      return term;
    return form?.kind === 'dissolved'
      ? {
          electionDay: form.electionDay,
          stateCode: seat.state_code ?? term?.stateCode ?? seat.jurisdiction,
        }
      : null;
  }
  if (!term) return null;
  if (seat.electorate_id && ended.resumed?.has(seat.electorate_id)) return null;
  return isCouncil(seat.chamber) && !councilEndsWithAssembly(seat.jurisdiction)
    ? null
    : term;
}

/**
 * Whether the index row itself says its house's term has ended: a district
 * row drawn with no index at hand. A Council region's row carries no field
 * of its own; ask `termEndedFor` with the whole index for those.
 */
export function rowTermEnded(seat: Pick<Electorate, 'dissolved_for'>): boolean {
  return formFromIndex(seat)?.kind === 'dissolved';
}

/**
 * The day a term ended, as the data writes days ("2026-11-03"): a view of a
 * seat on a chosen date shows its last members from this day on. Where the
 * rule gives no day (`termLine`), the election day, by which it had ended.
 */
export function endedTermDay(term: EndedTerm): string {
  const ended = termEndDate(term.electionDay, term.stateCode);
  return ended
    ? ended.toISOString().slice(0, 10)
    : term.electionDay.slice(0, 10);
}

/** "Parliament’s term ended on 3 November for the 28 November election". */
export function endedTermLine(term: EndedTerm): string {
  return termLine(term.electionDay, term.stateCode);
}

/**
 * The place line of someone who held a seat when its house's term ended.
 * Nobody is called a member: "Last member for Essendon".
 */
export function lastMemberFor(where: string): string {
  return `Last member for ${where}`;
}
