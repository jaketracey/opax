/** Seat vacancy: the one place that reads a vacancy from the electorate release and words it.
 *
 * A reviewed vacancy record (scripts/hubs/electorate-vacancies.json, written into the release by
 * parli.electorates.apply_vacancies) leaves a seat with a complete roster observation that has no
 * members and is marked `vacant_at`, and its last member with a closed, dated service record.
 * Nothing here names a seat or a person: every reader goes through these functions.
 *
 * Added by the Brunswick hotfix (im/brunswick-vacant). The vacancy sentence and the rules for the ended
 * houses are in vic-term.js; this module adds what only the release knows: the last member and dates.
 *
 * Shared by the election hub (scripts/build_vic_election.mjs, src/vic-election.ts), the electorate
 * page (public/electorates.js, src/index.ts) and the person page (public/app.js, src/seo-content.ts);
 * test/seat-vacancy.test.mjs.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
/** "3 November" */
const dayMonth = (date) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
/** "19 September 2026" */
const dayMonthYear = (date) => `${dayMonth(date)} ${date.slice(0, 4)}`;
const house = (chamber) => /_la$/.test(chamber || '') ? 'Assembly' : /_ha$/.test(chamber || '') ? 'House of Assembly' : 'house';

/** "Vacant when the Assembly expired on 3 November."; with a subject, "Brunswick was vacant when ...". */
export function vacancyText(vacancy, subject = '') {
  const when = `when the ${house(vacancy.chamber)} expired on ${dayMonth(vacancy.as_of)}.`;
  return subject ? `${subject} was vacant ${when}` : `Vacant ${when}`;
}
/** "Last member: Tim Read, to 19 September 2026." The name may be given as a link. */
export const lastMemberText = (name, to) => `Last member: ${name}, to ${dayMonthYear(to)}.`;
/** "Member for Brunswick, 2018 to 19 September 2026". The seat may be given as a link. */
export const servedText = (seat, start, end) => `Member for ${seat}, ${start.slice(0, 4)} to ${dayMonthYear(end)}`;

/**
 * The vacancy an electorate detail file records, or null: its newest roster observation is complete,
 * has no members and is marked `vacant_at: "expiry"`. `last` is the member whose dated service record
 * closed last, on or before that observation (null when the file has none).
 * @returns {{as_of: string, at: 'expiry', chamber: string, last: {person_id: string, name: string, party: string|null, source_url: string|null, start: string, end: string}|null}|null}
 */
export function seatVacancy(detail) {
  const roster = [...(detail?.rosters || [])].sort((a, b) => String(b.as_of).localeCompare(String(a.as_of)) || (b.priority || 0) - (a.priority || 0))[0];
  if (!roster || !roster.complete || !iso(roster.as_of) || (roster.members || []).length || roster.vacant_at !== 'expiry') return null;
  if ((detail.representatives || []).length || Number(detail.capacity || 1) !== 1) return null;
  const term = (detail.terms || []).filter((t) => t.end_precision === 'day' && iso(t.end) && iso(t.start) && t.end <= roster.as_of)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  const person = term && detail.people?.[term.person_id];
  return {
    as_of: roster.as_of, at: 'expiry', chamber: detail.chamber,
    last: person ? {
      person_id: term.person_id, name: person.name,
      party: [...(term.party_periods || [])].sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))[0]?.party || null,
      source_url: typeof person.source_url === 'string' ? person.source_url : null, start: term.start, end: term.end,
    } : null,
  };
}

/**
 * The seat a person was the last member of and that the release index now records vacant, or null.
 * `person` is their entry in the release's people file; `electorates` the index rows. The seat must be
 * verified with no representative at the date the person's entry was read, and every dated period of
 * theirs there must be closed on or before that date.
 * @returns {{electorate_id: string, name: string, url: string, start: string, end: string}|null}
 */
export function vacatedSeat(person, electorates) {
  if (!Array.isArray(electorates)) return null;
  for (const seat of person?.electorates || []) {
    const periods = seat.periods || [];
    if (seat.current || !periods.length || !periods.every((p) => iso(p.start) && iso(p.end))) continue;
    const row = electorates.find((e) => e.electorate_id === seat.electorate_id);
    const last = [...periods].sort((a, b) => b.end.localeCompare(a.end))[0];
    if (!row || row.representation_status !== 'verified' || (row.representatives || []).length || Number(row.capacity || 1) !== 1) continue;
    if (!row.dissolved_for || !iso(row.representation_as_of) || row.representation_as_of !== seat.as_of || last.end > row.representation_as_of) continue;
    return { electorate_id: seat.electorate_id, name: seat.name, url: seat.url, start: last.start, end: last.end };
  }
  return null;
}
