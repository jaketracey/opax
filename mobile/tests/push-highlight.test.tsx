/**
 * A row that opens a page keeps its highlight through the push and fades it
 * as the reader comes back (design/push-highlight.tsx).
 */
import { act, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableStateCallbackType,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  PUSH_HIGHLIGHT_FADE,
  PUSH_HIGHLIGHT_WAIT,
  pushHighlightProps,
  usePushHighlight,
} from '../src/design/push-highlight';

let mockReduceMotion = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => mockReduceMotion,
}));

function navigator() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    listeners,
    emit: (name: string) => listeners.get(name)?.forEach((fn) => fn()),
    value: {
      addListener: (name: string, fn: () => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(fn);
        return () => listeners.get(name)!.delete(fn);
      },
    } as never,
  };
}
const LIT = '#e8e4da';
const rowStyle = ({ pressed }: PressableStateCallbackType) => [
  { padding: 12, borderRadius: 10 },
  pressed ? { backgroundColor: LIT } : null,
];
let mounts = 0;
function Content() {
  useEffect(() => {
    mounts++;
  }, []);
  return <Text>Anthony Albanese</Text>;
}
function Row({ plain = false }: { plain?: boolean }) {
  const highlight = usePushHighlight();
  return (
    <Pressable
      testID="row"
      onPress={highlight.hold}
      {...pushHighlightProps(
        highlight,
        plain ? { padding: 12 } : rowStyle,
        <Content />,
      )}
    />
  );
}
function mount(nav: ReturnType<typeof navigator> | null, plain = false) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      nav ? (
        <NavigationContext.Provider value={nav.value}>
          <Row plain={plain} />
        </NavigationContext.Provider>
      ) : (
        <Row plain={plain} />
      ),
    );
  });
  const row = () => tree.root.findByProps({ testID: 'row' });
  return {
    tree,
    press: () => act(() => row().props.onPress()),
    // What the row draws with no finger on it.
    ground: () => {
      const style = row().props.style;
      return StyleSheet.flatten(
        typeof style === 'function' ? style({ pressed: false }) : style,
      ).backgroundColor;
    },
    fade: () => tree.root.findAllByProps({ testID: 'push-highlight-fade' }),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockReduceMotion = false;
  mounts = 0;
});
afterEach(() => {
  jest.useRealTimers();
});

test('the highlight holds through the push and fades when the page returns', () => {
  const nav = navigator();
  const row = mount(nav);
  expect(row.ground()).toBeUndefined();
  row.press();
  // Finger up, page still pushing: the row's own pressed look stays.
  expect(row.ground()).toBe(LIT);
  act(() => nav.emit('blur'));
  // However long the reader stays away.
  act(() => {
    jest.advanceTimersByTime(PUSH_HIGHLIGHT_WAIT * 5);
  });
  expect(row.ground()).toBe(LIT);
  act(() => nav.emit('focus'));
  // Back: the row is at rest under a fading copy of its highlight.
  expect(row.ground()).toBeUndefined();
  const [fade] = row.fade();
  expect(StyleSheet.flatten(fade!.props.style)).toMatchObject({
    backgroundColor: LIT,
    borderRadius: 10,
    position: 'absolute',
    pointerEvents: 'none',
  });
  act(() => {
    jest.advanceTimersByTime(PUSH_HIGHLIGHT_FADE.duration + 100);
  });
  expect(row.fade()).toHaveLength(0);
  expect(row.ground()).toBeUndefined();
  // The row's content was mounted once: never remounted by the highlight.
  expect(mounts).toBe(1);
  // Its listeners are gone.
  expect([...nav.listeners.values()].every((set) => set.size === 0)).toBe(true);
  act(() => row.tree.unmount());
});

test('with Reduce Motion the highlight is given up in one step', () => {
  mockReduceMotion = true;
  const nav = navigator();
  const row = mount(nav);
  row.press();
  expect(row.ground()).toBe(LIT);
  act(() => nav.emit('blur'));
  act(() => nav.emit('focus'));
  expect(row.ground()).toBeUndefined();
  expect(row.fade()).toHaveLength(0);
  act(() => row.tree.unmount());
});

test('a tap that opened nothing does not leave the row lit', () => {
  const nav = navigator();
  const row = mount(nav);
  row.press();
  expect(row.ground()).toBe(LIT);
  // A focus event with no blur before it (another screen's) changes nothing.
  act(() => nav.emit('focus'));
  expect(row.ground()).toBe(LIT);
  act(() => {
    jest.advanceTimersByTime(PUSH_HIGHLIGHT_WAIT);
  });
  expect(row.ground()).toBeUndefined();
  act(() => {
    jest.advanceTimersByTime(PUSH_HIGHLIGHT_FADE.duration + 100);
  });
  expect(row.fade()).toHaveLength(0);
  act(() => row.tree.unmount());
});

test('outside a navigator, or on a row with no pressed look, nothing is added', () => {
  const outside = mount(null);
  outside.press();
  expect(outside.ground()).toBeUndefined();
  act(() => outside.tree.unmount());
  const nav = navigator();
  const plain = mount(nav, true);
  plain.press();
  act(() => nav.emit('blur'));
  act(() => nav.emit('focus'));
  // No highlight colour to fade: no overlay.
  expect(plain.fade()).toHaveLength(0);
  act(() => plain.tree.unmount());
});

test('unmounting a held row removes its listeners and timer', () => {
  const nav = navigator();
  const row = mount(nav);
  row.press();
  act(() => row.tree.unmount());
  expect([...nav.listeners.values()].every((set) => set.size === 0)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
