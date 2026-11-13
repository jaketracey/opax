/**
 * A question for native Ask. A link (deep or shared) only drafts it: arriving
 * from outside the app never submits a paid request. In-app taps decide at
 * the tap: a shown question asks at once (`useAskNow`), a generic Ask drafts
 * (`useOpenAsk`).
 */
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
/**
 * Ask in the Ask tab's own stack. A tapped question switches there
 * (`useAskNow`); `askRoute` alone resolves to the browsing tab's copy.
 */
export const askTabPath = '/(tabs)/(ask)/ask' as const;
export const askConsentRoute = { pathname: '/consent' as const };
export const conversationsRoute = { pathname: '/conversations' as const };
/** `source`: a cited source's number, when reported from `/citation`. */
export const askReportRoute = (turn: string, source?: number) => ({
  pathname: '/ask-report' as const,
  params: { turn, ...(source ? { source: String(source) } : {}) },
});
export const askAccountRoute = { pathname: '/account/ask' as const };
