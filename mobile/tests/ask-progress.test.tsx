import { useSyncExternalStore } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState } from 'react-native';
import { haptic } from '../src/design/haptics';
import { Pressable } from '../src/design/pressable';
import { Text } from '../src/design/text';
import { AskThread } from '../src/features/ask/AskThread';
import { AskController } from '../src/features/ask/controller';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import { postAsk } from '../src/features/ask/transport';
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
const hideThread = () => act(() => tree.update(<></>));
const showThread = () => act(() => tree.update(<Thread />));
async function rateFailure(retryAfter: string | null) {
  const failure = await postAsk(
    'http://127.0.0.1:8940/api/ask?stream=1',
    async () =>
      ({
        status: 429,
        ok: false,
        headers: { get: () => retryAfter },
      }) as unknown as Response,
    new AbortController().signal,
  ).catch((error) => error);
  expect(failure).toBeInstanceOf(AskFailure);
  return failure as AskFailure;
}
async function rejectBusy(retryAfter: string | null) {
  const failure = await rateFailure(retryAfter);
  await act(async () => {
    fail(failure);
    await request;
  });
  return failure;
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

test('Retry-After 60 counts down in tabular figures and announces once at the server deadline', async () => {
  start();
  await rejectBusy('60');
  expect(label()).toBe('Try again in 60 s');
  expect(retry().props.disabled).toBe(true);
  expect(retry().props.accessibilityLiveRegion).toBe('none');
  expect(retry().props.accessibilityLabel).toBe('Try again');
  expect(
    tree.root.findAllByType(Text).find((n) => n.props.children === label())!
      .props.tabular,
  ).toBe(true);
  act(() => jest.advanceTimersByTime(59_000));
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

test.each(['network', 'server', undefined] as const)(
  'generic blocked reason %s does not imply a content rejection',
  (reason) => {
    expect(
      askErrorCopy(
        new AskFailure('blocked', 'Try rewording private server text', reason),
      ),
    ).toEqual({
      message: "This question couldn't be sent.",
      retry: false,
    });
  },
);

test('Retry-After HTTP date counts down to the absolute server deadline', async () => {
  start();
  const retryAt = Date.now() + 60_000;
  const failure = await rejectBusy(new Date(retryAt).toUTCString());
  expect(failure.retryAt).toBe(retryAt);
  expect(label()).toBe('Try again in 60 s');
  act(() => jest.advanceTimersByTime(59_000));
  expect(label()).toBe('Try again in 1 s');
  expect(retry().props.disabled).toBe(true);
  act(() => jest.advanceTimersByTime(1000));
  expect(label()).toBe('Try again');
  expect(retry().props.disabled).toBe(false);
});

test.each([null, 'invalid', '-1', '1.5'])(
  'Retry-After %s uses a 30 second fallback from the failure',
  async (header) => {
    start();
    const receivedAt = Date.now();
    const failure = await rejectBusy(header);
    expect(failure.retryAt).toBe(receivedAt + 30_000);
    expect(label()).toBe('Try again in 30 s');
    act(() => jest.advanceTimersByTime(29_000));
    expect(retry().props.disabled).toBe(true);
    act(() => jest.advanceTimersByTime(1000));
    expect(label()).toBe('Try again');
    expect(retry().props.disabled).toBe(false);
  },
);

test.each(['3600', 'Fri, 31 Dec 9999 23:59:59 GMT', '9'.repeat(400)])(
  'Retry-After %s counts down from the 120 s cap, never longer',
  async (header) => {
    start();
    const receivedAt = Date.now();
    const failure = await rejectBusy(header);
    expect(failure.retryAt).toBe(receivedAt + 120_000);
    expect(label()).toBe('Try again in 120 s');
    act(() => jest.advanceTimersByTime(119_000));
    expect(label()).toBe('Try again in 1 s');
    expect(retry().props.disabled).toBe(true);
    act(() => jest.advanceTimersByTime(1000));
    expect(label()).toBe('Try again');
    expect(retry().props.disabled).toBe(false);
  },
);

test('a past Retry-After date counts down the short 30 s default', async () => {
  start();
  const receivedAt = Date.now();
  const failure = await rejectBusy(new Date(receivedAt - 60_000).toUTCString());
  expect(failure.retryAt).toBe(receivedAt + 30_000);
  expect(label()).toBe('Try again in 30 s');
  act(() => jest.advanceTimersByTime(30_000));
  expect(label()).toBe('Try again');
  expect(retry().props.disabled).toBe(false);
});

test('a deadline beyond the cap (a clock set back) never shows more than 120 s', async () => {
  start();
  await act(async () => {
    fail(
      new AskFailure('rate-limited', 'Busy', undefined, Date.now() + 3_600_000),
    );
    await request;
  });
  expect(label()).toBe('Try again in 120 s');
  act(() => jest.advanceTimersByTime(60_000));
  expect(label()).toBe('Try again in 120 s');
  expect(retry().props.disabled).toBe(true);
});

test.each(['60', null])(
  'retry deadline survives a part-way remount with header %s',
  async (header) => {
    start();
    const failure = await rejectBusy(header);
    const duration = header ? 60 : 30;
    act(() => jest.advanceTimersByTime(10_000));
    hideThread();
    act(() => jest.advanceTimersByTime(10_000));
    showThread();
    expect(controller.snapshot().error).toBe(failure);
    expect(label()).toBe(`Try again in ${duration - 20} s`);
    act(() => jest.advanceTimersByTime((duration - 21) * 1000));
    expect(label()).toBe('Try again in 1 s');
    expect(retry().props.disabled).toBe(true);
    expect(
      AccessibilityInfo.announceForAccessibilityWithOptions,
    ).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1000));
    expect(label()).toBe('Try again');
    expect(retry().props.disabled).toBe(false);
    expect(
      AccessibilityInfo.announceForAccessibilityWithOptions,
    ).toHaveBeenCalledTimes(1);
    hideThread();
    act(() => jest.advanceTimersByTime(60_000));
    showThread();
    expect(label()).toBe('Try again');
    expect(
      AccessibilityInfo.announceForAccessibilityWithOptions,
    ).toHaveBeenCalledTimes(1);
  },
);

test('a new question cancels the old countdown and its announcement', async () => {
  start();
  await rejectBusy('60');
  act(() => jest.advanceTimersByTime(5000));
  start();
  act(() => jest.advanceTimersByTime(60_000));
  expect(
    AccessibilityInfo.announceForAccessibilityWithOptions,
  ).not.toHaveBeenCalled();
  await complete();
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

test('a delayed mount uses the question submission time for the arrival haptic', async () => {
  hideThread();
  const sentAt = Date.now();
  start();
  expect(controller.snapshot().thread.at(-1)?.at).toBe(sentAt);
  act(() => jest.advanceTimersByTime(2800));
  showThread();
  act(() => jest.advanceTimersByTime(200));
  act(() => handlers.delta('First words.'));
  expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
  hideThread();
  showThread();
  await complete();
  expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
});

test.each([0, 2000])(
  'a remount %i ms after the first words arrived away never taps',
  async (away) => {
    start();
    act(() => jest.advanceTimersByTime(5000));
    hideThread();
    act(() => handlers.delta('First words.'));
    act(() => jest.advanceTimersByTime(away));
    showThread();
    expect(haptic).not.toHaveBeenCalled();
    act(() => handlers.delta(' More words.'));
    hideThread();
    showThread();
    await complete();
    expect(haptic).not.toHaveBeenCalled();
  },
);

test('a remount after a whole answer arrived away never taps', async () => {
  start();
  act(() => jest.advanceTimersByTime(5000));
  hideThread();
  await complete();
  showThread();
  expect(haptic).not.toHaveBeenCalled();
});

test('a remount after the first-text tap never taps again', async () => {
  start();
  act(() => jest.advanceTimersByTime(5000));
  act(() => handlers.delta('First words.'));
  expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
  for (const wait of [0, 500, 5000]) {
    hideThread();
    act(() => jest.advanceTimersByTime(wait));
    showThread();
  }
  act(() => handlers.delta(' More words.'));
  await complete();
  hideThread();
  showThread();
  expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
});

test.each(['streamed', 'whole'] as const)(
  'two threads on one session (Ask open in two tab stacks) tap once for %s text',
  async (arrival) => {
    const both = () =>
      act(() =>
        tree.update(
          <>
            <Thread />
            <Thread />
          </>,
        ),
      );
    both();
    start();
    act(() => jest.advanceTimersByTime(5000));
    if (arrival === 'streamed') act(() => handlers.delta('First words.'));
    else await complete();
    expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
    hideThread();
    both();
    if (arrival === 'streamed') await complete();
    expect(jest.mocked(haptic).mock.calls).toEqual([['light']]);
    start();
    act(() => jest.advanceTimersByTime(3000));
    await complete();
    expect(jest.mocked(haptic).mock.calls).toEqual([['light'], ['light']]);
  },
);

test('the controller keeps the first-text arrival per question, across a recovery', async () => {
  start();
  expect(controller.snapshot().firstText).toBeNull();
  act(() => jest.advanceTimersByTime(4000));
  act(() => handlers.delta('  '));
  expect(controller.snapshot().firstText).toBeNull();
  act(() => handlers.delta('First words.'));
  const first = controller.snapshot().firstText;
  expect(first).toEqual({ at: 104_000, waited: 4000 });
  act(() => jest.advanceTimersByTime(1000));
  act(() => {
    handlers.retry();
    handlers.delta('Rewritten words.');
  });
  await complete();
  expect(controller.snapshot().firstText).toBe(first);
  start();
  expect(controller.snapshot().firstText).toBeNull();
  act(() => jest.advanceTimersByTime(3500));
  await complete();
  expect(controller.snapshot().firstText).toEqual({
    at: 108_500,
    waited: 3500,
  });
});

test.each([
  [0, true],
  [999, true],
  [1000, false],
  [60_000, false],
])(
  'an arrival first seen %i ms after it came taps: %s (never a late tap)',
  (late, taps) => {
    const s = { ...controller.snapshot(), firstText: null };
    const view = (firstText: { at: number; waited: number } | null) => (
      <AskThread
        s={{ ...s, firstText }}
        chat={undefined}
        profiles={profiles}
        names={[]}
        topics={[]}
        paneShowsSources={false}
        onAsk={noop}
        onRetry={noop}
        onTurnLayout={noop}
        minHeight={0}
      />
    );
    act(() => tree.update(view(null)));
    act(() => tree.update(view({ at: Date.now() - late, waited: 5000 })));
    expect(jest.mocked(haptic).mock.calls).toEqual(taps ? [['light']] : []);
  },
);

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
