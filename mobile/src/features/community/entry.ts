// Community in development and e2e builds. Production bundles resolve
// entry.production.ts instead, and metro.config.js keeps every other file in
// this folder, and src/app/community, out of them: the 1.0 App Store build
// leaves Community on the web (release/1.0 age rating, "communityHidden").
// Code outside Community reaches it only through this module, which loads no
// native bridge; its session clears itself on account changes
// (account/session-change.ts).
export { communityFromWebPath, communitySharePath } from './routes';
export { communityRequestAllowed } from './policy';

/** Where Today and Account open Community; null in builds without it. */
export const communityHome: '/community/home' | null = '/community/home';
