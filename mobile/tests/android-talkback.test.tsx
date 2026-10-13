import type { ReactElement, ReactNode } from 'react';
import type TestRendererType from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { emptySnapshot } from '../src/features/talk/model';
import type { VoiceSnapshot, VoiceStatus } from '../src/voice';

// TalkBack through Talk, sign-in, Account and deletion, as an Android build
// loads them (tokens, copy and focus read the platform when they load): every
// control labelled and at least 48dp, state changes spoken by a live region,
// focus moved rather than left on a control that has gone, and Back and Done
// asking before a call ends. No device: the accessibility props are the proof.

jest.mock('../src/features/talk/VoiceOrb', () => ({ VoiceOrb: () => null }));
jest.mock('../src/features/talk/useVoiceLevels', () => ({
  useVoiceLevels: () => ({}),
}));
jest.mock('../src/features/talk/captions-preference', () => ({
  useCaptionsPreference: () => [false, jest.fn()],
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 0,
}));
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockOptions = options;
      return null;
    },
  },
  useFocusEffect: jest.fn(),
}));
jest.mock('../src/design/menu', () => ({
  showMenu: jest.fn(),
  AndroidMenuHost: () => null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  };
});
jest.mock('../src/features/Person', () => ({ ProfileScreen: () => null }));
jest.mock('../src/features/Electorate', () => ({
  ElectorateScreen: () => null,
}));
jest.mock('../src/features/bills/BillDetail', () => () => null);
jest.mock('../src/features/records/DocumentReader', () => () => null);
jest.mock('../src/features/records/BillTextReader', () => () => null);
jest.mock('../src/features/talk/useTalk', () => ({
  useTalk: () => mockCall,
}));
jest.mock('../src/voice', () => ({
  status: jest.fn(),
  requestCode: jest.fn(),
  consumeCode: jest.fn(),
  logout: jest.fn(),
  requestDeletionCode: jest.fn(),
  deleteAccount: jest.fn(),
  subscribe: jest.fn(() => () => {}),
}));

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
let mockCall: ReturnType<typeof talk>;
function talk(snapshot: Partial<VoiceSnapshot>, more: object = {}) {
  return {
    snapshot: { ...emptySnapshot, ...snapshot },
    consent: true,
    consentLoaded: true,
    error: null,
    terminal: null,
    busy: false,
    microphone: null,
    active: ['checking', 'reserving', 'connecting', 'live', 'ending'].includes(
      snapshot.state ?? 'idle',
    ),
    start: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    changeConsent: jest.fn(async () => true),
    agreeAndStart: jest.fn(async () => undefined),
    allowMicrophone: jest.fn(async () => undefined),
    declineMicrophone: jest.fn(),
    end: jest.fn(async () => ({ ok: true as const, value: undefined })),
    mute: jest.fn(async () => undefined),
    send: jest.fn(async () => undefined),
    ...more,
  };
}

