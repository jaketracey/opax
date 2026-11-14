import { useSyncExternalStore } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { useReduceMotionSetting } from '../src/design/accessibility';
import {
  moveAccessibilityFocus,
  requestFocus,
  takeFocusRequest,
} from '../src/design/keyboard';
import { Skeleton } from '../src/design/states';
import {
  AskProgress,
  STREAM_FADE_MS,
  STREAM_QUIET_MS,
  streamStarted,
} from '../src/features/ask/AskProgress';
import { AskThread } from '../src/features/ask/AskThread';
import { AnswerBody } from '../src/features/ask/AnswerBody';
import { parseAnswer, type Block } from '../src/features/ask/answer-markdown';
import { AskController } from '../src/features/ask/controller';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import {
  revealLength,
  revealWindow,
  type RevealBlock,
  type RevealInline,
} from '../src/features/ask/stream-reveal';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useAccessibilitySize: () => false,
}));
jest.mock('../src/design/keyboard', () => ({
  ...jest.requireActual('../src/design/keyboard'),
  moveAccessibilityFocus: jest.fn(),
}));
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

const noop = () => {};
const profiles = new Map();
let tree: ReactTestRenderer;
let controller: AskController;
let handlers: StreamHandlers;
let fail: (error: Error) => void;
let request: Promise<void>;
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
const byId = (testID: string) =>
  tree.root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === testID,
  );
type Node = ReturnType<typeof byId>[number];
const clear = (n: Node) =>
  StyleSheet.flatten(n.props.style)?.color === 'transparent';
