import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { act } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { codeFigureCeiling } from '../src/design/controls';
import { Screen } from '../src/design/layout';
import { confirmAction } from '../src/design/menu';
import {
  Button,
  ErrorState,
  Field,
  InlineError,
  Text,
} from '../src/design/primitives';
import { AccountGroups } from '../src/features/account/AccountGroups';
import { textStyles } from '../src/design/tokens';
import { AccountScreen } from '../src/features/account/AccountScreen';
import {
  codeDigits,
  codeGate,
  isEmailAddress,
  resendWait,
} from '../src/features/account/code';
import { ConsentScreen } from '../src/features/account/ConsentScreen';
import {
  accountCopy,
  consumeRefusal,
  deletionRefusal,
  refusalCopy,
  requestRefusal,
} from '../src/features/account/copy';
import {
  DeleteCode,
  DeleteIntro,
} from '../src/features/account/DeleteAccountFlow';
import { DeleteCodeScreen } from '../src/features/account/DeleteAccountScreen';
import AccountEntry from '../src/features/account/entry';
import { finishSignIn } from '../src/features/account/navigation';
import { CodeStep, EmailStep } from '../src/features/account/SignInFlow';
import {
  SignInCodeScreen,
  SignInScreen,
  TalkSignInCodeScreen,
  TalkSignInScreen,
} from '../src/features/account/SignInScreen';
import {
  accountDeleted,
  accountSignedIn,
  accountView,
  codeAccepted,
  resetAccountStore,
  signOut,
} from '../src/features/account/store';
import {
  issueChallenge,
  resetChallenges,
} from '../src/features/account/useCodeChallenge';
import { clearAskConversations } from '../src/features/ask/store';
import { readConsent, setConsent } from '../src/features/talk/bridge';
import { takeConsentAfterSignIn } from '../src/features/talk/consent-store';
import { openOnWeb } from '../src/navigation/external';
import type { VoiceEvent, VoiceStatus } from '../src/voice';
import * as voice from '../src/voice';

jest.mock('../src/voice', () => ({
  status: jest.fn(),
  requestCode: jest.fn(),
  consumeCode: jest.fn(),
  logout: jest.fn(),
  requestDeletionCode: jest.fn(),
  deleteAccount: jest.fn(),
  subscribe: jest.fn(() => () => {}),
}));
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  usePreventRemove: jest.fn(),
  useNavigation: jest.fn(() => ({ dispatch: jest.fn() })),
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual('react');
  // Host elements: a Link row's href and a Redirect's target stay readable.
  const Link = ({ children, ...props }: { children: unknown }) =>
    createElement('Link', props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    router: {
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
      dismissAll: jest.fn(),
      canGoBack: jest.fn(() => true),
    },
    Link,
    Redirect: (props: object) => createElement('Redirect', props),
    Stack: { Screen: () => null },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: jest.fn(),
  };
});
// The text size, when a test sets one; otherwise the test default.
let mockFontScale: number | null = null;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual(
    'react-native/Libraries/Utilities/useWindowDimensions',
  );
  return {
    __esModule: true,
    default: () =>
      mockFontScale === null
        ? actual.default()
        : { width: 402, height: 874, scale: 3, fontScale: mockFontScale },
  };
});
jest.mock('../src/design/menu', () => ({
  ...jest.requireActual('../src/design/menu'),
  confirmAction: jest.fn(),
}));
jest.mock('../src/features/talk/bridge', () => ({
  readConsent: jest.fn(async () => false),
  setConsent: jest.fn(async () => true),
}));
jest.mock('../src/features/ask/store', () => ({
  ...jest.requireActual('../src/features/ask/store'),
  clearAskConversations: jest.fn(async () => undefined),
}));
// The remembered address (2.6), in memory: the slot survives a store reset,
// as the file survives a relaunch.
let mockSlots: Record<string, unknown> = {};
jest.mock('../src/storage/two-slot', () => ({
  TwoSlotStore: class {
    key: string;
    constructor(slots: string[]) {
      this.key = slots[0]!;
    }
    async read() {
      return mockSlots[this.key] ?? null;
    }
    async save(value: unknown) {
      mockSlots[this.key] = value;
    }
  },
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
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
const remembered = () =>
  (mockSlots['opax-account-v1.json'] as { email: string | null } | undefined)
    ?.email;
const has = (renderer: Renderer, testID: string) =>
  renderer.root.findAll((node) => node.props.testID === testID).length > 0;
const linkTo = (renderer: Renderer, testID: string) =>
  renderer.root.find(
    (node) =>
      node.type === 'Link' &&
      node.findAll((child) => child.props.testID === testID).length > 0,
  ).props.href;
/** The action (not Cancel) of the last confirmation shown. */
async function confirmLast() {
  const [action] = jest.mocked(confirmAction).mock.lastCall![1];
  await act(async () => action!.onPress());
}
// Buttons and link rows: the pressable that carries the test ID.
const button = (renderer: Renderer, testID: string) =>
  renderer.root.findAll(
    (node) =>
      node.props.testID === testID && typeof node.props.onPress === 'function',
  )[0]!;
/** The native input under a Field, with its focus state applied. */
const hostInput = async (renderer: Renderer, testID: string) => {
  const find = () =>
    renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.testID === testID,
    );
  await act(async () => find().props.onFocus?.({ nativeEvent: {} }));
  return find();
};
const field = (renderer: Renderer, testID: string) =>
  renderer.root
    .findAllByType(Field)
    .find((node) => node.props.testID === testID)!;
const refusal = (renderer: Renderer) =>
  renderer.root.findAllByType(ErrorState)[0]?.props.message;
const failure = (renderer: Renderer) =>
  renderer.root.findAllByType(InlineError)[0]?.props.message;
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
  resetChallenges();
  mockSlots = {};
  mockParams = {};
  mockFontScale = null;
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
  const state = {
    status: null,
    error: null,
    checking: false,
    email: null,
    cleared: false,
    notice: null,
  };
  test('status decides the view; a held account voice refuses is unavailable', () => {
    expect(
      accountView({
        ...state,
        status: status(),
        email: 'happy@example.invalid',
      }),
    ).toEqual({
      kind: 'signedIn',
      status: status(),
      email: 'happy@example.invalid',
    });
    expect(accountView({ ...state, status: disabled }).kind).toBe(
      'unavailable',
    );
    expect(accountView({ ...state, cleared: true })).toEqual({
      kind: 'failed',
      email: null,
      offline: false,
    });
    expect(accountView({ ...state, error: 'network' })).toMatchObject({
      kind: 'failed',
      offline: true,
    });
    // Before status arrives, a remembered address still names the account.
    expect(accountView({ ...state, email: 'happy@example.invalid' })).toEqual({
      kind: 'checking',
      email: 'happy@example.invalid',
    });
  });
  test('the bar symbol is filled while an account is held or remembered', () => {
    expect(accountSignedIn({ ...state, status: status() })).toBe(true);
    expect(accountSignedIn({ ...state, status: disabled })).toBe(true);
    expect(accountSignedIn({ ...state, status: signedOut })).toBe(false);
    expect(accountSignedIn({ ...state, email: 'a@example.invalid' })).toBe(
      true,
    );
    expect(accountSignedIn(state)).toBe(false);
  });
  test('sign-out says the same thing even when the server cannot be told', async () => {
    mocked.logout.mockResolvedValueOnce({ ok: false, error: 'network' });
    const renderer = await render(<AccountGroups />);
    await act(async () => {
      codeAccepted('happy@example.invalid', status());
    });
    await act(() => signOut());
    expect(shows(renderer, accountCopy.signedOutNotice)).toBe(true);
    expect(accountCopy.signedOutNotice).not.toMatch(/server|couldn/i);
    expect(has(renderer, 'account-sign-in-start')).toBe(true);
  });
  test('the address is remembered while signed in, and forgotten on sign-out', async () => {
    codeAccepted(' Happy@Example.invalid ', status());
    await act(async () => undefined);
    expect(remembered()).toBe('happy@example.invalid');
    // A relaunch: a fresh store, with the status read still out.
    resetAccountStore();
    mocked.status.mockReturnValue(new Promise(() => undefined));
    const renderer = await render(<AccountGroups />);
    expect(
      renderer.root.findByProps({ testID: 'account-identity' }).props
        .accessibilityLabel,
    ).toBe('happy@example.invalid');
    // Sign-out and deletion never wait for the status read (2.5).
    expect(has(renderer, 'account-sign-out')).toBe(true);
    expect(has(renderer, 'account-delete')).toBe(true);
    mocked.status.mockResolvedValue({ ok: true, value: signedOut });
    await act(() => signOut());
    expect(remembered()).toBeNull();
  });
  test('a status that holds no account forgets the address', async () => {
    mockSlots['opax-account-v1.json'] = { email: 'happy@example.invalid' };
    const renderer = await render(<AccountGroups />);
    expect(has(renderer, 'account-sign-in-start')).toBe(true);
    expect(shows(renderer, 'happy@example.invalid')).toBe(false);
    expect(remembered()).toBeNull();
  });
});