type Loaded = {
  React: typeof import('react');
  TestRenderer: typeof TestRendererType;
  RN: typeof import('react-native');
  showMenu: jest.Mock;
  voice: Record<string, jest.Mock>;
  load: <T>(path: string) => T;
};
type Spies = {
  announce: jest.SpyInstance;
  focus: jest.SpyInstance;
  legacyFocus: jest.SpyInstance;
  back: jest.SpyInstance;
  alert: jest.SpyInstance;
  settings: jest.SpyInstance;
};
type Shown = {
  app: Loaded;
  renderer: TestRendererType.ReactTestRenderer;
  spies: Spies;
};
function spy(RN: Loaded['RN'], screenReader: boolean): Spies {
  const a11y = RN.AccessibilityInfo;
  jest.spyOn(a11y, 'isScreenReaderEnabled').mockResolvedValue(screenReader);
  jest
    .spyOn(a11y, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
  return {
    announce: jest
      .spyOn(a11y, 'announceForAccessibility')
      .mockImplementation(() => {}),
    focus: jest
      .spyOn(a11y, 'sendAccessibilityEvent')
      .mockImplementation(() => {}),
    legacyFocus: jest
      .spyOn(a11y, 'setAccessibilityFocus')
      .mockImplementation(() => {}),
    back: jest.spyOn(RN.BackHandler, 'addEventListener'),
    alert: jest.spyOn(RN.Alert, 'alert').mockImplementation(() => {}),
    settings: jest
      .spyOn(RN.Linking, 'openSettings')
      .mockResolvedValue(undefined),
  };
}
/**
 * Runs a whole test in a fresh registry whose React Native is Android from
 * the first import. React Native's exports load lazily, so rendering and
 * every interaction stay inside it.
 */
async function android(run: (show: Show) => Promise<void>) {
  await jest.isolateModulesAsync(async () => {
    const RN = jest.requireActual('react-native');
    Object.defineProperty(RN.Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    const app: Loaded = {
      React: jest.requireActual('react'),
      TestRenderer: jest.requireActual('react-test-renderer'),
      RN,
      showMenu: jest.requireMock<{ showMenu: jest.Mock }>('../src/design/menu')
        .showMenu,
      voice: jest.requireMock('../src/voice'),
      load: (path) => jest.requireActual(path),
    };
    const mounted: TestRendererType.ReactTestRenderer[] = [];
    const show: Show = async (element, { screenReader = false } = {}) => {
      const spies = spy(RN, screenReader);
      let renderer!: TestRendererType.ReactTestRenderer;
      await app.React.act(async () => {
        renderer = app.TestRenderer.create(element(app));
      });
      mounted.push(renderer);
      return { app, renderer, spies };
    };
    show.mount = (element) => {
      let renderer!: TestRendererType.ReactTestRenderer;
      app.React.act(() => {
        renderer = app.TestRenderer.create(element);
      });
      mounted.push(renderer);
      return renderer;
    };
    try {
      await run(show);
    } finally {
      app.React.act(() => mounted.splice(0).forEach((r) => r.unmount()));
    }
  });
}
type Show = {
  (
    element: (app: Loaded) => ReactElement,
    options?: { screenReader?: boolean },
  ): Promise<Shown>;
  mount: (element: ReactElement) => TestRendererType.ReactTestRenderer;
};
afterEach(() => {
  jest.restoreAllMocks();
});
const talkScreen = (app: Loaded) => {
  const TalkScreen = app.load<{ default: () => ReactElement }>(
    '../src/features/talk/TalkScreen',
  ).default;
  return <TalkScreen />;
};
const byID = (renderer: TestRendererType.ReactTestRenderer, id: string) =>
  renderer.root.find(
    (node) => node.props.testID === id && typeof node.type === 'string',
  );
const pressable = (renderer: TestRendererType.ReactTestRenderer, id: string) =>
  renderer.root.find(
    (node) =>
      node.props.testID === id && typeof node.props.onPress === 'function',
  );

/** Every TalkBack control: a label, a role, and 48dp to touch. */
function expectTargets(renderer: TestRendererType.ReactTestRenderer) {
  const controls = renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      ['button', 'link', 'switch'].includes(node.props.accessibilityRole),
  );
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    const label = control.props.accessibilityLabel;
    const style = StyleSheet.flatten(control.props.style) ?? {};
    const tall = Math.max(
      Number(style.minHeight ?? 0),
      Number(style.height ?? 0),
    );
    expect([label, typeof label === 'string' && label.length > 0]).toEqual([
      label,
      true,
    ]);
    expect([label, tall >= 48]).toEqual([label, true]);
    if (style.width !== undefined)
      expect([label, Number(style.width) >= 48]).toEqual([label, true]);
  }
  return controls;
}

