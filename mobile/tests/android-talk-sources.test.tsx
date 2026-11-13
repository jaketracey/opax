import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { RecordRow, Text } from '../src/design/primitives';
import { mapEvent } from '../src/voice/mapping';
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
  title: 'Example Records Bill 2026',
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
  '%s uses Ask’s record row for an older title-only source',
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
    const row = renderer.root.findByType(RecordRow);
    expect(row.props.title).toBe(source.title);
    expect(row.props.meta).toBe('Bill · Date not published');
    const target = renderer.root
      .findAllByProps({
        testID: 'talk-source-0',
      })
      .find((node) => typeof node.props.accessibilityLabel === 'string')!;
    expect(target.props.accessibilityLabel).toBe(
      `Bill · Date not published, ${source.title}`,
    );
    expect(
      row
        .findAllByType(Text)
        .map((node) => [node.props.variant, node.props.children]),
    ).toEqual([
      ['secondary', 'Bill · Date not published'],
      ['rowRecord', source.title],
    ]);
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
test.each(['android', 'ios'] as const)(
  '%s maps and renders type and date, title, then speaker; a pay row stays',
  (os) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
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
    const event = mapEvent({ type: 'sources', sources: [speech, pay, source] });
    expect(event?.type).toBe('sources');
    publishTalk({
      sources: event?.type === 'sources' ? event.sources : [],
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
    const [first, second, third] = renderer.root.findAllByType(RecordRow);
    expect(first!.props.title).toBe('Committees');
    expect(first!.props.speaker).toEqual({ name: 'Alex Example', party: null });
    expect(
      first!
        .findAllByType(Text)
        .map((node) => [node.props.variant, node.props.children]),
    ).toEqual([
      ['secondary', 'Speech · 21 Jun 2001'],
      ['rowRecord', 'Committees'],
      ['secondary', 'Alex Example'],
    ]);
    const target = renderer.root
      .findAllByProps({ testID: 'talk-source-0' })
      .find((node) => typeof node.props.accessibilityLabel === 'string')!;
    expect(target.props.accessibilityLabel).toBe(
      'Speech · 21 Jun 2001, Committees, Alex Example',
    );
    expect(first!.props.accessibilityHint).toBe(
      'Opens the record within the call',
    );
    expect(second!.props.title).toBe(pay.recordTitle);
    expect(second!.props.speaker).toBeNull();
    expect(second!.props.meta).toBe('Pay record · 1999–2026');
    expect(second!.props.accessibilityHint).toBe('Opens in Ask after the call');
    expect(second!.props.external).toBe(true);
    // The shipped server's title-only source renders as before.
    expect(third!.props.title).toBe(source.title);
    expect(third!.props.speaker).toBeNull();
    act(() => second!.props.onPress());
    expect(takeChosenSource()).toEqual(pay);
  },
);
