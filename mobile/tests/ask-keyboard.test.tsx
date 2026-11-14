/**
 * Ask's composer follows the keyboard frame by frame on iOS (BACKLOG D3):
 * it stays laid out at rest and keyboard-controller's frames lift it, so it
 * no longer jumps up before the keyboard arrives. Reduce Motion takes the end
 * position at once; a floating keyboard lifts nothing; Android keeps laying
 * the composer out above the IME after the window resizes.
 */
import { act, useRef, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import {
  Dimensions,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  RegionProvider,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { emptyReservedRegions, type ReservedRegions } from '../src/design/fold';
import { rhythm } from '../src/design/tokens';
import { AskColumns, liftObstacles } from '../src/features/ask/AskLayout';
import {
  KeyboardFrames,
  composerLift,
  dockedKeyboardTop,
  useKeyboardOverlap,
} from '../src/features/ask/keyboard';

// keyboard-controller's frames, as its native observer reports them.
type KeyboardFrame = { height: number };
const mockKeyboard: {
  handlers: Partial<Record<string, (event: KeyboardFrame) => void>>;
  calls: number;
} = { handlers: {}, calls: 0 };
jest.mock('react-native-keyboard-controller', () => ({
  ...jest.requireActual('react-native-keyboard-controller/jest'),
  useKeyboardHandler: (
    handlers: Partial<Record<string, (event: KeyboardFrame) => void>>,
  ) => {
    mockKeyboard.calls += 1;
    mockKeyboard.handlers = handlers;
  },
}));
jest.mock('react-native-reanimated', () => {
  const { useState } = jest.requireActual('react');
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    // One shared value per mount, as on a device (the library mock makes a
    // new one on every render).
    useSharedValue: <T,>(init: T) => useState(() => ({ value: init }))[0],
  };
});
let mockReduceMotion = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => mockReduceMotion,
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));

// A 17 Pro: 874 pt tall, with 83 pt of tab bar and home indicator below the
// composer's resting area. The composer is 80 pt tall.
const WINDOW = { width: 402, height: 874, scale: 3, fontScale: 1 };
const AREA = 791;
const COMPOSER = 80;
const GAP = WINDOW.height - AREA;

const handlers = new Map<string, ((event: KeyboardEvent) => void)[]>();
const mounted: TestRenderer.ReactTestRenderer[] = [];
let windowAreaHeight = AREA;

beforeEach(() => {
  mockKeyboard.handlers = {};
  mockKeyboard.calls = 0;
  mockReduceMotion = false;
  windowAreaHeight = AREA;
  handlers.clear();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  // The resting area measures in the window: it ends GAP above the bottom.
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (
    this: View,
    callback,
  ) {
    if ((this.props as { testID?: string }).testID === 'ask-composer-bounds')
      callback(0, 0, WINDOW.width, windowAreaHeight);
    else callback(0, 0, WINDOW.width, WINDOW.height);
  });
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, handler) => {
    const list = handlers.get(name) ?? [];
    list.push(handler as (event: KeyboardEvent) => void);
    handlers.set(name, list);
    return {
      remove: () => list.splice(list.indexOf(handler as never), 1),
    } as never;
  });
  act(() => {
    Dimensions.set({ window: WINDOW, screen: WINDOW });
    resetAdaptiveDeviceForTests();
    setWindowTraitsOverride({
      horizontal: 'compact',
      vertical: 'regular',
      foldable: false,
    });
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
});

function emit(name: string, event: Partial<KeyboardEvent> = {}) {
  act(() =>
    (handlers.get(name) ?? []).forEach((handler) =>
      handler(event as KeyboardEvent),
    ),
  );
}
/** keyboard-controller reports a frame (`onMove`) or a phase of the motion. */
function frame(
  phase: 'onStart' | 'onMove' | 'onInteractive' | 'onEnd',
  height: number,
) {
  act(() => mockKeyboard.handlers[phase]?.({ height }));
}
const docked = (height: number) => ({
  endCoordinates: {
    screenX: 0,
    screenY: WINDOW.height - height,
    width: WINDOW.width,
    height,
  },
});
// iPad's floating keyboard, and the empty frame UIKit reports as it undocks.
const floatingFrame = {
  endCoordinates: { screenX: 60, screenY: 300, width: 320, height: 260 },
};
const emptyFrame = {
  endCoordinates: { screenX: 0, screenY: 0, width: 0, height: 0 },
};

