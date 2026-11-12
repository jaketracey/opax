import { act } from 'react';
import { AccessibilityInfo } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  useBoldText,
  useIncreaseContrast,
  useReduceMotion,
  useReduceTransparency,
} from '../src/design/accessibility';

afterEach(() => jest.restoreAllMocks());

test.each([
  ['Bold Text', 'isBoldTextEnabled', 'boldTextChanged', useBoldText],
  [
    'Increase Contrast',
    'isDarkerSystemColorsEnabled',
    'darkerSystemColorsChanged',
    useIncreaseContrast,
  ],
  [
    'Reduce Transparency',
    'isReduceTransparencyEnabled',
    'reduceTransparencyChanged',
    useReduceTransparency,
  ],
  [
    'Reduce Motion',
    'isReduceMotionEnabled',
    'reduceMotionChanged',
    useReduceMotion,
    useReduceTransparency,
  ],
] as const)(
  '%s keeps a newer setting change when the initial native read arrives late',
  (_label, method, event, useSetting) => {
    let complete!: (value: boolean) => void;
    jest.spyOn(AccessibilityInfo, method).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    let change!: (value: boolean) => void;
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((name, listener) => {
        if (name === event) change = listener as (value: boolean) => void;
        return { remove: jest.fn() };
      });
    let value: boolean | undefined;
    function Probe() {
      value = useSetting();
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Probe />);
    });
    expect(value).toBe(false);
    act(() => change(true));
    expect(value).toBe(true);
    return act(async () => {
      complete(false);
      await Promise.resolve();
    }).then(() => {
      expect(value).toBe(true);
      act(() => tree.unmount());
    });
  },
);
