export const docRoute = (slug: string, name?: string) => ({
  pathname: '/doc/[slug]' as const,
  params: { slug, ...(name ? { name } : {}) },
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
