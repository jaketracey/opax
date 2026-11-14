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
/** "Show me the basics": Parliament in a minute, before the electorate step. */
export const welcomeMinuteRoute = { pathname: '/welcome/minute' as const };
export const welcomeSeatStateRoute = (code: string) => ({
  pathname: '/welcome/seat/state/[code]' as const,
  params: { code },
});
