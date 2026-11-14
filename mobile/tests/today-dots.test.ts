import { execFileSync } from 'node:child_process';
import {
  DOT_CYCLE,
  DOT_NEUTRAL,
  cycleLevel,
  dotClockNeeded,
  dotLevel,
  dotRowOpacity,
  dotScrollDistance,
  dotStates,
  electorateDotState,
  outlineDotState,
  dotTarget,
  sampleDotRows,
  type DotHighlight,
} from '../src/features/today/australia-dots-model';
import { index } from './pinned';

const cycling: DotHighlight = { target: -1, from: [], changedAt: -1 };
const held = (state: (typeof dotStates)[number]): DotHighlight => ({
  target: dotStates.indexOf(state),
  from: [],
  changedAt: -1,
});
const levels = (time: number, mode: DotHighlight, reduced = false) =>
  dotStates.map((_, group) => dotLevel(group, time, mode, reduced));

test('the directory electorate supplies its state, including ACT with NSW', () => {
  expect(
    electorateDotState(
      index.electorates.find((seat) => seat.name === 'Grayndler')!,
    ),
  ).toBe('nsw');
  for (const state of [...dotStates, 'act']) {
    const seat = index.electorates.find(
      (seat) => seat.state_code.toLowerCase() === state,
    );
    expect(seat).toBeDefined();
    expect(electorateDotState(seat!)).toBe(state === 'act' ? 'nsw' : state);
    expect(electorateDotState({ state_code: state.toUpperCase() })).toBe(
      state === 'act' ? 'nsw' : state,
    );
  }
  expect(electorateDotState(null)).toBeNull();
  expect(electorateDotState({ state_code: 'unknown' })).toBeNull();
  expect(outlineDotState('8')).toBe('nsw');
  expect(outlineDotState('1')).toBe('nsw');
  expect(outlineDotState('9')).toBeNull();
});

