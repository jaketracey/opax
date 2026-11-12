/**
 * The record reader. `q` and `match` come only from an in-app search result
 * (the find bar's query and current match); `cite` opens Citation formats
 * over the record once it has loaded (the `opax://doc-cite/<slug>` link).
 */
export const docRoute = (
  slug: string,
  name?: string,
  open: {
    q?: string;
    match?: number;
    cite?: boolean;
    passage?: string;
    find?: 'auto';
  } = {},
) => ({
  pathname: '/doc/[slug]' as const,
  params: {
    slug,
    ...(name ? { name } : {}),
    ...(open.q ? { q: open.q } : {}),
    ...(open.q && open.find ? { find: open.find } : {}),
    ...(open.q && open.match != null ? { match: String(open.match) } : {}),
    ...(open.cite ? { cite: '1' } : {}),
    ...(open.passage ? { passage: open.passage.slice(0, 4000) } : {}),
  },
});
export const citeRoute = (slug: string, name?: string) => ({
  pathname: '/doc-cite/[slug]' as const,
  params: { slug, ...(name ? { name } : {}) },
});
export const billTextRoute = (
  key: string,
  version?: string,
  name?: string,
) => ({
  pathname: '/bill-text/[key]' as const,
  params: { key, ...(version ? { version } : {}), ...(name ? { name } : {}) },
});
export const billTextContentsRoute = (key: string, version?: string) => ({
  pathname: '/bill-text-contents/[key]' as const,
  params: { key, ...(version ? { version } : {}) },
});
export const recordListRoute = (
  filters: { person?: string; party?: string; kind?: string },
  name?: string,
) => ({
  pathname: '/record-list' as const,
  params: { ...filters, ...(name ? { name } : {}) },
});
export const recentRecordsRoute = {
  pathname: '/recent-records' as const,
  params: {},
};
export const reportRoute = (slug: string, name?: string) => ({
  pathname: '/report/[slug]' as const,
  params: { slug, ...(name ? { name } : {}) },
});
