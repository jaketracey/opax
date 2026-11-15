import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer from 'react-test-renderer';
import * as stub from '../src/perf/probe.production';

const mockWrites: { name: string; body: string }[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    write(body: string) {
      mockWrites.push({ name: this.name, body });
    }
  },
}));
const mockBuild = { e2e: true, argument: 'on' as string | undefined };
jest.mock('../src/design/environment', () => ({
  get isE2E() {
    return mockBuild.e2e;
  },
}));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperty(actual, 'Settings', {
    value: {
      get: (key: string) =>
        key === 'OPAXPerfProbe' ? mockBuild.argument : undefined,
    },
  });
});

type Probe = typeof import('../src/perf/probe.e2e');
/** A fresh probe module (its switch is read once), sharing this React. */
function load(): Probe {
  const react = jest.requireActual('react');
  let probe!: Probe;
  jest.isolateModules(() => {
    jest.doMock('react', () => react);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    probe = require('../src/perf/probe.e2e');
  });
  return probe;
}
beforeEach(() => {
  jest.useFakeTimers();
  mockWrites.splice(0);
  mockBuild.e2e = true;
  mockBuild.argument = 'on';
});
afterEach(() => jest.useRealTimers());

test('e2e with -OPAXPerfProbe on: marks are written once, 1.5 s after the last', () => {
  const stats = { js_allocatedBytes: 10, js_heapSize: 20, js_numGCs: 3 };
  Object.assign(globalThis, {
    HermesInternal: { getInstrumentedStats: () => stats },
  });
  try {
    const probe = load();
    probe.perfMark('intent', '/person/anthony-albanese');
    probe.perfOnce('today-bill-0');
    probe.perfOnce('today-bill-0');
    probe.perfHeap('preload-heap-start');
    jest.advanceTimersByTime(1499);
    expect(mockWrites).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]!.name).toBe('opax-perf-marks.json');
    const written = JSON.parse(mockWrites[0]!.body);
    expect(written).toEqual({
      wall: expect.any(Number),
      now: expect.any(Number),
      bundle: expect.any(Number),
      marks: [
        ['intent', expect.any(Number), '/person/anthony-albanese'],
        ['today-bill-0', expect.any(Number)],
        ['preload-heap-start', expect.any(Number), [10, 20, 3]],
      ],
    });
  } finally {
    Object.assign(globalThis, { HermesInternal: undefined });
  }
});

test.each([
  ['an e2e build without the launch argument', true, undefined],
  ['an e2e build with another value', true, 'yes'],
  ['a development build with the argument', false, 'on'],
])('%s records nothing', (_case, e2e, argument) => {
  mockBuild.e2e = e2e;
  mockBuild.argument = argument;
  const probe = load();
  probe.perfMark('intent', '/person/anthony-albanese');
  probe.perfHeap('intent-heap');
  jest.advanceTimersByTime(10_000);
  expect(mockWrites).toHaveLength(0);
});

test('useDrawnMark marks the first commit, then the next frame', async () => {
  const probe = load();
  function Drawn() {
    probe.useDrawnMark('profile-drawn');
    return null;
  }
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Drawn />);
  });
  await act(async () => r.update(<Drawn />));
  await act(async () => jest.advanceTimersByTime(2000));
  const marks = JSON.parse(mockWrites.at(-1)!.body).marks as [string][];
  expect(marks.map(([name]) => name)).toEqual([
    'profile-drawn-layout',
    'profile-drawn',
  ]);
  await act(async () => r.unmount());
});

test('the release stub has no imports and records nothing', () => {
  const source = readFileSync(
    join(__dirname, '../src/perf/probe.production.ts'),
    'utf8',
  );
  expect(source).not.toMatch(/\bimport\b|\brequire\s*\(/);
  expect(stub.perfMark('intent', '/x')).toBeUndefined();
  expect(stub.perfOnce('x')).toBeUndefined();
  expect(stub.perfHeap('x')).toBeUndefined();
  expect(stub.useDrawnMark('x')).toBeUndefined();
  jest.advanceTimersByTime(10_000);
  expect(mockWrites).toHaveLength(0);
});

test('a second with a late JS frame leaves one js-frames mark; smooth seconds leave none', () => {
  const probe = load();
  const clock = performance.now.bind(performance);
  let stalled = 0;
  const now = jest
    .spyOn(performance, 'now')
    .mockImplementation(() => clock() + stalled);
  // Turns the probe on, which starts the frame watch.
  probe.perfMark('start');
  // Two smooth seconds at the timers' 16 ms frames: nothing.
  jest.advanceTimersByTime(2000);
  // A 120 ms stall on the JS thread: the clock moves, no frame runs.
  stalled = 120;
  jest.advanceTimersByTime(3000);
  now.mockRestore();
  expect(mockWrites.length).toBeGreaterThan(0);
  const marks: [string, number, unknown][] = JSON.parse(
    mockWrites.at(-1)!.body,
  ).marks;
  const late = marks.filter(([name]) => name === 'js-frames');
  expect(late).toHaveLength(1);
  const [frames, count, worst] = late[0]![2] as number[];
  expect(frames).toBeGreaterThan(10);
  expect(count).toBe(1);
  expect(worst).toBeGreaterThanOrEqual(120);
  expect(probe.LATE_FRAME_MS).toBe(25);
});
