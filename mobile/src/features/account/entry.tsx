// Account and about in development and e2e builds. Production bundles resolve
// entry.production.ts instead, and metro.config.js keeps every other file in
// this folder out of them, so no sign-in screen or copy ships before voice does.
export { AccountScreen as default } from './AccountScreen';
