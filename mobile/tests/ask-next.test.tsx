import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { useReduceMotionSetting } from '../src/design/accessibility';
import { InsetGroup } from '../src/design/layout';
import { Skeleton } from '../src/design/states';
import { SurfaceContext } from '../src/design/row-padding';
import { Text } from '../src/design/text';
import { motion } from '../src/design/tokens';
import { AskThread } from '../src/features/ask/AskThread';
import { AskController } from '../src/features/ask/controller';
import type { Followup } from '../src/features/ask/model';
import { track } from '../src/analytics';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
}));
jest.mock('../src/features/ask/AnswerView', () => ({ AnswerView: () => null }));
jest.mock('../src/features/ask/AskProgress', () => ({
  AskProgress: () => null,
}));
jest.mock('../src/features/ask/AskIdle', () => ({ fillComposer: jest.fn() }));
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));

const questions: Followup[] = [
  { question: 'What age limit was proposed?', evidence: 'Fixture passage' },
  { question: 'What did the youth forum say?' },
  { question: 'How long were submissions open?' },
];
const initial = new AskController({
  post: jest.fn(),
  read: () => ({ v: 1, active: null, chats: [] }),
  save: jest.fn(),
  id: () => 'fixture',
  now: () => 1,
}).snapshot();
let view: ReactTestRenderer;
const onAsk = jest.fn();
let timing: jest.SpyInstance;
function useTestSharedValue<Value>(
  initial: Value,
): Reanimated.SharedValue<Value> {
  const [value] = useState(() => ({ value: initial }));
  return value as Reanimated.SharedValue<Value>;
}
beforeEach(() => {
  jest.useFakeTimers();
  view = undefined as unknown as ReactTestRenderer;
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  onAsk.mockClear();
  timing = jest.spyOn(Reanimated, 'withTiming').mockReturnValue(0);
  jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(useTestSharedValue);
});
afterEach(() => {
  act(() => view?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
function render(next?: Followup[], loading = !next) {
  const node = (
    <SurfaceContext.Provider value="sunken">
      <AskThread
        s={{
          ...initial,
          nextLoading: loading,
          thread: [
            { role: 'user', text: 'A fixture question?' },
            { role: 'answer', text: 'Fixture answer', next },
          ],
        }}
        chat={undefined}
        profiles={new Map()}
        names={[]}
        topics={[]}
        paneShowsSources={false}
        onAsk={onAsk}
        onRetry={jest.fn()}
        onTurnLayout={jest.fn()}
        minHeight={0}
      />
    </SurfaceContext.Provider>
  );
  act(() => {
    if (view) view.update(node);
    else view = create(node);
  });
}
const byID = (id: string) =>
  view.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');
const opacity = (id: string) =>
  StyleSheet.flatten(byID(id)[0]!.props.style).opacity;

test('Ask next reserves three rows inside its final card and hides skeletons from VoiceOver', () => {
  render();
  const skeletons = view.root.findAllByType(Skeleton);
  expect(skeletons.reduce((sum, n) => sum + n.props.count, 0)).toBe(3);
  const group = view.root.findByType(InsetGroup);
  expect(group.findAllByType(Skeleton)).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(byID(`ask-next-placeholder-${i}`)[0]!.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
  }
  const heights = [0, 1, 2].map(
    (i) =>
      StyleSheet.flatten(byID(`ask-next-row-${i}`)[0]!.props.style).minHeight,
  );
  render(questions);
  expect(view.root.findByType(InsetGroup)).toBe(group);
  expect(
    [0, 1, 2].map(
      (i) =>
        StyleSheet.flatten(byID(`ask-followup-${i}`)[0]!.props.style).minHeight,
    ),
  ).toEqual(heights);
});

test('suggestions crossfade with the skeleton for the standard 200 ms token and still send', () => {
  render();
  render(questions);
  expect(timing).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      duration: motion.duration.standard,
    }),
  );
  expect(opacity('ask-next-content-0')).toBe(0);
  expect(opacity('ask-next-placeholder-0')).toBe(1);
  const row = byID('ask-followup-0')[0]!;
  expect(row.props).toMatchObject({
    accessibilityRole: 'button',
    accessibilityLabel: questions[0]!.question,
    accessibilityHint: 'Asks this question.',
  });
  const control = view.root.findAll(
    (n) =>
      n.props.testID === 'ask-followup-0' &&
      typeof n.props.onPress === 'function',
  )[0]!;
  act(() => control.props.onPress());
  expect(onAsk).toHaveBeenCalledWith(questions[0]!.question, questions[0]);
  act(() => jest.advanceTimersByTime(motion.duration.standard - 1));
  expect(view.root.findAllByType(Skeleton)).toHaveLength(3);
  act(() => {
    // Complete the UI-thread timing before the placeholder's removal.
    jest.mocked(Reanimated.useSharedValue).mock.results[0]!.value.value = 1;
    jest.advanceTimersByTime(1);
  });
  expect(opacity('ask-next-content-0')).toBe(1);
  expect(view.root.findAllByType(Skeleton)).toHaveLength(0);
});

