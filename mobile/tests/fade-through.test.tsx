/**
 * A switch between two whole views of a page fades through instead of
 * cutting (design/fade-through.tsx): Money's Map and List.
 */
import {
  act,
  createRef,
  useCallback,
  useImperativeHandle,
  useState,
  type Ref,
} from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FADE_THROUGH,
  FadeThroughHost,
  useFadeThrough,
} from '../src/design/fade-through';

let mockReduceMotion = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => mockReduceMotion,
}));

type Mode = 'list' | 'map';
type Handle = { choose: (next: Mode) => void; target: Mode | null };
const handle = createRef<Handle>();
const choose = (next: Mode) => handle.current!.choose(next);
const applied: Mode[] = [];
function Page({ ref }: { ref: Ref<Handle> }) {
  const [mode, setMode] = useState<Mode>('map');
  const switching = useFadeThrough<Mode>(
    useCallback((next) => {
      applied.push(next);
      setMode(next);
    }, []),
  );
  useImperativeHandle(ref, () => ({
    choose: (next) => switching.choose(next, mode),
    target: switching.target,
  }));
  return <Text testID="view">{mode}</Text>;
}
function mount(hosted = true) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      hosted ? (
        <FadeThroughHost>
          <Page ref={handle} />
        </FadeThroughHost>
      ) : (
        <Page ref={handle} />
      ),
    );
  });
  return {
    tree,
    view: () => tree.root.findByProps({ testID: 'view' }).props.children,
    opacity: () =>
      Number(
        JSON.stringify(
          StyleSheet.flatten(
            tree.root.findByProps({ testID: 'fade-through' }).props.style,
          ).opacity,
        ),
      ),
  };
}
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  mockReduceMotion = false;
  applied.splice(0);
});
afterEach(() => jest.useRealTimers());

test('the view on screen fades out, the choice is applied, the new view fades in', () => {
  const page = mount();
  expect(page.opacity()).toBe(1);
  act(() => choose('list'));
  // The control shows the choice at once; the page has not swapped yet.
  expect(handle.current!.target).toBe('list');
  expect(page.view()).toBe('map');
  expect(applied).toEqual([]);
  advance(FADE_THROUGH.out + 34);
  // Faded out: the choice is applied and the new view starts in.
  expect(applied).toEqual(['list']);
  expect(page.view()).toBe('list');
  advance(FADE_THROUGH.in + 34);
  expect(page.opacity()).toBe(1);
  // The whole switch is short: the page answers within a quarter second.
  expect(FADE_THROUGH.out + FADE_THROUGH.in).toBeLessThanOrEqual(300);
  act(() => page.tree.unmount());
});

test('a second choice mid-fade wins, and is applied once', () => {
  const page = mount();
  // Before the outgoing fade has ended (the test clock has not moved).
  act(() => choose('list'));
  act(() => choose('map'));
  expect(handle.current!.target).toBe('map');
  expect(applied).toEqual([]);
  advance(FADE_THROUGH.out + FADE_THROUGH.in + 68);
  expect(applied).toEqual(['map']);
  expect(page.view()).toBe('map');
  expect(page.opacity()).toBe(1);
  act(() => page.tree.unmount());
});

test('choosing the view already shown does nothing', () => {
  const page = mount();
  act(() => choose('map'));
  advance(500);
  expect(applied).toEqual([]);
  expect(page.opacity()).toBe(1);
  act(() => page.tree.unmount());
});

test('with Reduce Motion the choice is applied at once and nothing fades', () => {
  mockReduceMotion = true;
  const page = mount();
  act(() => choose('list'));
  expect(applied).toEqual(['list']);
  expect(page.view()).toBe('list');
  expect(page.opacity()).toBe(1);
  act(() => page.tree.unmount());
});

test('without a host the choice is applied at once', () => {
  const page = mount(false);
  act(() => choose('list'));
  expect(applied).toEqual(['list']);
  expect(page.view()).toBe('list');
  act(() => page.tree.unmount());
});

test('Money draws both views in the host and its picker asks for the fade', () => {
  const screen = readFileSync(
    join(__dirname, '../src/features/money/MoneyScreen.tsx'),
    'utf8',
  );
  expect(screen).toMatch(/<FadeThroughHost>\s*<MoneyPage \/>/);
  expect(screen).toMatch(/useFadeThrough<Mode>\(setMode\)/);
  expect(screen).toMatch(/switching\.choose\(next, mode\)/);
  // The control shows the choice at once, ahead of the page.
  expect(screen).toMatch(/value=\{switching\.target \?\? mode \?\? 'list'\}/);
});
