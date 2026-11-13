import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ConsentSheet } from '../src/features/talk/Consent';
import { setConsent } from '../src/features/talk/bridge';
import { takeStartAfterConsent } from '../src/features/talk/consent-store';
import { track } from '../src/analytics';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { back: jest.fn() },
}));
jest.mock('../src/features/talk/bridge', () => ({ setConsent: jest.fn() }));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
let renderer: ReactTestRenderer;
let resolve!: (saved: boolean) => void;
const press = (testID: string) =>
  renderer.root
    .findAll(
      (node) =>
        node.props.testID === testID &&
        typeof node.props.onPress === 'function',
    )[0]!
    .props.onPress();
beforeEach(() => {
  jest.clearAllMocks();
  takeStartAfterConsent();
  jest.mocked(setConsent).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ConsentSheet />
      </SafeAreaProvider>,
    );
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  takeStartAfterConsent();
});

test('Not now while agreement is saving never starts a call or navigates back twice', async () => {
  act(() => press('talk-agree'));
  act(() => press('talk-not-now'));
  act(() => renderer.unmount());
  await act(async () => resolve(true));
  expect(takeStartAfterConsent()).toBe(false);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('swiping away while agreement is saving never queues a call on return', async () => {
  act(() => press('talk-agree'));
  act(() => renderer.unmount());
  await act(async () => resolve(true));
  expect(takeStartAfterConsent()).toBe(false);
  expect(router.back).not.toHaveBeenCalled();
});

test('agreement dispatches once, then queues one call after the save succeeds', async () => {
  act(() => {
    press('talk-agree');
    press('talk-agree');
  });
  expect(setConsent).toHaveBeenCalledTimes(1);
  await act(async () => resolve(true));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(takeStartAfterConsent()).toBe(true);
  expect(takeStartAfterConsent()).toBe(false);
});

describe('consent analytics', () => {
  const sent = () =>
    jest
      .mocked(track)
      .mock.calls.filter(([event]) => event === 'opax_talk')
      .map(([, properties]) => properties);

  test('shown, then accepted once the agreement is saved, and never declined after', async () => {
    expect(sent()).toEqual([{ action: 'consent_shown' }]);
    act(() => press('talk-agree'));
    expect(sent()).toHaveLength(1);
    await act(async () => resolve(true));
    act(() => renderer.unmount());
    expect(sent()).toEqual([
      { action: 'consent_shown' },
      { action: 'consent_accepted' },
    ]);
  });

  test('Not now is one decline as the sheet closes', () => {
    act(() => press('talk-not-now'));
    act(() => renderer.unmount());
    expect(sent()).toEqual([
      { action: 'consent_shown' },
      { action: 'consent_declined' },
    ]);
  });

  test('a failed save is no agreement: closing then is a decline', async () => {
    act(() => press('talk-agree'));
    await act(async () => resolve(false));
    act(() => renderer.unmount());
    expect(sent()).toEqual([
      { action: 'consent_shown' },
      { action: 'consent_declined' },
    ]);
  });
});
