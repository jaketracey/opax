import { shortDate } from './format.js';
/** Counts are keyed by the roster's verified person ID, never by a name. Both notes sit with the
 *  person's speeches, the section they qualify, never in the page head. */
export function heldBackTranscriptsHTML(personId, counts) {
  const count = personId == null ? 0 : counts?.[String(personId)];
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  const one = count === 1;
  const text = `${count.toLocaleString('en-AU')} earlier transcript${one ? '' : 's'} record${one ? 's' : ''} this member alongside other speakers and ${one ? 'is' : 'are'} not counted here.`;
  return `<p class="person-held-back fineprint"><a href="/methods#speaker-attribution">${text}</a></p>`;
}

export function chairRoleTranscriptsHTML(personId, counts) {
  const count = personId == null ? 0 : counts?.[String(personId)];
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  const one = count === 1;
  const text = `${count.toLocaleString('en-AU')} transcript${one ? '' : 's'} record${one ? 's' : ''} this member presiding in the chair. ${one ? 'It is' : 'They are'} kept apart from their own speeches.`;
  return `<p class="person-chair-role fineprint"><a href="/methods#speaker-attribution">${text}</a></p>`;
}

/** A list-only profile (roster_only: a member on a parliament's official list whose time in that chamber
 *  OPAX holds no Hansard for) says so where the speeches would be, instead of showing nothing or a zero. */
export const NO_HANSARD_HELD = 'No Hansard held for this period.';
export function noHansardHeldHTML(person) {
  if (!person?.roster_only) return '';
  return `<p class="person-no-hansard fineprint">${NO_HANSARD_HELD} This profile comes from the parliament’s member list; no speeches in the record are attributed to them.</p>`;
}

/** Where a person's speeches in the record stop, said plainly above the list: "Speeches in the record
 *  run to 11 Sep 2024." A sitting member whose newest speech is more than 120 days before `today`
 *  (YYYY-MM-DD) gets a second sentence, because the gap is the record's, not the member's silence.
 *  '' without a dated speech. */
export function speechSpanLine(latest, { current = false, today = '' } = {}) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(latest || ''))?.[0];
  if (!day || Number.isNaN(Date.parse(day))) return '';
  const line = `Speeches in the record run to ${shortDate(day)}.`;
  const now = /^\d{4}-\d{2}-\d{2}$/.test(today) ? Date.parse(today) : NaN;
  return current && Number.isFinite(now) && (now - Date.parse(day)) / 86_400_000 > 120
    ? `${line} Later speeches are not yet in the record.` : line;
}

/* Mentions on a person page. Hansard sets debate headings in capitals ("STATEMENTS BY SENATORS",
   "BILLS - Treasury Laws Amendment ..."); a row title reads in sentence case. Only a part set wholly in
   capitals changes, and the short acronyms the record uses keep their capitals. */
const KEEP_CAPS = new Set(['ABC', 'ACT', 'ADF', 'AFP', 'ASIO', 'AUKUS', 'COVID-19', 'GST', 'NBN', 'NDIS', 'NSW', 'NT', 'QLD', 'SA', 'SBS', 'TAS', 'UN', 'US', 'USA', 'UK', 'VIC', 'WA', 'II', 'III', 'IV']);
const sentencePart = part => {
  if (!/[A-Z]/.test(part) || /[a-z]/.test(part)) return part;
  const lower = part.toLowerCase().replace(/[A-Za-z0-9-]+/g, word => KEEP_CAPS.has(word.toUpperCase()) ? word.toUpperCase() : word);
  return lower.replace(/^(\W*)([a-z])/, (_, lead, c) => lead + c.toUpperCase());
};
export function mentionTitleCase(title) {
  return String(title || '').split(/(\s+[-–—]\s+)/).map((part, i) => i % 2 ? part : sentencePart(part)).join('');
}

const foldMention = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase();
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const within = (date, start, end) => Boolean(date) && (!start || date >= start) && (!end || date <= end);
const GENERIC_POSTS = new Set(['member of parliament', 'senator']);
/* Where a combined post's next title begins. The Handbook joins offices with ", " ("Leader of the House,
   Minister for Infrastructure, Transport, Regional Development and Local Government"), but a portfolio
   has commas of its own, so a post splits only where the next words open a title in their own right,
   and at " and " only where both halves do. Never a portfolio fragment such as "Transport". */
const TITLE_START = /^(?:(?:Shadow|Assistant|Deputy|Acting|Special|Second Deputy|Opposition|Government|Chief Government|Chief Opposition|Senior) )*(?:Minister|Ministers?|Parliamentary Secretary|Leader|Manager|Whip|Treasurer|Attorney-General|Prime Minister|President|Speaker|Cabinet Secretary|Vice-President|Temporary Chair|Chair|Chief Whip|Government Whip|Opposition Whip|Assistant Treasurer)\b/;
function officeTitles(post) {
  const titles = [];
  for (const part of String(post || '').split(/,\s+/)) {
    const clean = part.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!clean) continue;
    if (titles.length && !TITLE_START.test(clean)) { titles[titles.length - 1] += `, ${clean}`; continue; }
    titles.push(clean);
  }
  return titles.flatMap(title => {
    const halves = title.split(/\s+(?:and|\/)\s+(?=(?:Shadow |Assistant |Deputy )*(?:Minister|Parliamentary Secretary|Leader|Manager)\b)/);
    return halves.length > 1 && halves.every(h => TITLE_START.test(h)) ? halves : [title];
  }).map(t => t.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
}

