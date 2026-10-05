// Account and about in development and e2e builds. Production bundles resolve
// entry.production.tsx instead (metro.config.js), and the production block
// list keeps every other file in this folder out, so no sign-in screen or
// copy ships before voice does.
export { AccountScreen as default } from './AccountScreen';
