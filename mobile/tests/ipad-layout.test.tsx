import { act } from 'react';
import { Text as NativeText, View } from 'react-native';
import TestRenderer from 'react-test-renderer';

// SplitLayout decides between one pane and two from `useLayout()`; the test
// sets the region it reports. useFocusEffect runs as a mount effect here.
const mockLayout = { regular: true, width: 1180 };
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  return {
    ...actual,
    useLayout: () => ({
      size: mockLayout.regular ? 'regular' : 'compact',
      regular: mockLayout.regular,
      wide: mockLayout.width >= 1100,
      width: mockLayout.width,
      height: 800,
      window: { width: mockLayout.width, height: 800 },
      landscape: true,
    }),
  };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    require('react').useEffect(effect, []);
  },
}));

import {
  breakpoints,
  columns,
  gridColumns,
  readableInset,
  sizeClassFor,
} from '../src/design/adaptive';
import {
  dispatchKeyCommand,
  keyCommandSpecs,
  onKeyCommand,
  requestFocus,
  takeFocusRequest,
} from '../src/design/keyboard';
import { SplitLayout, SplitEmpty, useSplitPane } from '../src/design/split';
import { phoneCopy } from '../src/design/phone-copy';

describe('size classes', () => {
  test('regular from 700pt, on iPad only', () => {
    expect(breakpoints.regular).toBe(700);
    expect(sizeClassFor(699, true)).toBe('compact');
    expect(sizeClassFor(700, true)).toBe('regular');
    // A 1/3 Split View window on a 13-inch iPad.
    expect(sizeClassFor(375, true)).toBe('compact');
    // The iPhone is compact in every orientation (Pro Max landscape: 956pt).
    expect(sizeClassFor(956, false)).toBe('compact');
  });
  test('the readable column centres on regular width and keeps the margin on compact', () => {
    expect(readableInset(402, columns.readable, 20, 'compact')).toBe(20);
    expect(readableInset(1032, columns.readable, 20, 'regular')).toBe(166);
    // Never tighter than 1.6x the margin on a just-regular window.
    expect(readableInset(720, columns.readable, 20, 'regular')).toBe(32);
  });
  test('grid columns follow the grid width, its counts and the minimum card width', () => {
    expect(gridColumns(362, { pad: false })).toBe(1);
    expect(gridColumns(968, { pad: true })).toBe(2);
    expect(gridColumns(1180, { pad: true })).toBe(3);
    expect(gridColumns(1180, { pad: true, columns: { wide: 2 } })).toBe(2);
    // AX sizes scale the minimum width: three 560pt cards do not fit 1180pt.
    expect(gridColumns(1180, { pad: true, minItemWidth: 560 })).toBe(2);
    expect(gridColumns(968, { pad: true, minItemWidth: 560 })).toBe(1);
  });
});

describe('keyboard commands', () => {
  test('the newest handler for a command runs, and removing it restores the previous one', () => {
    const calls: string[] = [];
    const removeA = onKeyCommand('list-down', () => calls.push('a'));
    const removeB = onKeyCommand('list-down', () => calls.push('b'));
    expect(dispatchKeyCommand('list-down')).toBe(true);
    removeB();
    dispatchKeyCommand('list-down');
    removeA();
    expect(dispatchKeyCommand('list-down')).toBe(false);
    expect(calls).toEqual(['b', 'a']);
  });
  test('the shortcut list names Cmd-F, Cmd-N and Cmd-1 to Cmd-5 in sidebar order', () => {
    const listed = keyCommandSpecs
      .filter((spec) => spec.title)
      .map((spec) => `${spec.modifiers.join('+')}+${spec.input} ${spec.title}`);
    expect(listed).toEqual([
      'command+f Search',
      'command+n New question',
      'command+1 Today',
      'command+2 Your MP',
      'command+3 Bills',
      'command+4 Search',
      'command+5 Ask',
    ]);
  });
  test('a focus request waits for the screen that takes it, once', () => {
    requestFocus('search');
    expect(takeFocusRequest('ask')).toBe(false);
    expect(takeFocusRequest('search')).toBe(true);
    expect(takeFocusRequest('search')).toBe(false);
  });
});

