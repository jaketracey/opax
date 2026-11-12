import { useSyncExternalStore } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native';
import { haptic } from '../src/design/haptics';
import { Pressable } from '../src/design/pressable';
import { Skeleton } from '../src/design/states';
import { Text } from '../src/design/text';
import { colors } from '../src/design/tokens';
import { AskProgress } from '../src/features/ask/AskProgress';
import { AskThread } from '../src/features/ask/AskThread';
import { AskController } from '../src/features/ask/controller';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import { askErrorCopy } from '../src/features/ask/turn-copy';

jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../src/features/ask/AnswerView', () => ({
  AnswerView: () => null,
  SearchOpaxRow: () => null,
  machineNote: { title: 'Machine-written', body: [] },
}));
jest.mock('../src/features/ask/AskIdle', () => ({ fillComposer: jest.fn() }));
jest.mock('../src/features/ask/AskNext', () => ({ AskNext: () => null }));
jest.mock('../src/features/ask/AskRows', () => ({
  AskSuggestionRow: () => null,
}));

const profiles = new Map();
const noop = () => {};
const answer = { answer: 'A synthetic answer.', sources: [], citations: {} };
let tree: ReactTestRenderer;
let controller: AskController;
let handlers: StreamHandlers;
let finish: (answer: unknown) => void;
let fail: (error: Error) => void;
let request: Promise<void>;
const active = AppState.currentState;
function Thread() {
  const s = useSyncExternalStore(controller.subscribe, controller.snapshot);
  return (
    <AskThread
      s={s}
      chat={undefined}
      profiles={profiles}
      names={[]}
      topics={[]}
      paneShowsSources={false}
      onAsk={noop}
      onRetry={() => void controller.retry()}
      onTurnLayout={noop}
      minHeight={0}
    />
  );
}
function start() {
  act(() => {
    request = controller.submit('A synthetic question?');
  });
}
async function complete() {
  await act(async () => {
    finish(answer);
    await request;
  });
}
const retry = () =>
  tree.root
    .findAllByType(Pressable)
    .find((n) => n.props.testID === 'ask-retry')!;
const label = () =>
  tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .find((s) => typeof s === 'string' && s.startsWith('Try again'));
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(100_000);
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
    .mockImplementation(noop);
  controller = new AskController({
    post: (_path, _body, _signal, on) => {
      handlers = on!;
      return new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    },
    read: () => ({ v: 1, active: null, chats: [] }),
    save: async () => {},
    id: () => 'fixture',
    now: Date.now,
  });
  act(() => {
    tree = create(<Thread />);
  });
});
afterEach(() => {
  act(() => tree.unmount());
  controller.stop();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: active,
  });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('busy counts down in tabular figures, enables at zero and announces only once', async () => {
  start();
  await act(async () => {
    fail(new AskFailure('rate-limited', 'Private server text'));
    await request;
  });
  expect(label()).toBe('Try again in 30 s');
  expect(retry().props.disabled).toBe(true);
  expect(retry().props.accessibilityLiveRegion).toBe('none');
  expect(retry().props.accessibilityLabel).toBe('Try again');
  expect(
    tree.root.findAllByType(Text).find((n) => n.props.children === label())!
      .props.tabular,
  ).toBe(true);
  act(() => jest.advanceTimersByTime(29_000));
  expect(label()).toBe('Try again in 1 s');
  expect(retry().props.disabled).toBe(true);
  expect(
    AccessibilityInfo.announceForAccessibilityWithOptions,
  ).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1000));
  expect(label()).toBe('Try again');
  expect(retry().props.disabled).toBe(false);
  expect(
    tree.root.findAllByType(Text).find((n) => n.props.children === 'Try again')!
      .props.tone,
  ).toBe('navy');
  act(() => jest.advanceTimersByTime(60_000));
  expect(
    AccessibilityInfo.announceForAccessibilityWithOptions,
  ).toHaveBeenCalledTimes(1);
  expect(
    AccessibilityInfo.announceForAccessibilityWithOptions,
  ).toHaveBeenCalledWith('You can try again now', { queue: true });
  act(() => retry().props.onPress());
  expect(controller.snapshot().busy).toBe(true);
  await complete();
});

