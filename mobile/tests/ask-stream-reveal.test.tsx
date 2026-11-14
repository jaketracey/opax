import { useSyncExternalStore } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { useReduceMotionSetting } from '../src/design/accessibility';
import { Skeleton } from '../src/design/states';
import { textContent } from '../src/design/text';
import { AskProgress, STREAM_FADE_MS } from '../src/features/ask/AskProgress';
import { AskThread } from '../src/features/ask/AskThread';
import { parseAnswer } from '../src/features/ask/answer-markdown';
import { AskController } from '../src/features/ask/controller';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import {
  revealLength,
  revealWindow,
  type RevealInline,
} from '../src/features/ask/stream-reveal';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useAccessibilitySize: () => false,
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
  expect(tree.root.findAllByType(Skeleton)).toEqual([]);
  expect(tree.root.findAllByProps({ label: 'Loading the answer' })).toEqual([]);
  expect(byId('ask-streaming')).toEqual([]);
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
  expect(byId('ask-status-slot')).toEqual([]);
  expect(byId('ask-status-row')).toEqual([]);
  expect(settledText()).toBe('Housing was debated twice.');
});

test('a cached replay in several pieces builds up, each new piece fading over text already laid out', () => {
  start();
  delta('Housing was debated twice. ');
  tick(STREAM_FADE_MS);
  expect(fresh()).toEqual([]);
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
  expect(fresh()).toEqual([]);
  expect(settledText()).toBe(
    'Housing was debated twice. The bill passed in March. Two senators spoke against it.',
  );
  expect(tree.root.findAllByProps({ style: { color: 'transparent' } })).toEqual(
    [],
  );
});

test.each([true, null])(
  'Reduce Motion %s appends each piece at once: no fade layer, no clear text',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    start();
    act(() => handlers.stage('Writing the answer'));
    delta('Housing was debated twice. ');
    expect(byId('ask-status-row')).toEqual([]);
    expect(opacity(byId('ask-streamed')[0]!)).toBe(1);
    delta('The bill passed in March.');
    expect(settledText()).toBe(
      'Housing was debated twice. The bill passed in March.',
    );
    expect(fresh()).toEqual([]);
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
  expect(fresh()).toEqual([]);
  expect(byId('ask-status-row')).toEqual([]);
});

test('a retry that withdraws the text brings the status line back', () => {
  start();
  delta('Housing was debated twice.');
  tick(STREAM_FADE_MS);
  act(() => handlers.retry());
  expect(byId('ask-streaming')).toEqual([]);
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
  expect(tree.root.findAllByType(Skeleton)).toEqual([]);
  await act(async () => {
    fail(new AskFailure('timeout', 'The answer stalled.'));
    await request;
  });
  expect(byId('ask-progress')).toEqual([]);
  expect(byId('ask-error-timeout')).toHaveLength(1);
  const retry = tree.root.findAllByProps({ testID: 'ask-retry' });
  expect(retry.length).toBeGreaterThan(0);
  // Try again starts over on the status line alone.
  act(() => {
    request = controller.retry();
  });
  expect(byId('ask-status-row')).toHaveLength(1);
  expect(tree.root.findAllByType(Skeleton)).toEqual([]);
});

test('the bare progress component draws no skeleton at rest', () => {
  act(() => tree.update(<AskProgress stage={null} streaming="" />));
  expect(tree.root.findAllByType(Skeleton)).toEqual([]);
  expect(byId('ask-status-row')).toHaveLength(1);
});

describe('revealWindow', () => {
  const blocks = parseAnswer(
    'One **bold** start.\n\n- first item\n- second item\n\n| a | b |\n|---|---|\n| one | two |',
    { streaming: true },
  );
  const seen = (from: number, to: number) => {
    const out: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        const span = value as RevealInline & { text?: string };
        if (typeof span.text === 'string' && 'sentence' in span) {
          if (!span.unseen) out.push(span.text);
        } else Object.values(value).forEach(walk);
      }
    };
    walk(revealWindow(blocks, from, to));
    return out.join('');
  };
  test('the settled and fading layers partition the text at any offset, losing nothing', () => {
    const total = revealLength(blocks);
    const whole = seen(0, total);
    expect(whole.length).toBe(total);
    for (let at = 0; at <= total; at++) {
      expect(seen(0, at) + seen(at, total)).toBe(whole);
      expect(revealLength(revealWindow(blocks, 0, at))).toBe(total);
    }
  });
  test('a cut never lands inside a surrogate pair', () => {
    const emoji = parseAnswer('ab😀cd', { streaming: true });
    const text = textContent('ab😀cd');
    const at = text.indexOf('😀') + 1;
    const first = (revealWindow(emoji, 0, at)[0] as { spans: RevealInline[] })
      .spans;
    expect(first.map((span) => ('text' in span ? span.text : ''))).toEqual([
      'ab😀',
      'cd',
    ]);
  });
});
