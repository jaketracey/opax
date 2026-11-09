import { accountCopy, refusalCopy } from '../src/features/account/copy';
import { linksCopy } from '../src/features/account/parts';

// Account's words, pinned as specs/account.md 2.3, 5.5 and 6.6 print them.
jest.mock('expo-router', () => ({
  useIsPreview: () => false, router: { push: jest.fn() } }));

/** Every string a copy table can produce, with sample arguments. */
function strings(table: Record<string, unknown>): string[] {
  return Object.values(table).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'function')
      return [String((value as (...args: unknown[]) => string)('1.0.0', '1'))];
    return [];
  });
}
const all = [...strings(accountCopy), ...strings(refusalCopy)];

test('the house rules: typographic quotes, no em dash, Australian English', () => {
  for (const text of all) {
    expect([text, /['"]/.test(text)]).toEqual([text, false]);
    expect([text, text.includes('\u2014')]).toEqual([text, false]);
    expect([
      text,
      /\b(?:color|center|organization|license|canceled)\b/i.test(text),
    ]).toEqual([text, false]);
  }
});

test('no "Try again." inside a sentence, and refusals are one or two sentences', () => {
  for (const text of Object.values(refusalCopy)) {
    expect([text, /Try again\.\s+\S/.test(text)]).toEqual([text, false]);
    expect([text, text.split(/(?<=\.)\s+/).length <= 2]).toEqual([text, true]);
  }
});

test('the bar title, the sign-in row and the identity', () => {
  expect(accountCopy.title).toBe('Account');
  expect(accountCopy.signIn).toBe('Sign in');
  expect(accountCopy.signInDetail).toBe(
    'Talk to OPAX, and keep your Ask conversations on all your devices.',
  );
  expect(accountCopy.signedInHere).toBe('Signed in on this iPhone');
  expect(accountCopy.talk).toBe('Talk to OPAX');
  expect(accountCopy.voiceConsent).toBe('Voice consent');
  expect(accountCopy.signOut).toBe('Sign out');
  expect(accountCopy.deleteAccount).toBe('Delete account');
});

test('the notices never mention the server', () => {
  expect(accountCopy.signedOutNotice).toBe('Signed out of this iPhone.');
  expect(accountCopy.deletedNotice).toBe(
    'Your OPAX account was deleted. This iPhone is signed out.',
  );
  for (const notice of [accountCopy.signedOutNotice, accountCopy.deletedNotice])
    expect(notice).not.toMatch(/server|community/i);
});

test('sign in: the age line is on the email step and in the copy once', () => {
  expect(accountCopy.ageLimit).toBe('For people aged 16 and over.');
  expect(all.filter((text) => text.includes('16 and over'))).toEqual([
    accountCopy.ageLimit,
  ]);
  expect(accountCopy.email).toBe('Email');
  expect(accountCopy.code).toBe('8-digit code');
  expect(accountCopy.checkEmail).toBe('Check your email');
  expect(accountCopy.sendNewCodeIn(42)).toBe('Send a new code in 0:42');
  expect(accountCopy.availableIn(40)).toBe('available in 40 seconds');
});

test('delete account: two steps, the deletion code and the confirmation', () => {
  expect(accountCopy.emailDeletionCode).toBe('Email me a deletion code');
  expect(accountCopy.deletionCode).toBe('Deletion code');
  expect(accountCopy.confirmDeleteTitle).toBe('Delete your OPAX account?');
  expect(accountCopy.confirmDeleteMessage).toBe('This can’t be undone.');
  expect(accountCopy.sendNewDeletionCodeIn(60)).toBe(
    'Send a new deletion code in 1:00',
  );
});

test('the rows the voice-off build draws match the full sheet’s copy', () => {
  for (const key of Object.keys(linksCopy) as (keyof typeof linksCopy)[]) {
    const own = linksCopy[key];
    const full = accountCopy[key as keyof typeof accountCopy];
    if (typeof own === 'function')
      expect(own('1.0.0', '1')).toBe(
        (full as (v: string, b: string) => string)('1.0.0', '1'),
      );
    else expect([key, own]).toEqual([key, full]);
  }
});
