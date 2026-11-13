import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, IconButton, Text } from '../src/design/primitives';
import TalkScreen from '../src/features/talk/TalkScreen';
import { emptySnapshot, type TalkFailure } from '../src/features/talk/model';
import type { VoiceSnapshot, VoiceStatus } from '../src/voice';

// Design pass 4D: Talk stays minimal and calm. The orb is the only motion
// (the native canvas is left out here), one plain status line sits under it,
// the call controls are the shared round IconButton, and nothing starts a
// call but Start.
jest.mock('../src/features/talk/VoiceOrb', () => ({ VoiceOrb: () => null }));
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  usePreventRemove: jest.fn(),
  useNavigation: jest.fn(() => ({ dispatch: jest.fn() })),
}));
jest.mock('../src/features/talk/useVoiceLevels', () => ({
  useVoiceLevels: () => ({}),
}));
jest.mock('../src/features/talk/captions-preference', () => ({
  useCaptionsPreference: () => [false, jest.fn()],
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 0,
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));
jest.mock('../src/features/Person', () => ({ ProfileScreen: () => null }));
jest.mock('../src/features/Electorate', () => ({
  ElectorateScreen: () => null,
}));
jest.mock('../src/features/bills/BillDetail', () => () => null);
jest.mock('../src/features/records/DocumentReader', () => () => null);
jest.mock('../src/features/records/BillTextReader', () => () => null);

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
let mockCall: ReturnType<typeof call>;
function call(snapshot: Partial<VoiceSnapshot>, active = false) {
  return {
    snapshot: { ...emptySnapshot, ...snapshot },
    consent: true,
    consentLoaded: true,
    error: null as TalkFailure | null,
    terminal: null,
    busy: false,
    active,
    start: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    changeConsent: jest.fn(async () => true),
    agreeAndStart: jest.fn(async () => undefined),
    end: jest.fn(async () => ({ ok: true as const, value: undefined })),
    mute: jest.fn(async () => undefined),
    send: jest.fn(async () => undefined),
  };
}
jest.mock('../src/features/talk/useTalk', () => ({
  useTalk: () => mockCall,
}));

const rendered: TestRenderer.ReactTestRenderer[] = [];
function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 402, height: 874 },
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
        }}
      >
        <TalkScreen />
      </SafeAreaProvider>,
    );
  });
  rendered.push(renderer);
  return renderer;
}
afterEach(() => {
  act(() => rendered.splice(0).forEach((renderer) => renderer.unmount()));
});
const line = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root
    .findAllByType(Text)
    .find((node) => node.props.testID === testID);

test('idle and signed in: Start is the one primary action, and nothing starts by itself', () => {
  mockCall = call({ state: 'idle', status: status() });
  const renderer = render();
  const primaries = renderer.root
    .findAllByType(Button)
    .filter((node) => node.props.variant === 'primary');
  expect(primaries.map((node) => node.props.testID)).toEqual(['talk-start']);
  expect(mockCall.start).not.toHaveBeenCalled();
  expect(mockCall.agreeAndStart).not.toHaveBeenCalled();
  // Ready needs no line: Start says it.
  expect(line(renderer, 'talk-state')).toBeUndefined();
});

test('iOS keeps native Back handling while Talk is focused during a call', () => {
  mockCall = call({ state: 'live', mode: 'listening', status: status() }, true);
  const back = jest.spyOn(BackHandler, 'addEventListener');
  try {
    render();
    let blur: void | (() => void);
    act(() => {
      blur = jest.mocked(useFocusEffect).mock.lastCall![0]();
    });
    expect(blur).toBeUndefined();
    expect(back).not.toHaveBeenCalled();
    expect(usePreventRemove).not.toHaveBeenCalled();
  } finally {
    back.mockRestore();
  }
});

test('an open session on the account still offers Start, with no refusal line', () => {
  mockCall = call({
    state: 'ready',
    status: status({ activeSession: { state: 'active', expiresAt: null } }),
  });
  const renderer = render();
  const start = renderer.root
    .findAllByType(Button)
    .find((node) => node.props.testID === 'talk-start')!;
  expect(start).toBeDefined();
  expect(start.props.disabled).toBeFalsy();
  expect(line(renderer, 'talk-state')).toBeUndefined();
});

