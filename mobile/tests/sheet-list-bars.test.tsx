import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useSafeSetOptions } from '../src/navigation/preview';
import { sharedScreens } from '../src/navigation/stack';
import { sheetOptions } from '../src/navigation/stack/screen';
import {
  sheetListOptions,
  sheetListRoutes,
} from '../src/navigation/sheet-lists';
import { headerItems, shortSheet } from '../src/navigation/chrome';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), canGoBack: () => true },
  useIsPreview: () => false,
}));

test.each([...sheetListRoutes])(
  '%s keeps Done when rooted in a sheet and after loaded actions arrive',
  (name) => {
    const route = { key: 'list', name, params: {} };
    const navigation = {
      getState: () => ({ index: 0, routes: [route] }),
      setOptions: jest.fn(),
    };
    const screen = sharedScreens('(today)', false).find(
      (screen) => screen.props.name === name,
    );
    if (screen) {
      const options = screen.props.options({ route, navigation });
      expect(
        options.unstable_headerRightItems({ canGoBack: false }),
      ).toContainEqual(expect.objectContaining({ label: 'Done' }));
      expect(options.headerTitleAlign).toBe('center');
    }
    let set!: ReturnType<typeof useSafeSetOptions>;
    function Probe() {
      set = useSafeSetOptions();
      return null;
    }
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <Probe />
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    act(() =>
      set({
        unstable_headerRightItems: () => [
          { type: 'button', label: 'More', onPress: jest.fn() },
        ],
      }),
    );
    const options = navigation.setOptions.mock.calls.at(-1)![0];
    expect(
      options
        .unstable_headerRightItems()
        .map((item: { label: string }) => item.label),
    ).toEqual(['More', 'Done']);
    // Empty lists explicitly clear data-dependent actions on loading/error.
    act(() => set(headerItems(undefined)));
    const cleared = navigation.setOptions.mock.calls.at(-1)![0];
    const done = cleared.unstable_headerRightItems({ canGoBack: false });
    expect(done.map((item: { label: string }) => item.label)).toEqual(['Done']);
    done[0].onPress();
    expect(router.back).toHaveBeenCalled();
    act(() => view.unmount());
  },
);

test('an unrelated options delta preserves actions and pushed lists can clear them', () => {
  expect(
    sheetListOptions({ title: 'Members' }, 'members', 0),
  ).not.toHaveProperty('unstable_headerRightItems');
  const clear = headerItems(undefined);
  expect(sheetListOptions(clear, 'members', 1)).toBe(clear);
});

test('sheet titles are centred in both shared sheet recipes', () => {
  expect(shortSheet.headerTitleAlign).toBe('center');
  expect(sheetOptions.headerTitleAlign).toBe('center');
});
