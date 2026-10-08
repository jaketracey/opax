import { act } from 'react';
import {
  TextInput,
  StyleSheet,
  Dimensions,
  Keyboard,
  type KeyboardEvent,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Composer } from '../src/design/controls';
import { dispatchKeyCommand } from '../src/design/keyboard';
import { useAskSources } from '../src/features/ask/SourcesPane';
import { redirectSystemPath } from '../src/app/+native-intent';
import type { Source, Turn } from '../src/features/ask/model';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual('react').useEffect(effect, []),
}));
jest.mock('../src/features/ask/AnswerView', () => ({
  openAnswerLink: jest.fn(),
}));
jest.mock('../src/features/split/RecordDetail', () => {
  const React = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  return {
    RecordDetail: ({ entry }: { entry: { key: string } }) =>
      React.createElement(Native.View, {
        testID: `opened-record-${entry.key}`,
      }),
    RecordShare: () => null,
  };
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach((tree) => tree.unmount())));
function render(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}

test.each([
  'opax://directory?kind=party&open=party:Labor',
  '/directory?kind=party&open=party:Labor',
])(
  'an incoming directory link selects Search and retains its selection: %s',
  (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe(
      '/(tabs)/(search)/directory?kind=party&open=party:Labor',
    );
    expect(redirectSystemPath({ path, initial: false })).toBe(
      '/(tabs)/(search)/directory?kind=party&open=party:Labor',
    );
  },
);
test('other links retain the router handling', () => {
  for (const path of [
    'opax://bill/au-federal-r7534',
    'opax://search?q=gambling',
    '/(tabs)/(today)/directory?kind=person',
  ])
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
});

test('Ask source keys follow cited then also-retrieved order; arrows never open a record', () => {
  const source = (resource: string, cited: boolean): Source => ({
    resource,
    cited,
    title: `Fixture ${resource}`,
    slug: resource,
    href: `/doc/${resource}`,
    snippet: '',
    answerRanges: [],
  });
  const thread: Turn[] = [
    {
      role: 'answer',
      text: 'Fixture answer',
      sources: [source('speech-1', false), source('speech-2', true)],
    },
  ];
  function Pane() {
    return useAskSources(thread).pane;
  }
  const tree = render(<Pane />);
  act(() => {
    dispatchKeyCommand('list-down');
  });
  expect(
    tree.root.findAllByProps({ testID: 'opened-record-speech-2' }),
  ).toHaveLength(0);
  act(() => {
    dispatchKeyCommand('list-down');
  });
  act(() => {
    dispatchKeyCommand('list-up');
  });
  act(() => {
    dispatchKeyCommand('list-open');
  });
  expect(
    tree.root.findAllByProps({ testID: 'opened-record-speech-2' }).length,
  ).toBeGreaterThan(0);
  const { openAnswerLink } = jest.requireMock('../src/features/ask/AnswerView');
  expect(openAnswerLink).not.toHaveBeenCalled();
});

test('a long composer keeps Send outside its scrolling input and follows the live window', () => {
  const original = Dimensions.get('window');
  act(() =>
    Dimensions.set({ window: { ...original, height: 900, fontScale: 3.1 } }),
  );
  const tree = render(
    <Composer
      label="Question"
      submitLabel="Send"
      value={'Fixture draft '.repeat(100)}
      onChangeText={() => {}}
      onSubmit={() => {}}
      placeholder="Question"
    />,
  );
  const input = () => tree.root.findByType(TextInput);
  expect(input().props.scrollEnabled).toBe(true);
  expect(StyleSheet.flatten(input().props.style).maxHeight).toBeLessThanOrEqual(
    360,
  );
  act(() =>
    Dimensions.set({ window: { ...original, height: 600, fontScale: 3.1 } }),
  );
  expect(StyleSheet.flatten(input().props.style).maxHeight).toBeLessThanOrEqual(
    240,
  );
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Send' }).length,
  ).toBeGreaterThan(0);
  act(() => Dimensions.set({ window: original }));
});

test('an open iOS keyboard leaves conversation space above the capped composer', () => {
  const callbacks = new Map<string, (event: KeyboardEvent) => void>();
  const listener = jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((name, callback) => {
      callbacks.set(name, callback);
      return { remove: () => callbacks.delete(name) };
    });
  const original = Dimensions.get('window');
  act(() =>
    Dimensions.set({ window: { ...original, height: 900, fontScale: 3.1 } }),
  );
  const tree = render(
    <Composer
      label="Question"
      submitLabel="Send"
      value={'Fixture draft '.repeat(100)}
      onChangeText={() => {}}
      onSubmit={() => {}}
      placeholder="Question"
    />,
  );
  const cap = () =>
    StyleSheet.flatten(tree.root.findByType(TextInput).props.style).maxHeight;
  const resting = cap();
  act(() =>
    callbacks.get('keyboardWillChangeFrame')?.({
      endCoordinates: { screenY: 420 },
    } as KeyboardEvent),
  );
  expect(cap()).toBeLessThanOrEqual(420 * 0.4);
  expect(cap()).toBeLessThan(resting);
  act(() => callbacks.get('keyboardWillHide')?.({} as KeyboardEvent));
  expect(cap()).toBe(resting);
  act(() => Dimensions.set({ window: original }));
  listener.mockRestore();
});
