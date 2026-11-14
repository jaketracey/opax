import { act } from 'react';
import { Platform, Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import sample from './fixtures/bill-stages/sample.json';
import { BillStageTracker } from '../src/features/bills/tracker';
import { billTracker, type Tracker } from '../src/features/bills/tracker-model';
import { openTerm } from '../src/features/learn/open-term';

jest.mock('../src/features/learn/open-term', () => ({
  openTerm: jest.fn(),
}));

const trackerFor = (key: string): Tracker => {
  const b = sample.bills.find((x) => x.key === key)!;
  const result = billTracker({
    stages: b.key_dates,
    status: b.status,
    originatingHouse: b.originating_house,
    title: b.title,
    divisions: b.divisions,
    acts: b.acts,
  });
  if (result.kind !== 'tracker') throw new Error(`${key} fell back`);
  return result.tracker;
};

let renderer: TestRenderer.ReactTestRenderer | undefined;
async function render(tracker: Tracker) {
  await act(async () => {
    renderer = TestRenderer.create(<BillStageTracker tracker={tracker} />);
  });
  return renderer!.root;
}
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  jest.clearAllMocks();
});

const host = (root: ReactTestInstance, id: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
// Host Text nodes, the one searched from included (the summary is one).
const drawn = (node: ReactTestInstance) =>
  node
    .findAll((n) => n.type === 'Text')
    .map((t) => [t.props.children].flat().join(''))
    .filter(Boolean);
const buttons = (root: ReactTestInstance) =>
  root.findAll(
    (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button',
  );

test('the summary comes first, on screen and for VoiceOver', async () => {
  const root = await render(trackerFor('au-federal-s1518'));
  const texts = drawn(root);
  expect(texts[0]).toBe('Step 5 of 6: The House, now.');
  expect(drawn(host(root, 'bill-tracker-summary')[0]!)).toEqual([
    'Step 5 of 6: The House, now.',
  ]);
  // Every step after it, in order, each one button.
  expect(buttons(root).map((b) => b.props.accessibilityLabel)).toEqual([
    'Introduced in the Senate, done, 15 September 2026',
    'Second reading, done, 17 September 2026',
    'Consideration in detail, none recorded',
    'Passed the Senate, done, 17 September 2026',
    'The House, now',
    'Royal Assent, to come',
  ]);
});

test('each step opens its stage in the guide', async () => {
  const root = await render(trackerFor('au-federal-s1518'));
  const steps = buttons(root);
  for (const b of steps)
    expect(b.props.accessibilityHint).toBe('Explains this stage');
  for (const b of steps) {
    const pressable = root.find(
      (n) => n.props.testID === b.props.testID && !!n.props.onPress,
    );
    await act(async () => pressable.props.onPress());
  }
  const terms = jest.mocked(openTerm).mock.calls.map((call) => call[0]);
  // Glossary slugs from the guide (content/learn/glossary.json). A bill
  // from the Senate explains the House as its other house.
  expect(terms).toEqual([
    'first-reading',
    'second-reading',
    'consideration-in-detail',
    'third-reading',
    'house-of-representatives',
    'royal-assent',
  ]);
});

test('a bill voted down says where, why and when', async () => {
  const root = await render(trackerFor('au-federal-s986'));
  expect(drawn(host(root, 'bill-tracker-summary')[0]!)).toEqual([
    'Stopped at step 2 of 6: Second reading. Voted down.',
  ]);
  const second = host(root, 'bill-tracker-second')[0]!;
  expect(drawn(second)).toEqual(['Second reading', 'Voted down · 4 Dec 2014']);
  expect(second.props.accessibilityLabel).toBe(
    'Second reading, stopped here, Voted down, 4 December 2014',
  );
  // After a stop, the later steps are not reached, and say no date.
  expect(drawn(host(root, 'bill-tracker-passedFirst')[0]!)).toEqual([
    'Third reading',
  ]);
  expect(host(root, 'bill-tracker-assent')[0]!.props.accessibilityLabel).toBe(
    'Royal Assent, not reached',
  );
});

test('a lapsed bill in the other house, and an undated step', async () => {
  const lapsed = await render(trackerFor('au-federal-s1384'));
  expect(drawn(host(lapsed, 'bill-tracker-other')[0]!)).toEqual([
    'The House',
    'Lapsed · 28 Mar 2025',
  ]);
  expect(host(lapsed, 'bill-tracker-other')[0]!.props.accessibilityLabel).toBe(
    'The House, stopped here, Lapsed, 28 March 2025',
  );
  act(() => renderer?.unmount());
  const undated = await render(trackerFor('au-federal-alrc-2361'));
  expect(drawn(host(undated, 'bill-tracker-passedFirst')[0]!)).toEqual([
    'Passed the House',
    'No date recorded',
  ]);
  expect(
    host(undated, 'bill-tracker-passedFirst')[0]!.props.accessibilityLabel,
  ).toBe('Passed the House, done, no date recorded');
});

test('passed by the other house and back for its changes', async () => {
  const root = await render(trackerFor('au-federal-r7500'));
  expect(drawn(host(root, 'bill-tracker-other')[0]!)).toEqual([
    'The Senate',
    'Passed, back in the House',
  ]);
  expect(host(root, 'bill-tracker-other')[0]!.props.accessibilityLabel).toBe(
    'The Senate, now: Passed, back in the House',
  );
});

test('nothing is clipped: no line limits at any size', async () => {
  const root = await render(trackerFor('au-federal-s1464'));
  const texts = root.findAllByType(NativeText);
  expect(texts.length).toBeGreaterThan(6);
  for (const t of texts) expect(t.props.numberOfLines).toBeUndefined();
});

describe('on Android', () => {
  const os = Platform.OS;
  beforeAll(() =>
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    }),
  );
  afterAll(() =>
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true }),
  );

  test('the same summary, steps and TalkBack names', async () => {
    const root = await render(trackerFor('au-federal-r5728'));
    expect(drawn(host(root, 'bill-tracker-summary')[0]!)).toEqual([
      'Stopped at step 5 of 6: The Senate. Voted down.',
    ]);
    expect(buttons(root).map((b) => b.props.accessibilityLabel)).toEqual([
      'Introduced in the House, done, 14 September 2016',
      'Second reading, done, 20 October 2016',
      'Consideration in detail, none recorded',
      'Passed the House, done, 20 October 2016',
      'The Senate, stopped here, Voted down, 7 November 2016',
      'Royal Assent, not reached',
    ]);
  });
});
