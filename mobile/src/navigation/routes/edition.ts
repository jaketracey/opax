/** The native reader, also used for editions whose subjects are web reports. */
export const editionRoute = (id?: string, name?: string) => ({
  pathname: '/edition' as const,
  params: { ...(id ? { id } : {}), ...(name ? { name } : {}) },
});
