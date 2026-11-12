/* eslint-disable @typescript-eslint/no-require-imports -- inert native gesture hosts in Jest. */
import { act, useRef } from 'react';
import { Modal, Platform, ScrollView, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as Reanimated from 'react-native-reanimated';
import { router } from 'expo-router';
import mockPictures from '../../portal/public/years/pictures.json';
import { colors } from '../src/design/tokens';
import { showMenu } from '../src/design/menu';
import { AndroidPhoto } from '../src/features/explore/AndroidPhoto';
import AndroidViewer from '../src/features/explore/PhotoViewer.android';
import { openPhotoSource } from '../src/features/explore/YearGallery';
import {
  photoFit,
  photoFocalOffset,
  photoOffset,
  photoScale,
} from '../src/features/explore/photo-zoom';

// Explicit base source: the Android platform file must never replace this pin.
const IOSViewer = jest.requireActual<
  typeof import('../src/features/explore/PhotoViewer')
>('../src/features/explore/PhotoViewer.tsx').default;
const originalPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS')!;

let mockOptions: Record<string, any>;
let mockFocus: () => void | (() => void);
let mockReduced = false;
const mockGestures: {
  kind: string;
  callbacks: Record<string, (...args: any[]) => void>;
}[] = [];
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ year: '2025' }),
  useFocusEffect: (focus: typeof mockFocus) => {
    mockFocus = focus;
  },
}));
jest.mock('../src/navigation/preview', () => ({
  RouteOptions: ({ options }: { options: Record<string, unknown> }) => {
    mockOptions = options;
    return null;
  },
}));
jest.mock('expo-glass-effect', () => ({
  GlassView: () => null,
  isLiquidGlassAvailable: () => true,
}));
jest.mock('../src/api/useRead', () => ({
  useRead: () => ({ record: { data: mockPictures } }),
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn() },
}));
jest.mock('../src/design/keyboard', () => ({ useKeyCommand: () => {} }));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
jest.mock('../src/navigation/external', () => ({ openSource: jest.fn() }));
jest.mock('../src/features/explore/Picture', () => ({
  PHOTO_BLACK: '#000000',
  Picture: () => null,
}));
jest.mock('../src/features/explore/YearGallery', () => ({
  pictureKey: (photo: { file: string }) =>
    photo.file.split('/').at(-1)!.replace('.webp', ''),
  photoIndex: () => 0,
  openPhotoSource: jest.fn(),
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => mockReduced,
  useIncreaseContrast: () => false,
  useAccessibilitySize: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const make = (kind: string) => {
    const callbacks: Record<string, (...args: any[]) => void> = {};
    const gesture: Record<string, any> = {};
    for (const name of [
      'onStart',
      'onBegin',
      'onTouchesDown',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ])
      gesture[name] = (callback: (...args: any[]) => void) => {
        callbacks[name] = callback;
        return gesture;
      };
    for (const name of ['minDistance', 'numberOfTaps'])
      gesture[name] = () => gesture;
    mockGestures.push({ kind, callbacks });
    return gesture;
  };
  return {
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: {
      Pinch: () => make('pinch'),
      Pan: () => make('pan'),
      Tap: () => make('tap'),
      Race: () => ({}),
      Simultaneous: () => ({}),
      Exclusive: () => ({}),
    },
  };
});

const host = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === id);
async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const nativeShared = Reanimated.useSharedValue;
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  jest.clearAllMocks();
  jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(function useStableShared<T>(value: T) {
      return useRef(nativeShared(value)).current;
    });
  mockReduced = false;
  mockGestures.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', originalPlatform);
});

