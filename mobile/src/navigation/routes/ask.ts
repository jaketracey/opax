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
export const conversationsRoute = { pathname: '/conversations' as const };
/** `source`: a cited source's number, when reported from `/citation`. */
export const askReportRoute = (turn: string, source?: number) => ({
  pathname: '/ask-report' as const,
  params: { turn, ...(source ? { source: String(source) } : {}) },
});
export const askAccountRoute = { pathname: '/account/ask' as const };