describe('Talk with TalkBack', () => {
  test('ready: every control is labelled and 48dp; the status is a live region', () =>
    android(async (show) => {
      mockCall = talk({ state: 'ready', status: status() });
      const { renderer, spies } = await show(talkScreen);
      expectTargets(renderer);
      const state = byID(renderer, 'talk-status');
      expect(state.props.accessibilityLiveRegion).toBe('polite');
      expect(state.props.accessibilityLabel).toBe(
        'Ready to talk. Microphone off.',
      );
      // TalkBack hears the live region; no second, deprecated announcement.
      expect(spies.announce).not.toHaveBeenCalled();
      // The drawn line repeats it, so TalkBack skips the line.
      const allowance = renderer.root.findAll(
        (node) => node.props.testID === 'talk-allowance',
      );
      expect(allowance.length).toBeGreaterThan(0);
    }));

  test('connecting, live, muted, ending, ended and the caps are each spoken by the live region', () =>
    android(async (show) => {
      const steps: [Partial<VoiceSnapshot>, object, string][] = [
        [{ state: 'connecting' }, {}, 'Connecting'],
        [{ state: 'live', mode: 'listening' }, {}, 'Listening'],
        [{ state: 'live', mode: 'speaking' }, {}, 'OPAX is speaking'],
        [{ state: 'live', mode: 'muted' }, {}, 'Microphone muted'],
        [{ state: 'ending' }, {}, 'Ending the call'],
        [
          { state: 'ended', reason: 'user', status: status() },
          { terminal: 'user' },
          'Call ended. Microphone off.',
        ],
        [
          { state: 'ended', reason: 'allowanceExhausted', status: status() },
          { terminal: 'allowanceExhausted' },
          'Your free minutes are used up. Microphone off.',
        ],
        [
          { state: 'ended', reason: 'callLimit', status: status() },
          { terminal: 'callLimit' },
          'This call reached its limit. Microphone off.',
        ],
        [
          { state: 'ended', reason: 'deadline', status: status() },
          { terminal: 'deadline' },
          'The call reached its time limit. Microphone off.',
        ],
      ];
      mockCall = talk({ state: 'ready', status: status() });
      const { app, renderer } = await show(talkScreen);
      for (const [snapshot, more, words] of steps) {
        mockCall = talk({ status: status(), ...snapshot }, more);
        await app.React.act(async () => renderer.update(talkScreen(app)));
        const state = renderer.root.find(
          (node) =>
            typeof node.type === 'string' &&
            ['talk-status', 'talk-record-status'].includes(node.props.testID),
        );
        expect([words, state.props.accessibilityLiveRegion]).toEqual([
          words,
          'polite',
        ]);
        expect(state.props.accessibilityLabel).toBe(words);
      }
    }));

  test('a call’s controls: labelled, said as selected, 56dp, and the hint names TalkBack', () =>
    android(async (show) => {
      mockCall = talk({
        state: 'live',
        mode: 'muted',
        status: status(),
        sources: [
          { title: 'Fixture record one', path: '/doc/fixture-one' },
          { title: 'Fixture record two', path: '/doc/fixture-two' },
        ],
      });
      const { renderer } = await show(talkScreen, { screenReader: true });
      const controls = expectTargets(renderer);
      const labels = controls.map((node) => node.props.accessibilityLabel);
      expect(labels).toEqual(
        expect.arrayContaining([
          'Captions',
          'Unmute',
          'End call',
          'Sources, 2',
        ]),
      );
      const mute = byID(renderer, 'talk-mute');
      expect(mute.props.accessibilityState).toMatchObject({ selected: true });
      expect(StyleSheet.flatten(mute.props.style)).toMatchObject({
        width: 56,
        height: 56,
      });
      expect(byID(renderer, 'talk-status').props.accessibilityHint).toBe(
        'Headphones keep TalkBack speech out of the microphone.',
      );
    }));

  test('how a call ended takes TalkBack’s focus, by the Android event', () =>
    android(async (show) => {
      mockCall = talk(
        { state: 'ended', reason: 'allowanceExhausted', status: status() },
        { terminal: 'allowanceExhausted' },
      );
      const { renderer, spies } = await show(talkScreen, {
        screenReader: true,
      });
      const state = renderer.root.find(
        (node) =>
          typeof node.type === 'string' && node.props.testID === 'talk-status',
      );
      expect(spies.focus).toHaveBeenCalledWith(
        expect.objectContaining({}),
        'focus',
      );
      // setAccessibilityFocus does nothing on Android.
      expect(spies.legacyFocus).not.toHaveBeenCalled();
      expect(state.props.accessibilityLabel).toBe(
        'Your free minutes are used up. Microphone off.',
      );
    }));

  test('the bar: More opens Talk’s menu as a sheet, Done asks before ending a call', () =>
    android(async (show) => {
      mockCall = talk({
        state: 'live',
        mode: 'listening',
        remaining: 420,
        status: status(),
      });
      const { app, spies } = await show(talkScreen);
      const headerRight = mockOptions.headerRight as () => ReactElement;
      expect(typeof headerRight).toBe('function');
      const bar = show.mount(headerRight());
      const controls = expectTargets(bar);
      expect(controls.map((node) => node.props.accessibilityLabel)).toEqual([
        'More options',
        'Done',
      ]);
      app.React.act(() => pressable(bar, 'header-more').props.onPress());
      expect(app.showMenu).toHaveBeenCalledTimes(1);
      const [title, actions] = app.showMenu.mock.calls[0]!;
      expect(title).toBe('Over 5 min left in this call');
      expect(actions.map((action: { title: string }) => action.title)).toEqual([
        'Type a message',
        'Withdraw voice consent',
      ]);
      app.React.act(() => pressable(bar, 'header-done').props.onPress());
      expect(spies.alert).toHaveBeenCalledWith(
        'End the conversation?',
        undefined,
        expect.any(Array),
      );
    }));

  test('a menu’s submenu opens as its own sheet', () =>
    android(async (show) => {
      mockCall = talk({
        state: 'ready',
        status: status(),
        transcript: [{ role: 'agent', id: 1, text: 'Fixture answer.' }],
        sources: [
          { title: 'Fixture record one', path: '/doc/fixture-one' },
          { title: 'Fixture record two', path: '/doc/fixture-two' },
        ],
      });
      const { app } = await show(talkScreen);
      const bar = show.mount((mockOptions.headerRight as () => ReactElement)());
      app.React.act(() => pressable(bar, 'header-more').props.onPress());
      const actions = app.showMenu.mock.calls[0]![1] as {
        title: string;
        onPress: () => void;
      }[];
      expect(actions.map((action) => action.title)).toEqual([
        'Report this answer',
        'Voice privacy',
        'Withdraw voice consent',
      ]);
      actions[0]!.onPress();
      expect(app.showMenu).toHaveBeenLastCalledWith(
        'Report this answer',
        expect.any(Array),
      );
      const records = app.showMenu.mock.lastCall![1] as { title: string }[];
      expect(records.map((record) => record.title)).toEqual([
        'Fixture record one',
        'Fixture record two',
      ]);
    }));

  test('Back during a call asks first; at rest it is left to the navigator', () =>
    android(async (show) => {
      mockCall = talk({ state: 'live', mode: 'listening', status: status() });
      const live = await show(talkScreen);
      const handler = live.spies.back.mock.calls.find(
        ([name]) => name === 'hardwareBackPress',
      )?.[1] as () => boolean;
      expect(handler).toBeDefined();
      let handled = false;
      live.app.React.act(() => {
        handled = handler();
      });
      expect(handled).toBe(true);
      expect(live.spies.alert).toHaveBeenCalledWith(
        'End the conversation?',
        undefined,
        expect.any(Array),
      );
      const before = live.spies.back.mock.calls.length;
      mockCall = talk({ state: 'ready', status: status() });
      const idle = await show(talkScreen);
      expect(
        idle.spies.back.mock.calls
          .slice(before)
          .filter(([name]) => name === 'hardwareBackPress'),
      ).toHaveLength(0);
    }));
});