test('Android covers the tabs in a native modal, has one white Done, and system Back closes the route', async () => {
  const r = await render(<AndroidViewer />);
  const modal = r.root.findByType(Modal);
  expect(modal.props).toMatchObject({
    visible: true,
    statusBarTranslucent: true,
    navigationBarTranslucent: true,
  });
  expect(mockOptions).toEqual({ headerShown: false });
  const done = host(r, 'photo-viewer-done');
  expect(done.props.accessibilityRole).toBe('button');
  expect(
    r.root.findAll(
      (n) =>
        typeof n.type === 'string' && n.props.accessibilityLabel === 'Done',
    ),
  ).toHaveLength(1);
  expect(StyleSheet.flatten(done.props.style)).toMatchObject({
    minHeight: 48,
    minWidth: 64,
  });
  expect(
    StyleSheet.flatten(host(r, 'photo-viewer-caption').props.style),
  ).toMatchObject({ maxHeight: '40%', backgroundColor: colors.photoScrim });
  act(() => modal.props.onRequestClose());
  expect(router.back).toHaveBeenCalledTimes(1);
  act(() =>
    r.root
      .find(
        (n) =>
          n.props.testID === 'photo-viewer-done' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  expect(router.back).toHaveBeenCalledTimes(2);
  act(() =>
    r.root
      .find(
        (n) =>
          n.props.accessibilityLabel === 'More for this photograph' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  expect(showMenu).toHaveBeenCalledWith('Photograph', [
    expect.objectContaining({ title: 'Open original' }),
  ]);
  await act(async () => r.unmount());
});

test('the caption source can cover the viewer, and returning restores the same photograph', async () => {
  const r = await render(<AndroidViewer />);
  act(() =>
    host(r, 'photo-viewer').props.onLayout({
      nativeEvent: { layout: { width: 400, height: 800 } },
    }),
  );
  expect(r.root.findByType(AndroidPhoto).props.photo).toEqual(
    mockPictures['2025'][0],
  );
  act(() => r.root.findByType(AndroidPhoto).props.onPage(1));
  expect(r.root.findByType(AndroidPhoto).props.photo).toEqual(
    mockPictures['2025'][1],
  );
  const credit = r.root.find(
    (n) =>
      typeof n.props.onPress === 'function' &&
      String(n.props.testID).startsWith('photo-viewer-credit-'),
  );
  act(() => credit.props.onPress());
  expect(openPhotoSource).toHaveBeenCalledWith(
    mockPictures['2025'][1],
    'photo-viewer-source',
  );
  expect(r.root.findByType(Modal).props.visible).toBe(false);
  act(() => {
    mockFocus();
  });
  expect(r.root.findByType(Modal).props.visible).toBe(true);
  expect(r.root.findByType(AndroidPhoto).props.photo).toEqual(
    mockPictures['2025'][1],
  );
  await act(async () => r.unmount());
});

test('iOS keeps its original native zoom view, bar items, glass and dismissal path', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  expect(Platform.OS).toBe('ios');
  const r = await render(<IOSViewer />);
  expect(r.root.findAllByType(Modal)).toHaveLength(0);
  expect(r.root.findAllByType(AndroidPhoto)).toHaveLength(0);
  expect(
    r.root
      .findAllByType(ScrollView)
      .some(
        (n) =>
          n.props.minimumZoomScale === 1 &&
          n.props.maximumZoomScale === 3 &&
          n.props.bouncesZoom,
      ),
  ).toBe(true);
  expect(mockOptions).toMatchObject({
    headerShown: true,
    headerTransparent: true,
    headerBackVisible: false,
  });
  expect(mockOptions.headerLeft).toBeUndefined();
  const [done] = mockOptions.unstable_headerLeftItems();
  expect(done).toMatchObject({ label: 'Done', tintColor: colors.onBand });
  act(() => done.onPress());
  expect(router.back).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});

test('pinching and double-tapping zoom, a pinched pan never pages or dismisses, and accessibility can reset', async () => {
  const onPage = jest.fn(),
    onClose = jest.fn();
  const r = await render(
    <AndroidPhoto
      photo={mockPictures['2025'][0]!}
      width={400}
      height={800}
      reduced={false}
      onPage={onPage}
      onClose={onClose}
      onToggleChrome={jest.fn()}
    />,
  );
  const pinch = mockGestures.find((g) => g.kind === 'pinch')!.callbacks;
  const pan = mockGestures.find((g) => g.kind === 'pan')!.callbacks;
  act(() => {
    pan.onBegin!({});
    pinch.onStart!({ focalX: 200, focalY: 400 });
    pinch.onUpdate!({ focalX: 200, focalY: 400, scale: 2 });
    pinch.onFinalize!();
    pan.onEnd!({ translationX: -180, translationY: 0 });
  });
  expect(host(r, 'photo-viewer-image').props.accessibilityValue.text).toBe(
    'Zoom 200%',
  );
  expect(onPage).not.toHaveBeenCalled();
  act(() =>
    host(r, 'photo-viewer-image').props.onAccessibilityAction({
      nativeEvent: { actionName: 'zoomOut' },
    }),
  );
  expect(host(r, 'photo-viewer-image').props.accessibilityValue.text).toBe(
    'Zoom 100%',
  );
  act(() =>
    mockGestures.find((g) => g.kind === 'tap')!.callbacks.onEnd!(
      { x: 200, y: 400 },
      true,
    ),
  );
  expect(host(r, 'photo-viewer-image').props.accessibilityValue.text).toBe(
    'Zoom 300%',
  );
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});

test.each([false, true])(
  'page swipes work and Reduce Motion (%s) governs swipe dismissal',
  async (reduced) => {
    const onPage = jest.fn(),
      onClose = jest.fn();
    const r = await render(
      <AndroidPhoto
        photo={mockPictures['2025'][0]!}
        width={400}
        height={800}
        reduced={reduced}
        onPage={onPage}
        onClose={onClose}
        onToggleChrome={jest.fn()}
      />,
    );
    const pan = mockGestures.find((g) => g.kind === 'pan')!.callbacks;
    act(() => {
      pan.onBegin!({});
      pan.onEnd!({ translationX: -90, translationY: 0 });
    });
    expect(onPage).toHaveBeenCalledWith(1);
    act(() => {
      pan.onBegin!({});
      pan.onEnd!({ translationX: 0, translationY: 120 });
    });
    expect(onClose).toHaveBeenCalledTimes(reduced ? 0 : 1);
    await act(async () => r.unmount());
  },
);

test('photo geometry contains both orientations, bounds panning and preserves the pinch focal point', () => {
  expect(photoFit(400, 800, 4 / 3)).toEqual({ width: 400, height: 300 });
  expect(photoFit(800, 400, 4 / 3)).toEqual({
    width: 400 * (4 / 3),
    height: 400,
  });
  expect(photoScale(10)).toBe(3);
  expect(photoScale(0.1)).toBe(1);
  expect(photoOffset(1000, 3, 400, 400)).toBe(400);
  expect(photoOffset(-1000, 3, 400, 400)).toBe(-400);
  expect(photoOffset(50, 2, 300, 800)).toBe(0);
  expect(photoFocalOffset(0, 100, 1, 3)).toBe(-200);
});