/**
 * The dated ways a passage can address a person besides their surname, from verified records only:
 * "member for <seat>" for each single-member seat in its service periods (electorates people.json),
 * and each complete office title in its Parliamentary Handbook spells (pay.json `spells`: "Prime
 * Minister", "Minister for Infrastructure, Transport, Regional Development and Local Government"), each
 * with the dates it was held and the party recorded with it. Upper-house seats are shared by a state's
 * senators, so they never identify one person.
 */
export function mentionAliases({ electorates = [], spells = [], party = '' } = {}) {
  const aliases = [];
  for (const seat of electorates || []) {
    if (!seat?.name || /senate|_lc$/.test(String(seat.chamber || ''))) continue;
    for (const period of seat.periods || []) aliases.push({ phrase: `member for ${seat.name}`, start: period?.start || '', end: period?.end || '', party: seat.party || party || '' });
  }
  for (const spell of spells || []) {
    const [start, end, post] = Array.isArray(spell) ? spell : [spell?.start, spell?.end, spell?.post];
    for (const title of officeTitles(post)) {
      if (!GENERIC_POSTS.has(title.toLowerCase())) aliases.push({ phrase: title, start: start || '', end: end || '', party: party || '' });
    }
  }
  return aliases;
}

/* The words just before an alias, in its own clause, decide whose it is. Any of these names someone
   else: "the youth member for Rankin", "the shadow minister", "the former Liberal Treasurer", "the state
   member for", "when I was the member for". When unsure, the passage is not counted: a hidden mention is
   a lesser harm than naming the wrong person. */
const OTHER_HOLDER = new Set(['youth', 'shadow', 'deputy', 'assistant', 'acting', 'former', 'then', 'next', 'future',
  'previous', 'past', 'late', 'ex', 'junior', 'student', 'state', 'would-be', 'aspiring']);
// The speaker describing themselves: "when I was the member for", "I'm the".
const FIRST_PERSON = /\b(?:i|we)\s+(?:was|were|am|are|have been|had been)(?:\s+the)?$|\bi'm(?:\s+the)?$/;
const STATES = /(?:^|\s)(?:new south wales|nsw|victoria|victorian|queensland|queenslander|qld|south australian|western australian|wa|sa|tasmania|tasmanian|northern territory|territory|act)$/;
const PARTIES = [['liberal', /liberal/], ['labor', /labor/], ['national', /national/], ['nationals', /national/], ['greens', /green/], ['green', /green/],
  ['lnp', /liberal national|lnp/], ['coalition', /liberal|national|lnp/], ['independent', /independent/]];
function qualifiedAway(before, alias) {
  // A comma closes an appositive ("the previous minister, the member for Greenway"): its qualifier is not this alias's.
  const clause = before.split(/[.,;:!?\n—–()]/).at(-1);
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(-4).map(w => w.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, ''));
  if (words.some(w => OTHER_HOLDER.has(w) || w.startsWith('ex-')) || FIRST_PERSON.test(words.join(' '))) return true;
  const party = foldMention(alias.party || '');
  if (words.some(w => PARTIES.some(([adjective, test]) => w === adjective && !(party && test.test(party))))) return true;
  return /^member for /.test(alias.phrase.toLowerCase()) && STATES.test(words.join(' '));
}

/** A mention row names the person when the passage the row shows (its first `shown` characters, as the
 *  row prints it) carries their surname as a whole word, or addresses them by a seat or complete office
 *  title from `aliases` (mentionAliases) that they held on the passage's date, with nothing in the words
 *  just before it that makes it someone else's. A later seat, a heading or another speaker's name, or a
 *  name cut off where the shown passage ends is not a mention of them a reader can see. */
export function mentionNamesPerson(row, name, { shown = 220, aliases = [] } = {}) {
  const passage = foldMention(String(row?.snippet || '').slice(0, shown));
  const word = phrase => new RegExp(`(^|[^\\p{L}'-])${escapeRegExp(foldMention(phrase))}($|[^\\p{L}])`, 'gu');
  const surname = foldMention(name).trim().split(/\s+/).at(-1);
  if (surname && surname.length >= 2 && word(surname).test(passage)) return true;
  const date = /^\d{4}-\d{2}-\d{2}/.exec(String(row?.date || ''))?.[0];
  if (!date) return false;
  return aliases.some(alias => {
    if (!alias?.phrase || !within(date, alias.start, alias.end)) return false;
    // Every occurrence is weighed: one plainly addressed use is enough.
    for (const found of passage.matchAll(word(alias.phrase))) {
      if (!qualifiedAway(passage.slice(0, found.index + found[1].length), alias)) return true;
    }
    return false;
  });
}