function render(element: () => ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element());
  });
  mounted.push(tree);
  return {
    tree,
    rerender: () => act(() => tree.update(element())),
  };
}
const native = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );

function columns({
  isDocked = false,
  keyboard = 0,
  regions = emptyReservedRegions,
  width = WINDOW.width,
}: {
  isDocked?: boolean;
  keyboard?: number;
  regions?: ReservedRegions;
  width?: number;
} = {}) {
  // A fresh element on each call, so a rerender reaches the composer.
  return function element() {
    return (
      <RegionProvider value={{ width, height: WINDOW.height }}>
        <ReservedRegionsProvider value={regions}>
          <AskColumns
            docked={isDocked}
            content={<View />}
            dock={<View testID="fixture-composer" />}
            sources={isDocked ? <View /> : null}
            keyboard={keyboard}
            ground="sunken"
          />
        </ReservedRegionsProvider>
      </RegionProvider>
    );
  };
}
/** Lays the area and composer out as UIKit would, then reads the composer. */
function layOut(
  tree: TestRenderer.ReactTestRenderer,
  area: { width: number; height: number },
) {
  act(() => {
    native(tree, 'ask-composer-bounds').props.onLayout({
      nativeEvent: { layout: area },
    });
    native(tree, 'ask-composer-position').props.onLayout({
      nativeEvent: { layout: { width: area.width, height: COMPOSER } },
    });
  });
}
/** An upward offset of `n` points (0, not -0, when there is none). */
const up = (n: number) => (n > 0 ? -n : 0);
function composer(tree: TestRenderer.ReactTestRenderer) {
  const style = StyleSheet.flatten(
    native(tree, 'ask-composer-position').props.style,
  );
  const lift =
    (style.transform as { translateY: number }[] | undefined)?.[0]
      ?.translateY ?? 0;
  return { top: style.top as number, left: style.left as number, lift };
}

describe('the keyboard end frame', () => {
  test('a docked keyboard or a hardware keyboard’s shortcuts bar counts; a floating or empty one does not', () => {
    expect(dockedKeyboardTop(docked(336).endCoordinates, 874)).toBe(538);
    // iPad with a hardware keyboard: only the shortcuts bar, docked.
    expect(dockedKeyboardTop(docked(55).endCoordinates, 874)).toBe(819);
    // iPad's floating keyboard stands clear of the bottom edge.
    expect(
      dockedKeyboardTop(
        { screenX: 60, screenY: 300, width: 320, height: 260 },
        874,
      ),
    ).toBeNull();
    // UIKit reports an empty frame for a floating or cross-faded keyboard.
    expect(
      dockedKeyboardTop({ screenX: 0, screenY: 0, width: 0, height: 0 }, 874),
    ).toBeNull();
    expect(dockedKeyboardTop(undefined, 874)).toBeNull();
  });

  test('a floating keyboard leaves the conversation’s room and the band alone', () => {
    let result!: ReturnType<typeof useKeyboardOverlap>;
    function Probe() {
      const ref = useRef<View>(null);
      result = useKeyboardOverlap(ref);
      return <View ref={ref} testID="ask-root" />;
    }
    render(() => <Probe />);
    emit('keyboardWillChangeFrame', docked(336));
    expect(result).toEqual({ overlap: 336, visible: true });
    emit('keyboardWillChangeFrame', floatingFrame);
    expect(result).toEqual({ overlap: 0, visible: false });
    emit('keyboardWillChangeFrame', docked(336));
    emit('keyboardWillHide');
    expect(result).toEqual({ overlap: 0, visible: false });
  });
});

