import { assertAllowedPath } from '../../api/policy';
import { isMoreKind } from '../../features/search/contracts';
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
export const resultsRoute = (
  kind: string,
  filters: {
    group?: string;
    scope?: string;
    q?: string;
    speaker?: string;
  } = {},
  name?: string,
) => ({
  pathname: '/results/[kind]' as const,
  params: { kind, ...filters, ...(name ? { name } : {}) },
});
export const topicRoute = (
  slug: string,
  filters: Record<string, string> = {},
  name?: string,
) => ({
  pathname: '/topic/[slug]' as const,
  params: { slug, ...filters, ...(name ? { name } : {}) },
});
export const topicsRoute = { pathname: '/topics' as const };
