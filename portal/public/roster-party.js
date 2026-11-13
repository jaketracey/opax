/** The party a verified electorate roster records for a person whose own
 * record carries none.
 *
 * parliamentarians.json has no party for most state members (it is built from
 * Hansard prints and the federal APH list), while the electorates release
 * records, for each seat a parliament publishes a roster for, the members
 * holding it on a stated date and the party that roster gives them
 * (representation_status "verified", representatives[].party, each member
 * with the parliament's own profile URL).
 *
 * The roster decides only when it is unambiguous: the person's recorded seat
 * must name exactly one release entry in the same jurisdiction and chamber,
 * that entry must be verified with a valid as-of date, and across all their
 * recorded seats exactly one representative may be this person (the person
 * ID decides where both sides carry one; otherwise the exact full name, never
 * a surname print). Anything else gives null: no party is shown rather than a
 * guess.
 *
 * Shared by the person page (public/app.js, through electorates.js) and the
 * Worker's crawlable person answers (src/seo-content.ts);
 * test/roster-party.test.mjs.
 */

/** Diacritics, case, curly apostrophes and spacing folded away. */
export function rosterFold(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Whether a roster representative is this person: the ID where both carry one, else the exact name. */
function isPerson(rep, person) {
  const member = rep?.person || {};
  const ids = [member.legacy_person_id].filter(Boolean);
  if (person.pid && ids.length) return ids.includes(person.pid);
  // A surname print ("Pearson") can hold several people; only a full name may match.
  const name = rosterFold(person.name);
  if (!name.includes(' ')) return false;
  return [member.name, ...(member.aliases || [])].some((n) => rosterFold(n) === name);
}

/**
 * @param {{name: string, pid?: string|null, representation?: {electorate: string, jurisdiction: string, chamber: string}[]}} person
 * @param {object[]} electorates the release index's electorates
 * @returns {{party: string, as_of: string, electorate: string, url: string|null, source_url: string|null} | null}
 */
export function rosterSeatParty(person, electorates) {
  if (!person?.name || !Array.isArray(electorates)) return null;
  const hits = [];
  for (const r of person.representation || []) {
    const seats = electorates.filter((e) => e && e.jurisdiction === r.jurisdiction && e.chamber === r.chamber &&
      rosterFold(e.name) === rosterFold(r.electorate));
    if (seats.length !== 1) continue;
    const seat = seats[0];
    if (seat.representation_status !== 'verified' || !isoDate(seat.representation_as_of)) continue;
    for (const rep of seat.representatives || []) {
      if (isPerson(rep, person)) hits.push({ rep, seat });
    }
  }
  if (hits.length !== 1) return null;
  const { rep, seat } = hits[0];
  const party = typeof rep.party === 'string' ? rep.party.trim() : '';
  if (!party) return null;
  return {
    party,
    as_of: seat.representation_as_of,
    electorate: seat.name,
    url: typeof seat.url === 'string' ? seat.url : null,
    source_url: typeof rep.person?.source_url === 'string' ? rep.person.source_url : null,
  };
}

/** The party the latest dated official chamber list records for a full-name
 * profile with no party of its own and no verified seat party
 * (public/data/roster-list-parties.json, from scripts/export_roster_list_parties.py).
 *
 * Only a full name matches (exact, folded, or a listed alias), never a
 * single-name print, and only in a chamber the profile sat in. The latest
 * dated observation decides; two parties or two seats at that date give null.
 * The result is dated, so a reader sees "Labor (parliamentary roster as at
 * 25 Sep 2026)", never an undated affiliation.
 *
 * @param {{name: string, chambers?: string[]}} person
 * @param {{name: string, aliases?: string[], chamber: string, electorate?: string, party: string, as_of: string, source_url?: string}[]} observations
 * @returns {{party: string, as_of: string, electorate: string, url: null, source_url: string|null} | null}
 */
export function rosterListParty(person, observations) {
  if (!person?.name || !Array.isArray(observations)) return null;
  const name = rosterFold(person.name);
  if (!name.includes(' ')) return null;
  const chambers = new Set(person.chambers || []);
  const hits = observations.filter((o) => o && chambers.has(o.chamber) && isoDate(o.as_of) &&
    typeof o.party === 'string' && o.party.trim() && [o.name, ...(o.aliases || [])].some((n) => rosterFold(n) === name));
  if (!hits.length) return null;
  const latest = hits.reduce((a, o) => (o.as_of > a ? o.as_of : a), '');
  const top = hits.filter((o) => o.as_of === latest);
  if (new Set(top.map((o) => o.party.trim())).size !== 1 || new Set(top.map((o) => rosterFold(o.electorate))).size !== 1) return null;
  return {
    party: top[0].party.trim(),
    as_of: latest,
    electorate: top[0].electorate || '',
    url: null,
    source_url: typeof top[0].source_url === 'string' ? top[0].source_url : null,
  };
}

/**
 * People the electorates release lists as holding a seat now who have no row in the speech roster
 * (parliamentarians.json): a presiding officer Hansard prints only as "The SPEAKER" (Maree Edwards,
 * Bendigo West), or a member yet to speak. A release person is "in the roster" when their name or an
 * alias, folded, equals a roster row's name or one of the names its speeches sit under. Each comes
 * with their current seats. The Worker adds them to its people (src/index.ts loadPeople) and the
 * party index lists them (scripts/build_party_index.mjs seat_rosters, `reference`), so a party page
 * counts them the same way in the server answer and in the browser.
 * @param {{name: string, full?: string|null, speech_scope?: unknown}[]} rosterPeople
 * @param {{name: string, aliases?: string[], electorates?: {current?: boolean}[]}[]} referencePeople
 */
export function referenceOnlyPeople(rosterPeople, referencePeople) {
  // The roster names a row's speeches sit under: the same set as speech-attribution.js splitSpeakers.
  const spoken = (p) => [p.name, ...(p.speech_scope && p.full ? [p.full === 'Craig Crawford' ? 'Cd Crawford' : p.full, p.full] : [])];
  const names = new Set((rosterPeople || []).flatMap(spoken).map(rosterFold));
  const out = [];
  for (const person of referencePeople || []) {
    if ([person.name, ...(person.aliases || [])].some((n) => names.has(rosterFold(n)))) continue;
    const seats = (person.electorates || []).filter((e) => e.current);
    if (!seats.length) continue;
    out.push({ person, seats });
    names.add(rosterFold(person.name));
  }
  return out;
}
