import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { useReduceMotionSetting } from '../src/design/accessibility';
import { textContent } from '../src/design/text';
import { motion } from '../src/design/tokens';
import {
  AskStatus,
  useAskStageAnnouncement,
  useAskStageAnnouncer,
} from '../src/features/ask/AskStatus';
import { AskController } from '../src/features/ask/controller';
import {
  AskStream,
  type AskStage,
  type AskStep,
  type StreamHandlers,
} from '../src/features/ask/stream';
import { askStatusText, runningSteps } from '../src/features/ask/status';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useAccessibilitySize: () => false,
}));

const step = (
  id: string,
  state: AskStep['state'] = 'running',
  arg?: string,
): AskStep => ({
  id,
  label: `Checking ${id}`,
  state,
  ...(arg ? { arg } : {}),
});
const frame = (value: unknown) =>
  `event: status\ndata: ${JSON.stringify(value)}\n\n`;
const stageHandlers = () => ({
  stage: jest.fn(),
  step: jest.fn(),
  delta: jest.fn(),
  retry: jest.fn(),
  reading: jest.fn(),
});

test('step frames retain start and finish order across chunk boundaries and parallel lookups', () => {
  const handlers = stageHandlers();
  const stream = new AskStream(handlers);
  const steps = [
    step('hearings'),
    step('speakers', 'running', 'Greens'),
    step('hearings', 'done'),
    step('speakers', 'failed'),
    step('records', 'error'),
  ];
  const text = steps.map((s) => frame({ phase: 'step', step: s })).join('');
  for (let i = 0; i < text.length; i += 3) stream.push(text.slice(i, i + 3));
  expect(handlers.step.mock.calls.map(([s]) => s)).toEqual(steps);
  expect(handlers.stage).not.toHaveBeenCalled();
  stream.push(frame({ phase: 'retrieved', sources: [{}, {}] }));
  expect(handlers.reading).toHaveBeenCalledWith(2);
  expect(handlers.stage).toHaveBeenCalledWith('Writing the answer');
  expect(() =>
    new AskStream({ ...handlers, step: undefined }).push(text),
  ).not.toThrow();
});

test.each([
  null,
  [],
  {},
  { id: 1, label: 'Checking', state: 'running' },
  { id: '', label: 'Checking', state: 'running' },
  { id: 's', label: '  ', state: 'running' },
  { id: 's', label: 1, state: 'running' },
  { id: 's', label: 'Checking', state: 'finished' },
  { id: 's', label: 'Checking', state: { toString: 1 } },
  { id: 's', label: 'Checking', state: 'running', arg: {} },
  { id: 's', label: 'Checking', state: 'running', arg: null },
  { id: 's', label: 'Checking', state: 'running', arg: 'x'.repeat(41) },
])('malformed step is ignored without changing stages: %j', (value) => {
  const handlers = stageHandlers();
  const stream = new AskStream(handlers);
  expect(() =>
    stream.push(frame({ phase: 'step', step: value })),
  ).not.toThrow();
  expect(handlers.step).not.toHaveBeenCalled();
  expect(handlers.stage).not.toHaveBeenCalled();
});

test('the latest start still running wins, including out-of-order completions and duplicate starts', () => {
  let steps = runningSteps([], step('hearings'));
  steps = runningSteps(steps, step('speakers', 'running', 'Greens'));
  steps = runningSteps(steps, step('hearings', 'running', 'housing'));
  expect(askStatusText('Searching the record', steps)).toBe(
    'Checking speakers: Greens',
  );
  steps = runningSteps(steps, step('speakers', 'done'));
  expect(askStatusText('Searching the record', steps)).toBe(
    'Checking hearings: housing',
  );
  expect(askStatusText('Writing the answer', steps)).toBe('Writing the answer');
  for (const terminal of ['done', 'failed', 'error'] as const)
    expect(runningSteps(steps, step('hearings', terminal))).toEqual([]);
  expect(runningSteps(steps, step('unknown', 'done'))).toEqual(steps);
  expect(askStatusText(null, [])).toBe('Reading your question');
  for (const stage of [
    'Searching the record',
    'Searching again',
    'Writing the answer',
  ] as const)
    expect(askStatusText(stage, [])).toBe(stage);
});

