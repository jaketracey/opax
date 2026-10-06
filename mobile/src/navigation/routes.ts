import { partySlug } from '../design/party';
export const personRoute = (slug: string) => ({
  pathname: '/person/[slug]' as const,
  params: { slug },
});
export const billRoute = (key: string, section?: 'divisions') => ({
  pathname: '/bill/[key]' as const,
  params: { key, ...(section ? { section } : {}) },
});
// Alignment only. Associated Domains and native universal-link handling belong to a later lane.
export function fromWebPath(
  path: string,
): ReturnType<typeof personRoute> | ReturnType<typeof billRoute> | null {
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  if (match?.[1]) return personRoute(match[1]);
  const bill = /^\/bill\/([a-z0-9-]+)\/?$/.exec(path);
  return bill?.[1] ? billRoute(bill[1]) : null;
}
// Reserved Talk sheet presentation seam; no permission or transport is installed.
export const voiceSlot = { enabled: false, module: 'src/voice' } as const;

export const electorateRoute = (id: string) => ({
  pathname: '/electorate/[id]' as const,
  params: { id },
});

export const partyRoute = (name: string) => ({
  pathname: '/party/[slug]' as const,
  params: { slug: partySlug(name), name },
});
// Leads and the declared-interests feed (P1), opened from Today.
export const leadsRoute = { pathname: '/leads' as const };
export const leadRoute = (id: string) => ({
  pathname: '/lead/[id]' as const,
  params: { id },
});
export const declarationsRoute = { pathname: '/declarations' as const };
// Local follows: the list and its management, pushed within the current tab.
export const followsRoute = '/follows';
export const moneyRoute = (party?: string | null, jurisdiction = 'federal') => {
  const state = ['qld', 'vic', 'tas'].find(
    (key) => jurisdiction === key || jurisdiction === `au-${key}`,
  );
  const params = {
    ...(party ? { focus: `party:${party}` } : {}),
    ...(state ? { jurisdiction: state } : {}),
  };
  return {
    pathname: '/money' as const,
    ...(Object.keys(params).length ? { params } : {}),
  };
};
