import { act } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  SafeAreaInsetsContext,
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  SidebarSafe,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';

// Build 82, the closed iPhone Duo: a tab is laid out before it is shown, and
// the native safe-area view has no insets until its screen is. Bills drew
// its first frames 84 pt too wide, "Before parliament" cut at the rail.

let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => mockBarEdge,
}));

function sides(tabRoot: boolean) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaInsetsContext.Provider
        value={{ top: 0, bottom: 0, left: 0, right: 84 }}
      >
        <SidebarSafe tabRoot={tabRoot}>
          <View />
        </SidebarSafe>
      </SafeAreaInsetsContext.Provider>,
    );
  });
  const safe = renderer.root.findByType(SafeAreaView);
  const style = StyleSheet.flatten(safe.props.style);
  const read = {
    native: [...safe.props.edges],
    left: style.paddingLeft ?? 0,
    right: style.paddingRight ?? 0,
  };
  act(() => renderer.unmount());
  return read;
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  act(() => {
    resetAdaptiveDeviceForTests();
    setWindowTraitsOverride({
      horizontal: 'compact',
      vertical: 'regular',
      foldable: true,
    });
  });
});
afterEach(() => {
  mockBarEdge = 'unspecified';
  act(() => {
    setWindowTraitsOverride(undefined);
    resetAdaptiveDeviceForTests();
  });
});

test('beside the rail a tab root is inset from its first layout, by the window insets alone', () => {
  mockBarEdge = 'trailing';
  // Padded before the native view could know: not padded twice once it does.
  expect(sides(true)).toEqual({ native: [], left: 0, right: 84 });
});

test('a pushed page or a sheet beside the rail keeps its own screen insets', () => {
  mockBarEdge = 'trailing';
  expect(sides(false)).toEqual({
    native: ['left', 'right'],
    left: 0,
    right: 0,
  });
});

test('with no vertical bar (the open Duo) a tab root keeps the native insets', () => {
  expect(sides(true)).toEqual({ native: ['left', 'right'], left: 0, right: 0 });
});
