/** A draft in native Ask. Arrival never submits a paid request. */
export const askRoute = (
  scope: {
    question: string;
    speaker?: string;
    party?: string;
    state?: string;
    topic?: string;
    from?: string;
    to?: string;
    kind?: string;
  },
  name?: string,
) => ({
  pathname: '/ask' as const,
  params: {
    ...scope,
    ...(name ? { name } : {}),
    entry: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  },
});
export const askConsentRoute = { pathname: '/consent' as const };
export const askFiltersRoute = { pathname: '/filters/ask' as const };
export const conversationsRoute = { pathname: '/conversations' as const };
export const askReportRoute = (turn: string) => ({
  pathname: '/ask-report' as const,
  params: { turn },
});
export const askAccountRoute = { pathname: '/account/ask' as const };
