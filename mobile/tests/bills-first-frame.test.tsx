import { act } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { SegmentedPicker } from '../src/design/controls';
import { ScopeControl } from '../src/features/bills/BillsList';
import * as measure from '../src/features/money/map/measure';

// Build 82, the closed iPhone Duo: Bills opened on the segmented scope
// control and swapped it for the "Showing" row a frame later. The first
// frame is now the control the list settles on.

jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => 'trailing',
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn(), setOptions: jest.fn() }),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { bills: jest.fn(), billIndexRow: () => null },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 466, height: 678, scale: 3, fontScale: 1 });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("the Bills list's scope control", () => {
  /** The control's own width, then each label's, as read before paint. */
  function frames(width: number) {
    const read = [width, 113, 46, 16];
    let call = 0;
    jest
      .spyOn(measure, 'frameOf')
      .mockImplementation(() => ({ width: read[call++ % 4]!, height: 18 }));
  }
  function open(right: number) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SafeAreaInsetsContext.Provider
          value={{ top: 0, bottom: 0, left: 0, right }}
        >
          <ScopeControl value="before" onChange={() => undefined} />
        </SafeAreaInsetsContext.Provider>,
      );
    });
    // No layout event has been sent: this is the first frame drawn.
    const segments = renderer.root.findAllByType(SegmentedPicker).length;
    act(() => renderer.unmount());
    return segments ? 'segments' : 'row';
  }

  test('laid out before its tab has the rail inset, it opens on the row it settles on', () => {
    // 426 pt before the 84 pt rail inset arrives, 342 pt after: a third of
    // 342 does not hold "Before parliament" (113 + 24).
    frames(426);
    expect(open(84)).toBe('row');
  });

  test('a width the window has room for is used as it is', () => {
    frames(426);
    expect(open(0)).toBe('segments');
    frames(342);
    expect(open(84)).toBe('row');
  });
});
