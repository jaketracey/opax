export const seatRoute = (scope?: string, locate?: boolean) => ({
  pathname: '/seat' as const,
  params: { ...(scope ? { scope } : {}), ...(locate ? { locate: '1' } : {}) },
});
export const seatStateRoute = (code: string) => ({
  pathname: '/seat/state/[code]' as const,
  params: { code },
});
export const welcomeRoute = (short = false) => ({
  pathname: '/welcome' as const,
  params: { ...(short ? { short: '1' } : {}) },
});
export const welcomeSeatRoute = (locate = false) => ({
  pathname: '/welcome/seat' as const,
  params: { ...(locate ? { locate: '1' } : {}) },
});
export const welcomeSeatStateRoute = (code: string) => ({
  pathname: '/welcome/seat/state/[code]' as const,
  params: { code },
});
