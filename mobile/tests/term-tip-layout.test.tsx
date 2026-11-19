/**
 * The glossary popover's "More" sits on the text's own insets (build 76:
 * it was pushed into the corner, half the text's inset from the side and
 * foot, with a wide gap above), and still takes a 44 pt touch.
 */
import { act, render } from '@testing-library/react-native';
import * as Native from 'react-native';
import { Platform, Pressable, StyleSheet } from 'react-native';
import {
  border,
  colors,
  minimumTarget,
  rhythm,
  textStyles,
} from '../src/design/tokens';
import { learnCopy } from '../src/features/learn/copy';
import { termIds } from '../src/features/learn/glossary';
import TermTip, { MORE_SLOP, TIP_INSET } from '../src/features/learn/TermTip';

const mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => true,
    back: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/design/keyboard', () => ({ useKeyCommand: jest.fn() }));

const id = termIds[0]!;
const originalOS = Platform.OS;
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = originalOS;
  mockReplace.mockClear();
});
function tip() {
  Object.assign(mockParams, { id, x: '120', y: '200' });
  const r = render(<TermTip />);
  const flat = (testID: string, pressed = false) => {
    const node = r.UNSAFE_root.find(
      (n) => typeof n.type === 'string' && n.props.testID === testID,
    );
    const style = node.props.style;
    return StyleSheet.flatten(
      typeof style === 'function' ? style({ pressed }) : style,
    );
  };
  const more = r.UNSAFE_root.find(
    (n) =>
      n.type === (Pressable as unknown as { type: unknown }).type &&
      n.props.testID === `term-tip-${id}-more`,
  );
  return { r, flat, more };
}

test.each(['ios', 'android'] as const)(
  '%s: the popover has one inset at the side and the foot, from the tokens',
  (os) => {
    Platform.OS = os;
    const { flat } = tip();
    const bubble = flat(`term-tip-${id}`);
    expect(TIP_INSET).toBe(rhythm.block);
    expect(bubble.paddingHorizontal).toBe(TIP_INSET);
    // The foot matches the side: the action is not crammed into the corner.
    expect(bubble.paddingBottom).toBe(TIP_INSET);
    expect(bubble.paddingTop).toBe(rhythm.row);
  },
);

test('"More" ends on the text\'s trailing edge, a line below the body', () => {
  Platform.OS = 'ios';
  const { more } = tip();
  const style = StyleSheet.flatten(more.props.style({ pressed: false }));
  expect(style.alignSelf).toBe('flex-end');
  // Its padding (room for the pressed wash) is taken back by its margin,
  // so the label itself is on the content's edge: no bleed towards the card.
  expect(style.marginHorizontal).toBe(-style.paddingHorizontal);
  expect(style.marginRight).toBeUndefined();
  // Closer to the body than a new block: the popover's gap plus a line.
  expect(style.marginTop).toBe(rhythm.line);
  expect(style.marginTop + rhythm.line).toBeLessThan(rhythm.block);
  // The visual box is the label's line, not a 44 pt button.
  expect(style.minHeight).toBeUndefined();
  expect(style.height).toBeUndefined();
  expect(more.findByProps({ children: learnCopy.more })).toBeTruthy();
});

test('the touch still reaches 44 pt, and never past the popover', () => {
  Platform.OS = 'ios';
  const { more } = tip();
  expect(more.props.hitSlop).toEqual(MORE_SLOP);
  // 44 pt tall at the default size and at iOS's smallest text size, where
  // the label's line is about 0.8 of the default.
  const line = textStyles.strong.lineHeight;
  for (const scale of [1, 0.8])
    expect(
      line * scale + MORE_SLOP.top + MORE_SLOP.bottom,
    ).toBeGreaterThanOrEqual(minimumTarget);
  // The same reach on both sides, never past the popover's edge: in a
  // right-to-left layout "More" is on the other side, and a touch on the
  // backdrop must close the popover, not open the sheet.
  const style = StyleSheet.flatten(more.props.style({ pressed: false }));
  expect(MORE_SLOP.left).toBe(MORE_SLOP.right);
  for (const side of [MORE_SLOP.left, MORE_SLOP.right])
    expect(side + style.paddingHorizontal).toBeLessThanOrEqual(TIP_INSET);
  expect(MORE_SLOP.bottom).toBeLessThanOrEqual(TIP_INSET);
  more.props.onPress();
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/term',
    params: { id },
  });
  expect(more.props.accessibilityLabel).toMatch(
    new RegExp(`^${learnCopy.more} about `),
  );
});

test('a keyboard\'s focus shows the app\'s ring on "More", and leaves with it', () => {
  Platform.OS = 'ios';
  const { r, more } = tip();
  const outline = () => {
    const node = r.UNSAFE_root.find(
      (n) =>
        n.type === (Pressable as unknown as { type: unknown }).type &&
        n.props.testID === `term-tip-${id}-more`,
    );
    const style = node.props.style;
    return StyleSheet.flatten(
      typeof style === 'function' ? style({ pressed: false }) : style,
    );
  };
  expect(outline().outlineWidth).toBeUndefined();
  act(() => more.props.onFocus({ nativeEvent: {} }));
  expect(outline()).toMatchObject({
    outlineColor: colors.navy,
    outlineWidth: border.focus,
    outlineStyle: 'solid',
  });
  act(() => more.props.onBlur({ nativeEvent: {} }));
  expect(outline().outlineWidth).toBeUndefined();
});

test('light floats the popover on a shadow; dark drops it for a firmer hairline', () => {
  Platform.OS = 'ios';
  jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  const light = tip().flat(`term-tip-${id}`);
  expect(light.shadowOpacity).toBe(0.16);
  expect(light.shadowColor).toBe(colors.ink);
  expect(light.borderColor).toBe(colors.dividerSubtle);
  jest.spyOn(Native, 'useColorScheme').mockReturnValue('dark');
  const dark = tip().flat(`term-tip-${id}`);
  // Ink is pale in dark: a shadow drawn in it would glow round the popover.
  expect(dark.shadowColor).toBeUndefined();
  expect(dark.shadowOpacity).toBeUndefined();
  expect(dark.elevation).toBeUndefined();
  expect(dark.borderColor).toBe(colors.dividerDefault);
  expect(dark.backgroundColor).toBe(colors.raised);
});