test('while voice is checked, the status says so and Start waits with a spinner', () => {
  mockCall = call({ state: 'idle', status: null });
  const renderer = render();
  // Spoken only (7.5): no visible line, the orb's status element says it.
  expect(line(renderer, 'talk-state')).toBeUndefined();
  expect(
    renderer.root.findByProps({ testID: 'talk-status' }).props
      .accessibilityLabel,
  ).toBe('Checking voice');
  const start = renderer.root
    .findAllByType(Button)
    .find((node) => node.props.testID === 'talk-start')!;
  expect(start.props).toMatchObject({ variant: 'primary', loading: true });
});

test.each([
  [{ state: 'connecting' } as const, 'Connecting'],
  [{ state: 'live', mode: 'listening' } as const, 'Listening'],
  [{ state: 'live', mode: 'speaking' } as const, 'OPAX is speaking'],
  [{ state: 'live', mode: 'muted' } as const, 'Muted'],
  [{ state: 'ending' } as const, 'Ending the call'],
])('during a call the status line says %j in plain words', (state, words) => {
  mockCall = call({ ...state, status: status() }, true);
  const renderer = render();
  const shown = line(renderer, 'talk-state')!;
  expect(shown.props.children).toBe(words);
  // VoiceOver hears it once, from the status element by the orb.
  expect(shown.props.accessibilityElementsHidden).toBe(true);
  expect(
    renderer.root.findByProps({ testID: 'talk-status' }).props
      .accessibilityLabel,
  ).toBe(words);
});

test('the call controls are the shared round IconButton, mute said as selected', () => {
  mockCall = call(
    {
      state: 'live',
      mode: 'muted',
      status: status(),
      sources: [{ path: '/bill/example', title: 'Example record' }],
    },
    true,
  );
  const renderer = render();
  const controls = renderer.root
    .findAllByType(IconButton)
    .map((node) => node.props);
  expect(controls.map((props) => props.testID)).toEqual([
    'talk-mute',
    'talk-type',
    'talk-sources',
    'talk-end',
  ]);
  for (const props of controls) expect(props.size).toBe('large');
  const mute = controls.find((props) => props.testID === 'talk-mute')!;
  expect(mute).toMatchObject({ selected: true, accessibilityLabel: 'Mute' });
  expect(controls.find((props) => props.testID === 'talk-end')!.variant).toBe(
    'danger',
  );
  expect(
    controls.find((props) => props.testID === 'talk-sources')!,
  ).toMatchObject({ badge: 1, accessibilityLabel: 'Sources, 1' });
});

test('signed out, the free minutes line sits under its one action', () => {
  mockCall = call({
    state: 'idle',
    status: status({ signedIn: false, unlimited: null }),
  });
  const renderer = render();
  expect(line(renderer, 'talk-message')).toBeUndefined();
  expect(line(renderer, 'talk-free-minutes')!.props.children).toBe(
    'A free OPAX account includes 10 minutes of voice.',
  );
  expect(
    renderer.root
      .findAllByType(Button)
      .filter((node) => node.props.variant === 'primary')
      .map((node) => node.props.testID),
  ).toEqual(['talk-sign-in']);
});

test('an expired session without a status payload still offers Sign in', () => {
  mockCall = { ...call({ state: 'failed', status: null }), error: 'signedOut' };
  const renderer = render();
  expect(
    renderer.root.findAllByType(Button).map((node) => node.props.testID),
  ).toContain('talk-sign-in');
  expect(
    renderer.root.findAllByType(Button).map((node) => node.props.testID),
  ).not.toContain('talk-start');
  expect(line(renderer, 'talk-free-minutes')?.props.children).toBe(
    'Talk needs a free OPAX account.',
  );
  expect(
    renderer.root.findByProps({ testID: 'talk-status' }).props
      .accessibilityLabel,
  ).toBe('Talk needs a free OPAX account.');
  expect(mockCall.start).not.toHaveBeenCalled();
});

