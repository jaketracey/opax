export type FilterList =
  | 'bills'
  | 'divisions'
  | 'directory'
  | 'declarations'
  | 'connections'
  | 'search'
  | 'money'
  | 'allocation';
export const filtersRoute = (list: FilterList, owner?: string) => ({
  pathname: `/filters/${list}` as const,
  params: { ...(owner ? { owner } : {}) },
});
export const filterFacetRoute = (
  list: FilterList,
  facet: string,
  owner?: string,
) => ({
  pathname: `/filters/${list}/[facet]` as const,
  params: { facet, ...(owner ? { owner } : {}) },
});
