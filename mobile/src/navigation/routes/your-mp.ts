export const yourMPRoute = { pathname: '/your-mp' as const };
export const electorateRoute = (
  id: string,
  asof?: string,
  name?: string,
  section?: 'changes',
) => ({
  pathname: '/electorate/[id]' as const,
  params: {
    id,
    ...(asof ? { asof } : {}),
    ...(name ? { name } : {}),
    ...(section ? { section } : {}),
  },
});
export const membersRoute = (seat: string, name?: string) => ({
  pathname: '/members' as const,
  params: { seat, ...(name ? { name } : {}) },
});
export const electionRoute = (seat: string, key: string, name?: string) => ({
  pathname: '/election' as const,
  params: { seat, key, ...(name ? { name } : {}) },
});
export const electorateDateRoute = (
  id: string,
  asof?: string,
  name?: string,
) => ({
  pathname: '/electorate-date' as const,
  params: { id, ...(asof ? { asof } : {}), ...(name ? { name } : {}) },
});
export const followsRoute = '/follows';
