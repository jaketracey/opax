export const voiceSlot = { enabled: true, module: 'src/voice' } as const;
export const accountRoute = { pathname: '/account' as const };
export const voiceConsentRoute = { pathname: '/account/consent' as const };
export const signInCodeRoute = (email?: string) => ({
  pathname: '/account/sign-in/code' as const,
  params: { ...(email ? { email } : {}) },
});
export const deleteCodeRoute = { pathname: '/account/delete/code' as const };
export const talkRoute = { pathname: '/talk' as const };
export const talkConsentRoute = { pathname: '/talk/consent' as const };
export const talkSourcesRoute = { pathname: '/talk/sources' as const };
export const talkRecordRoute = { pathname: '/talk/record' as const };
export const talkSignInRoute = { pathname: '/talk/sign-in' as const };
export const talkSignInCodeRoute = (email?: string) => ({
  pathname: '/talk/sign-in/code' as const,
  params: { ...(email ? { email } : {}) },
});
