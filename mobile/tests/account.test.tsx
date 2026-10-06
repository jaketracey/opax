import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as voice from '../src/voice';
import type { VoiceEvent, VoiceStatus } from '../src/voice';
import { Button, ErrorState, Field } from '../src/design/primitives';
import {
  codeDigits,
  codeGate,
  isEmailAddress,
  resendWait,
} from '../src/features/account/code';
import {
  accountCopy,
  consumeRefusal,
  deletionRefusal,
  refusalCopy,
  requestRefusal,
} from '../src/features/account/copy';
import {
  accountView,
  codeAccepted,
  resetAccountStore,
  signOut,
} from '../src/features/account/store';
import { SignInFlow } from '../src/features/account/SignInFlow';
import { DeleteAccountFlow } from '../src/features/account/DeleteAccountFlow';
import { AccountSection } from '../src/features/account/AccountSection';
import { AccountScreen } from '../src/features/account/AccountScreen';
import AccountEntry from '../src/features/account/entry';

jest.mock('../src/voice', () => ({
  status: jest.fn(),
  requestCode: jest.fn(),
  consumeCode: jest.fn(),
  logout: jest.fn(),
  requestDeletionCode: jest.fn(),
  deleteAccount: jest.fn(),
  subscribe: jest.fn(() => () => {}),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

const mocked = jest.mocked(voice);
const challengeId = 'c'.repeat(43);
const status = (value: Partial<VoiceStatus> = {}): VoiceStatus => ({
  enabled: true,
  signedIn: true,
  unlimited: false,
  totalSeconds: 600,
  remainingSeconds: 480,
  activeSession: null,
  budgetOpen: null,
  ...value,
});
const signedOut = status({ signedIn: false, unlimited: null });
// A disabled member: voice refuses them, but the native core keeps the
// session so the account can still be signed out and deleted.
const disabled = status({ signedIn: false, enabled: false, accountHeld: true });

type Renderer = TestRenderer.ReactTestRenderer;
function texts(renderer: Renderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node)
      walk((node as { children: unknown }).children);
  };
  walk(renderer.toJSON());
  return out;
}
const shows = (renderer: Renderer, text: string) =>
  texts(renderer).join('\n').includes(text);
const button = (renderer: Renderer, testID: string) =>
  renderer.root
    .findAllByType(Button)
    .find((node) => node.props.testID === testID)!;
const field = (renderer: Renderer, testID: string) =>
  renderer.root
    .findAllByType(Field)
    .find((node) => node.props.testID === testID)!;
const refusal = (renderer: Renderer) =>
  renderer.root.findAllByType(ErrorState)[0]?.props.message;
async function press(renderer: Renderer, testID: string) {
  await act(async () => {
    button(renderer, testID).props.onPress();
  });
}
async function type(renderer: Renderer, testID: string, text: string) {
  await act(async () => {
    field(renderer, testID).props.onChangeText(text);
  });
}
const mounted: Renderer[] = [];
async function render(element: React.ReactElement) {
  let renderer!: Renderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
afterEach(() => {
  act(() => {
    for (const renderer of mounted.splice(0)) renderer.unmount();
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  resetAccountStore();
  mocked.status.mockResolvedValue({ ok: true, value: signedOut });
  mocked.requestCode.mockResolvedValue({
    ok: true,
    value: { sent: true, challengeId },
  });
  mocked.consumeCode.mockResolvedValue({ ok: true, value: status() });
  mocked.logout.mockResolvedValue({ ok: true, value: undefined });
  mocked.requestDeletionCode.mockResolvedValue({
    ok: true,
    value: { sent: true, challengeId },
  });
  mocked.deleteAccount.mockResolvedValue({
    ok: true,
    value: { deleted: true, signedOut: true },
  });
});

describe('code rules', () => {
  test('pasted and autofilled codes keep their eight digits', () => {
    expect(codeDigits('0123 4567')).toBe('01234567');
    expect(codeDigits('Code: 0123-4567, 15 minutes')).toBe('01234567');
    expect(codeDigits('0123')).toBe('0123');
  });
  test('addresses follow the Worker check', () => {
    expect(isEmailAddress(' happy@example.invalid ')).toBe(true);
    expect(isEmailAddress('happy@example')).toBe(false);
    expect(isEmailAddress('happy example@x.au')).toBe(false);
    expect(isEmailAddress(`${'a'.repeat(250)}@x.au`)).toBe(false);
  });
  test('a code stops at 15 minutes or five tries, and resend waits a minute', () => {
    const challenge = { id: challengeId, sentAt: 0, attempts: 0 };
    expect(codeGate(challenge, 899_999)).toBe('open');
    expect(codeGate(challenge, 900_000)).toBe('expired');
    expect(codeGate({ ...challenge, attempts: 5 }, 1)).toBe('spent');
    expect(resendWait(challenge, 0)).toBe(60);
    expect(resendWait(challenge, 59_001)).toBe(1);
    expect(resendWait(challenge, 60_000)).toBe(0);
    expect(resendWait(null, 0)).toBe(0);
  });
});

describe('refusals', () => {
  test('every code failure gets the one contract answer', () => {
    expect(consumeRefusal('invalidResponse')).toBe(refusalCopy.codeFailed);
    expect(consumeRefusal('signedOut')).toBe(refusalCopy.codeFailed);
    expect(consumeRefusal('rateLimited')).toBe(refusalCopy.tooManyAttempts);
    expect(consumeRefusal('network')).toBe(refusalCopy.network);
    expect(consumeRefusal('timeout')).toBe(refusalCopy.network);
    expect(consumeRefusal('unavailable')).toBe(refusalCopy.signInUnavailable);
  });
  test('code requests', () => {
    expect(requestRefusal('rateLimited')).toBe(
      'Too many codes requested. Try again later.',
    );
    expect(requestRefusal('network')).toBe(refusalCopy.network);
    expect(requestRefusal('unavailable')).toBe(refusalCopy.emailNotSent);
    expect(requestRefusal('invalidResponse')).toBe(refusalCopy.invalidEmail);
    expect(requestRefusal('forbidden')).toBe(refusalCopy.generic);
  });
  test('deletion', () => {
    expect(deletionRefusal('deletionVerificationFailed')).toBe(
      refusalCopy.deletionCodeFailed,
    );
    expect(deletionRefusal('signedOut')).toBe(refusalCopy.signedOut);
    expect(deletionRefusal('rateLimited')).toBe(refusalCopy.tooManyCodes);
    expect(deletionRefusal('network')).toBe(refusalCopy.network);
    expect(deletionRefusal('unavailable')).toBe(
      refusalCopy.deletionUnavailable,
    );
  });
  test('copy keeps the house rules: no em dashes, Australian spelling', () => {
    const all = JSON.stringify({ accountCopy, refusalCopy });
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/\b(?:color|center|organization|license)\b/i);
  });
});

describe('account store', () => {
  test('status decides the view; a held account voice refuses is unavailable', () => {
    expect(
      accountView({
        status: status(),
        error: null,
        checking: false,
        email: 'happy@example.invalid',
        cleared: false,
        notice: null,
      }),
    ).toEqual({
      kind: 'signedIn',
      status: status(),
      email: 'happy@example.invalid',
    });
    expect(
      accountView({
        status: disabled,
        error: null,
        checking: false,
        email: null,
        cleared: false,
        notice: null,
      }).kind,
    ).toBe('unavailable');
    expect(
      accountView({
        status: null,
        error: null,
        checking: false,
        email: null,
        cleared: true,
        notice: null,
      }).kind,
    ).toBe('failed');
  });
  test('sign-out removes the token even when the server cannot be told', async () => {
    mocked.logout.mockResolvedValueOnce({ ok: false, error: 'network' });
    const renderer = await render(<AccountSection />);
    await act(async () => {
      codeAccepted('happy@example.invalid', status());
    });
    await act(() => signOut());
    expect(shows(renderer, accountCopy.signedOutLocally)).toBe(true);
    expect(shows(renderer, accountCopy.signedOut)).toBe(true);
  });
});

describe('Account section', () => {
  test('signed out: one line and Sign in for voice', async () => {
    const renderer = await render(<AccountSection />);
    expect(mocked.status).toHaveBeenCalledTimes(1);
    expect(shows(renderer, accountCopy.signedOut)).toBe(true);
    await press(renderer, 'account-sign-in-start');
    expect(router.push).toHaveBeenCalledWith('/account/sign-in');
  });
  test('signed in: address, voice time, sign-out and deletion', async () => {
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    const renderer = await render(<AccountSection />);
    expect(shows(renderer, accountCopy.signedInHere)).toBe(true);
    expect(shows(renderer, 'Voice time: 8:00 remaining')).toBe(true);
    await act(async () => {
      codeAccepted('happy@example.invalid', status());
    });
    expect(shows(renderer, 'Signed in as happy@example.invalid')).toBe(true);
    await press(renderer, 'account-delete');
    expect(router.push).toHaveBeenCalledWith('/account/delete');
    mocked.status.mockResolvedValue({ ok: true, value: signedOut });
    await press(renderer, 'account-sign-out');
    expect(mocked.logout).toHaveBeenCalledTimes(1);
    expect(shows(renderer, accountCopy.signedOutNotice)).toBe(true);
    expect(shows(renderer, accountCopy.signedOut)).toBe(true);
  });
  test('a held account keeps sign-out and deletion after a relaunch, though voice refuses it', async () => {
    // A fresh store, as after a relaunch: only the native status knows.
    mocked.status.mockResolvedValue({ ok: true, value: disabled });
    const renderer = await render(<AccountSection />);
    expect(shows(renderer, accountCopy.unavailableAccount)).toBe(true);
    expect(button(renderer, 'account-sign-out')).toBeTruthy();
    expect(button(renderer, 'account-delete')).toBeTruthy();
    expect(button(renderer, 'account-sign-in-start')).toBeUndefined();
  });
  test('moderation after sign-in keeps sign-out and deletion', async () => {
    let listener!: (event: VoiceEvent) => void;
    mocked.subscribe.mockImplementation((value) => {
      listener = value;
      return () => {};
    });
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    const renderer = await render(<AccountSection />);
    await act(async () => {
      codeAccepted('happy@example.invalid', status());
    });
    await act(async () => listener({ type: 'status', status: disabled }));
    expect(shows(renderer, accountCopy.unavailableAccount)).toBe(true);
    expect(button(renderer, 'account-delete')).toBeTruthy();
    // Once no account is held, the controls and the label go.
    await act(async () => listener({ type: 'status', status: signedOut }));
    expect(button(renderer, 'account-delete')).toBeUndefined();
    expect(shows(renderer, accountCopy.signedOut)).toBe(true);
  });
  test('unlimited and switched-off voice', async () => {
    mocked.status.mockResolvedValue({
      ok: true,
      value: status({ unlimited: true, enabled: false }),
    });
    const renderer = await render(<AccountSection />);
    expect(shows(renderer, accountCopy.unlimited)).toBe(true);
    expect(shows(renderer, accountCopy.voiceOff)).toBe(true);
  });
  test('a failed status read says so, with Try again', async () => {
    mocked.status.mockResolvedValueOnce({ ok: false, error: 'network' });
    const renderer = await render(<AccountSection />);
    const error = renderer.root.findByType(ErrorState);
    expect(error.props.message).toBe(accountCopy.statusFailed);
    await act(async () => error.props.onRetry());
    expect(shows(renderer, accountCopy.signedOut)).toBe(true);
  });
  test('a cleared native status never starts another read by itself', async () => {
    let listener!: (event: VoiceEvent) => void;
    mocked.subscribe.mockImplementation((value) => {
      listener = value;
      return () => {};
    });
    const renderer = await render(<AccountSection />);
    await act(async () => listener({ type: 'status', status: null }));
    expect(mocked.status).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType(ErrorState).props.message).toBe(
      accountCopy.statusFailed,
    );
    await act(async () => listener({ type: 'status', status: status() }));
    expect(shows(renderer, 'Voice time: 8:00 remaining')).toBe(true);
  });
  test('the development sheet keeps About, the tour replay and the workbench', async () => {
    const renderer = await render(<AccountEntry />);
    expect(renderer.root.findByType(AccountScreen)).toBeTruthy();
    expect(button(renderer, 'account-about')).toBeTruthy();
    expect(button(renderer, 'account-workbench')).toBeTruthy();
    expect(button(renderer, 'account-replay-tour')).toBeTruthy();
  });
});

describe('Sign in by code', () => {
  async function toCode(onSignedIn = jest.fn()) {
    const renderer = await render(<SignInFlow onSignedIn={onSignedIn} />);
    await type(renderer, 'account-email', ' happy@example.invalid ');
    await press(renderer, 'account-send-code');
    return renderer;
  }
  test('the address step says what the account is and is for', async () => {
    const renderer = await render(<SignInFlow onSignedIn={jest.fn()} />);
    expect(shows(renderer, accountCopy.signInIntro)).toBe(true);
    expect(shows(renderer, accountCopy.sameAccount)).toBe(true);
    expect(
      shows(renderer, 'Accounts and voice are for people aged 16 and over.'),
    ).toBe(true);
    const privacy = renderer.root.findByProps({ testID: 'account-privacy' });
    expect(privacy.props.path).toBe('/privacy');
    const email = field(renderer, 'account-email').props;
    expect(email).toMatchObject({
      label: 'Email',
      textContentType: 'emailAddress',
      autoComplete: 'email',
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    });
    await type(renderer, 'account-email', 'not an address');
    await press(renderer, 'account-send-code');
    expect(mocked.requestCode).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.invalidEmail);
  });
  test.each([
    ['rateLimited', 'Too many codes requested. Try again later.'],
    ['network', refusalCopy.network],
    ['unavailable', refusalCopy.emailNotSent],
  ] as const)(
    'a refused request (%s) stays on the address',
    async (error, message) => {
      mocked.requestCode.mockResolvedValueOnce({ ok: false, error });
      const renderer = await toCode();
      expect(refusal(renderer)).toBe(message);
    },
  );
  test('the code field is one-time-code and paste friendly, and a full code signs in', async () => {
    const onSignedIn = jest.fn();
    const renderer = await toCode(onSignedIn);
    expect(mocked.requestCode).toHaveBeenCalledWith('happy@example.invalid');
    expect(shows(renderer, accountCopy.codeSent('happy@example.invalid'))).toBe(
      true,
    );
    expect(field(renderer, 'account-code').props).toMatchObject({
      label: '8-digit code',
      textContentType: 'oneTimeCode',
      autoComplete: 'one-time-code',
      keyboardType: 'number-pad',
    });
    await type(renderer, 'account-code', 'Your code: 0123 4567');
    expect(mocked.consumeCode).toHaveBeenCalledWith(challengeId, '01234567');
    expect(onSignedIn).toHaveBeenCalledWith('signedIn');
  });
  test('a wrong code gets the one answer and keeps the code to check', async () => {
    mocked.consumeCode.mockResolvedValueOnce({
      ok: false,
      error: 'invalidResponse',
    });
    const onSignedIn = jest.fn();
    const renderer = await toCode(onSignedIn);
    await type(renderer, 'account-code', '76543210');
    expect(refusal(renderer)).toBe(
      'That code did not work. Check it, or send a new code.',
    );
    expect(field(renderer, 'account-code').props.value).toBe('76543210');
    expect(onSignedIn).not.toHaveBeenCalled();
  });
  test('a disabled member is told the account is unavailable', async () => {
    mocked.consumeCode.mockResolvedValueOnce({ ok: true, value: disabled });
    mocked.status.mockResolvedValue({ ok: true, value: disabled });
    const onSignedIn = jest.fn();
    const renderer = await toCode(onSignedIn);
    await type(renderer, 'account-code', '01234567');
    expect(onSignedIn).toHaveBeenCalledWith('unavailable');
    const section = await render(<AccountSection />);
    expect(shows(section, accountCopy.unavailableAccount)).toBe(true);
    expect(button(section, 'account-delete')).toBeTruthy();
  });
  test('a refused code never signs in, nor relabels the account already held', async () => {
    // Account A is signed in; a code for B is refused while a general status
    // read would still say "signed in" (A's session).
    codeAccepted('a@example.invalid', status());
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    for (const error of [
      'invalidResponse',
      'network',
      'unavailable',
    ] as const) {
      mocked.consumeCode.mockResolvedValueOnce({ ok: false, error });
      const onSignedIn = jest.fn();
      const renderer = await render(<SignInFlow onSignedIn={onSignedIn} />);
      await type(renderer, 'account-email', 'b@example.invalid');
      await press(renderer, 'account-send-code');
      await type(renderer, 'account-code', '01234567');
      expect(onSignedIn).not.toHaveBeenCalled();
      expect(refusal(renderer)).toBe(consumeRefusal(error));
    }
    // The flow never read a general status in place of the exchange.
    expect(mocked.status).not.toHaveBeenCalled();
    const section = await render(<AccountSection />);
    expect(shows(section, 'Signed in as a@example.invalid')).toBe(true);
    expect(shows(section, 'b@example.invalid')).toBe(false);
  });
  test('an exchange that holds no account is not a sign-in', async () => {
    mocked.consumeCode.mockResolvedValueOnce({ ok: true, value: signedOut });
    const onSignedIn = jest.fn();
    const renderer = await toCode(onSignedIn);
    await type(renderer, 'account-code', '01234567');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.generic);
  });
  test('offline and too many attempts', async () => {
    mocked.consumeCode
      .mockResolvedValueOnce({ ok: false, error: 'network' })
      .mockResolvedValueOnce({ ok: false, error: 'rateLimited' });
    const renderer = await toCode();
    await type(renderer, 'account-code', '01234567');
    expect(refusal(renderer)).toBe(refusalCopy.network);
    await press(renderer, 'account-sign-in-code');
    expect(refusal(renderer)).toBe(refusalCopy.tooManyAttempts);
  });
  test('after five codes the challenge is not tried again', async () => {
    mocked.consumeCode.mockResolvedValue({
      ok: false,
      error: 'invalidResponse',
    });
    const renderer = await toCode();
    await type(renderer, 'account-code', '76543210');
    for (let i = 0; i < 5; i++) await press(renderer, 'account-sign-in-code');
    expect(mocked.consumeCode).toHaveBeenCalledTimes(5);
    expect(refusal(renderer)).toBe(refusalCopy.codeFailed);
  });
  test('an incomplete code is not sent', async () => {
    const renderer = await toCode();
    await type(renderer, 'account-code', '0123');
    await press(renderer, 'account-sign-in-code');
    expect(mocked.consumeCode).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.codeIncomplete);
  });
  test('resend after its cooldown, and expiry after 15 minutes', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const renderer = await toCode();
    expect(button(renderer, 'account-resend').props.disabled).toBe(true);
    expect(shows(renderer, 'You can send a new code in 60 seconds.')).toBe(
      true,
    );
    for (let second = 0; second < 59; second++)
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
    expect(shows(renderer, 'You can send a new code in 1 second.')).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(button(renderer, 'account-resend').props.disabled).toBe(false);
    await press(renderer, 'account-resend');
    expect(mocked.requestCode).toHaveBeenCalledTimes(2);
    expect(
      shows(renderer, 'We sent a new code to happy@example.invalid.'),
    ).toBe(true);
    await act(async () => {
      jest.setSystemTime(1_000_000 + 60_000 + 15 * 60_000);
    });
    await type(renderer, 'account-code', '01234567');
    expect(mocked.consumeCode).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.codeFailed);
  });
  test('Use a different email returns to the address and drops the challenge', async () => {
    const renderer = await toCode();
    await press(renderer, 'account-different-email');
    expect(field(renderer, 'account-email').props.value).toBe(
      ' happy@example.invalid ',
    );
    expect(
      renderer.root
        .findAllByType(Field)
        .some((node) => node.props.testID === 'account-code'),
    ).toBe(false);
  });
});

