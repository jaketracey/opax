/**
 * The line on Today's rotating parliamentarian cards: who this person is to a
 * voter, then what there is to read. Roster fields only, no extra request.
 *
 *   "MP for Mitchell, in New South Wales. 768 speeches to read."
 *   "Senator for Victoria. 331 speeches to read."
 *
 * Each part is dropped when its field is missing. There is deliberately no
 * "Speaking in Parliament since <year>" clause: the roster's `first` is the
 * earliest year a speech appears in the OPAX corpus (scripts/
 * export_parliamentarians.py: min of speech years; coverage starts 1993-03),
 * not the year the person entered Parliament, so it would be wrong for many
 * members.
 */
export interface HookInput {
  chamber: string;
  electorate?: string | null;
  state?: string | null;
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
const stateName = (code?: string | null) => {
  const raw = code?.trim();
  return raw ? (STATES[raw.toLowerCase()] ?? raw) : null;
};

export function featuredHook(person: HookInput): string {
  const state = stateName(person.state);
  const electorate = person.electorate?.trim() || null;
  const senate = /senate/i.test(person.chamber);
  let role: string | null;
  if (senate) {
    const place = state ?? electorate;
    role = place ? `Senator for ${place}.` : 'Senator.';
  } else if (electorate) {
    role = `MP for ${electorate}${state ? `, in ${state}` : ''}.`;
  } else {
    role = state ? `MP in ${state}.` : null;
  }
  const count =
    person.speeches && person.speeches > 0
      ? `${person.speeches.toLocaleString('en-AU')} ${person.speeches === 1 ? 'speech' : 'speeches'} to read.`
      : null;
  return [role, count].filter(Boolean).join(' ');
}