describe('the microphone rationale with TalkBack', () => {
  test('it replaces Start, takes focus at its heading and says the iOS purpose', () =>
    android(async (show) => {
      mockCall = talk(
        { state: 'ready', status: status() },
        {
          microphone: 'rationale',
        },
      );
      const { app, renderer, spies } = await show(talkScreen);
      const { policy } = app.load<{ policy: { microphonePurpose: string } }>(
        '../plugins/voiceProduction',
      );
      expect(
        renderer.root.findAll((node) => node.props.testID === 'talk-start'),
      ).toHaveLength(0);
      const heading = renderer.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'header' &&
          node.props.accessibilityLabel === 'Microphone access',
      );
      expect(heading.props.accessible).toBe(true);
      expect(spies.focus).toHaveBeenCalledWith(
        heading.instance ?? expect.anything(),
        'focus',
      );
      expect(JSON.stringify(renderer.toJSON())).toContain(
        policy.microphonePurpose,
      );
      expectTargets(renderer);
      app.React.act(() =>
        pressable(renderer, 'talk-microphone-continue').props.onPress(),
      );
      expect(mockCall.allowMicrophone).toHaveBeenCalledTimes(1);
      app.React.act(() =>
        pressable(renderer, 'talk-microphone-not-now').props.onPress(),
      );
      expect(mockCall.declineMicrophone).toHaveBeenCalledTimes(1);
    }));

  test('the consent panel also takes focus at its heading', () =>
    android(async (show) => {
      mockCall = talk({ state: 'ready', status: status() }, { consent: false });
      const { app, renderer, spies } = await show(talkScreen);
      app.React.act(() => pressable(renderer, 'talk-start').props.onPress());
      const heading = renderer.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'header' &&
          node.props.accessibilityLabel === 'Before you talk',
      );
      expect(heading).toBeDefined();
      expect(spies.focus).toHaveBeenCalledWith(expect.anything(), 'focus');
      expectTargets(renderer);
    }));

  test('denied: one line and Start, which asks again', () =>
    android(async (show) => {
      mockCall = talk(
        { state: 'ready', status: status() },
        { microphone: 'denied' },
      );
      const { renderer } = await show(talkScreen);
      expect(byID(renderer, 'talk-status').props.accessibilityLabel).toBe(
        'Allow microphone access to talk.',
      );
      expect(pressable(renderer, 'talk-start')).toBeDefined();
    }));

  test('“Don’t ask again”: one line and Open Settings', () =>
    android(async (show) => {
      mockCall = talk(
        { state: 'ready', status: status() },
        { microphone: 'blocked' },
      );
      const { app, renderer, spies } = await show(talkScreen);
      expect(byID(renderer, 'talk-status').props.accessibilityLabel).toBe(
        'Turn on microphone access in Settings to talk.',
      );
      expect(
        renderer.root.findAll((node) => node.props.testID === 'talk-start'),
      ).toHaveLength(0);
      app.React.act(() => pressable(renderer, 'talk-settings').props.onPress());
      expect(spies.settings).toHaveBeenCalledTimes(1);
    }));

  test('signed out: Sign in, with the 16+ line as on iPhone', () =>
    android(async (show) => {
      mockCall = talk({ state: 'ready', status: status({ signedIn: false }) });
      const { renderer } = await show(talkScreen);
      expectTargets(renderer);
      expect(pressable(renderer, 'talk-sign-in')).toBeDefined();
      expect(JSON.stringify(renderer.toJSON())).toContain(
        'Accounts and voice are for people aged 16 and over.',
      );
    }));
});

