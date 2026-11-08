export const editionRoute = (id?: string, name?: string) => ({
  pathname: '/edition' as const,
  params: { ...(id ? { id } : {}), ...(name ? { name } : {}) },
});
