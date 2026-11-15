// Delight round 3, record storytelling: a division's bar fills to the ayes'
// share once, and a bill's rail draws through the stages it has reached
// once. The words and numbers are final from the first frame; a second
// drawing, Reduce Motion (on or not yet known) and a missing key all show
// the figure at rest.
import { act, type ReactElement } from 'react';
import { Animated, Easing } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { VoteSplit } from '../src/design/charts';
import { resetSettleForTests } from '../src/design/settle';
import { motion } from '../src/design/tokens';
import {
  BillStageTracker,
  RAIL_DELAY_MS,
  RAIL_LENGTH_MS,
  RAIL_MAX_MS,
  railLengths,
} from '../src/features/bills/tracker';
import { billTracker, type Tracker } from '../src/features/bills/tracker-model';
import sample from './fixtures/bill-stages/sample.json';

jest.mock('../src/features/learn/open-term', () => ({ openTerm: jest.fn() }));
let mockReduced: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));

const proof = {
  dateRange: { start: '2026-10-01', end: '2026-10-01' },
  citation: 'They Vote For You',
};
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(element);
  });
  mounted.push(r);
  return r;
}
const hosts = (root: ReactTestInstance, id: RegExp) =>
  root.findAll(
    (n) => typeof n.type === 'string' && id.test(String(n.props.testID ?? '')),
  );
const labels = (root: ReactTestInstance) =>
  root
    .findAll((n) => typeof n.type === 'string' && !!n.props.accessibilityLabel)
    .map((n) => n.props.accessibilityLabel as string);
let timing: jest.SpyInstance;
const runs = () =>
  timing.mock.calls.map(
    ([, config]) => config as Animated.TimingAnimationConfig,
  );

beforeEach(() => {
  resetSettleForTests();
  mockReduced = false;
  timing = jest.spyOn(Animated, 'timing');
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  jest.restoreAllMocks();
});

describe('a division’s bar', () => {
  const split = (key?: string) => (
    <VoteSplit
      {...proof}
      ayes={76}
      noes={55}
      countsStyle="ayesNoes"
      settleKey={key}
    />
  );

  test('fills once from its leading edge, with the counts final throughout', () => {
    const r = render(split('division-invented-1'));
    const [bar] = hosts(r.root, /^vote-split-settle$/);
    expect(bar).toBeDefined();
    const style = [bar!.props.style].flat(3).filter(Boolean);
    expect(style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transformOrigin: 'left' }),
      ]),
    );
    // Its width is the ayes' share from the start: only the scale moves.
    expect(JSON.stringify(style)).toContain(`"width":"${(76 / 131) * 100}%"`);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({
      toValue: 1,
      duration: motion.duration.gentle,
      useNativeDriver: true,
    });
    expect(labels(r.root)[0]).toMatch(/^76 ayes, 55 noes\./);
  });

  test('a second drawing of the same division is at rest', () => {
    const first = render(split('division-invented-1'));
    act(() => first.unmount());
    mounted.length = 0;
    const again = render(split('division-invented-1'));
    expect(hosts(again.root, /^vote-split-settle$/)).toHaveLength(0);
    expect(runs()).toHaveLength(1);
    // Another division still gets its own.
    const other = render(split('division-invented-2'));
    expect(hosts(other.root, /^vote-split-settle$/)).toHaveLength(1);
    expect(runs()).toHaveLength(2);
  });

  test.each([['not yet known', null]])(
    'first drawn with Reduce Motion %s, it is seen: reopened with motion, it stays at rest',
    (_name, reduced) => {
      mockReduced = reduced;
      const first = render(split('division-invented-9'));
      expect(runs()).toHaveLength(0);
      act(() => first.unmount());
      mounted.length = 0;
      mockReduced = false;
      const again = render(split('division-invented-9'));
      expect(hosts(again.root, /^vote-split-settle$/)).toHaveLength(0);
      expect(runs()).toHaveLength(0);
    },
  );

  test.each([
    ['Reduce Motion on', true, 'division-invented-1'],
    ['Reduce Motion not yet known', null, 'division-invented-1'],
    ['no key', false, undefined],
  ])('%s: the bar is simply there', (_name, reduced, key) => {
    mockReduced = reduced;
    const r = render(split(key));
    expect(hosts(r.root, /^vote-split-settle$/)).toHaveLength(0);
    expect(runs()).toHaveLength(0);
    expect(labels(r.root)[0]).toMatch(/^76 ayes, 55 noes\./);
  });

  test('Reduce Motion did not use up the division’s one settle', () => {
    mockReduced = true;
    const calm = render(split('division-invented-1'));
    act(() => calm.unmount());
    mounted.length = 0;
    mockReduced = false;
    const r = render(split('division-invented-1'));
    expect(hosts(r.root, /^vote-split-settle$/)).toHaveLength(1);
  });
});

describe('a bill’s rail', () => {
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
  const tracker = trackerFor('au-federal-s1518');
  const rail = /^bill-tracker-.+-rail-(above|below)$/;

  test('the reached lengths run top to bottom and stop where the bill is', () => {
    const lengths = railLengths(tracker.steps);
    const current = tracker.steps.findIndex((s) => s.state === 'current');
    expect(current).toBeGreaterThan(0);
    // Two lengths between each pair of reached steps, none past the current.
    expect(lengths).toHaveLength(current * 2);
    expect(lengths[0]).toBe(`${tracker.steps[0]!.id}-below`);
    expect(lengths.at(-1)).toBe(`${tracker.steps[current]!.id}-above`);
  });

  test('draws each reached length in its turn, once, after the page arrives', () => {
    const r = render(<BillStageTracker tracker={tracker} settleKey="bill-1" />);
    const lengths = railLengths(tracker.steps);
    const drawn = hosts(r.root, rail);
    expect(drawn.map((n) => n.props.testID)).toEqual(
      lengths.map(
        (id) => `bill-tracker-${id.replace(/-(above|below)$/, '-rail-$1')}`,
      ),
    );
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({
      toValue: 1,
      duration: Math.min(RAIL_MAX_MS, lengths.length * RAIL_LENGTH_MS),
      delay: RAIL_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    for (const node of drawn) {
      const style = [node.props.style].flat(3).filter(Boolean);
      expect(style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ transformOrigin: 'top' }),
        ]),
      );
    }
  });

  test('what VoiceOver reads is the same with and without the drawing', () => {
    const moving = labels(
      render(<BillStageTracker tracker={tracker} settleKey="bill-1" />).root,
    );
    mockReduced = true;
    const still = labels(
      render(<BillStageTracker tracker={tracker} settleKey="bill-2" />).root,
    );
    expect(moving).toEqual(still);
    expect(moving.length).toBeGreaterThanOrEqual(tracker.steps.length);
  });

  test.each([
    ['Reduce Motion on', true, 'bill-1'],
    ['Reduce Motion not yet known', null, 'bill-1'],
    ['no key', false, undefined],
  ])('%s: the rail is simply there', (_name, reduced, key) => {
    mockReduced = reduced;
    const r = render(<BillStageTracker tracker={tracker} settleKey={key} />);
    expect(hosts(r.root, rail)).toHaveLength(0);
    expect(runs()).toHaveLength(0);
  });

  test('a reopened bill’s rail is at rest', () => {
    const first = render(
      <BillStageTracker tracker={tracker} settleKey="bill-1" />,
    );
    act(() => first.unmount());
    mounted.length = 0;
    const again = render(
      <BillStageTracker tracker={tracker} settleKey="bill-1" />,
    );
    expect(hosts(again.root, rail)).toHaveLength(0);
    expect(runs()).toHaveLength(1);
  });
});