test('copy keeps "iPhone" on iPhone (iPad wording is chosen at runtime)', () => {
  expect(phoneCopy('saved on this iPhone')).toBe('saved on this iPhone');
});

type Entry = { kind: 'item' | 'more'; key: string };
function Detail({ entry }: { entry: Entry }) {
  const pane = useSplitPane<Entry>();
  return (
    <View testID={`detail-${entry.kind}-${entry.key}`}>
      <NativeText>{`depth ${pane?.depth}`}</NativeText>
    </View>
  );
}
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});
/** Host views with this test ID (composites repeat the prop). */
const hosts = (tree: TestRenderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    (node) => node.props.testID === testID && typeof node.type === 'string',
  ).length;
function render(selected: Entry | null, onSelect = jest.fn()) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = create(selected, onSelect);
  });
  mounted.push(tree);
  return tree;
}
function create(selected: Entry | null, onSelect: jest.Mock) {
  return TestRenderer.create(
    <SplitLayout<Entry>
      id="test"
      testID="split"
      list={<View testID="the-list" />}
      selected={selected}
      onSelect={onSelect}
      entryKey={(e) => `${e.kind}:${e.key}`}
      entryTitle={(e) => (e.kind === 'item' ? 'Item' : 'More')}
      renderDetail={(e) => <Detail entry={e} />}
      keys={['a', 'b', 'c']}
      entryForKey={(key) => ({ kind: 'item', key })}
      empty={
        <SplitEmpty icon="doc.text" title="No item selected" testID="empty" />
      }
    />,
  );
}

describe('SplitLayout', () => {
  beforeEach(() => {
    mockLayout.regular = true;
    mockLayout.width = 1180;
  });
  test('compact width renders the list alone, as the phone does', () => {
    mockLayout.regular = false;
    const tree = render(null);
    expect(hosts(tree, 'the-list')).toBe(1);
    expect(hosts(tree, 'split')).toBe(0);
  });
  test('regular width shows the calm empty state until something is selected', () => {
    const tree = render(null);
    expect(hosts(tree, 'split-list')).toBe(1);
    expect(hosts(tree, 'empty')).toBeGreaterThan(0);
  });
  test('the pane pushes within itself, Back returns, and a new selection starts again', () => {
    let pane: ReturnType<typeof useSplitPane<Entry>> = null;
    function Capture({ entry }: { entry: Entry }) {
      pane = useSplitPane<Entry>();
      return <Detail entry={entry} />;
    }
    const onSelect = jest.fn();
    const make = (selected: Entry) => (
      <SplitLayout<Entry>
        id="test"
        list={<View />}
        selected={selected}
        onSelect={onSelect}
        entryKey={(e) => `${e.kind}:${e.key}`}
        entryTitle={(e) => (e.kind === 'item' ? 'Item' : 'More')}
        renderDetail={(e) => <Capture entry={e} />}
        empty={null}
      />
    );
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(make({ kind: 'item', key: 'a' }));
    });
    mounted.push(tree);
    expect(hosts(tree, 'detail-item-a')).toBe(1);
    act(() => pane!.push({ kind: 'more', key: 'a' }));
    expect(hosts(tree, 'detail-more-a')).toBe(1);
    expect(pane!.depth).toBe(2);
    act(() => {
      pane!.back();
    });
    expect(hosts(tree, 'detail-item-a')).toBe(1);
    act(() => pane!.push({ kind: 'more', key: 'a' }));
    act(() => tree.update(make({ kind: 'item', key: 'b' })));
    expect(hosts(tree, 'detail-item-b')).toBe(1);
    expect(pane!.depth).toBe(1);
  });
  test('Down and Up move the selection through the list keys', () => {
    const onSelect = jest.fn();
    render({ kind: 'item', key: 'b' }, onSelect);
    act(() => {
      dispatchKeyCommand('list-down');
    });
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'item', key: 'c' });
    act(() => {
      dispatchKeyCommand('list-up');
    });
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'item', key: 'a' });
  });
});
