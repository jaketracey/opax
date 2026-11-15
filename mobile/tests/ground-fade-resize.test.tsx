import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { BarFade } from '../src/design/bar-fade';
import { GroundFade } from '../src/design/ground-fade';

/**
 * Jake, 1.1.5 (84), Duo unfolded: Today's leading column ran under a solid
 * page-colour band that cut into the trailing column's first card, with no
 * fade over the rest. Today is one scroll view with one fade; the fade's
 * rectangle was sized in per cent, which react-native-svg 15.15.4 works out
 * once and keeps when the view is resized, so it stayed the folded display's
 * 382 pt wide. Nothing in the drawing may depend on a length in per cent.
 */
const percent = (value: unknown) =>
  typeof value === 'string' && value.includes('%');

async function fade(element: React.ReactElement) {
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(false);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  return tree;
}
const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'ios';
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

it.each(['top', 'left', 'right'] as const)(
  'a %s fade is drawn on a unit canvas stretched over its view, so a resized view is covered whole',
  async (side) => {
    const tree = await fade(<GroundFade side={side} />);
    const svg = tree.root.findByType(Svg);
    // The canvas follows the view; what is drawn in it has fixed units.
    expect(svg.props.viewBox).toBe('0 0 1 1');
    expect(svg.props.preserveAspectRatio).toBe('none');
    const rect = tree.root.findByType(Rect);
    expect([rect.props.width, rect.props.height]).toEqual([1, 1]);
    for (const value of Object.values(rect.props))
      expect(percent(value)).toBe(false);
    act(() => tree.unmount());
  },
);

it("the bar's fade spans the page and holds no length in per cent", async () => {
  const tree = await fade(<BarFade y={new Animated.Value(0)} bottom={54} />);
  const layer = tree.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === 'bar-fade',
  );
  expect(layer.props.style).toMatchObject({ left: 0, right: 0 });
  const rect = tree.root.findByType(Rect);
  expect(percent(rect.props.width)).toBe(false);
  expect(percent(rect.props.height)).toBe(false);
  act(() => tree.unmount());
});