test('controller resets lookups between rounds, on writing and cancellation, and ignores old callbacks', async () => {
  let on!: StreamHandlers;
  const controller = new AskController({
    post: async (_path, _body, signal, handlers) => {
      on = handlers!;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled'))),
      );
    },
    read: () => ({ v: 1, active: null, chats: [] }),
    save: async () => {},
    id: () => 'fixture',
    now: () => 0,
  });
  const pending = controller.submit('Who spoke on housing?');
  const stream = new AskStream(on);
  stream.push(frame({ phase: 'step', step: step('hearings') }));
  stream.push(frame({ phase: 'step', step: step('speakers') }));
  expect(controller.snapshot().steps.map((s) => s.id)).toEqual([
    'hearings',
    'speakers',
  ]);
  stream.push(frame({ phase: 'step', step: step('speakers', 'done') }));
  expect(controller.snapshot().steps.map((s) => s.id)).toEqual(['hearings']);
  stream.push('event: retry\ndata: {}\n\n');
  expect(controller.snapshot()).toMatchObject({
    steps: [],
    stage: 'Searching again',
  });
  on.step?.(step('records'));
  on.stage('Searching the record');
  expect(controller.snapshot().steps).toEqual([]);
  on.step?.(step('hearings'));
  on.delta('The answer');
  expect(controller.snapshot()).toMatchObject({
    steps: [],
    stage: 'Writing the answer',
  });
  on.reading?.(12);
  expect(controller.snapshot().reading).toBe(12);
  controller.stop();
  on.step?.(step('stale'));
  expect(controller.snapshot()).toMatchObject({
    steps: [],
    stage: null,
    reading: 0,
  });
  await pending;
});

let view: ReactTestRenderer;
let announce: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
    .mockImplementation(() => {});
});
afterEach(() => {
  act(() => view?.unmount());
  announce.mockRestore();
  jest.useRealTimers();
});
function renderStatus(stage: AskStage | null, steps: AskStep[] = []) {
  const node = (
    <AskStatus
      stage={stage}
      steps={steps}
      announcement="Searching the record"
    />
  );
  act(() => {
    if (view) view.update(node);
    else view = create(node);
  });
}
function currentText() {
  return textContent(
    view.root.findAll(
      (n) => n.props.testID === 'ask-status' && typeof n.type === 'string',
    )[0]!.props.children,
  );
}
function advance(ms: number) {
  act(() => jest.advanceTimersByTime(ms));
}

describe('status rendering', () => {
  beforeEach(() => {
    view = undefined as unknown as ReactTestRenderer;
  });
  test('each line stays 600 ms, only the latest waits, and transitions overlap for the motion token', () => {
    renderStatus('Reading your question');
    advance(100);
    renderStatus('Searching the record', [step('hearings')]);
    advance(100);
    renderStatus('Searching the record', [
      step('speakers', 'running', '<b>Greens</b>'),
    ]);
    advance(399);
    expect(currentText()).toBe('Reading your question');
    advance(1);
    expect(currentText()).toBe('Checking speakers: <b>Greens</b>');
    expect(
      view.root.findAllByProps({ testID: 'ask-status-outgoing' }).length,
    ).toBeGreaterThan(0);
    renderStatus('Writing the answer');
    advance(motion.duration.crossfade);
    expect(view.root.findAllByProps({ testID: 'ask-status-outgoing' })).toEqual(
      [],
    );
    advance(600 - motion.duration.crossfade);
    expect(currentText()).toBe('Writing the answer');
    const row = view.root.findAllByProps({ testID: 'ask-status-row' })[0]!;
    expect(row.props).toMatchObject({
      accessibilityLiveRegion: 'polite',
      accessibilityLabel: 'Searching the record',
    });
    expect(announce).not.toHaveBeenCalled();
  });
  test('a superseded pending line is discarded when the current line becomes latest again', () => {
    renderStatus('Searching the record');
    renderStatus('Searching the record', [step('hearings')]);
    advance(100);
    renderStatus('Searching the record');
    advance(1000);
    expect(currentText()).toBe('Searching the record');
  });
  test.each([true, null])(
    'Reduce Motion setting %s has static text and no outgoing nudge',
    (setting) => {
      jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
      renderStatus('Reading your question');
      renderStatus('Writing the answer');
      advance(600);
      expect(currentText()).toBe('Writing the answer');
      expect(
        view.root.findAllByProps({ testID: 'ask-status-outgoing' }),
      ).toEqual([]);
      const incoming = view.root.findAllByProps({
        testID: 'ask-status-incoming',
      })[0]!;
      expect(incoming.props.style.transform).toEqual([{ translateY: 0 }]);
    },
  );
});

