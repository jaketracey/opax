/* global jest */
// Component tests verify labels and workflow; journey 24 probes native pixels.
jest.mock('@shopify/react-native-skia', () => ({
  ColorType: { RGBA_8888: 4 },
  AlphaType: { Unpremul: 3 },
  Canvas: require('react-native').View,
  Path: () => null,
  useCanvasRef: require('react').useRef,
}));
