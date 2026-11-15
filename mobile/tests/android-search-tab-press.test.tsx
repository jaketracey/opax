// The Android tab bar's own press listener (navigation/AndroidTabs.tsx), not
// a stand-in: Search pressed from another tab keeps its stack and its
// field; a press while Search is in front clears the field (NativeStack
// pops the reselected tab itself).
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useSearchTabReset } from '../src/features/search/tab-reset';
import { AndroidTabs } from '../src/navigation/AndroidTabs';

type Listeners = (context: { navigation: { isFocused: () => boolean } }) => {
  tabPress: () => void;
};
const mockScreens = new Map<string, { listeners: Listeners }>();
jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: unknown }) => children;
  return {
    useSegments: () => ['(tabs)', '(bills)', 'index'],
    Tabs: Object.assign(Tabs, {
      Screen: (props: { name: string; listeners: Listeners }) => {
        mockScreens.set(props.name, props);
        return null;
      },
    }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function Root({ reset }: { reset: () => void }) {
  useSearchTabReset(reset);
  return null;
}
function mount(element: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(element);
  });
  return view;
}
const press = (name: string, focused: boolean) =>
  act(() =>
    mockScreens
      .get(name)!
      .listeners({ navigation: { isFocused: () => focused } })
      .tabPress(),
  );

test('the Android bar has the five tabs, each with a press listener', () => {
  const view = mount(<AndroidTabs />);
  expect([...mockScreens.keys()]).toEqual([
    '(today)',
    '(your-mp)',
    '(bills)',
    '(search)',
    '(ask)',
  ]);
  for (const screen of mockScreens.values())
    expect(typeof screen.listeners).toBe('function');
  act(() => view.unmount());
});

test('Search pressed from another tab keeps its field; a second press, on Search, clears it', () => {
  const view = mount(<AndroidTabs />);
  const reset = jest.fn();
  const root = mount(<Root reset={reset} />);
  // From Bills: Search is not in front when it is pressed.
  press('(search)', false);
  expect(reset).not.toHaveBeenCalled();
  // Now on Search: the same press clears the field.
  press('(search)', true);
  expect(reset).toHaveBeenCalledTimes(1);
  press('(search)', true);
  expect(reset).toHaveBeenCalledTimes(2);
  act(() => {
    root.unmount();
    view.unmount();
  });
});

test('no other tab clears the Search field, in front or not', () => {
  const view = mount(<AndroidTabs />);
  const reset = jest.fn();
  const root = mount(<Root reset={reset} />);
  for (const name of ['(today)', '(your-mp)', '(bills)', '(ask)'])
    for (const focused of [false, true]) press(name, focused);
  expect(reset).not.toHaveBeenCalled();
  act(() => {
    root.unmount();
    view.unmount();
  });
});