test.each([1, 2])(
  'Android font %s: overlap reads the resized window before the tab bar finishes hiding',
  (fontScale) => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    let result!: ReturnType<typeof useKeyboardOverlap>;
    const rendered: number[] = [];
    function Probe() {
      const ref = useRef<View>(null);
      result = useKeyboardOverlap(ref);
      rendered.push(result.overlap);
      return <View ref={ref} testID="ask-composer-bounds" />;
    }
    const top = WINDOW.height - 336;
    const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({ screenY: top } as never);
    act(() => Dimensions.set({ window: { ...WINDOW, fontScale } }));
    render(() => <Probe />);
    expect(result).toEqual({ overlap: 336, visible: true });
    const measure = jest.mocked(View.prototype.measureInWindow);
    measure.mockClear();
    rendered.length = 0;
    act(() =>
      Dimensions.set({ window: { ...WINDOW, fontScale, height: top } }),
    );
    // The measured container is still a tab-bar height above the window.
    windowAreaHeight = top - GAP;
    emit('keyboardDidShow', docked(336));
    expect(result).toEqual({ overlap: 0, visible: true });
    expect(rendered.every((overlap) => overlap === 0)).toBe(true);
    expect(measure).not.toHaveBeenCalled();
    windowAreaHeight = top;
    emit('keyboardDidShow', docked(336));
    expect(result).toEqual({ overlap: 0, visible: true });
    visible.mockReturnValue(false);
    emit('keyboardDidHide');
    expect(result).toEqual({ overlap: 0, visible: false });
  },
);

test.each([1, 2])(
  'Android font %s: the composer stays on the keyboard as the tab bar releases its space',
  (fontScale) => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    act(() => Dimensions.set({ window: { ...WINDOW, fontScale } }));
    const header = 80;
    const keyboard = 336;
    const element = columns({ keyboard });
    const { tree, rerender } = render(() => (
      <HeaderHeightContext.Provider value={header}>
        {element()}
      </HeaderHeightContext.Provider>
    ));
    const expected = WINDOW.height - keyboard - header - COMPOSER;
    // DidShow arrives while the content still ends above the tab bar.
    layOut(tree, { width: WINDOW.width, height: WINDOW.height - header - GAP });
    rerender();
    expect(composer(tree).top).toBe(expected);
    // Hiding the tab bar expands the same content area on a later frame.
    layOut(tree, { width: WINDOW.width, height: WINDOW.height - header });
    rerender();
    expect(composer(tree).top).toBe(expected);
  },
);

