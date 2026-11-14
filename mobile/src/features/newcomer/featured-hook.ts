/**
 * A better line for Today's rotating parliamentarian cards (newcomer design
 * pass; prototype). Today's line is a raw count ("Alex Hawke: 768 speeches
 * in the OPAX record."), which gives a cold reader no reason to care.
 *
 * The pattern: who this person is to a voter, then what there is to read.
 *   1. the job and the place, in plain words ("MP for Mitchell, in New
 *      South Wales." / "Senator for Victoria.");
 *   2. how long they have been on the record ("Speaking in Parliament since
 *      2007."), when the roster has the year;
 *   3. the count, last, as an invitation ("768 speeches to read.").
 * Every part comes from the roster the card already holds: no new request,
 * no ranking, no adjective, nothing a party would dispute.
 */
export interface HookInput {
  chamber: string;
  electorate: string;
  state?: string | null;
  /** The first year the person appears in the record, if the roster has it. */
  first?: number;
  speeches?: number;
}

const STATES: Record<string, string> = {
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  wa: 'Western Australia',
  sa: 'South Australia',
  tas: 'Tasmania',
  act: 'the Australian Capital Territory',
  nt: 'the Northern Territory',
};
const stateName = (code?: string | null) =>
  code ? (STATES[code.toLowerCase()] ?? code) : null;

export function featuredHook(person: HookInput): string {
  const state = stateName(person.state);
  const senate = /senate/i.test(person.chamber);
  const role = senate
    ? `Senator for ${state ?? person.electorate}.`
    : `MP for ${person.electorate}${state ? `, in ${state}` : ''}.`;
  const since =
    person.first && person.first > 1900 && person.first < 2100
      ? `Speaking in Parliament since ${person.first}.`
      : null;
  const count =
    person.speeches && person.speeches > 0
      ? `${person.speeches.toLocaleString('en-AU')} ${person.speeches === 1 ? 'speech' : 'speeches'} to read.`
      : null;
  return [role, since, count].filter(Boolean).join(' ');
}