describe('Account groups', () => {
  test('signed out: the one Sign in row, which pushes the email step', async () => {
    const renderer = await render(<AccountGroups />);
    expect(mocked.status).toHaveBeenCalledTimes(1);
    const row = renderer.root.findByProps({
      testID: 'account-sign-in-start',
    });
    expect(row.props.accessibilityLabel).toBe(
      'Sign in, Talk to OPAX, and keep your Ask conversations on all your devices.',
    );
    // The row is a link: the Link pushes it (and previews it), not a press.
    expect(linkTo(renderer, 'account-sign-in-start')).toBe('/account/sign-in');
    expect(has(renderer, 'account-sign-out')).toBe(false);
    expect(has(renderer, 'account-delete')).toBe(false);
  });
  test('signed in: address, voice time and consent, then sign-out, then deletion', async () => {
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    jest.mocked(readConsent).mockResolvedValue(true);
    const renderer = await render(<AccountGroups />);
    expect(shows(renderer, accountCopy.signedInHere)).toBe(true);
    expect(shows(renderer, '8 min left')).toBe(true);
    expect(
      renderer.root.find(
        (node) =>
          typeof node.type === 'string' && node.props.testID === 'account-talk',
      ).props.accessibilityLabel,
    ).toBe('Talk to OPAX, 8 minutes left');
    expect(linkTo(renderer, 'account-consent')).toBe('/account/consent');
    await act(async () => {
      codeAccepted('happy@example.invalid', status());
    });
    expect(shows(renderer, 'happy@example.invalid')).toBe(true);
    // Delete account is last, in its own group, after Sign out.
    const ids = renderer.root
      .findAll((node) => typeof node.props.testID === 'string')
      .map((node) => node.props.testID as string);
    expect(ids.lastIndexOf('account-sign-out')).toBeLessThan(
      ids.indexOf('account-delete'),
    );
    await press(renderer, 'account-delete');
    expect(router.push).toHaveBeenCalledWith('/account/delete');
    mocked.status.mockResolvedValue({ ok: true, value: signedOut });
    await press(renderer, 'account-sign-out');
    expect(mocked.logout).toHaveBeenCalledTimes(1);
    expect(shows(renderer, accountCopy.signedOutNotice)).toBe(true);
    expect(has(renderer, 'account-sign-in-start')).toBe(true);
  });
  test('a held account keeps sign-out and deletion after a relaunch, though voice refuses it', async () => {
    mocked.status.mockResolvedValue({ ok: true, value: disabled });
    const renderer = await render(<AccountGroups />);
    expect(shows(renderer, accountCopy.unavailableFooter)).toBe(true);
    expect(button(renderer, 'account-sign-out')).toBeTruthy();
    expect(button(renderer, 'account-delete')).toBeTruthy();
    expect(has(renderer, 'account-sign-in-start')).toBe(false);
  });
  test('moderation after sign-in keeps sign-out and deletion', async () => {
    let listener!: (event: VoiceEvent) => void;
    mocked.subscribe.mockImplementation((value) => {
      listener = value;
      return () => {};
    });
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    const renderer = await render(<AccountGroups />);
    await act(async () => {
      codeAccepted('happy@example.invalid', status());
    });
    await act(async () => listener({ type: 'status', status: disabled }));
    expect(shows(renderer, accountCopy.unavailableFooter)).toBe(true);
    expect(button(renderer, 'account-delete')).toBeTruthy();
    // Once no account is held, the controls and the address go.
    await act(async () => listener({ type: 'status', status: signedOut }));
    expect(button(renderer, 'account-delete')).toBeUndefined();
    expect(has(renderer, 'account-sign-in-start')).toBe(true);
  });
  test('unlimited voice, and voice switched off', async () => {
    mocked.status.mockResolvedValue({
      ok: true,
      value: status({ unlimited: true }),
    });
    const unlimited = await render(<AccountGroups />);
    expect(shows(unlimited, 'Unlimited')).toBe(true);
    expect(shows(unlimited, accountCopy.unlimitedFooter)).toBe(true);
    resetAccountStore();
    mocked.status.mockResolvedValue({
      ok: true,
      value: status({ enabled: false }),
    });
    const off = await render(<AccountGroups />);
    expect(shows(off, accountCopy.paused)).toBe(true);
    expect(shows(off, accountCopy.voiceOffFooter)).toBe(true);
  });
  test.each([
    ['unavailable', accountCopy.statusFailed],
    ['network', accountCopy.statusOffline],
  ] as const)(
    'a failed status read (%s) says so in one sentence, with Try again',
    async (error, message) => {
      mocked.status.mockResolvedValueOnce({ ok: false, error });
      const renderer = await render(<AccountGroups />);
      expect(failure(renderer)).toBe(message);
      expect(message).not.toMatch(/Try again/);
      await act(async () =>
        renderer.root.findAllByType(InlineError)[0]!.props.onRetry(),
      );
      expect(has(renderer, 'account-sign-in-start')).toBe(true);
    },
  );
  test('a cleared native status never starts another read by itself', async () => {
    let listener!: (event: VoiceEvent) => void;
    mocked.subscribe.mockImplementation((value) => {
      listener = value;
      return () => {};
    });
    const renderer = await render(<AccountGroups />);
    await act(async () => listener({ type: 'status', status: null }));
    expect(mocked.status).toHaveBeenCalledTimes(1);
    expect(failure(renderer)).toBe(accountCopy.statusFailed);
    await act(async () => listener({ type: 'status', status: status() }));
    expect(shows(renderer, '8 min left')).toBe(true);
  });
  test('after deletion: signed out with the notice, or the chats error with its retry', async () => {
    const renderer = await render(<AccountGroups />);
    await act(async () => accountDeleted(true));
    expect(shows(renderer, accountCopy.deletedNotice)).toBe(true);
    await act(async () => accountDeleted(false));
    expect(failure(renderer)).toBe(accountCopy.localChatsError);
    await act(async () =>
      renderer.root
        .findByProps({ testID: 'account-local-chats-error' })
        .props.onRetry(),
    );
    expect(clearAskConversations).toHaveBeenCalled();
    expect(shows(renderer, accountCopy.deletedNotice)).toBe(true);
  });
});

