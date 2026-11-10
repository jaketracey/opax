import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinkRow } from '../src/design/primitives';
import { TalkSourcesScreen } from '../src/features/talk/SourcesSheet';
import {
  publishTalk,
  resetTalk,
  takeChosenSource,
} from '../src/features/talk/live';

jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 0,
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { back: jest.fn() },
}));

const source = {
  path: '/bill/example',
  title: 'Interactive Gambling (Cost Recovery Levy) Bill 2026',
};
const original = Platform.OS;
let renderer: TestRenderer.ReactTestRenderer;
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  resetTalk();
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: original,
  });
  jest.clearAllMocks();
});
test.each(['android', 'ios'] as const)(
  '%s retains a complete source title and its platform metadata placement',
  (os) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    publishTalk({
      sources: [source],
      active: true,
      live: true,
      status: 'Listening',
      phase: 'listening',
      end: jest.fn(),
    });
    act(() => {
      renderer = TestRenderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 402, height: 874 },
            insets: { top: 0, left: 0, right: 0, bottom: 24 },
          }}
        >
          <TalkSourcesScreen />
        </SafeAreaProvider>,
      );
    });
    const row = renderer.root.findByType(LinkRow);
    expect(row.props.title).toBe(source.title);
    expect(row.props.accessibilityLabel).toBe(
      `Bill · Date not published, ${source.title}`,
    );
    const metadata =
      os === 'android' ? row.props.aboveTitle : row.props.leading;
    expect(metadata.props).toMatchObject({
      wordSafe: true,
      variant: 'secondary',
      children: 'Bill · Date not published',
    });
    expect(
      os === 'android' ? row.props.leading : row.props.aboveTitle,
    ).toBeUndefined();
    act(() => row.props.onPress());
    expect(takeChosenSource()).toEqual(source);
    expect(router.back).toHaveBeenCalledTimes(1);
  },
);
