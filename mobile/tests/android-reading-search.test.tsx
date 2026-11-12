import { act, type ReactElement } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import { Field } from '../src/design/primitives';
import { SearchField } from '../src/features/search/SearchField';
import { RouteOptions } from '../src/navigation/preview';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { ResultsScreen } from '../src/features/search/ResultsScreen';
import { ResultsView } from '../src/features/search/ResultsView';
import { ScopeBar } from '../src/features/search/ScopeBar';
import { ScopeChips } from '../src/features/search/ScopeChips';
import { useAndroidSearchKeyboard } from '../src/features/search/useAndroidSearchKeyboard';

let mockParams: Record<string, string> = {};
jest.mock('../src/api/runtime', () => ({
  catalogs: {},
  recordSearch: {},
  client: {},
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), setParams: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useSegments: () => [],
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: false } }),
}));
jest.mock('../src/features/ask/open', () => ({
  ...jest.requireActual('../src/features/ask/open'),
  useOpenAsk: () => jest.fn(),
  useAskNow: () => jest.fn(),
}));
jest.mock('../src/features/search/sources', () => ({
  useSearchSources: () => ({
    sources: null,
    roster: null,
    failed: false,
    refreshing: false,
    retry: jest.fn(),
  }),
}));
jest.mock('../src/features/search/controls', () => ({
  useResultsControls: () => ({
    items: () => [],
    setFilters: jest.fn(),
    filters: {},
    sort: 'relevance',
    recover: {},
    openFilters: jest.fn(),
  }),
}));
jest.mock('../src/features/search/ResultsView', () => ({
  ResultsView: () => null,
}));
jest.mock('../src/features/search/SearchIdle', () => ({
  SearchIdle: () => null,
}));
jest.mock('../src/features/search/SearchSuggestions', () => ({
  SearchSuggestions: () => null,
}));
jest.mock('../src/features/search/tab-reset', () => ({
  useSearchTabReset: () => {},
}));

const originalPlatform = Platform.OS;
beforeEach(() => {
  mockParams = {};
});
afterEach(() => {
  Platform.OS = originalPlatform;
  jest.restoreAllMocks();
});
async function mount(element: ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(element);
  });
  return view;
}

test.each([SearchScreen, ResultsScreen])(
  '%p pins the iOS native search field and adds no Android field',
  async (Screen) => {
    Platform.OS = 'ios';
    mockParams = { kind: 'all', q: 'housing' };
    const view = await mount(<Screen />);
    expect(view.root.findAllByType(Field)).toHaveLength(0);
    expect(view.root.findAllByType(SearchField)).toHaveLength(0);
    const options = view.root.findByType(RouteOptions).props.options;
    expect(options.headerSearchBarOptions).toMatchObject({
      placeholder: 'People, bills, topics and more',
      autoCapitalize: 'none',
    });
    expect(view.root.findAllByType(ScopeChips)).toHaveLength(0);
    await act(async () => view.unmount());
  },
);

test.each([SearchScreen, ResultsScreen])(
  '%p submits from Android Search once and dismisses the IME',
  async (Screen) => {
    Platform.OS = 'android';
    mockParams = { kind: 'all' };
    const dismiss = jest
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => {});
    const view = await mount(<Screen />);
    expect(
      view.root.findByType(RouteOptions).props.options.headerSearchBarOptions,
    ).toBeUndefined();
    const field = () => view.root.findByType(SearchField);
    expect(view.root.findByType(TextInput).props.returnKeyType).toBe('search');
    await act(async () => field().props.onChangeText('housing'));
    await act(async () => field().props.onSubmitEditing());
    expect(view.root.findByType(ResultsView).props.q).toBe('housing');
    expect(dismiss).toHaveBeenCalledTimes(1);
    // Returning to this retained screen does not submit or reset it again.
    await act(async () => view.update(<Screen />));
    expect(view.root.findByType(ResultsView).props.q).toBe('housing');
    expect(dismiss).toHaveBeenCalledTimes(1);
    await act(async () => view.unmount());
  },
);

test('Android scopes use full labels and selected tab states; iOS keeps its native picker', async () => {
  Platform.OS = 'android';
  const onChange = jest.fn();
  const view = await mount(<ScopeBar value="all" onChange={onChange} />);
  const chips = view.root.findByType(ScopeChips);
  expect(chips.props.options.map((o: { label: string }) => o.label)).toEqual([
    'All',
    'People',
    'Bills',
    'Speeches',
  ]);
  const tabs = view.root.findAll(
    (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'tab',
  );
  expect(tabs.map((n) => n.props.accessibilityState.selected)).toEqual([
    true,
    false,
    false,
    false,
  ]);
  await act(async () =>
    view.root
      .find(
        (n) =>
          n.props.testID === 'search-scope-speeches' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  expect(onChange).toHaveBeenCalledWith('speeches');
  expect(
    view.root.findAllByType(ScrollView).some((n) => n.props.horizontal),
  ).toBe(true);
  Platform.OS = 'ios';
  await act(async () =>
    view.update(<ScopeBar value="all" onChange={onChange} />),
  );
  expect(view.root.findAllByType(ScopeChips)).toHaveLength(0);
  expect(
    view.root.findAllByProps({ testID: 'search-scope' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test('Android IME Back releases focus without submitting; iOS installs no Android keyboard listener', async () => {
  const handlers = new Map<string, () => void>();
  const remove = jest.fn();
  const listen = jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((name, handler) => {
      handlers.set(name, handler as () => void);
      return { remove };
    });
  const blur = jest.fn();
  const onDismiss = jest.fn();
  const navigation = {
    isFocused: () => true,
    addListener: jest.fn((_event: string, _listener: () => void) => () => {}),
  };
  const ref = {
    current: { isFocused: () => true, blur } as unknown as TextInput,
  };
  function Focus() {
    useAndroidSearchKeyboard(ref, onDismiss);
    return null;
  }
  Platform.OS = 'android';
  const element = (
    <NavigationContext.Provider value={navigation as never}>
      <Focus />
    </NavigationContext.Provider>
  );
  const view = await mount(element);
  expect(navigation.addListener.mock.calls.map((call) => call[0])).toEqual([
    'focus',
    'blur',
  ]);
  act(() => handlers.get('keyboardDidHide')!());
  expect(blur).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
  expect(remove).toHaveBeenCalledTimes(1);
  listen.mockClear();
  navigation.addListener.mockClear();
  Platform.OS = 'ios';
  const ios = await mount(element);
  expect(listen).not.toHaveBeenCalled();
  expect(navigation.addListener).not.toHaveBeenCalled();
  await act(async () => ios.unmount());
});