describe('Identity rows at accessibility sizes', () => {
  test('a long signed-in email wraps at full size with word-safe fitting disabled', async () => {
    mockFontScale = 1;
    const email = 'averylongexampleperson@archive.example.invalid';
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    const renderer = await render(<AccountGroups />);
    await act(async () => codeAccepted(email, status()));
    const identity = renderer.root.findByProps({ testID: 'account-identity' });
    expect(identity.findByType(Text).props.wordSafe).toBe(false);
    const address = identity.findByType(NativeText);
    expect(address.props.onTextLayout).toBeUndefined();
    expect(address.props.numberOfLines).toBeUndefined();
    expect(address.props.adjustsFontSizeToFit).toBeUndefined();
    expect(StyleSheet.flatten(address.props.style).fontSize).toBe(
      textStyles.name.fontSize,
    );
    expect(address.props.children).toBe(email);
  });
  const flat = (renderer: Renderer, testID: string) =>
    StyleSheet.flatten(
      renderer.root.find(
        (node) => typeof node.type === 'string' && node.props.testID === testID,
      ).props.style,
    );
  test.each([
    [1, 'row'],
    [3.571, 'column'],
  ] as const)(
    'at font scale %s the symbol and text sit in a %s',
    async (scale, direction) => {
      mockFontScale = scale;
      const signedOutRow = await render(<AccountGroups />);
      expect(
        flat(signedOutRow, 'account-sign-in-lead').flexDirection ?? 'column',
      ).toBe(direction);
      // The chevron stays beside the stacked text.
      expect(flat(signedOutRow, 'account-sign-in-start').flexDirection).toBe(
        'row',
      );
      resetAccountStore();
      mocked.status.mockResolvedValue({ ok: true, value: status() });
      const signedIn = await render(<AccountGroups />);
      expect(flat(signedIn, 'account-identity').flexDirection).toBe(direction);
    },
  );
});

