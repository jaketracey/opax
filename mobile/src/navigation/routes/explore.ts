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