test('blocked reasons use known categories and never raw server text', () => {
  expect(
    askErrorCopy(new AskFailure('blocked', 'Private server text', 'network'))
      ?.reason,
  ).toBe('You can try again when you are online.');
  expect(
    askErrorCopy(new AskFailure('blocked', 'Private server text', 'server'))
      ?.reason,
  ).toBe('Try rewording your question with public details.');
  expect(askErrorCopy({ code: 'blocked' })?.reason).toBeUndefined();
});

test('the three answer skeleton bars use raised on the sunken ground', () => {
  act(() => tree.update(<AskProgress stage={null} streaming="" />));
  expect(tree.root.findByType(Skeleton).props).toMatchObject({
    count: 3,
    onSunken: true,
  });
  const fills = tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      StyleSheet.flatten(n.props.style)?.backgroundColor === colors.raised,
  );
  expect(fills.length).toBeGreaterThanOrEqual(3);
});

test.each([2999, 3000, 8000])(
  'first text after %i ms gives at most one light haptic',
  async (wait) => {
    start();
    act(() => jest.advanceTimersByTime(wait));
    act(() => handlers.delta('First words.'));
    expect(jest.mocked(haptic).mock.calls).toEqual(
      wait >= 3000 ? [['light']] : [],
    );
    act(() => handlers.delta(' More words.'));
    await complete();
    expect(jest.mocked(haptic).mock.calls).toEqual(
      wait >= 3000 ? [['light']] : [],
    );
  },
);

test('a final answer without streamed text also taps once after a long wait', async () => {
  start();
  act(() => jest.advanceTimersByTime(3000));
  await complete();
  expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
});

test('Stop consumes the wait and ignores late text and completion', async () => {
  start();
  act(() => jest.advanceTimersByTime(5000));
  act(() => controller.stop());
  act(() => handlers.delta('Late text.'));
  await complete();
  expect(haptic).not.toHaveBeenCalled();
});

test('a failure after waiting never taps, including retained partial text', async () => {
  start();
  act(() => jest.advanceTimersByTime(5000));
  await act(async () => {
    handlers.delta('Partial text.');
    fail(new AskFailure('partial', 'Failed'));
    await request;
  });
  expect(haptic).not.toHaveBeenCalled();
});

test('a no-answer result never taps', async () => {
  start();
  act(() => jest.advanceTimersByTime(5000));
  await act(async () => {
    finish({ ...answer, answer: '' });
    await request;
  });
  expect(haptic).not.toHaveBeenCalled();
});

test('a fast final answer never taps', async () => {
  start();
  act(() => jest.advanceTimersByTime(2999));
  await complete();
  expect(haptic).not.toHaveBeenCalled();
});

test('a failed turn without text never taps', async () => {
  start();
  act(() => jest.advanceTimersByTime(5000));
  await act(async () => {
    fail(new AskFailure('offline', 'Offline'));
    await request;
  });
  expect(haptic).not.toHaveBeenCalled();
});

test('a recovery and a second question each keep the first-text boundary', async () => {
  start();
  act(() => jest.advanceTimersByTime(3000));
  act(() => handlers.delta('First words.'));
  act(() => {
    handlers.retry();
    handlers.delta('Rewritten words.');
  });
  await complete();
  expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
  start();
  act(() => jest.advanceTimersByTime(3000));
  await complete();
  expect(jest.mocked(haptic).mock.calls).toEqual([['light'], ['light']]);
});

test('a new busy failure restarts its countdown and unmount clears its timer', async () => {
  start();
  await act(async () => {
    fail(new AskFailure('rate-limited', 'Busy'));
    await request;
  });
  act(() => jest.advanceTimersByTime(30_000));
  expect(label()).toBe('Try again');
  start();
  await act(async () => {
    fail(new AskFailure('rate-limited', 'Busy again'));
    await request;
  });
  expect(label()).toBe('Try again in 30 s');
  act(() => tree.update(<></>));
  act(() => jest.advanceTimersByTime(30_000));
  expect(
    AccessibilityInfo.announceForAccessibilityWithOptions,
  ).toHaveBeenCalledTimes(1);
});

test.each(['background', 'inactive'])(
  'first text while %s consumes the arrival without a delayed tap',
  async (state) => {
    start();
    act(() => jest.advanceTimersByTime(5000));
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: state,
    });
    act(() => handlers.delta('First words.'));
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    act(() => handlers.delta(' More words.'));
    await complete();
    expect(haptic).not.toHaveBeenCalled();
  },
);
