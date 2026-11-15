import type { PeopleCatalog, Roster, Slugs } from '../../api/catalog-decoders';
import {
  datedPeopleByRosterId,
  federalServiceStatus,
  recordedFederalOnly,
  type PartyStatus,
} from '../../api/party-transforms';
import type { Catalogs } from '../../api/catalogs';
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
 * claims nothing about service. A former federal member who now sits in a
 * state parliament is flagged current for that seat: Ask has no dated seats
 * to tell the two apart, so it names the federal seat alone for anyone the
 * roster also records in a state parliament.
 */
export function placeLine(
  person: Roster['people'][number],
  /**
   * What the dated record says of the person's federal service, when Ask
   * has the people catalogue (`rosterProfiles`). Without it the roster's
   * flag alone decides, as before.
   */
  status?: PartyStatus,
): string | null {
  const seats = (person.representation ?? []).filter(
    (r) => r.jurisdiction === 'federal',
  );
  const seat = seats.at(-1);
  if (!seat) return null;
  const state = stateName(seat.state ?? person.states?.at(-1));
  // The roster's `current` means sitting in any parliament it covers. For
  // someone it also records in a state parliament, true may be the state
  // seat, so alone it claims no federal one: the seat is named alone.
  const sits = person.current === true && recordedFederalOnly(person);
  const known: PartyStatus =
    status ??
    (sits ? 'current' : person.current === false ? 'former' : 'unknown');
  const said = (claim: string, former: string, plain: string) =>
    known === 'current' ? claim : known === 'former' ? former : plain;
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
/**
 * The people catalogue for Ask's place lines: the manifest, then the people
 * file it names, both through the catalog cache as Search reads them. Any
 * failure is null: the rows are then drawn from the roster alone.
 */
export async function askPeopleCatalog(
  source: Pick<Catalogs, 'manifest' | 'people'>,
): Promise<PeopleCatalog | null> {
  try {
    const manifest = await source.manifest();
    return (await source.people(manifest.data)).data;
  } catch {
    return null;
  }
}
/** Roster name → the person row's data; the only names People lists. */
/**
 * With the people catalogue (the read Search already makes), each row's
 * place line rests on the dated federal seats as well as the roster's flag,
 * as in Search: a sitting federal member the roster also records in a state
 * parliament reads "Member for", not the seat alone. Without it (the read
 * is missing or failed) every line is as the roster alone gives it.
 */
export function rosterProfiles(
  roster: Roster,
  slugs: Slugs,
  people?: PeopleCatalog | null,
) {
  const known = rosterPeople(roster, slugs);
  const dated = people ? datedPeopleByRosterId(people) : null;
  const out = new Map<string, AskPerson>();
  for (const p of roster.people) {
    const slug = known.get(p.name);
    if (!slug) continue;
    out.set(p.name, {
      name: p.name,
      slug,
      party: p.party_now || p.party || null,
      place: placeLine(
        p,
        dated
          ? federalServiceStatus(
              p,
              p.pid ? dated.get(p.pid) : undefined,
              people,
            )
          : undefined,
      ),
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