test('while the seat is read the map is neutral: no bronze, no walk, no clock (sweep 3, item 1)', () => {
  expect(dotTarget('nsw', true)).toBe(DOT_NEUTRAL);
  expect(dotTarget(null, true)).toBe(DOT_NEUTRAL);
  expect(dotTarget(null)).toBe(DOT_CYCLE);
  expect(dotTarget('vic')).toBe(dotStates.indexOf('vic'));
  const neutral: DotHighlight = {
    target: DOT_NEUTRAL,
    from: [],
    changedAt: -1,
  };
  for (const time of [0, 0.45, 2.4, 16.8, 200]) {
    expect(levels(time, neutral)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(levels(time, neutral, true)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(dotClockNeeded(true, true, true, false, time, neutral)).toBe(false);
  }
  // The seat answers: its tint fades in over 0.9 s from nothing, the clock
  // running only for the fade; with no seat, the walk fades in instead.
  const start = 0;
  const from = levels(start, neutral);
  const tint = { ...held('nsw'), from, changedAt: start };
  expect(levels(start, tint)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(levels(start + 0.45, tint)[4]).toBeCloseTo(0.5);
  expect(levels(start + 0.9, tint)).toEqual([0, 0, 0, 0, 1, 0, 0]);
  expect(dotClockNeeded(true, true, true, false, start + 0.45, tint)).toBe(
    true,
  );
  expect(dotClockNeeded(true, true, true, false, start + 0.9, tint)).toBe(
    false,
  );
  // Reduce Motion: the tint at once.
  expect(levels(start, tint, true)).toEqual([0, 0, 0, 0, 1, 0, 0]);
  const walk = { ...cycling, from, changedAt: start };
  expect(levels(start, walk)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(levels(start + 0.9, walk)).toEqual(
    dotStates.map((_, group) => cycleLevel(group, start + 0.9)),
  );
});

test('2.4 seconds per state, west to east, with the approved smooth rise and fall', () => {
  expect(dotStates).toEqual(['wa', 'nt', 'sa', 'qld', 'nsw', 'vic', 'tas']);
  dotStates.forEach((_, group) => {
    const start = group * 2.4;
    expect(cycleLevel(group, start)).toBeCloseTo(0);
    expect(cycleLevel(group, start + 0.175 * 2.4)).toBeCloseTo(0.5);
    expect(cycleLevel(group, start + 0.35 * 2.4)).toBeCloseTo(1);
    expect(cycleLevel(group, start + 1.175 * 2.4)).toBeCloseTo(0.5);
    expect(cycleLevel(group, start + 1.35 * 2.4)).toBeCloseTo(0);
    expect(cycleLevel(group, start + 7 * 2.4 + 0.35 * 2.4)).toBeCloseTo(1);
  });
});

test('a saved state is fully bronze on the first frame and never cycles', () => {
  for (const time of [0, 0.45, 2.4, 16.8, 200]) {
    expect(levels(time, held('nsw'))).toEqual([0, 0, 0, 0, 1, 0, 0]);
    expect(levels(time, cycling)).toEqual(
      dotStates.map((_, group) => cycleLevel(group, time)),
    );
  }
});

test('choosing, switching and clearing crossfade over 0.9 seconds', () => {
  for (const [previous, next] of [
    [cycling, held('nsw')],
    [held('nsw'), held('vic')],
    [held('vic'), cycling],
  ]) {
    const start = 1.2;
    const from = levels(start, previous!);
    const mode = { ...next!, from, changedAt: start };
    expect(levels(start, mode)).toEqual(from);
    const midway = levels(start + 0.45, mode);
    const target = levels(start + 0.45, next!);
    midway.forEach((value, group) =>
      expect(value).toBeCloseTo((from[group]! + target[group]!) / 2),
    );
    levels(start + 0.9, mode).forEach((value, group) =>
      expect(value).toBeCloseTo(levels(start + 0.9, next!)[group]!),
    );
  }
});

test('a rapid second choice starts from the current light without a jump', () => {
  const first = { ...held('vic'), from: levels(0, held('nsw')), changedAt: 0 };
  const current = levels(0.3, first);
  const second = { ...held('wa'), from: current, changedAt: 0.3 };
  expect(levels(0.3, second)).toEqual(current);
  levels(1.2, second).forEach((value, group) =>
    expect(value).toBeCloseTo(levels(1.2, held('wa'))[group]!),
  );
});

test('Reduce Motion keeps only the chosen state, including during a crossfade', () => {
  for (const time of [0, 0.45, 10]) {
    expect(levels(time, cycling, true)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(
      levels(
        time,
        { ...held('nsw'), from: [1, 0, 0, 0, 0, 0, 0], changedAt: 0 },
        true,
      ),
    ).toEqual([0, 0, 0, 0, 1, 0, 0]);
  }
});

test('bottom rows fade first, all are gone at 90 pt, and bounce stays at rest', () => {
  expect(dotScrollDistance(Number.NaN, 160)).toBe(0);
  expect(dotScrollDistance(-160, 160)).toBe(0);
  expect(dotScrollDistance(-180, 160)).toBe(0);
  expect(dotScrollDistance(-120, 160)).toBe(40);
  for (const row of [0, 0.25, 0.5, 0.75, 1]) {
    expect(dotRowOpacity(row, 0)).toBe(1);
    expect(dotRowOpacity(row, 90)).toBe(0);
    expect(dotRowOpacity(row, 200)).toBe(0);
  }
  expect(dotRowOpacity(0, 40)).toBeGreaterThan(dotRowOpacity(1, 40));
});

test('the clock stops when hidden, unfocused, backgrounded, reduced or held', () => {
  expect(dotClockNeeded(true, true, true, false, 0, cycling)).toBe(true);
  expect(dotClockNeeded(false, true, true, false, 0, cycling)).toBe(false);
  expect(dotClockNeeded(true, false, true, false, 0, cycling)).toBe(false);
  expect(dotClockNeeded(true, true, false, false, 0, cycling)).toBe(false);
  expect(dotClockNeeded(true, true, true, true, 0, cycling)).toBe(false);
  expect(dotClockNeeded(true, true, true, false, 0, held('nsw'))).toBe(false);
  const transition = { ...held('nsw'), changedAt: 2 };
  expect(dotClockNeeded(true, true, true, false, 2.89, transition)).toBe(true);
  expect(dotClockNeeded(true, true, true, false, 2.91, transition)).toBe(false);
});

test('the sampler uses a deterministic 5 pt grid and one owner per point', () => {
  const paths = [
    { state: 'wa' as const, contains: (x: number) => x < 10 },
    { state: 'nsw' as const, contains: () => true },
  ];
  const rows = sampleDotRows(192, 10, paths);
  expect(sampleDotRows(192, 10, paths)).toEqual(rows);
  expect(rows.map((row) => row.y)).toEqual([2.5, 7.5]);
  expect(rows[0]!.groups[0]).toEqual({
    state: 'wa',
    points: [
      { x: 2.5, y: 2.5 },
      { x: 7.5, y: 2.5 },
    ],
  });
  expect(rows[0]!.groups[1]!.points[0]).toEqual({ x: 12.5, y: 2.5 });
});

test('the real ABS paths produce the same sampled field on repeated runs', () => {
  // Real Skia containment, independent of workflow tests' native canvas mock.
  const result = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '-e',
      `
    const init = require('canvaskit-wasm/bin/full/canvaskit.js');
    const outline = require('./src/features/today/australia-outline.json');
    const {sampleDotRows, outlineDotState} = require('./src/features/today/australia-dots-model.ts');
    init().then(kit => {
      const paths = outline.states.map(s => {
        const path = kit.Path.MakeFromSVGString(s.d);
        return {state: outlineDotState(s.code), contains: (x,y) => path.contains(x,y)};
      });
      const a = sampleDotRows(outline.width, outline.height, paths);
      const b = sampleDotRows(outline.width, outline.height, paths);
      const counts = {};
      for (const row of a) for (const group of row.groups) counts[group.state] = (counts[group.state] || 0) + group.points.length;
      process.stdout.write(JSON.stringify({same: JSON.stringify(a) === JSON.stringify(b), rows: a.length, counts}));
    });
  `,
    ],
    { cwd: `${__dirname}/..`, encoding: 'utf8' },
  );
  const sampled = JSON.parse(result) as {
    same: boolean;
    rows: number;
    counts: Record<string, number>;
  };
  expect(sampled.same).toBe(true);
  expect(sampled.rows).toBeGreaterThan(30);
  expect(Object.keys(sampled.counts).sort()).toEqual([...dotStates].sort());
  expect(
    Object.values(sampled.counts).reduce((sum, count) => sum + count, 0),
  ).toBeGreaterThan(500);
});
