import { partySlug } from '../../design/party';
import { startPartyTiming } from '../../features/people/party-timing';

/** Where a profile link lands (people.md 2.1): the page scrolls there. */
export type PersonSection = 'votes' | 'interests' | 'pay' | 'changes';
/** Where a party link lands (people.md 2.2). */
export type PartySection = 'members' | 'receipts' | 'changes';

export const personRoute = (
  slug: string,
  name?: string,
  section?: PersonSection,
) => ({
  pathname: '/person/[slug]' as const,
  params: { slug, ...(name ? { name } : {}), ...(section ? { section } : {}) },
});
export const personVotesRoute = (slug: string, name?: string) => ({
  pathname: '/person/[slug]/votes' as const,
  params: { slug, ...(name ? { name } : {}) },
});
export const personSpeechesRoute = (slug: string, name?: string) => ({
  pathname: '/person/[slug]/speeches' as const,
  params: { slug, ...(name ? { name } : {}) },
});
export const personInterestsRoute = (slug: string, name?: string) => ({
  pathname: '/person/[slug]/interests' as const,
  params: { slug, ...(name ? { name } : {}) },
});
export const partyRoute = (name: string, section?: PartySection) => {
  startPartyTiming();
  return {
    pathname: '/party/[slug]' as const,
    params: { slug: partySlug(name), name, ...(section ? { section } : {}) },
  };
};
export const partySourcesRoute = (slug: string, name?: string) => ({
  pathname: '/party-sources' as const,
  params: { slug, ...(name ? { name } : {}) },
});
export const directoryRoute = (
  kind: 'person' | 'party' | 'electorate',
  name?: string,
) => ({
  pathname: '/directory' as const,
  params: { kind, ...(name ? { name } : {}) },
});
export const declarationsRoute = { pathname: '/declarations' as const };
/**
 * Expense categories (money.md 2.15): opens at `category`; from a profile it
 * also names that member's own amount there ("Anthony Albanese claimed
 * $1,204,330, 2017 to 2026").
 */
export const expenseGlossaryRoute = (
  opts: {
    category?: string;
    person?: string;
    amount?: number;
    years?: string;
  } = {},
) => ({
  pathname: '/expense-glossary' as const,
  params: {
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.person ? { person: opts.person } : {}),
    ...(opts.amount !== undefined ? { amount: String(opts.amount) } : {}),
    ...(opts.years ? { years: opts.years } : {}),
  },
});
