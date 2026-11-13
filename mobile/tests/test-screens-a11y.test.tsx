import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import VoiceBridgeTestScreen from '../src/test-screens/VoiceBridgeTestScreen';
import Workbench from '../src/workbench/Workbench';
import * as voice from '../src/voice';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

// These developer routes are audited too. Every voice boundary is inert:
// rendering and cleanup only, with no call start, device or audio service.
jest.mock('../src/voice', () => ({
  subscribe: jest.fn(() => () => {}),
  status: jest.fn(async () => ({ ok: true, value: null })),
  end: jest.fn(async () => ({ ok: true, value: null })),
}));
jest.mock('../src/features/talk/bridge', () => ({ setConsent: jest.fn() }));
jest.mock('expo-router', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    children ?? null;
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useIsPreview: () => false,
    useSegments: () => [],
    Link: Object.assign(Pass, {
      Trigger: Pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});

test('the voice bridge harness renders its controls with an inert voice boundary', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<VoiceBridgeTestScreen />);
  });
  expect(
    tree.root
      .findAllByProps({ testID: 'voice-bridge-test-title' })
      .some((node) => node.props.accessibilityRole === 'header'),
  ).toBe(true);
  expect(voice.status).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
  expect(voice.end).toHaveBeenCalledTimes(1);
});

test('the design workbench participates in the same rendered audit', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<Workbench />);
  });
  expect(
    tree.root.findAllByProps({ testID: 'workbench-screen' }).length,
  ).toBeGreaterThan(0);
});