test.each([true, null])(
  'Reduce Motion %s swaps straight to the questions',
  (setting) => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(setting);
    render();
    render(questions);
    expect(timing).not.toHaveBeenCalled();
    expect(opacity('ask-next-content-0')).toBe(1);
    expect(view.root.findAllByType(Skeleton)).toHaveLength(0);
  },
);

test('opening saved suggestions is immediate, and no suggestions removes the card', () => {
  render(questions);
  expect(timing).not.toHaveBeenCalled();
  expect(view.root.findAllByType(Skeleton)).toHaveLength(0);
  render([], false);
  expect(byID('ask-followups')).toHaveLength(0);
});

test('row reservations scale with Dynamic Type and keep the full-width tap targets', () => {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({
      ...Dimensions.get('window'),
      fontScale: 2.76,
    });
  render();
  const before = StyleSheet.flatten(byID('ask-next-row-0')[0]!.props.style);
  expect(before.minHeight).toBeGreaterThan(140);
  render(questions);
  expect(
    StyleSheet.flatten(byID('ask-followup-0')[0]!.props.style).minHeight,
  ).toBe(before.minHeight);
  expect(
    StyleSheet.flatten(byID('ask-next-content-0')[0]!.props.style)
      .paddingHorizontal,
  ).toBe(-before.marginHorizontal);
  expect(before.marginHorizontal).toBe(-16);
  // Two visible lines bound the final height; VoiceOver retains the full question.
  const label = view.root
    .findAllByType(Text)
    .find((n) => n.props.children === questions[0]!.question)!;
  expect(label.props.numberOfLines).toBe(2);
  expect(byID('ask-followup-0')[0]!.props.accessibilityLabel).toBe(
    questions[0]!.question,
  );
});

test('enabling Reduce Motion during the fade swaps immediately and cancels cleanup', () => {
  render();
  render(questions);
  jest.mocked(useReduceMotionSetting).mockReturnValue(true);
  render(questions);
  expect(opacity('ask-next-content-0')).toBe(1);
  expect(view.root.findAllByType(Skeleton)).toHaveLength(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('empty suggestions remove the pending card and its placeholders', () => {
  render();
  render([], false);
  expect(byID('ask-followups')).toHaveLength(0);
  expect(view.root.findAllByType(Skeleton)).toHaveLength(0);
});

test('a follow-up tap sends its position and the server kind once, never the question', () => {
  jest.mocked(track).mockClear();
  render([
    {
      question: 'Did Jane Citizen vote on the 2031 housing bill?',
      kind: 'vote',
    },
    { question: 'What else did she say?' },
  ]);
  const press = (i: number) =>
    view.root
      .findAll(
        (n) =>
          n.props.testID === `ask-followup-${i}` &&
          typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress();
  act(() => press(0));
  expect(jest.mocked(track).mock.calls).toEqual([
    ['opax_ask_followup_click', { position: 1, kind: 'vote' }],
  ]);
  // A suggestion with no server kind is a plain detail question.
  act(() => press(1));
  expect(jest.mocked(track).mock.calls[1]).toEqual([
    'opax_ask_followup_click',
    { position: 2, kind: 'detail' },
  ]);
  expect(JSON.stringify(jest.mocked(track).mock.calls)).not.toMatch(
    /Jane|housing|say/,
  );
});