describe('Delete account', () => {
  async function toCode() {
    const onDone = jest.fn();
    const onCancel = jest.fn();
    const renderer = await render(
      <DeleteAccountFlow onDone={onDone} onCancel={onCancel} />,
    );
    return { renderer, onDone, onCancel };
  }
  test('the confirmation says what is deleted and what is not', async () => {
    const { renderer, onCancel } = await toCode();
    for (const line of [
      ...accountCopy.deleted,
      ...accountCopy.kept,
      accountCopy.deleteIntro,
    ])
      expect(shows(renderer, line)).toBe(true);
    expect(button(renderer, 'account-delete-confirm').props).toMatchObject({
      variant: 'danger',
      label: 'Delete account',
    });
    await press(renderer, 'account-delete-cancel');
    expect(onCancel).toHaveBeenCalled();
    expect(mocked.requestDeletionCode).not.toHaveBeenCalled();
  });
  test('the confirmation states decision 5', async () => {
    const { renderer } = await toCode();
    const page = texts(renderer).join('\n');
    // Personal data and the member's own discussions and replies go.
    expect(page).toMatch(/personal data, including your email address/);
    expect(page).toMatch(/Your own discussions and replies on opax\.com\.au/);
    // Other members' replies stay under a stub with no personal data.
    expect(page).toMatch(
      /Other members’ replies under a discussion you started\. The discussion stays as a stub with no personal data\./,
    );
    // Voice usage is kept without a link, and nothing is refunded.
    expect(page).toMatch(/Your voice usage, kept without a link to you/);
    expect(page).toMatch(/Voice time is not refunded\./);
    expect(page.indexOf('What is deleted')).toBeLessThan(
      page.indexOf('Your own discussions'),
    );
    expect(page.indexOf('What is not deleted')).toBeLessThan(
      page.indexOf('Voice time is not refunded'),
    );
  });
  test('the confirmation discloses recovery history and links the policy', async () => {
    const { renderer } = await toCode();
    const page = texts(renderer).join('\n');
    expect(page).toMatch(
      /Deleting removes these from OPAX’s live database straight away\. It cannot be undone\./,
    );
    expect(page).toMatch(
      /Recovery history\..*Your deleted data stays in it for up to 30 days, then is gone\./,
    );
    const policy = renderer.root.findByProps({
      testID: 'account-deletion-policy',
    });
    expect(policy.props.path).toBe('/privacy#privacy-deletion');
  });
  test('after five deletion codes the challenge is not tried again', async () => {
    mocked.deleteAccount.mockResolvedValue({
      ok: false,
      error: 'deletionVerificationFailed',
    });
    const { renderer } = await toCode();
    await press(renderer, 'account-delete-confirm');
    await type(renderer, 'account-deletion-code', '76543210');
    for (let i = 0; i < 6; i++) await press(renderer, 'account-delete-final');
    expect(mocked.deleteAccount).toHaveBeenCalledTimes(5);
    expect(refusal(renderer)).toBe(refusalCopy.deletionCodeFailed);
  });
  test('a fresh code, a deliberate tap, then the result', async () => {
    mocked.status.mockResolvedValue({ ok: true, value: signedOut });
    const { renderer, onDone } = await toCode();
    await press(renderer, 'account-delete-confirm');
    expect(mocked.requestDeletionCode).toHaveBeenCalledTimes(1);
    expect(field(renderer, 'account-deletion-code').props).toMatchObject({
      textContentType: 'oneTimeCode',
      keyboardType: 'number-pad',
    });
    await type(renderer, 'account-deletion-code', '0123 4567');
    expect(mocked.deleteAccount).not.toHaveBeenCalled();
    await press(renderer, 'account-delete-final');
    expect(mocked.deleteAccount).toHaveBeenCalledWith(challengeId, '01234567');
    expect(shows(renderer, accountCopy.accountDeleted)).toBe(true);
    expect(shows(renderer, accountCopy.accountDeletedDetail)).toBe(true);
    expect(accountCopy.accountDeletedDetail).toMatch(
      /removed from OPAX’s live database\. Its recovery history keeps them for up to 30 days/,
    );
    expect(mocked.status).toHaveBeenCalled();
    await press(renderer, 'account-delete-done');
    expect(onDone).toHaveBeenCalled();
  });
  test('each step opens in a new scroll view, so at the top', async () => {
    const { renderer } = await toCode();
    const view = () => renderer.root.findByType(ScrollView).instance;
    const confirm = view();
    await press(renderer, 'account-delete-confirm');
    const code = view();
    await type(renderer, 'account-deletion-code', '01234567');
    await press(renderer, 'account-delete-final');
    expect(shows(renderer, accountCopy.accountDeleted)).toBe(true);
    expect(confirm).toBeTruthy();
    expect(code).not.toBe(confirm);
    expect(view()).not.toBe(code);
  });
  test('a wrong deletion code, then an ended session', async () => {
    mocked.deleteAccount
      .mockResolvedValueOnce({ ok: false, error: 'deletionVerificationFailed' })
      .mockResolvedValueOnce({ ok: false, error: 'signedOut' });
    const { renderer } = await toCode();
    await press(renderer, 'account-delete-confirm');
    await type(renderer, 'account-deletion-code', '76543210');
    await press(renderer, 'account-delete-final');
    expect(refusal(renderer)).toBe(
      'That code did not work. Check it, or send a new deletion code.',
    );
    await press(renderer, 'account-delete-final');
    expect(refusal(renderer)).toBe(refusalCopy.signedOut);
    expect(mocked.status).toHaveBeenCalled();
  });
  test('a refused deletion-code request stays on the confirmation', async () => {
    mocked.requestDeletionCode.mockResolvedValueOnce({
      ok: false,
      error: 'rateLimited',
    });
    const { renderer } = await toCode();
    await press(renderer, 'account-delete-confirm');
    expect(renderer.root.findByType(ErrorState).props.message).toBe(
      refusalCopy.tooManyCodes,
    );
    expect(button(renderer, 'account-delete-confirm')).toBeTruthy();
  });
});
