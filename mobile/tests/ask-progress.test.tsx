import { useSyncExternalStore } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, Text as NativeText, useColorScheme } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';
import { AnimalLoader } from '../src/design/menagerie/AnimalLoader';
import { AnimalDrawing } from '../src/design/menagerie/animals';
import {
  ANIMAL_WIDTH,
  STAGE_WIDTH,
  cyclePercent,
  walkPosition,
} from '../src/design/menagerie/motion';
import { animals } from '../src/design/menagerie/poses';
import {
  useAccessibilitySize,
  useReduceMotionSetting,
} from '../src/design/accessibility';
import { paletteFor } from '../src/design/palette';
import { AskProgress } from '../src/features/ask/AskProgress';
import { AskController } from '../src/features/ask/controller';
import { AskStream, type StreamHandlers } from '../src/features/ask/stream';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useAccessibilitySize: jest.fn(() => false),
  useIncreaseContrast: () => false,
  useHighTextContrast: () => false,
}));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));
jest.mock('../src/api/runtime', () => ({ client: {}, catalogs: {} }));

let view: ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  jest.mocked(useAccessibilitySize).mockReturnValue(false);
});
afterEach(() => {
  act(() => view?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const frame = (value: unknown, event = 'status') =>
  `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
const lookup = (id: number, state = 'running', extras = {}) => ({
  phase: 'step',
  step: {
    id,
    label: `Checking ${id}`,
    state,
    tool: 'search',
    round: 1,
    ...extras,
  },
});
function Progress({ controller }: { controller: AskController }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  return (
    <AskProgress
      stage={state.stage}
      steps={state.steps}
      announcement="Searching the record"
      streaming={state.streaming}
    />
  );
}
function setup() {
  let handlers!: StreamHandlers;
  const controller = new AskController({
    post: async (_path, _body, signal, on) => {
      handlers = on!;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled'))),
      );
    },
    read: () => ({ v: 1, active: null, chats: [] }),
    save: async () => {},
    id: () => 'progress-test',
    now: () => 0,
  });
  let pending!: Promise<void>;
  act(() => {
    pending = controller.submit(
      'Which financial years do the disclosed gambling receipt totals cover?',
    );
    view = create(<Progress controller={controller} />);
  });
  const stream = new AskStream(handlers);
  return {
    controller,
    stream,
    pending,
    push: (value: unknown) => act(() => stream.push(frame(value))),
  };
}
function row(id: number | string) {
  return view.root.findAllByProps({ testID: `ask-step-${id}` })[0]!;
}
function text() {
  return view.root
    .findAllByType(NativeText)
    .map((node) => node.props.children)
    .flat()
    .join(' ')
    .replace(/\s+/g, ' ');
}

test('real numeric SSE steps survive the controller, retain parallel start order and show completed counts immediately', async () => {
  const { controller, stream, push, pending } = setup();
  push(lookup(1));
  push(lookup(2, 'running', { tool: 'find_people', arg: 'Greens' }));
  expect(row(1).props.accessibilityLabel).toContain('working');
  expect(row(2).props.accessibilityLabel).toContain('Greens, working');
  // Finish both in the same network chunk. Their start order stays intact.
  act(() =>
    stream.push(
      frame(lookup(2, 'done', { results: 1, ms: 1200 })) +
        frame(lookup(1, 'done', { results: 128, ms: 2400 })),
    ),
  );
  expect(row(1).props.accessibilityLabel).toBe(
    'Checking 1, done, 128 passages · 2.4 s',
  );
  expect(row(2).props.accessibilityLabel).toBe(
    'Checking 2, Greens, done, 1 passage · 1.2 s',
  );
  const rows = view.root.findAll(
    (n) =>
      typeof n.type === 'string' && /^ask-step-\d+$/.test(n.props.testID ?? ''),
  );
  expect(rows.map((n) => n.props.testID)).toEqual(['ask-step-1', 'ask-step-2']);
  expect(
    view.root.findAllByProps({ testID: 'ask-animal' }).length,
  ).toBeGreaterThan(0);
  // A separate writing event clears the controller, but the wait keeps its trail.
  push({ phase: 'writing' });
  expect(row(1).props.accessibilityLabel).toContain('128 passages');
  expect(row('writing').props.accessibilityLabel).toContain(
    'Writing the answer',
  );
  act(() =>
    stream.push(
      frame({ text: 'The disclosed totals cover these years.' }, 'delta'),
    ),
  );
  expect(view.root.findAllByProps({ testID: 'ask-animal' })).toHaveLength(0);
  expect(view.root.findAllByProps({ testID: 'ask-steps' })).toHaveLength(0);
  expect(
    view.root.findAllByProps({ testID: 'ask-streaming' }).length,
  ).toBeGreaterThan(0);
  controller.stop();
  await pending;
});

test('tool units, no results, failed lookups and later rounds match the web wording', async () => {
  const { controller, push, pending } = setup();
  push(lookup(1, 'done', { tool: 'find_people', results: 1 }));
  push(lookup(2, 'done', { tool: 'read_passage', results: 0 }));
  push(lookup(3, 'done', { tool: 'unknown', results: 1200 }));
  push(lookup(4, 'error', { round: 2, ms: 50 }));
  expect(row(1).props.accessibilityLabel).toContain('1 person');
  expect(row(2).props.accessibilityLabel).toContain('No passages');
  expect(row(3).props.accessibilityLabel).toContain('1,200 results');
  expect(row(4).props.accessibilityLabel).toContain('failed, <0.1 s');
  expect(text()).toContain('Round 2');
  controller.stop();
  await pending;
});

test('five recent rows stay compact, older live steps stay visible and the older completed steps expand', async () => {
  const { controller, push, pending } = setup();
  for (let id = 1; id <= 8; id++)
    push(
      lookup(id, id === 1 || id === 8 ? 'running' : 'done', { results: id }),
    );
  expect(row(1).props.accessibilityLabel).toContain('working');
  expect(view.root.findAllByProps({ testID: 'ask-step-2' })).toHaveLength(0);
  expect(row(8).props.accessibilityLabel).toContain('working');
  expect(text()).toContain('Show 2 earlier steps');
  act(() =>
    view.root
      .findAllByProps({ testID: 'ask-steps-toggle' })[0]!
      .props.onPress(),
  );
  expect(row(2).props.accessibilityLabel).toContain('done');
  expect(text()).toContain('Hide earlier steps');
  controller.stop();
  await pending;
});

test('retry discards the old trail and new events still update under Reduce Motion', async () => {
  jest.mocked(useReduceMotionSetting).mockReturnValue(true);
  const { controller, stream, push, pending } = setup();
  push(lookup(1, 'done', { results: 10 }));
  act(() => stream.push(frame({}, 'retry')));
  expect(view.root.findAllByProps({ testID: 'ask-step-1' })).toHaveLength(0);
  push(lookup(2));
  push(lookup(2, 'done', { results: 3 }));
  expect(row(2).props.accessibilityLabel).toContain('3 passages');
  expect(view.root.findAllByProps({ testID: 'ask-step-1' })).toHaveLength(0);
  controller.stop();
  await pending;
});

test.each([true, null])(
  'Reduce Motion %s stands still on stage with no animation and hides the animal from VoiceOver',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    act(() => {
      view = create(<AnimalLoader animal="wombat" />);
    });
    expect(repeat).not.toHaveBeenCalled();
    const animal = view.root.findAllByProps({ testID: 'ask-animal' })[0]!;
    expect(animal.props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    const pose = view.root.findAllByProps({ testID: 'ask-animal-pose' })[0]!;
    expect(StyleSheet.flatten(pose.props.style)).toMatchObject({
      opacity: 1,
      transform: [{ translateX: (STAGE_WIDTH - ANIMAL_WIDTH) / 2 }],
    });
    const groups = view.root
      .findAllByType(G)
      .filter((n) => n.props.animatedProps);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups)
      expect(group.props.animatedProps.matrix).toEqual([1, 0, -0, 1, 0, 0]);
  },
);

test('one 16 second driver starts on stage and is cancelled when motion changes or the loader unmounts', () => {
  const repeat = jest.spyOn(Reanimated, 'withRepeat');
  const timing = jest.spyOn(Reanimated, 'withTiming');
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  const random = jest.spyOn(Math, 'random').mockReturnValue(0.6);
  act(() => {
    view = create(<AnimalLoader />);
  });
  expect(repeat).toHaveBeenCalledTimes(1);
  expect(timing).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: 16000 }),
  );
  expect(walkPosition(cyclePercent(0, -5.5))).toBeGreaterThanOrEqual(0);
  expect(walkPosition(44)).toBe(walkPosition(56));
  expect(view.root.findByType(AnimalDrawing).props.name).toBe('platypus');
  random.mockReturnValue(0.1);
  jest.mocked(useReduceMotionSetting).mockReturnValue(true);
  act(() => view.update(<AnimalLoader phase={-5.4} />));
  expect(view.root.findByType(AnimalDrawing).props.name).toBe('platypus');
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
  expect(cancel).toHaveBeenCalledTimes(2);
});

test.each(animals)(
  '%s uses the web paths and resolves bronze artwork in both appearances',
  (animal) => {
    for (const scheme of ['light', 'dark'] as const) {
      jest.mocked(useColorScheme).mockReturnValue(scheme);
      act(() => {
        view = create(<AnimalLoader animal={animal} />);
      });
      expect(view.root.findByType(AnimalDrawing).props.ink).toBe(
        paletteFor(scheme).bronzeInk,
      );
      expect(view.root.findAllByType(Path).length).toBeGreaterThan(3);
      act(() => view.unmount());
    }
  },
);
