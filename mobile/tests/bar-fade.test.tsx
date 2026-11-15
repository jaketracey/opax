import TestRenderer, { act } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
} from 'react-native';
import { paletteFor } from '../src/design/palette';
import { AnimatedHeaderHeightContext } from 'expo-router/build/react-navigation/native-stack/utils/useAnimatedHeaderHeight';
import {
  BAR_FADE_RAMP,
  BAR_FADE_TAIL,
  BarFade,
  ClearBarFade,
  useBarFadeScroll,
} from '../src/design/bar-fade';
import { clearBars } from '../src/navigation/chrome';

let mockSolid = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useSolidBar: () => mockSolid,
}));

// A page under a clear bar fades into its own ground behind the bar: no
// blur panel, no fill of another colour and no hairline (Ask and Today on
// the Duo, b76), and the title no longer prints over the page (Bills, iOS
// 27). The fade is one layer, always mounted, moved and faded by Animated
// nodes: scrolling renders nothing.
const layer = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.find(
    (node) => node.props.testID === 'bar-fade' && typeof node.type === 'string',
  );
const shown = (renderer: TestRenderer.ReactTestRenderer) => {
  const style = StyleSheet.flatten(layer(renderer).props.style);
  return {
    opacity: style.opacity as number,
    foot:
      (style.transform as { translateY: number }[])[0]!.translateY +
      (style.height as number),
  };
};
const attach = jest.spyOn(
  Animated as unknown as { attachNativeEvent: (...args: unknown[]) => unknown },
  'attachNativeEvent',
);
const detach = jest.fn();
beforeEach(() => {
  mockSolid = false;
  detach.mockClear();
  attach.mockReset().mockReturnValue({ detach });
});
const scrollEvent = (y: number, view: unknown = { tag: 7 }) =>
  ({ currentTarget: view, nativeEvent: { contentOffset: { y } } }) as never;

test('clear bars are on, as one setting', () => {
  expect(clearBars).toBe(true);
});

test('the fade is clear at rest, comes up as content goes under the bar, and ends below its foot', () => {
  const y = new Animated.Value(-100);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<BarFade y={y} bottom={100} />);
  });
  try {
    const view = layer(renderer);
    expect(view.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(view.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    });
    // At rest the page's top is at the bar's foot: nothing shows.
    expect(shown(renderer)).toEqual({ opacity: 0, foot: 100 + BAR_FADE_TAIL });
    // Pulled down (rubber band): still nothing.
    act(() => y.setValue(-140));
    expect(shown(renderer).opacity).toBe(0);
    // Half the ramp under the bar, then all of it and beyond.
    act(() => y.setValue(-100 + BAR_FADE_RAMP / 2));
    expect(shown(renderer).opacity).toBeCloseTo(0.5);
    act(() => y.setValue(-100 + BAR_FADE_RAMP));
    expect(shown(renderer).opacity).toBe(1);
    act(() => y.setValue(900));
    expect(shown(renderer).opacity).toBe(1);
    // Opaque down to just above the foot, clear at the end: the page's
    // ground, held for all but the last 28 pt of the layer.
    const fade = view.find(
      (node) => node.props.side === 'top' && 'hold' in node.props,
    );
    expect(fade.props.ground).toBe('paper');
    expect(fade.props.hold).toBeGreaterThan(0.9);
    expect(fade.props.hold).toBeLessThan(1);
  } finally {
    act(() => renderer.unmount());
  }
});

test("the fade's foot follows the bar's own height through a large-title collapse", () => {
  // UIKit reports the bar's height frame by frame (the stack's animated
  // header height). While the title collapses the page moves with the bar,
  // so nothing is under it; the debounced height (148 here) is not used.
  const y = new Animated.Value(-148);
  const header = new Animated.Value(148);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnimatedHeaderHeightContext.Provider value={header as never}>
        <BarFade y={y} bottom={148} />
      </AnimatedHeaderHeightContext.Provider>,
    );
  });
  try {
    expect(shown(renderer)).toEqual({ opacity: 0, foot: 148 + BAR_FADE_TAIL });
    // Half collapsed: 26 pt scrolled, the bar 26 pt shorter.
    act(() => {
      y.setValue(-122);
      header.setValue(122);
    });
    expect(shown(renderer)).toEqual({ opacity: 0, foot: 122 + BAR_FADE_TAIL });
    // Collapsed to the inline bar, then rows go under it.
    act(() => {
      y.setValue(-96 + BAR_FADE_RAMP);
      header.setValue(96);
    });
    expect(shown(renderer)).toEqual({ opacity: 1, foot: 96 + BAR_FADE_TAIL });
  } finally {
    act(() => renderer.unmount());
  }
});