describe('accounts with TalkBack', () => {
  const ok = <T,>(value: T) => ({ ok: true as const, value });

  test('sign-in: labelled fields and actions, the age line, and a refusal TalkBack is moved to', () =>
    android(async (show) => {
      const { app, renderer, spies } = await show((loaded) => {
        const { SignInFlow } = loaded.load<
          typeof import('../src/features/account/SignInFlow')
        >('../src/features/account/SignInFlow');
        return <SignInFlow onSignedIn={jest.fn()} />;
      });
      const email = renderer.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'account-email',
      );
      expect(email.props.accessibilityLabel).toBe('Email');
      expectTargets(renderer);
      expect(JSON.stringify(renderer.toJSON())).toContain(
        'Accounts and voice are for people aged 16 and over.',
      );
      // A bad address: the refusal is an alert TalkBack lands on.
      await app.React.act(async () =>
        pressable(renderer, 'account-send-code').props.onPress(),
      );
      const alert = renderer.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'alert',
      );
      expect(alert.props.accessibilityLabel).toBe(
        'Enter a valid email address.',
      );
      expect(spies.focus).toHaveBeenCalledWith(expect.anything(), 'focus');
      // The code step, from a synthetic challenge: a labelled code field.
      app.voice.requestCode!.mockResolvedValue(
        ok({ sent: true, challengeId: 'c'.repeat(43) }),
      );
      await app.React.act(async () =>
        email.props.onChangeText('reader@example.invalid'),
      );
      await app.React.act(async () =>
        pressable(renderer, 'account-send-code').props.onPress(),
      );
      const code = renderer.root.find(
        (node) =>
          typeof node.type === 'string' && node.props.testID === 'account-code',
      );
      expect(code.props.accessibilityLabel).toBe('8-digit code');
      expectTargets(renderer);
    }));

  test('signed in: the account reads “this phone”, with sign-out and deletion at 48dp', () =>
    android(async (show) => {
      const { app, renderer } = await show((loaded) => {
        loaded.voice.status!.mockResolvedValue(ok(status()));
        const { AccountSection } = loaded.load<
          typeof import('../src/features/account/AccountSection')
        >('../src/features/account/AccountSection');
        return <AccountSection />;
      });
      await app.React.act(async () => {});
      const text = JSON.stringify(renderer.toJSON());
      expect(text).toContain('Signed in on this phone');
      expect(text).not.toContain('iPhone');
      const labels = expectTargets(renderer).map(
        (node) => node.props.accessibilityLabel,
      );
      expect(labels).toEqual(['Sign out of this phone', 'Delete account']);
    }));

  test('deletion: each step is labelled and 48dp, and says “this phone” when done', () =>
    android(async (show) => {
      const { app, renderer } = await show((loaded) => {
        const { DeleteAccountFlow } = loaded.load<
          typeof import('../src/features/account/DeleteAccountFlow')
        >('../src/features/account/DeleteAccountFlow');
        return (
          <DeleteAccountFlow
            onCancel={jest.fn()}
            onDone={jest.fn()}
            onSignIn={jest.fn()}
          />
        );
      });
      expectTargets(renderer);
      const confirm = JSON.stringify(renderer.toJSON());
      expect(confirm).toContain('What is deleted');
      expect(confirm).toContain('What is not deleted');
      const { accountCopy } = app.load<
        typeof import('../src/features/account/copy')
      >('../src/features/account/copy');
      expect(accountCopy.accountDeletedDetail).toContain(
        'This phone is signed out.',
      );
      expect(accountCopy.accountDeletedDetail).not.toContain('iPhone');
    }));
});