/** The strings a host subtree draws, with those set clear left out. */
function drawn(node: Node | string, hidden = false, all = false): string {
  if (typeof node === 'string') return hidden && !all ? '' : node;
  const unseen = hidden || clear(node);
  return node.children.map((child) => drawn(child, unseen, all)).join('');
}
const settledText = () => drawn(byId('ask-streaming')[0]!);
const allText = () => drawn(byId('ask-streaming')[0]!, false, true).length;
const fresh = () => byId('ask-streaming-fresh');
const opacity = (n: Node) => StyleSheet.flatten(n.props.style)?.opacity;
const delta = (text: string) => act(() => handlers.delta(text));
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));
function start() {
  act(() => {
    request = controller.submit('A synthetic question?');
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(100_000);
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
    .mockImplementation(noop);
  controller = new AskController({
    post: (_path, _body, _signal, on) => {
      handlers = on!;
      return new Promise((_resolve, reject) => {
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
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('waiting shows the status line alone: no skeleton in the answer shape', () => {
  start();
  act(() => handlers.stage('Writing the answer'));
  tick(60_000);
  expect(byId('ask-status-row')).toHaveLength(1);
  expect(tree.root.findAllByType(Skeleton)).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ label: 'Loading the answer' }),
  ).toHaveLength(0);
  expect(byId('ask-streaming')).toHaveLength(0);
  expect(byId('ask-stream-tail')).toHaveLength(0);
  // Nothing else is drawn in the live turn while it waits.
  expect(byId('ask-progress')[0]!.children).toHaveLength(1);
  // The line itself carries the waiting state.
  expect(byId('ask-status-row')[0]!.props.accessibilityState).toEqual({
    busy: true,
  });
});

test('the first delta puts text where the status line was, and the line fades out of flow', () => {
  start();
  act(() => handlers.stage('Writing the answer'));
  delta('Housing was debated twice.');
  expect(settledText()).toBe('Housing was debated twice.');
  // The text arrives clear and fades; the line goes over it, out of flow
  // and out of VoiceOver's reach, so nothing moves and nothing is read twice.
  expect(opacity(byId('ask-streamed')[0]!)).toBe(0);
  const slot = byId('ask-status-slot')[0]!;
  expect(StyleSheet.flatten(slot.props.style)).toMatchObject({
    position: 'absolute',
    top: 0,
  });
  expect(slot.props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    pointerEvents: 'none',
  });
  expect(STREAM_FADE_MS).toBeLessThan(200);
  tick(STREAM_FADE_MS);
  expect(byId('ask-status-slot')).toHaveLength(0);
  expect(byId('ask-status-row')).toHaveLength(0);
  expect(settledText()).toBe('Housing was debated twice.');
});

test('a cached replay in several pieces builds up, each new piece fading over text already laid out', () => {
  start();
  delta('Housing was debated twice. ');
  tick(STREAM_FADE_MS);
  expect(fresh()).toHaveLength(0);
  delta('The bill passed in March. ');
  // Laid out at once, so later lines never jump; drawn only by the fade.
  expect(allText()).toBe(
    'Housing was debated twice. The bill passed in March.'.length,
  );
  expect(settledText()).toBe('Housing was debated twice.');
  expect(fresh()).toHaveLength(1);
  expect(opacity(fresh()[0]!)).toBe(0);
  expect(drawn(fresh()[0]!)).toBe(' The bill passed in March.');
  // The fading layer sits over the text, out of flow and out of VoiceOver.
  const layer = byId('ask-streaming-layer')[0]!;
  expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
    position: 'absolute',
  });
  expect(layer.props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    pointerEvents: 'none',
  });
  // Pieces landing mid-fade wait for it, then share one fade.
  tick(STREAM_FADE_MS / 2);
  delta('Two senators ');
  delta('spoke against it.');
  expect(drawn(fresh()[0]!)).toBe(' The bill passed in March.');
  tick(STREAM_FADE_MS / 2);
  expect(settledText()).toBe(
    'Housing was debated twice. The bill passed in March.',
  );
  expect(drawn(fresh()[0]!)).toBe(' Two senators spoke against it.');
  tick(STREAM_FADE_MS);
  expect(fresh()).toHaveLength(0);
  expect(settledText()).toBe(
    'Housing was debated twice. The bill passed in March. Two senators spoke against it.',
  );
  expect(
    tree.root.findAllByProps({ style: { color: 'transparent' } }),
  ).toHaveLength(0);
});

test('a quiet tail row keeps the busy state, at a fixed height, and shows its spinner only after a second with no new piece', () => {
  start();
  delta('Housing was debated twice. ');
  const tail = () => byId('ask-stream-tail')[0]!;
  const spinner = () => byId('ask-stream-tail-spinner');
  // Reserved from the first text, so the indicator never moves anything.
  expect(StyleSheet.flatten(tail().props.style).height).toBe(20);
  expect(tail().props).toMatchObject({
    accessible: true,
    accessibilityLabel: 'Writing the answer',
    accessibilityState: { busy: true },
    accessibilityLiveRegion: 'none',
  });
  expect(spinner()).toHaveLength(0);
  // A fast replay never reaches the wait: no flicker.
  for (const piece of ['The bill ', 'passed ', 'in March.']) {
    tick(STREAM_QUIET_MS - 1);
    expect(spinner()).toHaveLength(0);
    delta(piece);
  }
  tick(STREAM_QUIET_MS);
  expect(spinner()).toHaveLength(1);
  expect(spinner()[0]!.props).toMatchObject({
    size: 'small',
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
  expect(StyleSheet.flatten(tail().props.style).height).toBe(20);
  // The next piece hides it again.
  delta(' More.');
  expect(spinner()).toHaveLength(0);
});

describe('VoiceOver focus at the handover', () => {
  const move = jest.mocked(moveAccessibilityFocus);
  const tails = () =>
    move.mock.calls.filter(
      ([node]) =>
        (node as unknown as { props: { testID?: string } } | null)?.props
          .testID === 'ask-stream-tail',
    );
  beforeEach(() => {
    move.mockClear();
    takeFocusRequest('ask-status');
  });
  afterEach(() => {
    takeFocusRequest('ask-status');
  });

  test('a send that put VoiceOver on the status line moves it to the tail row, once, and a server retry does not move it again', () => {
    requestFocus('ask-status');
    start();
    act(() => handlers.stage('Writing the answer'));
    tick(100);
    expect(tails()).toHaveLength(0);
    delta('Housing was debated twice. ');
    tick(20);
    expect(tails()).toHaveLength(1);
    // Outside the fade, so it is opaque when VoiceOver lands on it.
    let node = byId('ask-stream-tail')[0]!.parent;
    while (node) {
      expect(node.props.testID).not.toBe('ask-streamed');
      node = node.parent;
    }
    delta('The bill passed in March.');
    tick(5000);
    expect(tails()).toHaveLength(1);
    // The server withdraws the text and writes again: the line comes back
    // and hands over a second time, and focus stays where the reader is.
    act(() => handlers.retry());
    expect(byId('ask-status-row')).toHaveLength(1);
    delta('Housing was debated three times.');
    tick(5000);
    expect(byId('ask-stream-tail')).toHaveLength(1);
    expect(tails()).toHaveLength(1);
  });

  test('a composer send, a follow-up or a retry asks for no status focus: the tail never pulls VoiceOver away', () => {
    start();
    act(() => handlers.stage('Writing the answer'));
    delta('Housing was debated twice. ');
    tick(5000);
    expect(byId('ask-stream-tail')).toHaveLength(1);
    expect(move).not.toHaveBeenCalled();
  });

  test('Ask mounted in a second tab stack: one view took the request, so focus moves once', () => {
    let second: ReactTestRenderer;
    act(() => {
      second = create(<Thread />);
    });
    try {
      requestFocus('ask-status');
      start();
      delta('Housing was debated twice. ');
      tick(5000);
      const count = (root: ReactTestRenderer) =>
        root.root.findAll(
          (n) =>
            typeof n.type === 'string' && n.props.testID === 'ask-stream-tail',
        ).length;
      expect(count(tree) + count(second!)).toBe(2);
      expect(tails()).toHaveLength(1);
    } finally {
      act(() => second.unmount());
    }
  });

  test('a screen without navigation focus never moves it', () => {
    const blurred = { isFocused: () => false } as never;
    act(() =>
      tree.update(
        <NavigationContext.Provider value={blurred}>
          <Thread />
        </NavigationContext.Provider>,
      ),
    );
    requestFocus('ask-status');
    start();
    delta('Housing was debated twice. ');
    tick(5000);
    expect(byId('ask-stream-tail')).toHaveLength(1);
    expect(tails()).toHaveLength(0);
  });

  test('a view that mounts mid-answer took no handover and takes no focus', () => {
    requestFocus('ask-status');
    start();
    delta('Housing was debated twice. ');
    tick(20);
    expect(tails()).toHaveLength(1);
    act(() => tree.update(<></>));
    act(() => tree.update(<Thread />));
    tick(5000);
    expect(tails()).toHaveLength(1);
  });

  test('the tail taking focus tells the screen, so the waiting stage is not read twice', () => {
    const onTailFocus = jest.fn();
    requestFocus('ask-status');
    act(() =>
      tree.update(
        <AskProgress
          stage="Writing the answer"
          streaming=""
          onTailFocus={onTailFocus}
        />,
      ),
    );
    tick(100);
    act(() =>
      tree.update(
        <AskProgress
          stage="Writing the answer"
          streaming="Housing was debated twice."
          onTailFocus={onTailFocus}
        />,
      ),
    );
    tick(20);
    expect(tails()).toHaveLength(1);
    expect(onTailFocus).toHaveBeenCalledTimes(1);
  });
});

test('text that is not blank but draws nothing yet keeps the status line: one signal for the row leaving', () => {
  start();
  for (const partial of ['**', '## ', '[1]']) {
    act(() => handlers.retry());
    delta(partial);
    if (streamStarted(partial)) continue;
    expect(byId('ask-status-row')).toHaveLength(1);
    expect(byId('ask-stream-tail')).toHaveLength(0);
  }
  expect(['**', '## ', '[1]'].some((partial) => !streamStarted(partial))).toBe(
    true,
  );
  expect(streamStarted('Housing.')).toBe(true);
  expect(streamStarted('')).toBe(false);
});

test.each([true, null])(
  'Reduce Motion %s appends each piece at once: no fade layer, no clear text',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    start();
    act(() => handlers.stage('Writing the answer'));
    delta('Housing was debated twice. ');
    expect(byId('ask-status-row')).toHaveLength(0);
    expect(opacity(byId('ask-streamed')[0]!)).toBe(1);
    delta('The bill passed in March.');
    expect(settledText()).toBe(
      'Housing was debated twice. The bill passed in March.',
    );
    expect(fresh()).toHaveLength(0);
    // The tail's indicator is three still dots, never a spinner.
    tick(STREAM_QUIET_MS);
    expect(byId('ask-stream-tail-spinner')).toHaveLength(0);
    expect(byId('ask-stream-tail-dots')).toHaveLength(1);
  },
);

test('a remount mid-answer shows the text as it stands, with no second fade', () => {
  start();
  delta('Housing was debated twice.');
  tick(STREAM_FADE_MS);
  act(() => tree.update(<></>));
  act(() => tree.update(<Thread />));
  expect(settledText()).toBe('Housing was debated twice.');
  expect(opacity(byId('ask-streamed')[0]!)).toBe(1);
  expect(fresh()).toHaveLength(0);
  expect(byId('ask-status-row')).toHaveLength(0);
});

test('a retry that withdraws the text brings the status line back', () => {
  start();
  delta('Housing was debated twice.');
  tick(STREAM_FADE_MS);
  act(() => handlers.retry());
  expect(byId('ask-streaming')).toHaveLength(0);
  expect(byId('ask-status-row')).toHaveLength(1);
  expect(byId('ask-status-slot')[0]!.props.accessibilityElementsHidden).toBe(
    false,
  );
});

test('a stall with no text still ends in one sentence and Try again', async () => {
  start();
  act(() => handlers.stage('Writing the answer'));
  tick(85_000);
  expect(byId('ask-status-row')).toHaveLength(1);
  expect(tree.root.findAllByType(Skeleton)).toHaveLength(0);
  await act(async () => {
    fail(new AskFailure('timeout', 'The answer stalled.'));
    await request;
  });
  expect(byId('ask-progress')).toHaveLength(0);
  expect(byId('ask-error-timeout')).toHaveLength(1);
  const retry = tree.root.findAllByProps({ testID: 'ask-retry' });
  expect(retry.length).toBeGreaterThan(0);
  // Try again starts over on the status line alone.
  act(() => {
    request = controller.retry();
  });
  expect(byId('ask-status-row')).toHaveLength(1);
  expect(tree.root.findAllByType(Skeleton)).toHaveLength(0);
});

test('the bare progress component draws no skeleton at rest', () => {
  act(() => tree.update(<AskProgress stage={null} streaming="" />));
  expect(tree.root.findAllByType(Skeleton)).toHaveLength(0);
  expect(byId('ask-status-row')).toHaveLength(1);
});

describe('revealWindow', () => {
  const prose =
    'One **bold** start.\n\n- first item\n- second item\n\n> a quoted line';
  const table = '\n\n| a | b |\n|---|---|\n| one | two |';
  const blocks = parseAnswer(prose, { streaming: true });
  const seen = (source: Block[], from: number, to: number) => {
    const out: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        const span = value as RevealInline & { text?: string };
        if (typeof span.text === 'string' && 'sentence' in span) {
          if (!span.unseen) out.push(span.text);
        } else if (!(value as RevealBlock).unseen)
          Object.values(value).forEach(walk);
      }
    };
    walk(revealWindow(source, from, to));
    return out.join('');
  };
  test('the settled and fading layers partition the text at any offset, losing nothing', () => {
    const total = revealLength(blocks);
    const whole = seen(blocks, 0, total);
    expect(whole.length).toBe(total);
    for (let at = 0; at <= total; at++) {
      expect(seen(blocks, 0, at) + seen(blocks, at, total)).toBe(whole);
      expect(revealLength(revealWindow(blocks, 0, at))).toBe(total);
    }
  });
  test('a table never fades: whole on the settled layer, laid out and undrawn on the fading one', () => {
    const withTable = parseAnswer(prose + table, { streaming: true });
    const before = revealLength(blocks);
    const total = revealLength(withTable);
    expect(total).toBeGreaterThan(before);
    for (const at of [0, before, before + 2, total]) {
      const settled = revealWindow(withTable, 0, at).at(-1)!;
      expect(settled.kind).toBe('table');
      expect(settled.unseen).toBeUndefined();
      expect(JSON.stringify(settled)).not.toContain('unseen');
      const fading = revealWindow(withTable, Math.max(1, at), total).at(-1)!;
      expect(fading.unseen).toBe(true);
    }
    // The table's characters still count, so text after it keeps its place.
    const after = parseAnswer(prose + table + '\n\nAfter it.', {
      streaming: true,
    });
    const start = revealLength(after) - 'After it.'.length;
    expect(seen(after, start, revealLength(after))).toBe('After it.');
  });
  test('the fading copy of a table is drawn at no opacity', () => {
    const withTable = parseAnswer(prose + table, { streaming: true });
    act(() =>
      tree.update(
        <AnswerBody blocks={revealWindow(withTable, 5, 9)} streaming />,
      ),
    );
    const scroll = tree.root.findAll(
      (n) => typeof n.type === 'string' && n.props.horizontal === true,
    )[0]!;
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({
      opacity: 0,
    });
    // Unrevealed text is a plain nested Text: it inherits its parent's font.
    const clearText = tree.root.findAll(
      (n) => typeof n.type === 'string' && clear(n as Node),
    );
    expect(clearText.length).toBeGreaterThan(0);
    expect(
      clearText.some(
        (n) =>
          Object.keys(StyleSheet.flatten(n.props.style)).join() === 'color',
      ),
    ).toBe(true);
  });
  test('a cut never lands inside a surrogate pair', () => {
    const emoji = parseAnswer('ab😀cd', { streaming: true });
    const at = 'ab😀cd'.indexOf('😀') + 1;
    const first = (revealWindow(emoji, 0, at)[0] as { spans: RevealInline[] })
      .spans;
    expect(first.map((span) => ('text' in span ? span.text : ''))).toEqual([
      'ab😀',
      'cd',
    ]);
  });
});
