import { act, useEffect } from 'react';
import { Dimensions, Text as NativeText, View } from 'react-native';
import TestRenderer from 'react-test-renderer';

import {
  dragWebUrl,
  breakpoints,
  columnBreakout,
  columns,
  gridColumns,
  readableInset,
  ScreenColumn,
  sizeClassFor,
  splitPaneWidth,
  useColumnChoice,
} from '../src/design/adaptive';
import {
  dispatchKeyCommand,
  keyCommandSpecs,
  onKeyCommand,
  requestFocus,
  takeFocusRequest,
} from '../src/design/keyboard';
import { SplitLayout, SplitEmpty, useSplitPane } from '../src/design/split';
import { Section } from '../src/design/layout';
import { colors } from '../src/design/tokens';
import { phoneCopy } from '../src/design/phone-copy';

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
    jest.requireActual('react').useEffect(effect, []);
  },
}));

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
      'command+[ Back',
      'command+r Refresh',
      '+return Open focused row',
      '+escape Close sheet',
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
  test('regular width shows the quiet empty line until something is selected', () => {
    const tree = render(null);
    expect(hosts(tree, 'split-list')).toBe(1);
    expect(hosts(tree, 'empty')).toBeGreaterThan(0);
  });
  test('the pane pushes within itself, Back returns, and a new selection starts again', () => {
    const held: { pane: ReturnType<typeof useSplitPane<Entry>> } = {
      pane: null,
    };
    function Capture({ entry }: { entry: Entry }) {
      const current = useSplitPane<Entry>();
      useEffect(() => {
        held.pane = current;
      });
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
    act(() => held.pane!.push({ kind: 'more', key: 'a' }));
    expect(hosts(tree, 'detail-more-a')).toBe(1);
    expect(held.pane!.depth).toBe(2);
    act(() => {
      held.pane!.back();
    });
    expect(hosts(tree, 'detail-item-a')).toBe(1);
    act(() => held.pane!.push({ kind: 'more', key: 'a' }));
    act(() => tree.update(make({ kind: 'item', key: 'b' })));
    expect(hosts(tree, 'detail-item-b')).toBe(1);
    expect(held.pane!.depth).toBe(1);
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

describe('two panes and the reading measure (design pass 4E)', () => {
  test('the narrow pane is a third of the shared region, 300 to 440pt, never over half; 45% at accessibility sizes', () => {
    // 13-inch landscape with the sidebar open, and in portrait.
    expect(splitPaneWidth(1096)).toBe(365);
    expect(splitPaneWidth(1032)).toBe(344);
    // The sidebar hidden: capped.
    expect(splitPaneWidth(1376)).toBe(440);
    // Just regular (a Stage Manager window): the detail keeps 400pt.
    expect(splitPaneWidth(700)).toBe(300);
    expect(splitPaneWidth(1096, true)).toBe(493);
  });
  test('a split list starts at that width: a third, or 45% at accessibility sizes', () => {
    mockLayout.regular = true;
    mockLayout.width = 1096;
    const listWidth = (fontScale: number) => {
      const window = Dimensions.get('window');
      const screen = Dimensions.get('screen');
      const size = { width: 1096, height: 800, scale: 2, fontScale };
      act(() => Dimensions.set({ window: size, screen: size }));
      try {
        const tree = render(null);
        const list = tree.root.find(
          (node) =>
            node.props.testID === 'split-list' && typeof node.type === 'string',
        );
        return Object.assign({}, ...[list.props.style].flat(3)).width;
      } finally {
        act(() => Dimensions.set({ window, screen }));
      }
    };
    expect(listWidth(1)).toBe(365);
    // Jest's own window is at an accessibility size.
    expect(listWidth(3.571)).toBe(493);
  });
  test('the list pane draws no category accent: the detail carries it', () => {
    mockLayout.regular = true;
    mockLayout.width = 1096;
    const section = (
      <Section title="Bills" accent="bills">
        <View />
      </Section>
    );
    const marks = (tree: TestRenderer.ReactTestRenderer) =>
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          [node.props.style]
            .flat(3)
            .some((style) => style?.backgroundColor === colors.billsInk),
      ).length;
    let alone!: TestRenderer.ReactTestRenderer;
    let split!: TestRenderer.ReactTestRenderer;
    act(() => {
      alone = TestRenderer.create(section);
      split = TestRenderer.create(
        <SplitLayout<Entry>
          id="accent"
          list={section}
          selected={{ kind: 'item', key: 'a' }}
          onSelect={jest.fn()}
          entryKey={(e) => e.key}
          renderDetail={() => section}
          empty={null}
        />,
      );
    });
    mounted.push(alone, split);
    expect(marks(alone)).toBe(1);
    // Only the detail pane's section keeps its mark.
    expect(marks(split)).toBe(1);
  });
  test('a route can choose the readable column over the screen’s own', () => {
    const seen: string[] = [];
    function Probe() {
      seen.push(useColumnChoice('wide'));
      return null;
    }
    act(() => {
      mounted.push(
        TestRenderer.create(
          <>
            <Probe />
            <ScreenColumn column="readable">
              <Probe />
            </ScreenColumn>
          </>,
        ),
      );
    });
    expect(seen.slice(0, 2)).toEqual(['wide', 'readable']);
  });
  test('a figure in the readable column reaches the wide one, never on compact', () => {
    // 13-inch landscape full screen (the money map), and portrait.
    expect(columnBreakout(1376, 'readable', 'regular')).toBe(240);
    expect(columnBreakout(1032, 'readable', 'regular')).toBe(134);
    expect(columnBreakout(1376, 'wide', 'regular')).toBe(0);
    expect(columnBreakout(402, 'readable', 'compact')).toBe(0);
    // The phone never breaks out (sizeClassFor is compact off iPad).
    expect(columnBreakout(956, 'readable')).toBe(0);
  });
});

test('drags use canonical public URLs and reject foreign destinations', () => {
  expect(dragWebUrl('/bill/au-federal-r7534', 'https://opax.com.au')).toBe(
    'https://opax.com.au/bill/au-federal-r7534',
  );
  expect(dragWebUrl('/doc/example', 'https://opax.com.au')).toBe(
    'https://opax.com.au/doc/example',
  );
  for (const value of [
    '//other.example/a',
    'https://other.example/a',
    'file:///a',
    'https://opax.com.au@other.example/a',
  ])
    expect(dragWebUrl(value)).toBeNull();
});
