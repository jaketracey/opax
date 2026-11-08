// The Account stack's screens in development, e2e and voice-on production
// builds. Voice-off production bundles resolve entry.production.ts instead,
// and metro.config.js keeps every other file in this folder out of them, so
// every account route file imports its screen from here.
export { AccountScreen as default } from './AccountScreen';
export { ConsentScreen } from './ConsentScreen';
export {
  SignInScreen,
  SignInCodeScreen,
  TalkSignInScreen,
  TalkSignInCodeScreen,
} from './SignInScreen';
export { DeleteAccountScreen, DeleteCodeScreen } from './DeleteAccountScreen';
