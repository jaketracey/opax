import type { Roster, RosterPerson, Slugs } from '../../api/catalog-decoders';
import type { EditionView } from '../../api/selectors';
import { partyIdentity } from '../../design/party';
import type { SourceDetails } from '../../design/source';
import { sponsorKey, sponsorSlug } from '../bills/sponsors';
import { editionPerson, editionSources } from '../edition/model';
import { featuredHook } from './featured-hook';
import { daysBetween } from './rules';

export const FEATURED_PEOPLE_RULE =
  'The daily edition’s featured parliamentarian, followed by a daily rotation of current federal members from the parliamentary roster. One member per political group, with Coalition parties sharing a group. Members rotate by edition date, without ranking speech counts.';

export interface FeaturedPerson {
  slug: string;
  group: string;
  edition: EditionView;
  source: SourceDetails;
}

/** Aliases share a quota; Coalition parties cannot occupy multiple places. */
export function featuredGroup(party: string): string {
  const short = partyIdentity(party).short.toLocaleUpperCase('en-AU');
  if (['LIB', 'NAT', 'LNP', 'CLP', 'LP', 'NP', 'COALITION'].includes(short))
    return 'coalition';
  if (['ALP', 'LABOR'].includes(short)) return 'labor';
  if (['GRN', 'GRN.', 'GREENS'].includes(short)) return 'greens';
  if (['IND', 'INDEPENDENT', 'INDEPENDENTS'].includes(short))
    return 'independent';
  return short.toLocaleLowerCase('en-AU');
}

const rotate = <T>(items: T[], day: number): T[] => {
  if (!items.length) return [];
  const start = ((day % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
};

/**
 * The edition schema publishes one subject, so extra cards come from the
 * existing roster, dated and attributed to that roster. No claim of new
 * records today, no additional person-detail requests, no popularity rank.
 */
export function featuredPeople(
  edition: EditionView,
  roster: Roster,
  slugs: Slugs,
): FeaturedPerson[] {
  if (edition.kind !== 'politician') return [];
  const firstSlug = sponsorSlug(edition.title, roster, slugs);
  const first = roster.people.find(
    (person) => sponsorKey(person.name) === sponsorKey(edition.title),
  );
  const firstParty = first?.party_now?.trim() || first?.party?.trim();
  // Keep the existing card when identity or affiliation cannot be verified.
  if (!firstSlug || !firstParty) return [];
  const firstSeat = first?.representation?.find(
    (seat) => seat.jurisdiction === 'federal',
  );
  // The edition's own line reads "Name: 414 speeches in the Opax record.",
  // which repeats the title. Cards share one hook line; with no federal seat
  // the name prefix is dropped and the brand is written OPAX.
  const firstHook = firstSeat
    ? featuredHook({
        chamber: firstSeat.chamber,
        electorate: firstSeat.electorate,
        state: firstSeat.state,
        speeches: first?.speeches,
      })
    : '';
  const own = edition.paragraphs[0]
    ?.replace(
      new RegExp(
        `^${edition.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`,
      ),
      '',
    )
    .replace(/\bOpax\b/g, 'OPAX');
  const lead = firstHook || own;
  const result: FeaturedPerson[] = [
    {
      slug: firstSlug,
      group: featuredGroup(editionPerson(edition).party ?? firstParty),
      edition: lead
        ? { ...edition, paragraphs: [lead, ...edition.paragraphs.slice(1)] }
        : edition,
      source: { ...editionSources(edition), rule: FEATURED_PEOPLE_RULE },
    },
  ];
  const groups = new Map<string, { person: RosterPerson; slug: string }[]>();
  const seen = new Set([firstSlug]);
  for (const person of roster.people) {
    const party = person.party_now?.trim() || person.party?.trim();
    if (
      person.current !== true ||
      !party ||
      !person.representation?.some((seat) => seat.jurisdiction === 'federal')
    )
      continue;
    const group = featuredGroup(party);
    if (group === result[0]!.group) continue;
    const slug = sponsorSlug(person.name, roster, slugs, person.pid);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const members = groups.get(group) ?? [];
    members.push({ person, slug });
    groups.set(group, members);
  }
  const day = daysBetween('2026-01-01', edition.date.slice(0, 10));
  for (const group of rotate([...groups.keys()].sort(), day).slice(0, 4)) {
    const members = groups
      .get(group)!
      .sort((a, b) => a.slug.localeCompare(b.slug, 'en-AU'));
    const { person, slug } = rotate(members, day)[0]!;
    const seat = person.representation!.find(
      (seat) => seat.jurisdiction === 'federal',
    )!;
    const paragraph =
      featuredHook({
        chamber: seat.chamber,
        electorate: seat.electorate,
        state: seat.state,
        speeches: person.speeches,
      }) || 'Explore their parliamentary record.';
    result.push({
      slug,
      group,
      edition: {
        ...edition,
        title: person.name,
        cardTitle: person.name,
        shortTitle: null,
        path: `/person/${slug}`,
        paragraphs: [paragraph],
        machineWritten: null,
        sourceRows: [],
        facts: {
          kicker: 'Parliamentarian',
          line: person.party_now?.trim() || person.party!.trim(),
          figures: [],
          bars: null,
          events: [],
          division: null,
        },
      },
      source: {
        asOf: roster.meta.generated,
        citation: 'OPAX parliamentary roster',
        originals: [
          {
            label: 'OPAX parliamentary roster',
            url: '/parliamentarians.json',
            asOf: roster.meta.generated,
          },
        ],
        rule: FEATURED_PEOPLE_RULE,
      },
    });
  }
  return result;
}
