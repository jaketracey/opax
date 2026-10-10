import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, IconButton, Text } from '../src/design/primitives';
import TalkScreen from '../src/features/talk/TalkScreen';
import { emptySnapshot } from '../src/features/talk/model';
import type { VoiceSnapshot, VoiceStatus } from '../src/voice';

// Design pass 4D: Talk stays minimal and calm. The orb is the only motion
// (the native canvas is left out here), one plain status line sits under it,
// the call controls are the shared round IconButton, and nothing starts a
// call but Start.
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
jest.mock('expo-router', () => ({
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
    error: null,
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

test('while voice is checked, one plain line says so', () => {
  mockCall = call({ state: 'idle', status: null });
  const renderer = render();
  expect(line(renderer, 'talk-state')!.props.children).toBe('Checking voice');
});

test.each([
  [{ state: 'connecting' } as const, 'Connecting'],
  [{ state: 'live', mode: 'listening' } as const, 'Listening'],
  [{ state: 'live', mode: 'speaking' } as const, 'OPAX is speaking'],
  [{ state: 'live', mode: 'muted' } as const, 'Microphone muted'],
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
    'talk-captions',
    'talk-mute',
    'talk-end',
    'talk-sources',
  ]);
  for (const props of controls) expect(props.size).toBe('large');
  const mute = controls.find((props) => props.testID === 'talk-mute')!;
  expect(mute).toMatchObject({ selected: true, accessibilityLabel: 'Unmute' });
  expect(controls.find((props) => props.testID === 'talk-end')!.variant).toBe(
    'danger',
  );
  expect(
    controls.find((props) => props.testID === 'talk-sources')!,
  ).toMatchObject({ badge: 1, accessibilityLabel: 'Sources, 1' });
});

test('a refusal is one plain sentence with its one action', () => {
  mockCall = call({
    state: 'idle',
    status: status({ signedIn: false, unlimited: null }),
  });
  const renderer = render();
  expect(line(renderer, 'talk-message')!.props.children).toBe(
    'Voice needs a free OPAX account.',
  );
  expect(
    renderer.root
      .findAllByType(Button)
      .filter((node) => node.props.variant === 'primary')
      .map((node) => node.props.testID),
  ).toEqual(['talk-sign-in']);
});
