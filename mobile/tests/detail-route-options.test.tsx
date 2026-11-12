import { measureBarTitle } from './bar-title-metrics';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Animated, Platform } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { RouteOptions } from '../src/navigation/preview';
import { headerItems } from '../src/navigation/chrome';
import { BarTitle } from '../src/navigation/useTitleOnScroll';
import { motion } from '../src/design/tokens';

let mockReduceMotion: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduceMotion,
}));
jest.mock('expo-router', () => ({ router: {}, useSegments: () => [] }));

const originalPlatform = Platform.OS;
afterEach(() => {
  Platform.OS = originalPlatform;
});

test.each(['ios', 'android'] as const)(
  'a data load on %s sends only title and retains every header-item option, including a seeded title',
  (os) => {
    Platform.OS = os;
    const setOptions = jest.fn();
    const navigation = { setOptions, getState: () => ({ routes: [] }) };
    const loadingAction = jest.fn();
    const loadedAction = jest.fn();
    const searchRef = { current: null };
    const render = (title: string, ready: boolean, onPress: () => void) => (
      <NavigationContext.Provider value={navigation as never}>
        <RouteOptions
          stableItems
          options={{
            title,
            headerBackTitle: 'Your MP',
            headerBackButtonDisplayMode: 'default',
            headerLeft: () => null,
            headerRight: () => null,
            headerSearchBarOptions: {
              ref: searchRef,
              placeholder: 'Records',
              onChangeText: onPress,
            },
            ...headerItems(() => [
              { type: 'button', label: 'Share', disabled: !ready, onPress },
            ]),
          }}
        />
      </NavigationContext.Provider>
    );
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(render('', false, loadingAction));
    });
    const initial = setOptions.mock.calls[0]![0];
    expect(initial).toMatchObject({
      headerBackTitle: 'Your MP',
      headerBackButtonDisplayMode: 'default',
    });
    const itemOptions = [
      'headerLeft',
      'headerRight',
      'unstable_headerRightItems',
    ];
    for (const key of itemOptions) expect(typeof initial[key]).toBe('function');
    setOptions.mockClear();
    act(() => view.update(render('Loaded subject', true, loadedAction)));
    expect(setOptions.mock.calls).toEqual([[{ title: 'Loaded subject' }]]);
    const items = initial.unstable_headerRightItems();
    expect(items[0].disabled).toBe(false);
    items[0].onPress();
    expect(loadedAction).toHaveBeenCalledTimes(1);
    expect(loadingAction).not.toHaveBeenCalled();
    expect(initial.headerSearchBarOptions.ref).toBe(searchRef);
    initial.headerSearchBarOptions.onChangeText();
    expect(loadedAction).toHaveBeenCalledTimes(2);
    let androidAction: (() => void) | undefined;
    if (os === 'android') {
      let right!: TestRenderer.ReactTestRenderer;
      act(() => {
        right = TestRenderer.create(initial.headerRight({}));
      });
      androidAction = right.root.findByProps({ testID: 'header-share' }).props
        .onPress;
      act(() => right.unmount());
    }
    const refreshedAction = jest.fn();
    setOptions.mockClear();
    act(() => view.update(render('Loaded subject', true, refreshedAction)));
    expect(setOptions).not.toHaveBeenCalled();
    expect(initial.unstable_headerRightItems()).toBe(items);
    items[0].onPress();
    expect(refreshedAction).toHaveBeenCalledTimes(1);
    androidAction?.();
    expect(refreshedAction).toHaveBeenCalledTimes(os === 'android' ? 2 : 1);
    // A known list title does not mask the transition from disabled to ready.
    act(() => view.update(render('Loaded subject', false, loadingAction)));
    expect(setOptions.mock.calls).toEqual([[{ title: 'Loaded subject' }]]);
    setOptions.mockClear();
    act(() => view.update(render('Loaded subject', true, loadedAction)));
    expect(setOptions.mock.calls).toEqual([[{ title: 'Loaded subject' }]]);
    act(() => view.unmount());
  },
);

test.each([false, true, null])(
  'a revealed loaded title uses the motion token only when Reduce Motion is false (%s)',
  (reduced) => {
    mockReduceMotion = reduced;
    const timing = jest.spyOn(Animated, 'timing');
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(
        <BarTitle title="Loaded title" shown={false} />,
      );
    });
    measureBarTitle(view);
    timing.mockClear();
    act(() => view.update(<BarTitle title="Loaded title" shown />));
    if (reduced === false)
      expect(timing).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          toValue: 1,
          duration: reduced === false ? motion.duration.crossfade : 0,
          useNativeDriver: true,
        }),
      );
    else expect(timing).not.toHaveBeenCalled();
    act(() => view.unmount());
    timing.mockRestore();
  },
);
