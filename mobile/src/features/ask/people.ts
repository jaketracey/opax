import type { Roster, Slugs } from '../../api/catalog-decoders';
import { rosterPeople, type Answer } from './model';

export type AskPerson = {
  name: string;
  slug: string;
  party: string | null;
  place: string | null;
};
const states: Record<string, string> = {
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  wa: 'Western Australia',
  sa: 'South Australia',
  tas: 'Tasmania',
  act: 'Australian Capital Territory',
  nt: 'Northern Territory',
};
const stateName = (raw: string | null | undefined) =>
  raw ? (states[raw.trim().toLowerCase()] ?? raw.trim()) : '';
/**
 * "Member for Clark, Tasmania" / "Senator for Tasmania", from the roster.
 * Ask holds only the roster, whose `current` flag is set for some people
 * and absent for the rest. "Member for" is said only where it is true,
 * "Former member for" only where it is false; where it is absent the line
 * names the seat alone ("Watson, New South Wales", "Senate, Tasmania") and
 * claims nothing about service.
 */
export function placeLine(person: Roster['people'][number]): string | null {
  const seats = (person.representation ?? []).filter(
    (r) => r.jurisdiction === 'federal',
  );
  const seat = seats.at(-1);
  if (!seat) return null;
  const state = stateName(seat.state ?? person.states?.at(-1));
  const said = (claim: string, former: string, plain: string) =>
    person.current === true ? claim : person.current === false ? former : plain;
  if (/senate/i.test(seat.chamber))
    return state
      ? said(
          `Senator for ${state}`,
          `Former senator for ${state}`,
          `Senate, ${state}`,
        )
      : null;
  if (!seat.electorate) return null;
  const where = `${seat.electorate}${state ? `, ${state}` : ''}`;
  return said(`Member for ${where}`, `Former member for ${where}`, where);
}
/** Roster name → the person row's data; the only names People lists. */
export function rosterProfiles(roster: Roster, slugs: Slugs) {
  const known = rosterPeople(roster, slugs);
  const out = new Map<string, AskPerson>();
  for (const p of roster.people) {
    const slug = known.get(p.name);
    if (!slug) continue;
    out.set(p.name, {
      name: p.name,
      slug,
      party: p.party_now || p.party || null,
      place: placeLine(p),
    });
  }
  return out;
}
const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
/**
 * People in this answer, in the order the answer cites them: each person's
 * first citation mark in the text; people named without a citation follow in
 * order of first mention; ties by surname. Never by party, office or
 * prominence (a neutrality rule, specs/ask.md 2.5).
 */
export function peopleInAnswer(
  answer: Answer,
  profiles: Map<string, AskPerson>,
): AskPerson[] {
  const points = Array.from(answer.answer);
  const first = new Map<string, number>();
  for (const s of answer.sources) {
    if (!s.cited || !s.speaker || !profiles.has(s.speaker)) continue;
    const at = Math.min(
      ...s.answerRanges.map(([, end]) => Math.min(end, points.length)),
      Number.MAX_SAFE_INTEGER,
    );
    first.set(s.speaker, Math.min(first.get(s.speaker) ?? Infinity, at));
  }
  const cited = [...first.entries()]
    .sort((a, b) => a[1] - b[1] || surname(a[0]).localeCompare(surname(b[0])))
    .map(([name]) => profiles.get(name)!);
  const text = answer.answer;
  const named = answer.sources
    .flatMap((s) =>
      s.speaker &&
      profiles.has(s.speaker) &&
      !first.has(s.speaker) &&
      text.includes(s.speaker)
        ? [s.speaker]
        : [],
    )
    .filter((name, i, all) => all.indexOf(name) === i)
    .sort(
      (a, b) =>
        text.indexOf(a) - text.indexOf(b) ||
        surname(a).localeCompare(surname(b)),
    )
    .map((name) => profiles.get(name)!);
  return [...cited, ...named];
}
