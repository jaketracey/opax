import { partySlug } from '../../design/party';
import { startPartyTiming } from '../../features/people/party-timing';
export const personRoute = (
  slug: string,
  name?: string,
  section?: 'votes' | 'interests' | 'pay' | 'changes',
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
export const partyRoute = (name: string, section?: 'changes') => {
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
export const expenseGlossaryRoute = {
  pathname: '/expense-glossary' as const,
  params: {},
};
