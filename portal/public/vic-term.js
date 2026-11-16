/* Who a Victorian seat's member was when its house's term ended, and how a person stands to that.
 *
 * One rule for every reader (the election pages, electorate profiles, person titles and Ask): while
 * the electorates index still holds the Assembly ended (dissolved_for), the member of a seat is whoever
 * that seat's own index row names, the roster the parliament published, which carries each by-election
 * winner of the term. A person is "Member for X until the Assembly expired on 3 November" only when a
 * row names them. A recorded representation in the speech roster does not: it keeps earlier members of
 * the seat (a member who resigned before a by-election) and surname prints that hold several people.
 *
 * test/vic-term.test.mjs checks the rule over every Victorian seat in the published roster and index.
 */
import { VIC_ASSEMBLY_EXPIRED_AT, vicAssemblyEnded, vicCouncilEnded, vicAssemblyExpiredPhrase, vicCouncilExpiredPhrase } from './vic-election.js?v=a412e65c49';
import { rosterFold, rosterIsPerson } from './roster-party.js';

/** Whether a seat row's representative is this person. The state roster's own ID decides where the person
 *  carries one; a former federal member's APH number is another parliament's scheme and cannot be compared
 *  with it, so the exact full name decides for them (never a surname print: rosterIsPerson). */
export const vicIsMember = (rep, person) => rosterIsPerson(rep, /^\d+$/.test(String(person?.pid ?? '')) ? { ...person, pid: null } : person);

/* Reviewed exceptions: seats with no member on the day the term ended, where the published roster was
 * fetched before the vacancy and still names someone. The member's service ended with no by-election
 * before the Assembly expired, so the seat reads "Vacant when the Assembly expired on 3 November." and
 * nobody is named its member at expiry. Add a seat only on a reliable dated source.
 *   Brunswick: ABC News, 19 September 2026; the roster in the index was fetched on 9 September 2026. */
export const VIC_VACANT_AT_EXPIRY = [
  { chamber: 'vic_la', electorate: 'Brunswick' },
];

const victorian = (row) => row?.jurisdiction === 'vic' && (row.chamber === 'vic_la' || row.chamber === 'vic_lc');
/** Whether a seat's house has ended and the new parliament's roster has not loaded for it. The Council
 *  has no record of its own: it follows the Assembly's rows (Constitution Act 1975 s 28(2)). */
export const vicSeatEnded = (row, rows) => victorian(row) && (row.chamber === 'vic_la' ? vicAssemblyEnded(row) : vicCouncilEnded(rows));
export const vicSeatVacantAtExpiry = (row) => victorian(row) &&
  VIC_VACANT_AT_EXPIRY.some((v) => v.chamber === row.chamber && rosterFold(v.electorate) === rosterFold(row.name));
/** The members a seat's row names for the day its term ended: none for a seat that was vacant. */
export const vicMembersAtExpiry = (row, rows) => vicSeatEnded(row, rows) && !vicSeatVacantAtExpiry(row) ? row.representatives || [] : [];
/** "until the Assembly expired on 3 November", or the Council's form for a region. */
export const vicExpiredPhrase = (row) => row?.chamber === 'vic_lc' ? vicCouncilExpiredPhrase() : vicAssemblyExpiredPhrase();
/** "Member for Richmond", "Member for Northern Victoria Region". */
export const vicMemberRole = (row) => `Member for ${row.name}${row.chamber === 'vic_lc' ? ' Region' : ''}`;
/** "Vacant when the Assembly expired on 3 November." */
export const vicVacantSentence = (row) => `Vacant when the ${row?.chamber === 'vic_lc' ? 'Council' : 'Assembly'} expired on ${vicAssemblyExpiredPhrase().split(' on ')[1]}.`;

/**
 * How a person stands to the ended Victorian houses.
 *   { row }       a seat's row names them as its member when the term ended
 *   { row: null } they have a recorded Victorian seat in an ended house and no row names them: a
 *                 former member, or a surname print, never a sitting one
 *   null          no ended Victorian house concerns them: other rules decide
 * @param {{name: string, pid?: string|null, representation?: {electorate: string, jurisdiction: string, chamber: string}[]|null}} person
 * @param {object[]|null|undefined} rows the electorates index
 */
export function vicTermEnd(person, rows) {
  if (!person?.name || !Array.isArray(rows)) return null;
  const seats = (person.representation || []).filter(victorian);
  // A person the speech roster records no Victorian seat for can still be a row's member (a presiding
  // officer Hansard prints only by office): the row decides.
  for (const row of rows) {
    if (vicMembersAtExpiry(row, rows).some((rep) => vicIsMember(rep, person))) return { row };
  }
  const assemblyEnded = rows.some(vicAssemblyEnded);
  const ended = seats.some((seat) => {
    if (seat.chamber === 'vic_lc') return assemblyEnded;
    const own = rows.filter((row) => row.jurisdiction === 'vic' && row.chamber === 'vic_la' && rosterFold(row.name) === rosterFold(seat.electorate));
    // A seat the index no longer has (abolished in 2022) belongs to no sitting house either.
    return own.length ? own.some(vicAssemblyEnded) : assemblyEnded;
  });
  return ended ? { row: null } : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The day the term ended, as a title dates it: "3 November 2026", or "3 Nov 2026" where room is short. */
export function vicTermEndDay() {
  const [year, month, day] = VIC_ASSEMBLY_EXPIRED_AT.slice(0, 10).split('-').map(Number);
  return { long: `${day} ${MONTHS[month - 1]} ${year}`, short: `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}` };
}