describe('iOS: the composer rises with the keyboard', () => {
  test('frame by frame, its bottom edge sits on the keyboard’s top; its layout stays at rest', () => {
    const { tree, rerender } = render(columns());
    layOut(tree, { width: WINDOW.width, height: AREA });
    rerender();
    const rest = AREA - COMPOSER;
    expect(composer(tree)).toEqual({ top: rest, left: 0, lift: 0 });
    // The keyboard's height on successive frames as it opens, then closes.
    frame('onStart', 336);
    rerender();
    // Its destination alone moves nothing: the frames do.
    expect(composer(tree).lift).toBe(0);
    for (const height of [0, 24, 83, 140, 260, 336, 300, 120, 40, 0]) {
      frame('onMove', height);
      rerender();
      const { top, lift } = composer(tree);
      expect(top).toBe(rest);
      expect(lift).toBe(up(height - GAP));
      // Until the keyboard passes the tab bar the composer stays put; then
      // its bottom edge is the keyboard's top edge.
      const bottom = top + COMPOSER + lift;
      expect(bottom).toBe(Math.min(AREA, WINDOW.height - height));
    }
    expect(mockKeyboard.calls).toBeGreaterThan(0);
  });

  test('an interactive dismissal: the composer follows the keyboard under the finger', () => {
    const { tree, rerender } = render(columns());
    layOut(tree, { width: WINDOW.width, height: AREA });
    frame('onEnd', 336);
    rerender();
    expect(composer(tree).lift).toBe(up(336 - GAP));
    for (const height of [300, 180, 90]) {
      frame('onInteractive', height);
      rerender();
      expect(composer(tree).lift).toBe(up(height - GAP));
    }
    frame('onEnd', 0);
    rerender();
    expect(composer(tree).lift).toBe(0);
  });

  test.each([
    ['an iPhone', false, ['left', 'right', 'bottom']],
    // iPad and an adaptive iPhone (the Duo): SidebarSafe owns the sides.
    ['an adaptive iPhone', true, ['bottom']],
  ] as const)(
    'the resting area keeps its bottom inset with the keyboard up on %s: the lift covers it',
    (_device, adaptive, expected) => {
      if (adaptive)
        act(() =>
          setWindowTraitsOverride({
            horizontal: 'regular',
            vertical: 'regular',
            foldable: false,
          }),
        );
      const { tree } = render(columns({ keyboard: 253 }));
      const edges = tree.root
        .findAllByType(SafeAreaView)
        .map((node) => node.props.edges as string[]);
      // The composer's area, and the band inside it (positioned: no edges).
      expect(edges).toEqual([expected, []]);
      // The end-state overlap no longer shortens the area: no layout jump.
      layOut(tree, { width: WINDOW.width, height: AREA });
      expect(composer(tree).top).toBe(AREA - COMPOSER);
    },
  );

  test('the band keeps its top padding at rest, so the composer’s height holds as the keyboard starts', () => {
    const band = (keyboard: number) => {
      const { tree } = render(columns({ keyboard }));
      return StyleSheet.flatten(native(tree, 'ask-phone-dock').props.style);
    };
    const atRest = band(0);
    const raised = band(253);
    expect(atRest.paddingTop).toBe(rhythm.tight);
    expect(raised.paddingTop).toBe(rhythm.tight);
    // Only the colour behind it changes.
    expect(atRest.backgroundColor).toBeUndefined();
    expect(raised.backgroundColor).toBeDefined();
  });

  test('iPad’s floating keyboard lifts nothing; docked again, the composer rises', () => {
    act(() => {
      Dimensions.set({
        window: { ...WINDOW, width: 1032, height: 1376 },
        screen: { ...WINDOW, width: 1032, height: 1376 },
      });
    });
    windowAreaHeight = 1376;
    const { tree, rerender } = render(columns({ width: 1032 }));
    layOut(tree, { width: 1032, height: 1376 });
    rerender();
    const ipadFloating = {
      endCoordinates: { screenX: 300, screenY: 700, width: 320, height: 260 },
    };
    for (const frameEvent of [ipadFloating, emptyFrame]) {
      emit('keyboardWillChangeFrame', frameEvent);
      // keyboard-controller still reports the floating keyboard's height.
      frame('onStart', 260);
      frame('onMove', 260);
      frame('onEnd', 260);
      rerender();
      expect(composer(tree).lift).toBe(0);
    }
    // Docked again: the frames lift it.
    emit('keyboardWillChangeFrame', {
      endCoordinates: {
        screenX: 0,
        screenY: 1376 - 398,
        width: 1032,
        height: 398,
      },
    });
    frame('onMove', 398);
    rerender();
    expect(composer(tree).lift).toBe(-398);
    // Undocking with the keyboard up drops it at once.
    emit('keyboardWillChangeFrame', ipadFloating);
    rerender();
    expect(composer(tree).lift).toBe(0);
    frame('onEnd', 260);
    rerender();
    expect(composer(tree).lift).toBe(0);
  });

  test('Reduce Motion: a floating keyboard’s destination lifts nothing either', () => {
    mockReduceMotion = true;
    const { tree, rerender } = render(columns());
    layOut(tree, { width: WINDOW.width, height: AREA });
    emit('keyboardWillChangeFrame', floatingFrame);
    frame('onStart', 260);
    frame('onEnd', 260);
    rerender();
    expect(composer(tree).lift).toBe(0);
  });

  test('Reduce Motion: no animation, the composer takes the keyboard’s end position at once', () => {
    mockReduceMotion = true;
    const { tree, rerender } = render(columns());
    layOut(tree, { width: WINDOW.width, height: AREA });
    // Its destination is known as it starts to move: the composer goes there.
    frame('onStart', 336);
    rerender();
    expect(composer(tree).lift).toBe(-(336 - GAP));
    // The frames in between move nothing.
    for (const height of [24, 200, 320]) {
      frame('onMove', height);
      rerender();
      expect(composer(tree).lift).toBe(-(336 - GAP));
    }
    frame('onEnd', 336);
    frame('onStart', 0);
    rerender();
    expect(composer(tree).lift).toBe(0);
    frame('onMove', 200);
    rerender();
    expect(composer(tree).lift).toBe(0);
  });

  test('iPad split pane: the composer under the conversation rises by the whole overlap', () => {
    act(() => {
      Dimensions.set({
        window: { ...WINDOW, width: 1032, height: 1376 },
        screen: { ...WINDOW, width: 1032, height: 1376 },
      });
      setWindowTraitsOverride({
        horizontal: 'regular',
        vertical: 'regular',
        foldable: false,
      });
    });
    windowAreaHeight = 1376;
    const { tree, rerender } = render(columns({ isDocked: true, width: 1032 }));
    expect(
      tree.root.findAllByType(SafeAreaView).map((node) => node.props.edges),
    ).toContainEqual([]);
    layOut(tree, { width: 640, height: 1376 });
    rerender();
    // Hardware keyboard: only the 55 pt shortcuts bar.
    for (const height of [0, 20, 55, 200, 398]) {
      frame('onMove', height);
      rerender();
      expect(composer(tree).lift).toBe(up(height));
    }
    // Undocked to float, UIKit hides the docked keyboard: nothing lifts.
    frame('onEnd', 0);
    rerender();
    expect(composer(tree).lift).toBe(0);
  });

  test('Duo: on its side of a vertical fold, the composer keeps its side and rises', () => {
    const fold: ReservedRegions = {
      divisions: [{ x: 293, y: 0, width: 40, height: 874, active: true }],
      occlusions: [],
    };
    const { tree, rerender } = render(columns({ regions: fold, width: 626 }));
    layOut(tree, { width: 626, height: AREA });
    rerender();
    const rest = composer(tree);
    expect(rest).toMatchObject({ top: AREA - COMPOSER, left: 333, lift: 0 });
    frame('onMove', 300);
    rerender();
    expect(composer(tree)).toEqual({ ...rest, lift: -(300 - GAP) });
  });

  test('Duo: rising, the composer moves above a horizontal fold rather than across it', () => {
    const fold: ReservedRegions = {
      divisions: [{ x: 0, y: 400, width: 402, height: 30, active: true }],
      occlusions: [],
    };
    const { tree, rerender } = render(columns({ regions: fold }));
    layOut(tree, { width: WINDOW.width, height: AREA });
    rerender();
    const rest = AREA - COMPOSER;
    frame('onMove', 336);
    rerender();
    expect(composer(tree).lift).toBe(-(336 - GAP));
    // 450 pt would put it across 400 to 430: it sits above the fold instead.
    frame('onMove', 450);
    rerender();
    expect(rest + composer(tree).lift).toBe(400 - COMPOSER);
  });
});

