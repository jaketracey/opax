/* global jest, beforeEach */
// Component tests verify labels and workflow; journey 24 probes native pixels.
jest.mock('@shopify/react-native-skia', () => {
  // The money map records its layers into pictures: a recorder whose canvas
  // counts the draw calls, so tests can check what a layer holds.
  const paint = () => ({
    setAntiAlias() {},
    setStyle() {},
    setStrokeCap() {},
    setStrokeWidth() {},
    setColor() {},
    setAlphaf() {},
  });
  const canvas = () => ({
    calls: 0,
    drawCircle() {
      this.calls++;
    },
    drawLine() {
      this.calls++;
    },
    drawPath() {
      this.calls++;
    },
  });
  return {
    ColorType: { RGBA_8888: 4 },
    AlphaType: { Unpremul: 3 },
    PaintStyle: { Fill: 0, Stroke: 1 },
    StrokeCap: { Butt: 0, Round: 1, Square: 2 },
    Canvas: require('react-native').View,
    Path: () => null,
    Points: () => null,
    Circle: () => null,
    Rect: () => null,
    Group: ({ children }) => children ?? null,
    Picture: () => null,
    RadialGradient: () => null,
    usePathValue: () => ({ value: null }),
    vec: (x, y) => ({ x, y }),
    useCanvasRef: require('react').useRef,
    Skia: {
      Path: {
        MakeFromSVGString: () => ({ contains: () => false }),
      },
      Paint: paint,
      Color: (hex) => hex,
      XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
      PictureRecorder: () => {
        const c = canvas();
        return {
          beginRecording: () => c,
          finishRecordingAsPicture: () => ({ calls: c.calls }),
        };
      },
    },
  };
});

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

// Connectivity is supplied explicitly by its regression tests. No native monitor in Jest.
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({})) }));

// Legacy explicit router mocks describe normal routes unless a test supplies
// the preview hook. Preview regressions supply their own true/false mock.
beforeEach(() => {
  const router = require('expo-router');
  if (router.useIsPreview === undefined) router.useIsPreview = () => false;
});
