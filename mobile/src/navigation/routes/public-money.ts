export const publicMoneyRoute = { pathname: '/public-money' as const };
export const leadsRoute = { pathname: '/leads' as const };
export const leadRoute = (id: string, name?: string) => ({
  pathname: '/lead/[id]' as const,
  params: { id, ...(name ? { name } : {}) },
});
export const moneyRecordRoute = (
  params: Record<string, string | string[] | undefined>,
  name?: string,
) => ({
  pathname: '/money-record' as const,
  params: { ...params, ...(name ? { name } : {}) },
});
export const moneyItemRoute = (
  params: Record<string, string>,
  name?: string,
) => ({
  pathname: '/money-item' as const,
  params: { ...params, ...(name ? { name } : {}) },
});
export const moneyDonorsRoute = (
  params: Record<string, string> = {},
  name?: string,
) => ({
  pathname: '/money-donors' as const,
  params: { ...params, ...(name ? { name } : {}) },
});
export const fundingBySeatTypeRoute = {
  pathname: '/funding-by-seat-type' as const,
};
export const agencyListRoute = (id: string, kind: string, name?: string) => ({
  pathname: '/agency-list' as const,
  params: { id, kind, ...(name ? { name } : {}) },
});
export const connectionRoute = (id: string, name?: string) => ({
  pathname: '/connection' as const,
  params: { id, ...(name ? { name } : {}) },
});
export const grantsRoute = (params: Record<string, string> = {}) => ({
  pathname: '/grants' as const,
  params,
});
export const grantProgramRoute = (
  id: string,
  jur = 'federal',
  name?: string,
  /** A seat view of the program: `seat` and `state` (specs/money.md 2.4). */
  seat?: { seat: string; state: string },
) => ({
  pathname: '/grant-program' as const,
  params: { id, jur, ...(name ? { name } : {}), ...(seat ?? {}) },
});
export const largestGrantsRoute = (month?: string) => ({
  pathname: '/largest-grants' as const,
  params: { ...(month ? { month } : {}) },
});
export const agenciesRoute = { pathname: '/agencies' as const };
export const agencyRoute = (id: string, name?: string) => ({
  pathname: '/agency' as const,
  params: { id, ...(name ? { name } : {}) },
});
export const connectionsRoute = { pathname: '/connections' as const };
export const grantsAllocationRoute = {
  pathname: '/grants-allocation' as const,
};