test('Android: unchanged, laid out above the IME after the resize, with no keyboard tracking', () => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  const { tree } = render(columns({ keyboard: 300 }));
  expect(
    tree.root.findAllByType(SafeAreaView).map((node) => node.props.edges),
  ).toContainEqual(['left', 'right']);
  layOut(tree, { width: WINDOW.width, height: WINDOW.height });
  const { top, lift } = composer(tree);
  expect(top).toBe(WINDOW.height - 300 - COMPOSER);
  expect(lift).toBe(0);
  expect(mockKeyboard.calls).toBe(0);
});

// Retains 7ac5ed1b1's unchanged-window tab resize regression. The window
// bottom is already correct at keyboardDidShow, before the tab bar resizes.
test.each([1, 2])(
  'Android font %s: tab resizes and keyboard changes keep the window overlap current',
  (fontScale) => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    act(() => Dimensions.set({ window: { ...WINDOW, fontScale } }));
    let bottom = AREA;
    let result!: ReturnType<typeof useKeyboardOverlap>;
    const event = docked(336);
    const metrics = jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const measure = jest
      .mocked(View.prototype.measureInWindow)
      .mockImplementation((callback) => callback(0, 0, WINDOW.width, bottom));
    measure.mockClear();
    function Probe() {
      const ref = useRef<View>(null);
      result = useKeyboardOverlap(ref);
      return <View ref={ref} style={{ height: bottom }} />;
    }
    const { rerender } = render(() => <Probe />);
    metrics.mockReturnValue(event.endCoordinates);
    emit('keyboardDidShow', event);
    expect(result).toEqual({ overlap: 336, visible: true });
    // Hiding the tab bar grows Ask after keyboardDidShow, with the same
    // edge-to-edge window. There must be no old tab-height inset first.
    bottom = WINDOW.height;
    rerender();
    expect(Dimensions.get('window').height).toBe(WINDOW.height);
    expect(result).toEqual({ overlap: 336, visible: true });
    // Moving away and back can restore the tab reservation while the
    // keyboard hides, then show a keyboard with a different height.
    metrics.mockReturnValue(undefined);
    emit('keyboardDidHide');
    bottom = AREA;
    rerender();
    expect(result).toEqual({ overlap: 0, visible: false });
    emit('keyboardDidShow', docked(280));
    bottom = WINDOW.height;
    rerender();
    expect(result).toEqual({ overlap: 280, visible: true });
    // A native adjustResize path already clears the IME: no second lift.
    bottom = WINDOW.height - 280;
    act(() =>
      Dimensions.set({ window: { ...WINDOW, height: bottom, fontScale } }),
    );
    rerender();
    expect(result).toEqual({ overlap: 0, visible: true });
    expect(measure).not.toHaveBeenCalled();
    emit('keyboardDidHide');
    expect(result).toEqual({ overlap: 0, visible: false });
    expect(mockKeyboard.calls).toBe(0);
  },
);

