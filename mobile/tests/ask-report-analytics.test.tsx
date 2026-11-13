import { act } from 'react';
import { Linking, TextInput } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { NativeStackHeaderItem } from '@react-navigation/native-stack';
import { track } from '../src/analytics';
import ReportSheet from '../src/features/ask/ReportSheet';
import { answerTurn } from '../src/features/ask/session';

// Ask's report sheet sends opax_answer_feedback (docs/ANALYTICS.md): the sheet
// opened, and Mail opened with the report. Never the reason, the note, the
// question or the answer. Fixture names are invented.
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ turn: 'fixture-chat:1' }),
  router: { back: jest.fn() },
}));
let mockOptions: Record<string, unknown> = {};
jest.mock('../src/navigation/preview', () => ({
  RouteOptions: ({ options }: { options: Record<string, unknown> }) => {
    mockOptions = options;
    return null;
  },
}));
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/features/ask/session', () => ({ answerTurn: jest.fn() }));
jest.mock('../src/features/ask/store', () => ({
  chatsSnapshot: () => ({ chats: [] }),
}));
jest.mock('../src/features/ask/report-mail', () => ({
  reportReasons: ['Wrong', 'Missing', 'Unclear', 'Other'],
  reportMail: () => ({ url: 'mailto:corrections@example.org', text: 'x' }),
  reportText: () => 'x',
}));
jest.mock('../src/features/records/actions', () => ({
  copyText: jest.fn(),
}));

const question = 'Did Jane Citizen vote on the 2031 housing bill?';
const found = {
  chat: 'fixture-chat',
  index: 1,
  question: { role: 'user' as const, text: question },
  answer: { role: 'answer' as const, text: 'Jane Citizen voted yes.' },
};
let renderer: TestRenderer.ReactTestRenderer;
const openURL = jest.spyOn(Linking, 'openURL');
function render() {
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ReportSheet />
      </SafeAreaProvider>,
    );
  });
}
const email = () =>
  (
    mockOptions.unstable_headerRightItems as () => (NativeStackHeaderItem & {
      onPress: () => void;
    })[]
  )()[0]!;
const sent = () =>
  jest
    .mocked(track)
    .mock.calls.filter(([event]) => event === 'opax_answer_feedback')
    .map(([, properties]) => properties);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(answerTurn).mockReturnValue(found as never);
  openURL.mockResolvedValue(true);
});
afterEach(() => act(() => renderer.unmount()));

test('opening the sheet is one report_opened, however often it redraws', () => {
  render();
  expect(sent()).toEqual([{ surface: 'ask', action: 'report_opened' }]);
  act(() =>
    renderer.root
      .findAll(
        (n) =>
          n.props.testID === 'ask-report-reason-0' &&
          typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress(),
  );
  expect(sent()).toHaveLength(1);
});

test('Email sends report_sent_mail once Mail opens, and never the note', async () => {
  render();
  act(() =>
    renderer.root
      .findAll(
        (n) =>
          n.props.testID === 'ask-report-reason-1' &&
          typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress(),
  );
  act(() =>
    renderer.root
      .findByType(TextInput)
      .props.onChangeText('Jane Citizen was in the other chamber.'),
  );
  await act(async () => email().onPress());
  expect(openURL).toHaveBeenCalledTimes(1);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(sent()).toEqual([
    { surface: 'ask', action: 'report_opened' },
    { surface: 'ask', action: 'report_sent_mail' },
  ]);
  expect(JSON.stringify(jest.mocked(track).mock.calls)).not.toMatch(
    /Jane|housing|chamber|Missing|fixture-chat/,
  );
});

test('no Mail app is no report_sent_mail, and a missing answer is no report_opened', async () => {
  openURL.mockRejectedValueOnce(new Error('No mail app'));
  render();
  act(() =>
    renderer.root
      .findAll(
        (n) =>
          n.props.testID === 'ask-report-reason-0' &&
          typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress(),
  );
  await act(async () => email().onPress());
  expect(sent()).toEqual([{ surface: 'ask', action: 'report_opened' }]);
  act(() => renderer.unmount());
  jest.mocked(track).mockClear();
  jest.mocked(answerTurn).mockReturnValue(null);
  render();
  expect(sent()).toEqual([]);
});
