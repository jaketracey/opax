import type { Electorate } from '../../api/catalogs';

/** A day the data gave, or null for anything that is not a real day. */
function dayOf(day: string): Date | null {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day.slice(0, 10)
    ? date
    : null;
}
const dayWords = (date: Date) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);

/**
 * The day the Victorian Parliament's term ended before a fixed-date general
 * election, as a day and month; null where that rule does not give it.
 *
 * Under the Constitution Act 1975 (Vic) the term expires 25 days before
 * election day, and election day is the last Saturday of November. So the
 * day follows from the index's election day, and only then: another
 * state's house, or a Victorian election on any other day, has no date
 * this rule can give. No date is written here.
 */
const TERM_ENDS_DAYS_BEFORE = 25;
function termEndWords(electionDay: Date, stateCode: string): string | null {
  if (stateCode.toLowerCase() !== 'vic') return null;
  const nextWeek = new Date(electionDay.getTime() + 7 * 86_400_000);
  const lastSaturdayOfNovember =
    electionDay.getUTCDay() === 6 &&
    electionDay.getUTCMonth() === 10 &&
    nextWeek.getUTCMonth() !== 10;
  if (!lastSaturdayOfNovember) return null;
  return dayWords(
    new Date(electionDay.getTime() - TERM_ENDS_DAYS_BEFORE * 86_400_000),
  );
}

/**
 * The line for a house whose term has ended for an election: with the day
 * it ended where the rule above gives one, without it otherwise, and with
 * no election day when the data's is not a day.
 */
export function termLine(electionDay: string, stateCode: string): string {
  const day = dayOf(electionDay);
  if (!day) return 'Parliament’s term has ended for the election';
  const ended = termEndWords(day, stateCode);
  return ended
    ? `Parliament’s term ended on ${ended} for the ${dayWords(day)} election`
    : `Parliament’s term has ended for the ${dayWords(day)} election`;
}

type IndexRow = Pick<
  Electorate,
  'jurisdiction' | 'chamber' | 'state_code' | 'dissolved_for'
>;
/** A seat as any record names it: the parliament and the house. */
type Seat = { jurisdiction: string; chamber: string };

const isCouncil = (chamber: string) => /_lc$|upper|council/i.test(chamber);

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
 * The parliaments whose term has ended for an election, by jurisdiction,
 * as the electorates index says it (`dissolved_for`): one entry while any
 * lower-house row of the jurisdiction carries an election day, none once
 * the result is loaded and the field is null, none from an index without
 * the field.
 */
export function endedParliaments(
  electorates: readonly IndexRow[],
): ReadonlyMap<string, EndedTerm> {
  const ended = new Map<string, EndedTerm>();
  for (const row of electorates) {
    if (row.dissolved_for == null || ended.has(row.jurisdiction)) continue;
    ended.set(row.jurisdiction, {
      electionDay: row.dissolved_for.slice(0, 10),
      stateCode: row.state_code,
    });
  }
  return ended;
}

/**
 * The ended term a seat belongs to, or null while its house has members: a
 * lower-house seat of an ended parliament, and a Council seat where the
 * Council ends with the Assembly (`councilEndsWithAssembly`).
 */
export function termEndedFor(
  seat: Seat,
  ended: ReadonlyMap<string, EndedTerm>,
): EndedTerm | null {
  if (seat.jurisdiction === 'federal') return null;
  const term = ended.get(seat.jurisdiction);
  if (!term) return null;
  return isCouncil(seat.chamber) && !councilEndsWithAssembly(seat.jurisdiction)
    ? null
    : term;
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