test('keyboard frames come from one provider at the root, on iOS only, without preloading the keyboard', () => {
  const child = <View testID="fixture-app" />;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<KeyboardFrames>{child}</KeyboardFrames>);
  });
  mounted.push(tree);
  const provider = tree.root.find(
    (node) => node.type === ('KeyboardProvider' as never),
  );
  expect(provider.props.preload).toBe(false);
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  act(() => tree.update(<KeyboardFrames>{child}</KeyboardFrames>));
  expect(
    tree.root.findAll((node) => node.type === ('KeyboardProvider' as never)),
  ).toEqual([]);
  expect(native(tree, 'fixture-app')).toBeTruthy();
});

describe('composerLift', () => {
  const rest = { top: 711, height: 80 };
  test('nothing until the keyboard passes the area’s bottom edge, then the overlap', () => {
    expect(composerLift(0, 83, rest, [])).toBe(0);
    expect(composerLift(83, 83, rest, [])).toBe(0);
    expect(composerLift(336, 83, rest, [])).toBe(-253);
  });
  test('a camera or horizontal fold above is passed over, lowest first', () => {
    const obstacles = liftObstacles(
      {
        divisions: [
          { x: 0, y: 400, width: 402, height: 30, active: true },
          // Vertical: the composer keeps its side of it instead.
          { x: 300, y: 0, width: 30, height: 874, active: true },
        ],
        occlusions: [
          { x: 150, y: 300, width: 60, height: 60, active: true },
          { x: 150, y: 100, width: 60, height: 60, active: false },
        ],
      },
      { x: 0, y: 711, width: 402, height: 80 },
    );
    expect(obstacles).toEqual([
      { top: 400, bottom: 430 },
      { top: 300, bottom: 360 },
    ]);
    expect(composerLift(450, 83, rest, obstacles)).toBe(220 - 711);
    expect(composerLift(200, 83, rest, obstacles)).toBe(-117);
  });
});
