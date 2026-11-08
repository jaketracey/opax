export const voiceSlot = { enabled: true, module: 'src/voice' } as const;
export const accountRoute = { pathname: '/account' as const };
export const voiceConsentRoute = { pathname: '/account/consent' as const };
type SignInReturn = 'account' | 'talk' | 'dismiss';
/** Sign in from Account (1.5); `dismiss` closes the sheet when it finishes. */
export const signInRoute = (to?: SignInReturn) => ({
  pathname: '/account/sign-in' as const,
  params: { ...(to ? { return: to } : {}) },
});
export const signInCodeRoute = (
  email?: string,
  challenge?: string,
  to?: SignInReturn,
) => ({
  pathname: '/account/sign-in/code' as const,
  params: {
    ...(email ? { email } : {}),
    ...(challenge ? { challenge } : {}),
    ...(to ? { return: to } : {}),
  },
});
export const deleteRoute = { pathname: '/account/delete' as const };
export const deleteCodeRoute = { pathname: '/account/delete/code' as const };
export const deleteCodeRouteFor = (challenge: string) => ({
  pathname: '/account/delete/code' as const,
  params: { challenge },
});
export const talkRoute = { pathname: '/talk' as const };
export const talkConsentRoute = { pathname: '/talk/consent' as const };
export const talkSourcesRoute = { pathname: '/talk/sources' as const };
export const talkRecordRoute = { pathname: '/talk/record' as const };
/** A native record pushed inside Talk during or after a call (7.4). */
export const talkRecordRouteFor = (path: string) => ({
  pathname: '/talk/record' as const,
  params: { path },
});
export const talkSignInRoute = { pathname: '/talk/sign-in' as const };
export const talkSignInCodeRoute = (
  email?: string,
  challenge?: string,
  to?: SignInReturn,
) => ({
  pathname: '/talk/sign-in/code' as const,
  params: {
    ...(email ? { email } : {}),
    ...(challenge ? { challenge } : {}),
    ...(to ? { return: to } : {}),
  },
});
