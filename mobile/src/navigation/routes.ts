import { partySlug } from '../design/party';
import { assertAllowedPath } from '../api/policy';
import { isMoreKind } from '../features/search/contracts';
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
):
  | ReturnType<typeof personRoute>
  | ReturnType<typeof billRoute>
  | { pathname: '/search'; params: Record<string, string> }
  | null {
  const search = searchRouteFromWebPath(path);
  if (search) return search;
  const match = /^\/subject\/person\/([a-z0-9-]+)\/?$/.exec(path);
  if (match?.[1]) return personRoute(match[1]);
  const bill = /^\/bill\/([a-z0-9-]+)\/?$/.exec(path);
  return bill?.[1] ? billRoute(bill[1]) : null;
}

/** A shared search opens a draft. Mounting this route never submits it. */
export function searchRouteFromWebPath(
  path: string,
): { pathname: '/search'; params: Record<string, string> } | null {
  const [pathname, query] = path.split('?');
  if (
    pathname !== '/ask' ||
    !query ||
    path.split('?').length !== 2 ||
    path.includes('#')
  )
    return null;
  const p = new URLSearchParams(query);
  if (p.get('view') !== 'search' || p.getAll('view').length !== 1) return null;
  p.delete('view');
  if (!p.get('q') && p.get('speaker')) p.set('q', p.get('speaker')!);
  if (!p.get('kind')) p.set('kind', 'all');
  try {
    assertAllowedPath(
      `${isMoreKind(p.get('kind')!) ? '/api/search-all' : '/api/search'}?${p}`,
    );
  } catch {
    return null;
  }
  return { pathname: '/search', params: Object.fromEntries(p) };
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
