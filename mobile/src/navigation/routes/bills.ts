// The legacy second argument 'divisions' stays valid for existing callers.
export const billRoute = (
  key: string,
  name?: string,
  options: { division?: string; section?: 'divisions' | 'changes' } = {},
) => ({
  pathname: '/bill/[key]' as const,
  params: {
    key,
    ...(name === 'divisions' ? { section: 'divisions' } : name ? { name } : {}),
    ...options,
  },
});
export const billListRoute = (
  filters: {
    scope?: string;
    year?: string;
    sort?: string;
    q?: string;
    /** '1' puts the cursor in the search field. */
    focus?: string;
  } = {},
  name?: string,
) => ({
  pathname: '/bill-list' as const,
  params: { ...filters, ...(name ? { name } : {}) },
});
export const divisionHistoryRoute = { pathname: '/division-history' as const };
