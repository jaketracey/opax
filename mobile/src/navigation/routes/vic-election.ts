export const vicElectionRoute = (q?: string) => ({
  pathname: '/vic-election' as const,
  params: q ? { q: q.slice(0, 60) } : {},
});
export const vicSeatRoute = (district: string) => ({
  pathname: '/vic-election/[district]' as const,
  params: { district },
});
