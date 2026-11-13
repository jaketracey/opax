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
import { track } from '../src/analytics';

jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 0,
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { back: jest.fn() },
}));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
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
    // One source open from Talk's Sources sheet, never which source.
    expect(jest.mocked(track).mock.calls).toEqual([
      [
        'opax_source_open',
        {
          from_section: 'other',
          destination: 'app',
          placement: 'talk_sources',
        },
      ],
    ]);
  },
);

// Voice sources since im/voice-ask: Ask's labels, and Ask's pay rows on /ask.
test('an Ask-style source reads type and date, title, then speaker; a pay row stays', () => {
  const speech = {
    title: 'Alex Example: Committees',
    path: '/doc/speech-500101',
    recordTitle: 'Committees',
    speaker: 'Alex Example',
    date: '2001-06-21',
    type: 'Speech',
  };
  const pay = {
    title: 'Example office pay: every step since 1999',
    path: '/ask?q=How%20much%20is%20the%20example%20office%20paid%3F',
    recordTitle: 'Example office pay: every step since 1999',
    date: '1999–2026',
    type: 'Pay record',
  };
  publishTalk({
    sources: [speech, pay, source],
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
  const [first, second, third] = renderer.root.findAllByType(LinkRow);
  expect(first!.props.title).toBe('Committees');
  expect(first!.props.secondary.props).toMatchObject({
    variant: 'secondary',
    children: 'Alex Example',
  });
  expect(first!.props.accessibilityLabel).toBe(
    'Speech · 21 Jun 2001, Committees, Alex Example',
  );
  expect(first!.props.accessibilityHint).toBe(
    'Opens the record within the call',
  );
  expect(second!.props.title).toBe(pay.recordTitle);
  expect(second!.props.secondary).toBeUndefined();
  expect(second!.props.accessibilityLabel).toBe(
    `Pay record · 1999–2026, ${pay.recordTitle}`,
  );
  expect(second!.props.accessibilityHint).toBe('Opens in Ask after the call');
  expect(second!.props.external).toBe(true);
  // The shipped server's title-only source renders as before.
  expect(third!.props.title).toBe(source.title);
  expect(third!.props.secondary).toBeUndefined();
  act(() => second!.props.onPress());
  expect(takeChosenSource()).toEqual(pay);
});