test('a pinned band at the foot takes no tail', () => {
  const y = new Animated.Value(0);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<BarFade y={y} bottom={100} tail={0} />);
  });
  expect(shown(renderer).foot).toBe(100);
  act(() => renderer.unmount());
});

test('a solid bar (Reduce Transparency, Increase Contrast) has no fade', () => {
  mockSolid = true;
  const y = new Animated.Value(0);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ClearBarFade y={y} bottom={100} />);
  });
  expect(renderer.toJSON()).toBeNull();
  act(() => renderer.unmount());
});

test('scroll events are bound to the fade on the native side, once, and scrolling renders nothing', () => {
  let renders = 0;
  let api!: ReturnType<typeof useBarFadeScroll>;
  function Owner({ enabled }: { enabled: boolean }) {
    renders++;
    api = useBarFadeScroll(enabled);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Owner enabled />);
  });
  const view = { tag: 7 };
  expect(attach).not.toHaveBeenCalled();
  act(() => api.onScroll(scrollEvent(-98, view)));
  expect(attach).toHaveBeenCalledTimes(1);
  expect(attach).toHaveBeenCalledWith(view, 'onScroll', [
    { nativeEvent: { contentOffset: { y: api.y } } },
  ]);
  // The first event seeds the value; later ones go to the native driver.
  expect((api.y as unknown as { __getValue(): number }).__getValue()).toBe(-98);
  renders = 0;
  for (let offset = -90; offset < 600; offset += 7)
    act(() => api.onScroll(scrollEvent(offset, view)));
  expect(attach).toHaveBeenCalledTimes(1);
  expect(renders).toBe(0);
  // Switched off (a legibility setting, a split pane): unbound and unseen
  // until the page next reports where it is.
  act(() => renderer.update(<Owner enabled={false} />));
  expect(detach).toHaveBeenCalledTimes(1);
  expect(
    (api.y as unknown as { __getValue(): number }).__getValue(),
  ).toBeLessThan(-10000);
  act(() => api.onScroll(scrollEvent(300, view)));
  expect(attach).toHaveBeenCalledTimes(1);
  act(() => renderer.update(<Owner enabled />));
  act(() => api.onScroll(scrollEvent(300, view)));
  expect(attach).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());
  expect(detach).toHaveBeenCalledTimes(2);
});

test('an open Ask thread: the fade ends at the bar on screen, not at the hidden large-title band', () => {
  // UIKit keeps the large-title band in the bar's height (172) while the
  // thread shows the inline bar (106), and Ask rests at -106. Measured
  // against 172 the fade was whole at rest and covered the question.
  const y = new Animated.Value(-106);
  const header = new Animated.Value(172);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnimatedHeaderHeightContext.Provider value={header as never}>
        <BarFade y={y} bottom={106} hidden={66} />
      </AnimatedHeaderHeightContext.Provider>,
    );
  });
  try {
    expect(shown(renderer)).toEqual({ opacity: 0, foot: 106 + BAR_FADE_TAIL });
    act(() => y.setValue(-106 + BAR_FADE_RAMP));
    expect(shown(renderer).opacity).toBe(1);
  } finally {
    act(() => renderer.unmount());
  }
});

test("the stack's own provider is the context the fade reads", () => {
  // A deep import with no exports map behind it: if a router bump moved the
  // context, the fade would fall back to the debounced height in silence.
  const stack = jest.requireActual(
    'expo-router/build/react-navigation/native-stack',
  ) as { useAnimatedHeaderHeight(): unknown };
  const header = new Animated.Value(96);
  let read: unknown;
  function Reader() {
    read = stack.useAnimatedHeaderHeight();
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnimatedHeaderHeightContext.Provider value={header as never}>
        <Reader />
      </AnimatedHeaderHeightContext.Provider>,
    );
  });
  expect(read).toBe(header);
  act(() => renderer.unmount());
});

describe("the fade is the page's ground token, in either scheme", () => {
  const stopColours = async (
    scheme: 'light' | 'dark',
    ground: 'paper' | 'sunken',
  ) => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(false);
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BarFade y={new Animated.Value(0)} bottom={100} ground={ground} />,
      );
    });
    const colours = new Set(
      layer(renderer)
        .findAll((node) => 'stopColor' in node.props)
        .map((node) => node.props.stopColor as string),
    );
    act(() => renderer.unmount());
    platform.restore();
    return [...colours];
  };
  afterEach(() => jest.restoreAllMocks());
  test.each(['paper', 'sunken'] as const)('%s', async (ground) => {
    const light = await stopColours('light', ground);
    const dark = await stopColours('dark', ground);
    expect(light).toEqual([paletteFor('light')[ground]]);
    expect(dark).toEqual([paletteFor('dark')[ground]]);
    // A hard-coded light value would give the same colour twice.
    expect(dark).not.toEqual(light);
  });
});
