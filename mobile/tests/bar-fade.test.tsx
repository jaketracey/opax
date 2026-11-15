import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { BAR_FADE_TAIL, BarFade } from '../src/design/bar-fade';
import { clearBars } from '../src/navigation/chrome';
import { colors } from '../src/design/tokens';

// A page under a clear bar fades into its own ground behind the bar: no
// blur panel, no fill of another colour and no hairline (Ask and Today on
// the Duo, b76), and the title no longer prints over the page (Bills, iOS 27).
const band = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.find(
    (node) => node.props.testID === 'bar-fade' && typeof node.type === 'string',
  );

test('clear bars are on, as one setting', () => {
  expect(clearBars).toBe(true);
});

test('the fade is the page ground, opaque behind the title and clear below the bar', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(false);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BarFade bottom={100} ground="sunken" />);
  });
  try {
    const view = band(renderer);
    expect(StyleSheet.flatten(view.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 100 + BAR_FADE_TAIL,
    });
    // Never a target, never read out.
    expect(view.props.pointerEvents).toBe('none');
    expect(view.props.accessibilityElementsHidden).toBe(true);
    const stops = view
      .findAll((node) => 'stopOpacity' in node.props && 'offset' in node.props)
      .filter((node) => typeof node.type !== 'string' || true)
      .map((node) => [Number(node.props.offset), node.props.stopOpacity]);
    const unique = [...new Map(stops.map((s) => [s[0], s[1]])).entries()];
    // Opaque from the top to just above the bar's foot, clear at the end.
    expect(unique[0]).toEqual([0, 1]);
    expect(unique.at(-1)).toEqual([1, 0]);
    const hold = unique[1]!;
    expect(hold[1]).toBe(1);
    expect(hold[0] * (100 + BAR_FADE_TAIL)).toBeGreaterThan(80);
    expect(hold[0] * (100 + BAR_FADE_TAIL)).toBeLessThan(100);
    // No fill of its own: the gradient alone.
    expect(
      StyleSheet.flatten(view.props.style).backgroundColor,
    ).toBeUndefined();
  } finally {
    act(() => renderer.unmount());
    platform.restore();
    jest.restoreAllMocks();
  }
});

test('Reduce Transparency gets a solid band in the page ground', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(true);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BarFade bottom={100} ground="sunken" />);
  });
  try {
    expect(StyleSheet.flatten(band(renderer).props.style)).toMatchObject({
      backgroundColor: colors.sunken,
    });
  } finally {
    act(() => renderer.unmount());
    platform.restore();
    jest.restoreAllMocks();
  }
});

test('no bar to fade under draws nothing', () => {
  const renderer = TestRenderer.create(<BarFade bottom={0} />);
  expect(renderer.toJSON()).toBeNull();
  act(() => renderer.unmount());
});
