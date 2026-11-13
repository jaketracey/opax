import { act } from 'react';
import type TestRenderer from 'react-test-renderer';
import { fireEvent, render } from '@testing-library/react-native';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import TalkScreen from '../src/features/talk/TalkScreen';
import {
  applyEvent,
  emptySnapshot,
  type TalkSnapshot,
} from '../src/features/talk/model';
import { AnswerCaption } from '../src/features/talk/AnswerCaption';
import { TRANSCRIPT_EDGE_HEIGHT } from '../src/features/talk/TranscriptEdge';
import {
  talkRecordRouteFor,
  talkSourcesRoute,
} from '../src/navigation/routes/account';
import type { VoiceEvent } from '../src/voice';

jest.mock('../src/features/talk/VoiceOrb', () => ({ VoiceOrb: () => null }));
jest.mock('../src/features/talk/useVoiceLevels', () => ({
  useVoiceLevels: () => ({}),
}));
jest.mock('../src/features/talk/captions-preference', () => ({
  useCaptionsPreference: () => [true, jest.fn()],
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 0,
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
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

let mockSnapshot: TalkSnapshot;
jest.mock('../src/features/talk/useTalk', () => ({
  useTalk: () => ({
    snapshot: mockSnapshot,
    consent: true,
    consentLoaded: true,
    error: null,
    terminal: null,
    busy: false,
    active: mockSnapshot.state === 'live',
    start: jest.fn(),
    refresh: jest.fn(),
    changeConsent: jest.fn(),
    end: jest.fn(async () => ({ ok: true, value: undefined })),
    mute: jest.fn(),
    send: jest.fn(),
  }),
}));
const bill = { title: 'Gambling Reform Bill', path: '/bill/gambling' };
const person = { title: 'David Pocock', path: '/subject/person/david-pocock' };
const division = { title: 'Division 42', path: '/doc/division-42' };
let renderer: ReturnType<typeof render>;
const screen = () => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      insets: { top: 0, left: 0, right: 0, bottom: 34 },
    }}
  >
    <TalkScreen />
  </SafeAreaProvider>
);
const host = (testID: string) =>
  renderer.UNSAFE_root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const buttons = (caption: TestRenderer.ReactTestInstance) =>
  caption.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === 'button',
  );
const event = (value: VoiceEvent) => {
  mockSnapshot = applyEvent(mockSnapshot, value);
};
beforeEach(() => {
  jest.clearAllMocks();
  mockSnapshot = { ...emptySnapshot, state: 'live', mode: 'speaking' };
});
afterEach(() => jest.restoreAllMocks());
async function mount() {
  renderer = render(screen());
  await act(async () => {});
}
async function update() {
  renderer.rerender(screen());
  await act(async () => {});
}

test('shows clean captions and accessible per-turn chips that open real records', async () => {
  const first = {
    role: 'agent' as const,
    id: 1,
    text: 'Let me check the record. August nineteen twenty twenty-six had eleven ayes.',
  };
  const question = {
    role: 'user' as const,
    id: 2,
    text: 'Uh, has he he tried again?',
  };
  const second = {
    role: 'agent' as const,
    id: 3,
    text: 'Let me check the record. There were twenty-four noes.',
  };
  event({ type: 'sources', sources: [bill, person] });
  event({ type: 'transcript', turns: [first] });
  event({ type: 'transcript', turns: [first, question] });
  event({ type: 'sources', sources: [bill, person, division] });
  event({ type: 'transcript', turns: [first, question, second] });
  await mount();
  const captions = renderer.UNSAFE_root.findAllByType(AnswerCaption);
  expect(captions[0]!.props.sources).toHaveLength(2);
  expect(
    captions.map((caption) =>
      caption
        .findAll(
          (node) =>
            typeof node.type === 'string' &&
            node.props.accessibilityLabel?.startsWith('OPAX said'),
        )
        .map((node) => node.props.accessibilityLabel),
    ),
  ).toEqual([
    ['OPAX said 19 August 2026 had 11 ayes.'],
    [],
    ['OPAX said There were 24 noes.'],
  ]);
  expect(
    renderer.UNSAFE_root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.children === 'Let me check the record.',
    ),
  ).toHaveLength(0);
  expect(
    host('talk-turn-user').findAll(
      (node) =>
        node.props.accessibilityLabel === 'You said has he tried again?',
    ).length,
  ).toBeGreaterThan(0);
  expect(
    buttons(captions[0]!).map((node) => node.props.accessibilityLabel),
  ).toEqual([
    'Open Gambling Reform Bill, Bill · Date not published',
    'Open David Pocock, Parliamentarian · Date not published',
  ]);
  expect(buttons(captions[1]!)).toHaveLength(0);
  expect(buttons(captions[2]!)).toHaveLength(1);
  for (const caption of [captions[0]!, captions[2]!]) {
    for (const button of buttons(caption)) {
      expect(button.props.accessibilityRole).toBe('button');
      const style = StyleSheet.flatten(button.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      fireEvent.press(button);
    }
  }
  expect(router.push).toHaveBeenNthCalledWith(1, talkRecordRouteFor(bill.path));
  expect(router.push).toHaveBeenNthCalledWith(
    2,
    talkRecordRouteFor(person.path),
  );
  expect(router.push).toHaveBeenNthCalledWith(
    3,
    talkRecordRouteFor(division.path),
  );
  expect(host('talk-sources').props.accessibilityLabel).toBe('Sources, 3');
  const scroll = renderer.UNSAFE_root.findAllByType(ScrollView).find(
    (node) => node.props.testID === 'talk-captions-list',
  )!;
  expect(
    StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop,
  ).toBeGreaterThan(TRANSCRIPT_EDGE_HEIGHT);
  expect(host('talk-transcript-edge').props.pointerEvents).toBe('none');
});

