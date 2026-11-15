/**
 * The money map's layout settles out of sight, a slice of each frame at a
 * time, and the map is drawn once (features/money/map/settle.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  ForceLayout,
  layoutLinks,
  layoutNodes,
} from '../src/features/money/map/layout';
import { sameLabels } from '../src/features/money/map/labels';
import { LABEL_FADE_MS } from '../src/features/money/map/MoneyMapLabels';
import {
  SETTLE_BUDGET_MS,
  SETTLE_TICKS,
  settleLayout,
} from '../src/features/money/map/settle';
import { pinned } from './pinned';

/** Frames run by hand; a clock that moves only when a tick costs time. */
function harness(tickCost: number) {
  const frames: (() => void)[] = [];
  const cancelled: number[] = [];
  const clock = { at: 0 };
  let left = 192;
  const ticks: number[] = [];
  const layout = {
    get settled() {
      return left <= 0;
    },
    tick(n = 1) {
      const run = Math.min(n, left);
      left -= run;
      ticks.push(run);
      clock.at += run * tickCost;
      return left <= 0;
    },
  };
  return {
    layout,
    ticks,
    frames,
    cancelled,
    options: {
      now: () => clock.at,
      frame: (run: () => void) => frames.push(run),
      cancelFrame: (id: number) => {
        cancelled.push(id);
      },
    },
    /** Runs the next frame; false when none is waiting. */
    step() {
      const run = frames.shift();
      run?.();
      return !!run;
    },
  };
}

test('it settles over frames within the budget and says so once, at the end', () => {
  // A tick of 0.5 ms: a slice of eight is 4 ms, a second passes the budget.
  const h = harness(0.5);
  const settled = jest.fn();
  settleLayout(h.layout, settled, h.options);
  // Nothing runs before the first frame.
  expect(h.ticks).toEqual([]);
  let frames = 0;
  while (h.step()) {
    frames++;
    // While it runs, nothing is said: the map draws no step.
    if (!h.layout.settled) expect(settled).not.toHaveBeenCalled();
  }
  expect(settled).toHaveBeenCalledTimes(1);
  expect(h.layout.settled).toBe(true);
  // 16 ticks a frame (two slices reach the 6 ms budget): 192 ticks, 12 frames.
  expect(frames).toBe(12);
  expect(Math.max(...h.ticks)).toBe(SETTLE_TICKS);
  expect(SETTLE_BUDGET_MS).toBeLessThanOrEqual(8);
});

test('a fast device settles in fewer frames, a slow one never takes more than a slice past the budget', () => {
  const fast = harness(0.05);
  settleLayout(fast.layout, jest.fn(), fast.options);
  let fastFrames = 0;
  while (fast.step()) fastFrames++;
  expect(fastFrames).toBeLessThanOrEqual(2);
  const slow = harness(2);
  const done = jest.fn();
  settleLayout(slow.layout, done, slow.options);
  let frames = 0;
  while (slow.step()) frames++;
  // One slice of eight a frame (16 ms of ticks, already over the budget).
  expect(frames).toBe(192 / SETTLE_TICKS);
  expect(done).toHaveBeenCalledTimes(1);
});

test('with Reduce Motion it settles in one go', () => {
  const h = harness(0.5);
  const settled = jest.fn();
  settleLayout(h.layout, settled, { ...h.options, reduced: true });
  expect(h.step()).toBe(true);
  expect(settled).toHaveBeenCalledTimes(1);
  expect(h.frames).toHaveLength(0);
});

test('cancelling stops it: no more ticks, nothing said', () => {
  const h = harness(0.5);
  const settled = jest.fn();
  const cancel = settleLayout(h.layout, settled, h.options);
  h.step();
  const before = h.ticks.length;
  cancel();
  expect(h.cancelled).toHaveLength(1);
  // A frame already handed out does nothing.
  h.step();
  expect(h.ticks).toHaveLength(before);
  expect(settled).not.toHaveBeenCalled();
});

test('the federal graph settles to the same places as ticking it through', () => {
  const federal = decodeMoneyGraph(pinned('/graph/money.json'));
  const nodes = layoutNodes(federal),
    links = layoutLinks(federal, nodes);
  const a = new ForceLayout(nodes, links, 402 / 600);
  const b = new ForceLayout(nodes, links, 402 / 600);
  while (!a.tick(10));
  const frames: (() => void)[] = [];
  const settled = jest.fn();
  settleLayout(b, settled, {
    frame: (run) => frames.push(run),
    cancelFrame: () => undefined,
  });
  while (frames.length) frames.shift()!();
  expect(settled).toHaveBeenCalledTimes(1);
  expect(Array.from(b.x)).toEqual(Array.from(a.x));
  expect(Array.from(b.y)).toEqual(Array.from(a.y));
});

test('the stage draws nothing of a layout still settling', () => {
  const stage = readFileSync(
    join(__dirname, '../src/features/money/map/MoneyMap.tsx'),
    'utf8',
  );
  // No per-step render: the old glide re-recorded every picture each frame.
  expect(stage).not.toMatch(/setGeneration|TICKS_PER_FRAME/);
  expect(stage).toMatch(/settleLayout\(/);
  // Pictures and names wait for the settled layout.
  expect(stage).toMatch(/if \(!settled\) return null;/);
  expect(stage).toMatch(/settled \? labelSlots\(/);
  expect(stage).toMatch(/\{pictures \? \(/);
});

describe('names on the map', () => {
  test('sameLabels is true only for the same set of names', () => {
    expect(sameLabels({}, {})).toBe(true);
    expect(sameLabels({ a: 1, b: 1 }, { b: 1, a: 1 })).toBe(true);
    expect(sameLabels({ a: 1 }, { a: 1, b: 1 })).toBe(false);
    expect(sameLabels({ a: 1, b: 1 }, { a: 1 })).toBe(false);
    expect(sameLabels({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameLabels({}, { a: 1 })).toBe(false);
  });
  test('the stage writes the visible names only when they change, and each name fades on its own change', () => {
    const read = (file: string) =>
      readFileSync(join(__dirname, '../src/features/money/map', file), 'utf8');
    // Not on every camera frame: a write restarts every name's reaction.
    expect(read('MoneyMap.tsx')).toMatch(
      /if \(!sameLabels\(allowed\.value, next\)\) allowed\.value = next;/,
    );
    expect(read('MoneyMap.tsx')).not.toMatch(
      /allowed\.value = visibleLabels\(/,
    );
    const labels = read('MoneyMapLabels.tsx');
    // The fade, its Reduce Motion cut, and no fade for the first answer.
    expect(labels).toMatch(
      /reduceMotion \|\| before === null\s*\?\s*now\s*:\s*withTiming\(now, \{ duration: LABEL_FADE_MS \}\)/,
    );
    expect(labels).toMatch(/opacity: byKind \* shown\.value/);
    expect(LABEL_FADE_MS).toBeGreaterThanOrEqual(100);
    expect(LABEL_FADE_MS).toBeLessThanOrEqual(200);
  });
});
