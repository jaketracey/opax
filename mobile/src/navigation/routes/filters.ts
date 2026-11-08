export type FilterList =
  | 'bills'
  | 'divisions'
  | 'directory'
  | 'declarations'
  | 'connections'
  | 'search'
  | 'ask'
  | 'money'
  | 'allocation';
export const filtersRoute = (list: FilterList, owner?: string) => ({
  pathname: '/filters/[list]' as const,
  params: { list, ...(owner ? { owner } : {}) },
});
export const filterFacetRoute = (
  list: FilterList,
  facet: string,
  owner?: string,
) => ({
  pathname: '/filters/[list]/[facet]' as const,
  params: { list, facet, ...(owner ? { owner } : {}) },
});