test('a placeholder appears once as a working line and disappears from history', async () => {
  const first = {
    role: 'agent' as const,
    id: 1,
    text: 'Let me check the record.',
  };
  const second = { ...first, id: 2 };
  event({ type: 'transcript', turns: [first, second] });
  await mount();
  expect(host('talk-working').props.children).toBe('Let me check the record.');
  expect(
    renderer.UNSAFE_root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'talk-turn-agent',
    ),
  ).toHaveLength(0);
  event({
    type: 'transcript',
    turns: [
      first,
      { ...second, text: 'Let me check the record. The bill passed.' },
    ],
  });
  await update();
  expect(
    renderer.UNSAFE_root.findAll(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'talk-working',
    ),
  ).toHaveLength(0);
  expect(
    host('talk-turn-agent').findAll(
      (node) => node.props.children === 'The bill passed.',
    ).length,
  ).toBeGreaterThan(0);
  event({ type: 'transcript', turns: [first] });
  event({ type: 'state', state: 'ended', reason: 'user' });
  await update();
  expect(
    renderer.UNSAFE_root.findAll(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'talk-working',
    ),
  ).toHaveLength(0);
});

test('limits chips to three, opens more in Sources, and uses the web record flow', async () => {
  const web = { title: 'Donations', path: '/money/donations' };
  event({
    type: 'transcript',
    turns: [{ role: 'agent', id: 1, text: 'The records are here.' }],
  });
  event({
    type: 'sources',
    sources: [
      web,
      bill,
      person,
      division,
      { title: 'Another bill', path: '/bill/other' },
    ],
  });
  await mount();
  const chips = buttons(renderer.UNSAFE_root.findByType(AnswerCaption));
  expect(chips).toHaveLength(4);
  expect(chips[3]!.props.accessibilityLabel).toBe(
    '2 more sources, opens Sources',
  );
  fireEvent.press(chips[3]!);
  expect(router.push).toHaveBeenCalledWith(talkSourcesRoute);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  fireEvent.press(chips[0]!);
  expect(alert).toHaveBeenCalledWith(
    'Open after the call?',
    expect.stringContaining('Donations'),
    expect.any(Array),
  );
});

test('an Ask pay row asks before ending the call, then opens an unsent Ask draft', async () => {
  const pay = {
    title: 'Example office pay: every step since 1999',
    path: '/ask?q=How%20much%20is%20the%20example%20office%20paid%3F',
    recordTitle: 'Example office pay: every step since 1999',
    date: '1999–2026',
    type: 'Pay record',
  };
  event({
    type: 'transcript',
    turns: [{ role: 'agent', id: 1, text: 'The pay records are here.' }],
  });
  event({ type: 'sources', sources: [pay] });
  await mount();
  const [chip] = buttons(renderer.UNSAFE_root.findByType(AnswerCaption));
  expect(chip!.props.accessibilityHint).toBe('Offers to open in Ask');
  expect(chip!.props.accessibilityLabel).toBe(
    `Open ${pay.title}, Pay record · 1999–2026`,
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  fireEvent.press(chip!);
  expect(alert).toHaveBeenCalledWith(
    'Open after the call?',
    `${pay.title} opens in Ask, which would end the call.`,
    expect.any(Array),
  );
  const actions = alert.mock.calls[0]![2]!;
  const now = actions.find((action) => action.text === 'End call and open');
  await act(async () => {
    now!.onPress!();
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: '/(tabs)/(ask)/ask',
    params: expect.objectContaining({
      question: 'How much is the example office paid?',
    }),
  });
  expect(router.push).not.toHaveBeenCalled();
});
