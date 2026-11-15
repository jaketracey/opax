// The status line's hold (AskStatus.useHeldLine): each line stays for the
// whole interval from when it was drawn; only the latest one waits. On fake
// timers, so the 600 ms is counted exactly and never slept through.
import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { STATUS_HOLD_MS, useHeldLine } from '../src/features/ask/AskStatus';

function Probe({ text }: { text: string }) {
  const line = useHeldLine(text, STATUS_HOLD_MS);
  return createElement('held-line', {
    current: line.current,
    previous: line.previous,
  });
}
let mounted: TestRenderer.ReactTestRenderer | null = null;
/** What the hook holds now, read from the rendered tree. */
const held = () => {
  const { current, previous } = (
    mounted!.toJSON() as TestRenderer.ReactTestRendererJSON
  ).props as { current: string; previous: string | null };
  return { current, previous };
};
const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-16T00:00:00Z') });
});
afterEach(() => {
  jest.useRealTimers();
});

test('the hold is 600 ms', () => {
  expect(STATUS_HOLD_MS).toBe(600);
});

test('a new status waits out the hold: the old line at 599 ms, the new one at 600', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    mounted = r = TestRenderer.create(<Probe text="Reading your question" />);
  });
  expect(held().current).toBe('Reading your question');
  act(() => r.update(<Probe text="Searching the record" />));
  expect(held().current).toBe('Reading your question');
  advance(STATUS_HOLD_MS - 1);
  expect(held().current).toBe('Reading your question');
  advance(1);
  expect(held()).toEqual({
    current: 'Searching the record',
    previous: 'Reading your question',
  });
  act(() => r.unmount());
});

test('the hold counts from when the line was drawn, not from when the next arrived', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    mounted = r = TestRenderer.create(<Probe text="Reading your question" />);
  });
  // 400 ms into the first line's hold, the next status arrives.
  advance(400);
  act(() => r.update(<Probe text="Searching the record" />));
  advance(STATUS_HOLD_MS - 400 - 1);
  expect(held().current).toBe('Reading your question');
  advance(1);
  expect(held().current).toBe('Searching the record');
  // The new line starts its own full hold.
  act(() => r.update(<Probe text="Checking committee hearings: housing" />));
  advance(STATUS_HOLD_MS - 1);
  expect(held().current).toBe('Searching the record');
  advance(1);
  expect(held().current).toBe('Checking committee hearings: housing');
  act(() => r.unmount());
});

test('only the latest waits: a status replaced during the hold is never drawn', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    mounted = r = TestRenderer.create(<Probe text="Reading your question" />);
  });
  act(() => r.update(<Probe text="Searching the record" />));
  advance(300);
  act(() => r.update(<Probe text="Checking committee hearings: housing" />));
  advance(STATUS_HOLD_MS - 300 - 1);
  expect(held().current).toBe('Reading your question');
  advance(1);
  expect(held().current).toBe('Checking committee hearings: housing');
  act(() => r.unmount());
});

test('a line already held for its time changes at the next turn', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    mounted = r = TestRenderer.create(<Probe text="Reading your question" />);
  });
  advance(STATUS_HOLD_MS + 250);
  act(() => r.update(<Probe text="Searching the record" />));
  advance(0);
  expect(held().current).toBe('Searching the record');
  act(() => r.unmount());
});
