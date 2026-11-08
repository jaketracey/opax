import { createElement } from 'react';
import { Redirect } from 'expo-router';
import { AccountRowsScreen } from './AccountRows';

// Production Account with the voice switch off: the same sheet without the
// account groups, on iOS and Android alike (specs/account.md 9). Voice, its
// sign-in and deletion stay out of these builds (src/voice/README.md); a
// stray link to one of their routes lands on Account.
const ProductionAccount = AccountRowsScreen;
export default ProductionAccount;

const toAccount = () => createElement(Redirect, { href: '/account' });
export const ConsentScreen = toAccount;
export const SignInScreen = toAccount;
export const SignInCodeScreen = toAccount;
export const DeleteAccountScreen = toAccount;
export const DeleteCodeScreen = toAccount;
const toTalk = () => createElement(Redirect, { href: '/talk' });
export const TalkSignInScreen = toTalk;
export const TalkSignInCodeScreen = toTalk;
