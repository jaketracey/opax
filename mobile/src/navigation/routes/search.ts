import { assertAllowedPath } from '../../api/policy';
import { isMoreKind } from '../../features/search/contracts';
import { capQuery, targetForWebKind } from '../../features/search/scopes';

/** Speech filters a pushed results list carries (request keys unchanged). */
export type ResultsParams = {
  group?: string;
  scope?: string;
  q?: string;
  /** Recorded entity spellings for the reader, never sent to search APIs. */
  aliases?: string;
  speaker?: string;
  party?: string;
  state?: string;
  topic?: string;
  from?: string;
  to?: string;
  /** `all` widens Speeches to every parliamentary record type. */
  type?: string;
  mode?: string;
  sort?: string;
  /** The query arrived by link: it never enters Recent. */
  link?: string;
};

/**
 * `/results/[kind]`: one pushed route in every stack (journeys/search.md
 * 4.3). `kind` is a scope (`all`, `people`, `bills`, `speeches`) or a list
 * (`interests`, `grants`, …); singular names (`speech`) are accepted.
 */
export const resultsRoute = (
  kind: string,
  filters: ResultsParams = {},
  name?: string,
) => ({
  pathname: '/results/[kind]' as const,
  params: {
    kind,
    ...Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
    ),
    ...(name ? { name } : {}),
  },
});

/**
 * A shared opax.com.au search link, submitted (journeys/search.md 4.5): in
 * the app it pushes `/results` in the current tab and the read runs, the tap
 * on the link being the explicit action. The query is capped at 100
 * characters on a word boundary, and the web `kind` maps to a scope or list.
 */
export function searchRouteFromWebPath(
  path: string,
): ReturnType<typeof resultsRoute> | null {
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
  const kind = p.get('kind');
  const target = targetForWebKind(
    kind === 'all' && !query.includes('kind=') ? null : kind,
    p.get('speaker'),
  );
  const filters: ResultsParams = { q: capQuery(p.get('q') ?? ''), link: '1' };
  for (const key of [
    'speaker',
    'party',
    'state',
    'topic',
    'from',
    'to',
    'mode',
    'sort',
  ] as const)
    if (p.get(key)) filters[key] = p.get(key)!;
  if (target.scope === 'speeches' && kind && !['speech', 'all'].includes(kind))
    filters.type = kind === 'press_release' ? kind : 'all';
  return target.group
    ? resultsRoute(target.group, { ...filters, group: target.group })
    : resultsRoute(target.scope, filters);
}

/** Filters a topic page reads (specs/search.md 5.2.1, the arrivals table). */
export type TopicFilters = {
  from?: string;
  to?: string;
  state?: string;
  party?: string;
  debate?: string;
};
export const topicRoute = (
  slug: string,
  filters: TopicFilters | Record<string, string> = {},
  name?: string,
) => ({
  pathname: '/topic/[slug]' as const,
  params: { slug, ...filters, ...(name ? { name } : {}) },
});
export const topicsRoute = { pathname: '/topics' as const };