describe('Account sheet', () => {
  test('the development sheet: the rows in order, with the workbench last', async () => {
    const renderer = await render(<AccountEntry />);
    expect(renderer.root.findByType(AccountScreen)).toBeTruthy();
    const ids = renderer.root
      .findAll((node) => typeof node.props.testID === 'string')
      .map((node) => node.props.testID as string)
      .filter((id, index, all) => all.indexOf(id) === index);
    const rows = [
      'account-section',
      'account-ask',
      'account-about',
      'account-sources',
      'account-methods',
      'account-coverage',
      'account-privacy',
      'account-support',
      'account-correction',
      'account-replay-tour',
      'account-workbench',
      'account-version',
    ];
    expect(ids.filter((id) => rows.includes(id))).toEqual(rows);
    expect(linkTo(renderer, 'account-ask')).toBe('/account/ask');
    // Sweep 1, item 12: the row says what it opens.
    const ask = renderer.root.find(
      (node) =>
        typeof node.props.testID === 'string' &&
        node.props.testID === 'account-ask' &&
        typeof node.props.title === 'string',
    );
    expect(ask.props.title).toBe('Ask settings');
  });
  test('no primary capsule and no repeated title: signing in is a row', async () => {
    const renderer = await render(<AccountEntry />);
    expect(
      renderer.root
        .findAllByType(Button)
        .filter((node) => node.props.variant === 'primary'),
    ).toEqual([]);
    expect(shows(renderer, 'independent and non-partisan')).toBe(false);
  });
});

describe('Voice consent page', () => {
  test('given: withdrawing asks first, then says so', async () => {
    const { useFocusEffect } = jest.requireMock('expo-router');
    jest
      .mocked(useFocusEffect)
      .mockImplementationOnce((effect: () => void) => effect());
    jest.mocked(readConsent).mockResolvedValueOnce(true);
    const renderer = await render(<ConsentScreen />);
    await press(renderer, 'account-withdraw-consent');
    expect(confirmAction).toHaveBeenCalledWith(
      'Withdraw voice consent?',
      [expect.objectContaining({ title: 'Withdraw' })],
      undefined,
      'Talk will ask again before your next call.',
    );
    await confirmLast();
    expect(setConsent).toHaveBeenCalledWith(false);
    expect(has(renderer, 'account-withdraw-consent')).toBe(false);
    expect(shows(renderer, accountCopy.consentNotGivenFooter)).toBe(true);
  });
});