// A sign-in that started from Talk (specs/account.md 1.5, 5.8 item 6): once
// Talk has read the new status and consent, it opens the consent sheet if
// consent is not given, once, and never starts a call itself.
describe('back from a Talk sign-in', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { router, useFocusEffect } = require('expo-router');
  const { useEffect } = require('react');
  const {
    requestConsentAfterSignIn,
  } = require('../src/features/talk/consent-store');
  /* eslint-enable @typescript-eslint/no-require-imports */
  beforeEach(() => {
    jest.mocked(router.push).mockClear();
    // Focus runs on mount (the screen keeps its focus callback stable).
    jest
      .mocked(useFocusEffect)
      .mockImplementation((effect: () => void) =>
        useEffect(() => effect(), [effect]),
      );
  });
  afterEach(() => {
    jest.mocked(useFocusEffect).mockReset();
  });
  function signedIn(consent: boolean, settled: number) {
    return {
      ...call({ state: 'idle', status: status() }),
      consent,
      consentLoaded: settled > 0,
      settled,
    };
  }
  function update(renderer: TestRenderer.ReactTestRenderer) {
    act(() =>
      renderer.update(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 402, height: 874 },
            insets: { top: 0, left: 0, right: 0, bottom: 34 },
          }}
        >
          <TalkScreen />
        </SafeAreaProvider>,
      ),
    );
  }
  test('consent not given: the consent sheet opens once, after the reads settle', () => {
    requestConsentAfterSignIn();
    mockCall = signedIn(false, 0);
    const renderer = render();
    // The status and consent reads have not settled yet.
    expect(router.push).not.toHaveBeenCalled();
    mockCall = signedIn(false, 1);
    update(renderer);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/talk/consent' });
    // Later reads never open it again, and nothing starts a call.
    mockCall = signedIn(false, 2);
    update(renderer);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(mockCall.start).not.toHaveBeenCalled();
    expect(mockCall.agreeAndStart).not.toHaveBeenCalled();
  });
  test('consent already given: Start shows ready and nothing opens', () => {
    requestConsentAfterSignIn();
    mockCall = signedIn(true, 0);
    const renderer = render();
    mockCall = signedIn(true, 1);
    update(renderer);
    expect(router.push).not.toHaveBeenCalled();
    expect(mockCall.start).not.toHaveBeenCalled();
    expect(
      renderer.root
        .findAllByType(Button)
        .filter((node) => node.props.variant === 'primary')
        .map((node) => node.props.testID),
    ).toEqual(['talk-start']);
  });
  test('without a Talk sign-in, a settled read opens nothing', () => {
    mockCall = signedIn(false, 0);
    const renderer = render();
    mockCall = signedIn(false, 1);
    update(renderer);
    expect(router.push).not.toHaveBeenCalled();
  });
});

// The consent sheet at AX5 (7.7): the root is capped at the space the sheet
// can use, the text scrolls, and the two buttons sit outside the scroll view.
test('the consent sheet keeps its buttons pinned under a capped root', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const {
    ConsentSheet,
    SHEET_HEADER,
  } = require('../src/features/talk/Consent');
  const { ScrollView, StyleSheet } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 402, height: 874 },
          insets: { top: 62, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ConsentSheet />
      </SafeAreaProvider>,
    );
  });
  rendered.push(renderer);
  const host = (testID: string) =>
    renderer.root.find(
      (node) => typeof node.type === 'string' && node.props.testID === testID,
    );
  const sheet = host('talk-consent-sheet');
  // The jest window is 750 pt tall unless a test sets one.
  const { height } = jest
    .requireActual('react-native')
    .Dimensions.get('window');
  expect(StyleSheet.flatten(sheet.props.style).maxHeight).toBe(
    height - 62 - SHEET_HEADER,
  );
  const scroll = renderer.root.findByType(ScrollView);
  const inScroll = (testID: string) =>
    scroll.findAll((node) => node.props.testID === testID).length > 0;
  expect(inScroll('talk-consent-privacy')).toBe(true);
  expect(inScroll('talk-consent-footer')).toBe(false);
  expect(inScroll('talk-agree')).toBe(false);
  expect(inScroll('talk-not-now')).toBe(false);
  const footer = host('talk-consent-footer');
  for (const id of ['talk-agree', 'talk-not-now'])
    expect(
      footer.findAll((node) => node.props.testID === id).length,
    ).toBeGreaterThan(0);
});

test('each callOpen case shows its own line once no call is on screen', () => {
  const cases: [TalkFailure, Partial<VoiceSnapshot>, string][] = [
    // A 409 from Start.
    [
      'callOpen',
      { state: 'failed', reason: 'failed' },
      'Your earlier call is still ending. Try again in a minute.',
    ],
    // Start refused while a call is still being set up and not yet shown.
    ['alreadyInCall', { state: 'checking' }, 'You’re already in a call.'],
    // Typed text that reached native after the call ended.
    [
      'notLive',
      { state: 'ended', reason: 'network' },
      'The call ended before your message was sent.',
    ],
  ];
  for (const [error, snapshot, copy] of cases) {
    mockCall = { ...call({ ...snapshot, status: status() }), error };
    const renderer = render();
    expect([error, line(renderer, 'talk-message')?.props.children]).toEqual([
      error,
      copy,
    ]);
  }
});
