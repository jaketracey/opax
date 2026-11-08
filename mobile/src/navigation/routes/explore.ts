export const exploreRoute = { pathname: '/explore' as const };
export const exploreToolRoute = (
  tool: string,
  params: { q?: string; resume?: string; year?: string; photo?: string } = {},
  name?: string,
) => ({
  pathname: '/explore/[tool]' as const,
  params: { tool, ...params, ...(name ? { name } : {}) },
});
export const exploreQuizRoute = (q?: string) =>
  exploreToolRoute('quiz', { ...(q ? { q } : {}) });
export const explorePhotoRoute = (year: string, photo: string) => ({
  pathname: '/explore/photo' as const,
  params: { year, photo },
});
export const exploreTideTableRoute = (params: Record<string, string> = {}) => ({
  pathname: '/explore/tide-table' as const,
  params,
});
export const exploreYearsRoute = (year?: string) => ({
  pathname: '/explore/years' as const,
  params: { ...(year ? { year } : {}) },
});
export function exploreFromWebPath(path: string) {
  const url = new URL(path, 'https://opax.invalid');
  if (!/^\/explore\/?$/.test(url.pathname) || url.hash) return null;
  const tool = url.searchParams.get('game');
  if (!tool) return exploreRoute;
  if (!['quiz', 'tm', 'tide', 'matrix', 'wd'].includes(tool))
    return exploreRoute;
  const params = Object.fromEntries(
    ['q', 'resume', 'year', 'photo'].flatMap((key) =>
      url.searchParams.has(key) ? [[key, url.searchParams.get(key)!]] : [],
    ),
  );
  return exploreToolRoute(tool, params);
}
/**
 * The canonical web path for an Explore screen, for Share, Copy link and
 * Open on opax.com.au: "/explore", "/explore?game=quiz&q=q1a2b3c4d".
 */
export function exploreWebPath(
  tool?: string,
  params: Record<string, string | undefined> = {},
) {
  if (!tool) return '/explore';
  const query = new URLSearchParams({ game: tool });
  for (const [key, value] of Object.entries(params))
    if (value) query.set(key, value);
  return `/explore?${query}`;
}
/** Whether a stack already holds the hub, so an unknown tool returns to it. */
export function hubInStack(
  state: { routes?: readonly { name?: string }[] } | undefined,
) {
  return !!state?.routes?.some((route) => route.name === 'explore/index');
}