describe('Sign in by code', () => {
  const email = 'happy@example.invalid';
  async function codeStep(onSignedIn = jest.fn()) {
    const challenge = issueChallenge(challengeId);
    const renderer = await render(
      <CodeStep email={email} challenge={challenge} onSignedIn={onSignedIn} />,
    );
    return renderer;
  }
  test('Talk leads with sign-up copy and keeps its return through the code step', async () => {
    const renderer = await render(<TalkSignInScreen />);
    expect(
      renderer.root.findByProps({ testID: 'account-sign-in-heading' }).props,
    ).toMatchObject({ children: 'Sign up or sign in' });
    expect(
      renderer.root
        .findAll(
          (node) =>
            node.type === 'Text' && node.props.accessibilityRole === 'header',
        )
        .map((node) => node.props.children),
    ).toContain('Sign up or sign in');
    await type(renderer, 'account-email', email);
    await press(renderer, 'account-send-code');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/talk/sign-in/code',
      params: { email, challenge: challengeId, return: 'talk' },
    });
    mockParams = { email, challenge: challengeId };
    takeConsentAfterSignIn();
    const code = await render(<TalkSignInCodeScreen />);
    await type(code, 'account-sign-in-code', '01234567');
    expect(mocked.consumeCode).toHaveBeenCalledWith(challengeId, '01234567');
    expect(router.dismissTo).toHaveBeenCalledWith('/talk');
    expect(takeConsentAfterSignIn()).toBe(true);
  });
  test.each([
    {},
    { return: 'account' },
    { return: 'talk' },
    { return: 'dismiss' },
  ])(
    'Account keeps its existing sign-in copy with params %j',
    async (params) => {
      mockParams = params;
      const renderer = await render(<SignInScreen />);
      expect(has(renderer, 'account-sign-in-heading')).toBe(false);
      expect(shows(renderer, 'Sign up or sign in')).toBe(false);
      expect(shows(renderer, accountCopy.emailFooter)).toBe(true);
    },
  );
  test('step 1: one labelled field, the age line, Send code, then the privacy row', async () => {
    const onSent = jest.fn();
    const renderer = await render(<EmailStep onSent={onSent} />);
    expect(field(renderer, 'account-email').props).toMatchObject({
      grouped: true,
      label: 'Email',
      textContentType: 'emailAddress',
      autoComplete: 'email',
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    });
    expect(shows(renderer, accountCopy.emailFooter)).toBe(true);
    expect(
      renderer.root.findByProps({ testID: 'account-age-limit' }).props.children,
    ).toBe('For people aged 16 and over.');
    const privacy = renderer.root.findByProps({ testID: 'account-privacy' });
    expect(privacy.props.external).toBe(true);
    act(() => privacy.props.onPress());
    expect(openOnWeb).toHaveBeenLastCalledWith('/privacy', 'Privacy policy');
    await type(renderer, 'account-email', 'not an address');
    await press(renderer, 'account-send-code');
    expect(mocked.requestCode).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.invalidEmail);
    await type(renderer, 'account-email', ` ${email} `);
    await press(renderer, 'account-send-code');
    expect(mocked.requestCode).toHaveBeenCalledWith(email);
    expect(onSent).toHaveBeenCalledWith(email, challengeId);
  });
  test.each([
    ['rateLimited', 'Too many codes requested. Try again later.'],
    ['network', refusalCopy.network],
    ['unavailable', refusalCopy.emailNotSent],
  ] as const)(
    'a refused request (%s) stays on the address',
    async (error, message) => {
      mocked.requestCode.mockResolvedValueOnce({ ok: false, error });
      const onSent = jest.fn();
      const renderer = await render(<EmailStep onSent={onSent} />);
      await type(renderer, 'account-email', email);
      await press(renderer, 'account-send-code');
      expect(refusal(renderer)).toBe(message);
      expect(onSent).not.toHaveBeenCalled();
    },
  );
  test('the email screen pushes the code step with the address and challenge', async () => {
    mockParams = { return: 'talk' };
    const renderer = await render(<SignInScreen />);
    await type(renderer, 'account-email', email);
    await press(renderer, 'account-send-code');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/sign-in/code',
      params: { email, challenge: challengeId, return: 'talk' },
    });
  });
  test('the code screen opened cold starts at the address', async () => {
    const renderer = await render(<SignInCodeScreen />);
    expect(renderer.root.findByType('Redirect' as never).props.href).toBe(
      '/account/sign-in',
    );
  });
  test.each([
    [
      'account',
      () => expect(router.dismissTo).toHaveBeenCalledWith('/account'),
    ],
    ['talk', () => expect(router.dismissTo).toHaveBeenCalledWith('/talk')],
    [
      'dismiss',
      () => {
        expect(router.dismissAll).toHaveBeenCalled();
        expect(router.back).toHaveBeenCalled();
      },
    ],
  ] as const)('a finished sign-in returns to %s', (to, check) => {
    finishSignIn(to);
    check();
  });
  test('only a sign-in from Talk asks Talk for its consent sheet', () => {
    takeConsentAfterSignIn(); // Left by an earlier sign-in in this file.
    finishSignIn('account');
    expect(takeConsentAfterSignIn()).toBe(false);
    finishSignIn('dismiss');
    expect(takeConsentAfterSignIn()).toBe(false);
    finishSignIn('talk');
    expect(takeConsentAfterSignIn()).toBe(true);
    // Reading clears it.
    expect(takeConsentAfterSignIn()).toBe(false);
  });
  test.each(['android', 'ios'] as const)(
    '%s supplies its emailed-code autofill hint',
    async (os) => {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
      try {
        const renderer = await codeStep(jest.fn());
        expect(field(renderer, 'account-sign-in-code').props).toMatchObject({
          autoComplete: os === 'android' ? 'email-otp' : 'one-time-code',
          textContentType: 'oneTimeCode',
          keyboardType: 'number-pad',
        });
      } finally {
        Object.defineProperty(Platform, 'OS', {
          configurable: true,
          value: original,
        });
      }
    },
  );
  test('the sign-in code field never shows a clear button, even focused; email keeps it', async () => {
    const renderer = await codeStep();
    // At AX3 the clear button took the first digit's room while focused.
    expect(
      (await hostInput(renderer, 'account-sign-in-code')).props.clearButtonMode,
    ).toBe('never');
    const signIn = await render(<TalkSignInScreen />);
    expect(
      (await hostInput(signIn, 'account-email')).props.clearButtonMode,
    ).toBe('while-editing');
  });
  test('step 2: the code field is one-time-code and paste friendly, and a full code signs in', async () => {
    const onSignedIn = jest.fn();
    const renderer = await codeStep(onSignedIn);
    expect(shows(renderer, accountCopy.codeSent(email))).toBe(true);
    expect(field(renderer, 'account-sign-in-code').props).toMatchObject({
      grouped: true,
      label: '8-digit code',
      textContentType: 'oneTimeCode',
      autoComplete: 'one-time-code',
      keyboardType: 'number-pad',
    });
    await type(renderer, 'account-sign-in-code', 'Your code: 0123 4567');
    expect(mocked.consumeCode).toHaveBeenCalledWith(challengeId, '01234567');
    expect(onSignedIn).toHaveBeenCalledWith('signedIn');
    expect(remembered()).toBe(email);
  });
  // Android, 12 October: a change on the sign-in screen committed with its
  // pop crashed Fabric ("child already has a parent"). On success the screen
  // closes with nothing on it changed.
  test('a signed-in code closes the screen without changing it', async () => {
    const onSignedIn = jest.fn();
    const renderer = await codeStep(onSignedIn);
    const signIn = () =>
      renderer.root
        .findAllByType(Button)
        .find((node) => node.props.testID === 'account-sign-in')!;
    let release!: (value: { ok: true; value: VoiceStatus }) => void;
    mocked.consumeCode.mockReturnValueOnce(
      new Promise((resolve) => (release = resolve)),
    );
    await type(renderer, 'account-sign-in-code', '01234567');
    expect(signIn().props.loading).toBe(true);
    const before = JSON.stringify(renderer.toJSON());
    await act(async () => release({ ok: true, value: status() }));
    expect(onSignedIn).toHaveBeenCalledWith('signedIn');
    expect(JSON.stringify(renderer.toJSON())).toBe(before);
  });
  test('a wrong code gets the one answer and keeps the code to check', async () => {
    mocked.consumeCode.mockResolvedValueOnce({
      ok: false,
      error: 'invalidResponse',
    });
    const onSignedIn = jest.fn();
    const renderer = await codeStep(onSignedIn);
    await type(renderer, 'account-sign-in-code', '76543210');
    expect(refusal(renderer)).toBe(
      'That code didn’t work. Check it, or send a new code.',
    );
    expect(field(renderer, 'account-sign-in-code').props.value).toBe(
      '76543210',
    );
    expect(onSignedIn).not.toHaveBeenCalled();
  });
  test('a disabled member is told the account is unavailable', async () => {
    mocked.consumeCode.mockResolvedValueOnce({ ok: true, value: disabled });
    mocked.status.mockResolvedValue({ ok: true, value: disabled });
    const onSignedIn = jest.fn();
    const renderer = await codeStep(onSignedIn);
    await type(renderer, 'account-sign-in-code', '01234567');
    expect(onSignedIn).toHaveBeenCalledWith('unavailable');
    const groups = await render(<AccountGroups />);
    expect(shows(groups, accountCopy.unavailableFooter)).toBe(true);
    expect(button(groups, 'account-delete')).toBeTruthy();
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
      const renderer = await render(
        <CodeStep
          email="b@example.invalid"
          challenge={issueChallenge(`${error}-${challengeId}`)}
          onSignedIn={onSignedIn}
        />,
      );
      await type(renderer, 'account-sign-in-code', '01234567');
      expect(onSignedIn).not.toHaveBeenCalled();
      expect(refusal(renderer)).toBe(consumeRefusal(error));
    }
    // The flow never read a general status in place of the exchange.
    expect(mocked.status).not.toHaveBeenCalled();
    const groups = await render(<AccountGroups />);
    expect(shows(groups, 'a@example.invalid')).toBe(true);
    expect(shows(groups, 'b@example.invalid')).toBe(false);
  });
  test('an exchange that holds no account is not a sign-in', async () => {
    mocked.consumeCode.mockResolvedValueOnce({ ok: true, value: signedOut });
    const onSignedIn = jest.fn();
    const renderer = await codeStep(onSignedIn);
    await type(renderer, 'account-sign-in-code', '01234567');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.generic);
  });
  test('offline and too many attempts', async () => {
    mocked.consumeCode
      .mockResolvedValueOnce({ ok: false, error: 'network' })
      .mockResolvedValueOnce({ ok: false, error: 'rateLimited' });
    const renderer = await codeStep();
    await type(renderer, 'account-sign-in-code', '01234567');
    expect(refusal(renderer)).toBe(refusalCopy.network);
    await press(renderer, 'account-sign-in');
    expect(refusal(renderer)).toBe(refusalCopy.tooManyAttempts);
  });
  test('after five codes the challenge is not tried again', async () => {
    mocked.consumeCode.mockResolvedValue({
      ok: false,
      error: 'invalidResponse',
    });
    const renderer = await codeStep();
    await type(renderer, 'account-sign-in-code', '76543210');
    for (let i = 0; i < 5; i++) await press(renderer, 'account-sign-in');
    expect(mocked.consumeCode).toHaveBeenCalledTimes(5);
    expect(refusal(renderer)).toBe(refusalCopy.codeFailed);
  });
  // Build 61 at AX5: the code drew at 79 pt (22 pt x 3.571) and its first
  // digit scrolled out of the 370 pt field. The figures now stop growing at
  // the size where all eight fit; AX3 (2.643) is under that and unchanged.
  test('all eight code digits fit the field at AX5; smaller sizes draw as before', async () => {
    mockFontScale = 3.571;
    const renderer = await codeStep();
    const input = () =>
      renderer.root.find(
        (node) =>
          node.type === 'TextInput' &&
          node.props.testID === 'account-sign-in-code',
      );
    // No ceiling until the field's width is known.
    expect(input().props.maxFontSizeMultiplier).toBe(0);
    await act(async () =>
      input().props.onLayout({ nativeEvent: { layout: { width: 370 } } }),
    );
    const ceiling = input().props.maxFontSizeMultiplier;
    expect(ceiling).toBeGreaterThan(2.643);
    expect(ceiling).toBeLessThan(3.571);
    // Eight figures at the measured advance (0.64 em) fit inside the padding.
    const size = 22 * Math.min(ceiling, 3.571);
    expect(8 * 0.64 * size).toBeLessThanOrEqual(370 - 2 * 17);
    expect(codeFigureCeiling(370, 8)).toBe(ceiling);
    expect(codeFigureCeiling(0, 8)).toBe(0);
    expect(codeFigureCeiling(370)).toBe(0);
    // Never below the base size, however narrow the field.
    expect(codeFigureCeiling(60, 8)).toBe(1);
    // The deletion field is plain text: no ceiling, and no measuring.
    const deletion = await render(
      <DeleteCode challenge={issueChallenge(challengeId)} />,
    );
    const deletionInput = deletion.root.find(
      (node) =>
        node.type === 'TextInput' &&
        node.props.testID === 'account-deletion-code',
    );
    expect(deletionInput.props.maxFontSizeMultiplier).toBe(0);
    expect(deletionInput.props.onLayout).toBeUndefined();
  });
  // Build 61 at AX3 and AX5: a code against a challenge this session never
  // issued (or one past 15 minutes or five tries) answered with the keyboard
  // still up, and the error drew behind it. Every refusal hides it now, and
  // the screen scrolls the error into view.
  test('a refused code hides the keyboard and reveals its error', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const reveal = jest.fn(() => () => {});
    const renderer = await render(
      <CodeStep
        email={email}
        challenge="b62-local"
        onSignedIn={jest.fn()}
        reveal={reveal}
      />,
    );
    await type(renderer, 'account-sign-in-code', '76543210');
    expect(mocked.consumeCode).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.codeFailed);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    // A server refusal is revealed the same way.
    mocked.consumeCode.mockResolvedValueOnce({ ok: false, error: 'network' });
    const sent = await codeStep();
    await type(sent, 'account-sign-in-code', '01234567');
    expect(refusal(sent)).toBe(refusalCopy.network);
    expect(dismiss).toHaveBeenCalledTimes(2);
    dismiss.mockRestore();
  });
  test('the code screen gives its scroll view to the error reveal', async () => {
    mockParams = { email, challenge: issueChallenge(challengeId) };
    const renderer = await render(<SignInCodeScreen />);
    const screen = renderer.root.findByType(Screen);
    expect(screen.props.scrollRef).toEqual({ current: expect.anything() });
    expect(typeof screen.props.onScroll).toBe('function');
    expect(typeof renderer.root.findByType(CodeStep).props.reveal).toBe(
      'function',
    );
  });
  test('Sign in waits for all 8 digits', async () => {
    const renderer = await codeStep();
    await type(renderer, 'account-sign-in-code', '0123');
    const signIn = renderer.root
      .findAllByType(Button)
      .find((node) => node.props.testID === 'account-sign-in')!;
    expect(signIn.props.disabled).toBe(true);
    expect(mocked.consumeCode).not.toHaveBeenCalled();
  });
  test('resend counts down in its own label, then expiry after 15 minutes', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const renderer = await codeStep();
    const resend = () =>
      renderer.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'account-resend',
      );
    expect(resend().props.accessibilityState.disabled).toBe(true);
    expect(shows(renderer, 'Send a new code in 1:00')).toBe(true);
    for (let second = 0; second < 59; second++)
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
    expect(shows(renderer, 'Send a new code in 0:01')).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(resend().props.accessibilityState.disabled).toBe(false);
    expect(shows(renderer, 'Send a new code')).toBe(true);
    await press(renderer, 'account-resend');
    expect(mocked.requestCode).toHaveBeenCalledTimes(1);
    expect(shows(renderer, accountCopy.newCodeSent(email))).toBe(true);
    await act(async () => {
      jest.setSystemTime(1_000_000 + 60_000 + 15 * 60_000);
    });
    await type(renderer, 'account-sign-in-code', '01234567');
    expect(mocked.consumeCode).not.toHaveBeenCalled();
    expect(refusal(renderer)).toBe(refusalCopy.codeFailed);
  });
});

