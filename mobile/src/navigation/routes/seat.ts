export const seatRoute = (scope?: string, locate?: boolean) => ({
  pathname: '/seat' as const,
  params: { ...(scope ? { scope } : {}), ...(locate ? { locate: '1' } : {}) },
});
export const seatStateRoute = (code: string) => ({
  pathname: '/seat/state/[code]' as const,
  params: { code },
});
/**
 * `short`: the link-first welcome (Continue only, no seat step).
 * `entry: 'launch'`: presented by the root on a first launch, with no
 * animation, straight out of the splash; a replay slides up.
 */
export const welcomeRoute = (short = false, entry?: 'launch') => ({
  pathname: '/welcome' as const,
  params: {
    ...(short ? { short: '1' } : {}),
    ...(entry ? { entry } : {}),
  },
});
export const welcomeSeatRoute = (locate = false) => ({
  pathname: '/welcome/seat' as const,
  params: { ...(locate ? { locate: '1' } : {}) },
});
export const welcomeSeatStateRoute = (code: string) => ({
  pathname: '/welcome/seat/state/[code]' as const,
  params: { code },
});
/** Newcomer design pass (prototype): option A's cards and option C's page. */
export const welcomeTourRoute = { pathname: '/welcome/tour' as const };
export const welcomeBasicsRoute = { pathname: '/welcome/basics' as const };