function StageProbe({ stage }: { stage: AskStage | null }) {
  return <View accessibilityLabel={useAskStageAnnouncement(stage)} />;
}
test('polite stage announcements coalesce to two seconds from actual speech, including final writing after completion', () => {
  act(() => {
    view = create(<StageProbe stage={null} />);
  });
  advance(5000);
  expect(announce).not.toHaveBeenCalled();
  act(() => view.update(<StageProbe stage="Reading your question" />));
  advance(0);
  expect(announce).toHaveBeenCalledWith('Reading your question', {
    queue: true,
  });
  act(() => view.update(<StageProbe stage="Searching the record" />));
  advance(100);
  act(() => view.update(<StageProbe stage="Searching again" />));
  act(() => view.update(<StageProbe stage="Writing the answer" />));
  advance(1899);
  expect(announce).toHaveBeenCalledTimes(1);
  advance(1);
  expect(announce.mock.calls.map(([label]) => label)).toEqual([
    'Reading your question',
    'Writing the answer',
  ]);
  expect(Platform.OS).toBe('ios');
});

test('a stage still waiting when the answer ends is dropped, never spoken after "Answer ready"', () => {
  act(() => {
    view = create(<StageProbe stage="Reading your question" />);
  });
  advance(0);
  act(() => view.update(<StageProbe stage="Writing the answer" />));
  advance(500);
  act(() => view.update(<StageProbe stage={null} />));
  advance(10_000);
  expect(announce.mock.calls.map(([label]) => label)).toEqual([
    'Reading your question',
  ]);
});

test('dropping a waiting stage (the tail row took focus and reads it) keeps it unspoken and the label current', () => {
  function DropProbe({ stage }: { stage: AskStage | null }) {
    const announcer = useAskStageAnnouncer(stage);
    return (
      <View
        accessibilityLabel={announcer.announcement}
        onAccessibilityTap={announcer.drop}
      />
    );
  }
  const probe = () => view.root.findByType(View).props;
  const label = () => probe().accessibilityLabel;
  const drop = () => probe().onAccessibilityTap();
  act(() => {
    view = create(<DropProbe stage="Reading your question" />);
  });
  advance(0);
  act(() => view.update(<DropProbe stage="Writing the answer" />));
  advance(500);
  expect(label()).toBe('Reading your question');
  act(() => drop());
  expect(label()).toBe('Writing the answer');
  advance(10_000);
  expect(announce.mock.calls.map(([said]) => said)).toEqual([
    'Reading your question',
  ]);
  // Nothing waiting: a second drop changes nothing.
  act(() => drop());
  expect(label()).toBe('Writing the answer');
});

function RowProbe({ stage, row }: { stage: AskStage | null; row: boolean }) {
  return <View accessibilityLabel={useAskStageAnnouncement(stage, row)} />;
}
test('Android speaks a pending stage itself once streamed text has replaced the status row', () => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    act(() => {
      view = create(<RowProbe stage="Reading your question" row />);
    });
    advance(0);
    // The row is there: its live region speaks, not a second announcement.
    expect(announce).not.toHaveBeenCalled();
    act(() => view.update(<RowProbe stage="Writing the answer" row />));
    // The first text takes the row's place before the stage is due.
    act(() => view.update(<RowProbe stage="Writing the answer" row={false} />));
    advance(1999);
    expect(announce).not.toHaveBeenCalled();
    advance(1);
    expect(announce.mock.calls.map(([label]) => label)).toEqual([
      'Writing the answer',
    ]);
  } finally {
    os.restore();
  }
});

test('unmount cancels pending announcements', () => {
  act(() => {
    view = create(<StageProbe stage="Reading your question" />);
  });
  advance(0);
  act(() => view.update(<StageProbe stage="Writing the answer" />));
  act(() => view.unmount());
  advance(3000);
  expect(announce).toHaveBeenCalledTimes(1);
});