describe('Delete account', () => {
  async function codeStep() {
    const renderer = await render(
      <DeleteCode challenge={issueChallenge(challengeId)} />,
    );
    return renderer;
  }
  async function deleteWith(renderer: Renderer, code: string) {
    await type(renderer, 'account-deletion-code', code);
    await press(renderer, 'account-delete-final');
    await confirmLast();
  }
  test.each(['android', 'ios'] as const)(
    '%s keeps the deletion request on screen with Android system Back blocked',
    async (os) => {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
      const prevent = jest.mocked(usePreventRemove);
      prevent.mockClear();
      let resolve!: (
        result: Awaited<ReturnType<typeof voice.deleteAccount>>,
      ) => void;
      mocked.deleteAccount.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      try {
        const renderer = await codeStep();
        expect(prevent.mock.lastCall?.[0]).toBe(
          os === 'android' ? false : undefined,
        );
        await deleteWith(renderer, '01234567');
        if (os === 'android') {
          expect(prevent).toHaveBeenLastCalledWith(true, expect.any(Function));
          expect(router.dismissTo).not.toHaveBeenCalled();
          const dispatch = jest.mocked(useNavigation).mock.lastCall;
          expect(dispatch).toBeDefined();
          const nav = jest.mocked(useNavigation).mock.results.at(-1)!.value;
          act(() =>
            prevent.mock.lastCall![1]({
              data: { action: { type: 'GO_BACK' } },
            }),
          );
          expect(nav.dispatch).not.toHaveBeenCalled();
        } else {
          expect(prevent).not.toHaveBeenCalled();
        }
        await act(async () => resolve({ ok: false, error: 'network' }));
        expect(prevent.mock.lastCall?.[0]).toBe(
          os === 'android' ? false : undefined,
        );
      } finally {
        Object.defineProperty(Platform, 'OS', {
          configurable: true,
          value: original,
        });
      }
    },
  );
  test('Android lets the completed deletion return to Account through its guard', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    try {
      const renderer = await codeStep();
      await deleteWith(renderer, '01234567');
      const navigation = jest.mocked(useNavigation).mock.results.at(-1)!.value;
      const action = { type: 'POP_TO', payload: { name: 'account' } };
      act(() =>
        jest.mocked(usePreventRemove).mock.lastCall![1]({ data: { action } }),
      );
      expect(navigation.dispatch).toHaveBeenCalledWith(action);
      expect(router.dismissTo).toHaveBeenCalledWith('/account');
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: original,
      });
    }
  });
  test('step 1 says what is deleted and kept, then emails a code', async () => {
    const renderer = await render(<DeleteIntro />);
    for (const line of [
      accountCopy.deleteLede,
      accountCopy.deletedHeader,
      ...accountCopy.deletedRows,
      accountCopy.keptHeader,
      ...accountCopy.keptRows,
    ])
      expect(shows(renderer, line)).toBe(true);
    const policy = renderer.root.findByProps({
      testID: 'account-deletion-policy',
    });
    expect(policy.props.external).toBe(true);
    act(() => policy.props.onPress());
    expect(openOnWeb).toHaveBeenLastCalledWith(
      '/privacy#privacy-deletion',
      accountCopy.deletionPolicy,
    );
    await press(renderer, 'account-delete-confirm');
    expect(mocked.requestDeletionCode).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/delete/code',
      params: { challenge: challengeId },
    });
  });
  test('a refused deletion-code request stays on step 1', async () => {
    mocked.requestDeletionCode.mockResolvedValueOnce({
      ok: false,
      error: 'rateLimited',
    });
    const renderer = await render(<DeleteIntro />);
    await press(renderer, 'account-delete-confirm');
    expect(refusal(renderer)).toBe(refusalCopy.tooManyCodes);
    expect(router.push).not.toHaveBeenCalled();
    expect(button(renderer, 'account-delete-confirm')).toBeTruthy();
  });
  test('an ended session on step 1 offers sign-in again', async () => {
    mocked.requestDeletionCode.mockResolvedValueOnce({
      ok: false,
      error: 'signedOut',
    });
    const renderer = await render(<DeleteIntro />);
    await press(renderer, 'account-delete-confirm');
    expect(refusal(renderer)).toBe(refusalCopy.signedOut);
    await press(renderer, 'account-deletion-sign-in');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/sign-in',
      params: { return: 'account' },
    });
  });
  test('the code step opened cold returns to step 1', async () => {
    const renderer = await render(<DeleteCodeScreen />);
    expect(renderer.root.findByType('Redirect' as never).props.href).toBe(
      '/account/delete',
    );
  });
  test.each(['android', 'ios'] as const)(
    '%s supplies its emailed deletion-code autofill hint',
    async (os) => {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
      try {
        const renderer = await codeStep();
        expect(field(renderer, 'account-deletion-code').props).toMatchObject({
          autoComplete: os === 'android' ? 'email-otp' : 'one-time-code',
          textContentType: 'oneTimeCode',
          keyboardType: 'number-pad',
        });
      } finally {
        Object.defineProperty(Platform, 'OS', {
          configurable: true,
          value: original,
        });
      }
    },
  );
  test('the deletion code field never shows a clear button, even focused', async () => {
    const renderer = await codeStep();
    expect(
      (await hostInput(renderer, 'account-deletion-code')).props
        .clearButtonMode,
    ).toBe('never');
  });
  test('step 2: a hidden-label code field, then a deliberate, confirmed Delete', async () => {
    const renderer = await codeStep();
    expect(field(renderer, 'account-deletion-code').props).toMatchObject({
      grouped: true,
      labelHidden: true,
      label: 'Deletion code',
      textContentType: 'oneTimeCode',
      keyboardType: 'number-pad',
    });
    expect(
      renderer.root.findByProps({ testID: 'account-delete-final' }).props
        .disabled,
    ).toBe(true);
    await type(renderer, 'account-deletion-code', '0123 4567');
    expect(mocked.deleteAccount).not.toHaveBeenCalled();
    await press(renderer, 'account-delete-final');
    expect(confirmAction).toHaveBeenCalledWith(
      'Delete your OPAX account?',
      [
        expect.objectContaining({
          title: 'Delete account',
          destructive: true,
        }),
      ],
      undefined,
      'This can’t be undone.',
    );
    expect(mocked.deleteAccount).not.toHaveBeenCalled();
    await confirmLast();
    expect(mocked.deleteAccount).toHaveBeenCalledWith(challengeId, '01234567');
    // 6.5: Ask's local conversations go, and Account shows the notice.
    expect(clearAskConversations).toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith('/account');
    const groups = await render(<AccountGroups />);
    expect(shows(groups, accountCopy.deletedNotice)).toBe(true);
  });
  test('conversations that could not be cleared say so on Account', async () => {
    jest
      .mocked(clearAskConversations)
      .mockRejectedValueOnce(new Error('fixture'));
    const renderer = await codeStep();
    await deleteWith(renderer, '01234567');
    const groups = await render(<AccountGroups />);
    expect(failure(groups)).toBe(accountCopy.localChatsError);
  });
  // Review P3-2: a credential-store fault signs this device out without the
  // Worker deleting anything. The page says so and offers sign-in again.
  test('a fault that signed this device out says the account was not deleted', async () => {
    mocked.deleteAccount.mockResolvedValueOnce({
      ok: false,
      error: 'unavailable',
    });
    mocked.status.mockResolvedValue({ ok: true, value: signedOut });
    const renderer = await codeStep();
    await deleteWith(renderer, '01234567');
    expect(refusal(renderer)).toBe(refusalCopy.deletionSignedOutHere);
    expect(has(renderer, 'account-delete-final')).toBe(false);
    await press(renderer, 'account-deletion-sign-in');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/sign-in',
      params: { return: 'account' },
    });
  });
  test('a Worker outage keeps the session and the usual answer', async () => {
    mocked.status.mockResolvedValue({ ok: true, value: status() });
    mocked.deleteAccount.mockResolvedValueOnce({
      ok: false,
      error: 'unavailable',
    });
    const renderer = await codeStep();
    await deleteWith(renderer, '01234567');
    expect(refusal(renderer)).toBe(refusalCopy.deletionUnavailable);
    expect(has(renderer, 'account-delete-final')).toBe(true);
  });
  test('after five deletion codes the challenge is not tried again', async () => {
    mocked.deleteAccount.mockResolvedValue({
      ok: false,
      error: 'deletionVerificationFailed',
    });
    const renderer = await codeStep();
    await type(renderer, 'account-deletion-code', '76543210');
    for (let i = 0; i < 6; i++) {
      await press(renderer, 'account-delete-final');
      await confirmLast();
    }
    expect(mocked.deleteAccount).toHaveBeenCalledTimes(5);
    expect(refusal(renderer)).toBe(refusalCopy.deletionCodeFailed);
  });
  test('a wrong deletion code, then an ended session', async () => {
    mocked.deleteAccount
      .mockResolvedValueOnce({ ok: false, error: 'deletionVerificationFailed' })
      .mockResolvedValueOnce({ ok: false, error: 'signedOut' });
    const renderer = await codeStep();
    await deleteWith(renderer, '76543210');
    expect(refusal(renderer)).toBe(
      'That code didn’t work. Check it, or send a new deletion code.',
    );
    await press(renderer, 'account-delete-final');
    await confirmLast();
    expect(refusal(renderer)).toBe(refusalCopy.signedOut);
    expect(has(renderer, 'account-deletion-sign-in')).toBe(true);
  });
  test('resend waits, then sends a new deletion code', async () => {
    jest.useFakeTimers({ now: 2_000_000 });
    const renderer = await codeStep();
    expect(shows(renderer, 'Send a new deletion code in 1:00')).toBe(true);
    await act(async () => {
      jest.setSystemTime(2_000_000 + 60_000);
      jest.advanceTimersByTime(1_000);
    });
    await press(renderer, 'account-deletion-resend');
    expect(mocked.requestDeletionCode).toHaveBeenCalledTimes(1);
    expect(shows(renderer, accountCopy.newDeletionCodeSent)).toBe(true);
  });
});
