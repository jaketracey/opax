import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import Search from '../src/features/Search';
import { dispatchKeyCommand } from '../src/design/keyboard';
import { defaultFilters } from '../src/features/search/contracts';
import { router } from 'expo-router';
import { Results } from '../src/features/search/Results';
import { ResultRow } from '../src/features/search/ResultRow';

const mockFocus = { active: true, listeners: new Set<() => void>() };
const mockNavigation = {
  isFocused: () => mockFocus.active,
  addListener: (_event: string, listener: () => void) => {
    mockFocus.listeners.add(listener);
    return () => mockFocus.listeners.delete(listener);
  },
};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(() => {
      let cleanup: void | (() => void);
      const changed = () => {
        if (typeof cleanup === 'function') cleanup();
        cleanup = mockFocus.active ? effect() : undefined;
      };
      changed();
      mockFocus.listeners.add(changed);
      return () => {
        mockFocus.listeners.delete(changed);
        if (typeof cleanup === 'function') cleanup();
      };
    }, [effect]);
  },
}));
jest.mock('../src/design/adaptive', () => ({
  ...jest.requireActual('../src/design/adaptive'),
  isPad: true,
  useLayout: () => ({
    size: 'regular',
    regular: true,
    wide: true,
    width: 1180,
    height: 800,
    window: { width: 1180, height: 800 },
    landscape: true,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { suggestionSourcesOnFocus: () => Promise.resolve(null) },
  recordSearch: { suggestions: () => Promise.resolve(null) },
}));
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: () => null,
  RecordShare: () => null,
}));
// Supply loaded fixtures while retaining the real Search split and Results
// keyboard handlers. No transport, paid search or summary runs.
jest.mock('../src/features/search/RecordSearchForm', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Results } = jest.requireActual<
    typeof import('../src/features/search/Results')
  >('../src/features/search/Results');
  const { decodeRecords } = jest.requireActual<
    typeof import('../src/features/search/decoders')
  >('../src/features/search/decoders');
  const data = decodeRecords({
    query: 'fixture',
    kind: 'all',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: 2,
    count: 2,
    truncated: false,
    years: {},
    results: ['speech-1', 'speech-2'].map((slug) => ({
      kind: 'speech',
      title: `Fixture ${slug}`,
      slug,
      resource: slug,
      snippet: '',
      href: `/doc/${slug}`,
    })),
  });
  const noop = () => {};
  return {
    RecordSearchForm: (
      props: React.ComponentProps<
        typeof import('../src/features/search/RecordSearchForm').RecordSearchForm
      >,
    ) =>
      React.createElement(Results, {
        result: { data, stale: false, savedAt: 0, asOf: null },
        busy: false,
        filtered: false,
        sort: 'relevance',
        onSort: noop,
        onPage: noop,
        onOpen: (path, title) => {
          props.openInPane?.(path, title);
        },
        readMode: 'passages',
        onRead: noop,
        briefs: {},
        briefBusy: false,
        briefError: null,
        onBriefRetry: noop,
        summary: null,
        summaryBusy: false,
        summaryError: null,
        onSummary: noop,
        summaryAllowed: true,
        onRecover: noop,
        onExample: noop,
        cursorReveal: props.cursorReveal,
        selectedPath: props.selectedPath,
      }),
  };
});

test('record results retain arrow and Return order when Search regains focus', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <NavigationContext.Provider
        value={
          mockNavigation as unknown as React.ContextType<
            typeof NavigationContext
          >
        }
      >
        <Search initialFilters={defaultFilters} />
      </NavigationContext.Provider>,
    );
  });
  expect(tree.root.findByType(Results).props.cursorReveal).toBeDefined();
  const refocus = (active: boolean) =>
    act(() => {
      mockFocus.active = active;
      for (const listener of [...mockFocus.listeners]) listener();
    });
  const down = () =>
    act(() => {
      expect(dispatchKeyCommand('list-down')).toBe(true);
    });
  try {
    refocus(false);
    expect(dispatchKeyCommand('list-down')).toBe(false);
    refocus(true);
    down();
    down();
    expect(tree.root.findAllByType(ResultRow).at(-1)?.props.highlighted).toBe(
      true,
    );
    expect(router.setParams).not.toHaveBeenCalled();
    act(() => {
      dispatchKeyCommand('list-open');
    });
    expect(router.setParams).toHaveBeenLastCalledWith({
      open: 'doc:speech-2',
      q: '',
    });
  } finally {
    act(() => tree.unmount());
    mockFocus.active = true;
    mockFocus.listeners.clear();
  }
});
