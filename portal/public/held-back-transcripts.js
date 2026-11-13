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

const foldMention = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase();
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const within = (date, start, end) => Boolean(date) && (!start || date >= start) && (!end || date <= end);
// A title after one of these is someone else's office ("the Shadow Treasurer", "the former Prime Minister").
const NOT_THE_HOLDER = /(?:shadow|deputy|assistant|acting|former|then|next|future)\s+$/;
const GENERIC_POSTS = new Set(['member of parliament', 'senator']);

/**
 * The dated ways a passage can address a person besides their surname, from verified records only:
 * "member for <seat>" for each single-member seat in its service periods (electorates people.json),
 * and each office in its Parliamentary Handbook spells (pay.json `spells`, "Prime Minister",
 * "Treasurer"), each with the dates it was held. Upper-house seats are shared by a state's senators,
 * so they never identify one person.
 */
export function mentionAliases({ electorates = [], spells = [] } = {}) {
  const aliases = [];
  for (const seat of electorates || []) {
    if (!seat?.name || /senate|_lc$/.test(String(seat.chamber || ''))) continue;
    for (const period of seat.periods || []) aliases.push({ phrase: `member for ${seat.name}`, start: period?.start || '', end: period?.end || '' });
  }
  for (const spell of spells || []) {
    const [start, end, post] = Array.isArray(spell) ? spell : [spell?.start, spell?.end, spell?.post];
    for (const office of String(post || '').split(/,\s+(?=[A-Z])/)) {
      const title = office.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (title && !GENERIC_POSTS.has(title.toLowerCase())) aliases.push({ phrase: title, start: start || '', end: end || '' });
    }
  }
  return aliases;
}

/** A mention row names the person when the passage the row shows (its first `shown` characters, as the
 *  row prints it) carries their surname as a whole word, or addresses them by a seat or office from
 *  `aliases` (mentionAliases) that they held on the passage's date. A title held by someone else on
 *  that date, a later seat, a heading or another speaker's name, or a name cut off where the shown
 *  passage ends is not a mention of them a reader can see. */
export function mentionNamesPerson(row, name, { shown = 220, aliases = [] } = {}) {
  const passage = foldMention(String(row?.snippet || '').slice(0, shown));
  const word = phrase => new RegExp(`(^|[^\\p{L}'])${escapeRegExp(foldMention(phrase))}($|[^\\p{L}])`, 'u');
  const surname = foldMention(name).trim().split(/\s+/).at(-1);
  if (surname && surname.length >= 2 && word(surname).test(passage)) return true;
  const date = /^\d{4}-\d{2}-\d{2}/.exec(String(row?.date || ''))?.[0];
  if (!date) return false;
  return aliases.some(alias => {
    if (!alias?.phrase || !within(date, alias.start, alias.end)) return false;
    const found = word(alias.phrase).exec(passage);
    return Boolean(found) && !NOT_THE_HOLDER.test(passage.slice(0, found.index + found[1].length));
  });
}
