/* global jest */
// Component tests verify labels and workflow; journey 24 probes native pixels.
jest.mock('@shopify/react-native-skia', () => ({
  ColorType: { RGBA_8888: 4 },
  AlphaType: { Unpremul: 3 },
  Canvas: require('react-native').View,
  Path: () => null,
  Circle: () => null,
  Group: () => null,
  RadialGradient: () => null,
  usePathValue: () => ({ value: null }),
  vec: (x, y) => ({ x, y }),
  useCanvasRef: require('react').useRef,
}));

// Talk's call animation: worklets and frame callbacks never run under Jest.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useFrameCallback: () => ({
    setActive: () => {},
    isActive: false,
    callbackId: -1,
  }),
}));
