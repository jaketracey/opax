import { act, type ReactNode, type ComponentProps } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  Platform,
  StyleSheet,
  View,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  Grid,
  RegionProvider,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { emptyReservedRegions, type ReservedRegions } from '../src/design/fold';
import { Text } from '../src/design/text';
import { ElectorateCard } from '../src/features/your-mp/ElectorateCard';
import { Catalogs, decodeElectorate, electorateFor } from '../src/api/catalogs';
import { index, pinned, slugs } from './pinned';
import { catalogs as runtime } from '../src/api/runtime';
import { PartyPage } from '../src/features/Party';
import AskScreen from '../src/features/ask/AskScreen';
import { AskColumns } from '../src/features/ask/AskLayout';
import { askSession } from '../src/features/ask/session';
import { chatsSnapshot } from '../src/features/ask/store';
import {
  citationSelection,
  selectCitation,
} from '../src/features/ask/citation-state';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withNavigationOptions } from './navigation-options';
import { DailyPair } from '../src/features/today/DailyPair';
import { MoreToExplore } from '../src/features/today/MoreToExplore';
import { Masthead } from '../src/features/today/Masthead';

let mockWidth = 626;
let mockHeight = 800;
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, isPad: false } },
    useWindowDimensions: {
      value: () => ({
        width: mockWidth,
        height: mockHeight,
        scale: 2,
        fontScale: 1,
      }),
    },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Pass = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Link: Object.assign(Pass, {
      Trigger: Pass,
      Preview: () => null,
      Menu: Pass,
      MenuAction: Pass,
    }),
    Stack: { Screen: () => null },
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  };
});
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  apiClient: { get: jest.fn() },
  peopleDepth: {
    access: jest.fn().mockRejectedValue(new Error('Offline')),
    funding: jest.fn().mockRejectedValue(new Error('Offline')),
    mentions: jest.fn().mockRejectedValue(new Error('Offline')),
    news: jest.fn().mockRejectedValue(new Error('Offline')),
  },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
    partyPage: jest.fn(),
    followSources: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn(() => new Promise(() => {})) },
}));

let mockThreadMounts = 0;
jest.mock('../src/features/ask/AskThread', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('../src/features/ask/AskThread');
  return {
    ...actual,
    AskThread: (
      props: ComponentProps<
        (typeof import('../src/features/ask/AskThread'))['AskThread']
      >,
    ) => {
      React.useEffect(() => {
        mockThreadMounts++;
      }, []);
      return React.createElement(actual.AskThread, props);
    },
  };
});
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: true }, checking: false }),
  accountSnapshot: () => ({ status: { signedIn: true }, checking: false }),
}));
jest.mock('../src/voice/linked', () => ({ voiceLinked: false }));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/ask/store', () => {
  const empty = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: jest.fn(() => empty),
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    forgetActiveChat: jest.fn(),
  };
});
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: () => null,
  RecordShare: () => null,
}));
const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
const compact: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: true,
};
const fold: ReservedRegions = {
  divisions: [{ x: 261, y: 0, width: 40, height: 800, active: true }],
  occlusions: [],
};
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(children: ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(children);
  });
  mounted.push(tree);
  return tree;
}
function surface(
  children: ReactNode,
  regions = emptyReservedRegions,
  width = 562,
) {
  return (
    <RegionProvider value={{ width, height: mockHeight }}>
      <ReservedRegionsProvider value={regions}>
        {children}
      </ReservedRegionsProvider>
    </RegionProvider>
  );
}
function native(tree: TestRenderer.ReactTestRenderer, id: string) {
  return tree.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
}
function cells(tree: TestRenderer.ReactTestRenderer, id: string) {
  return native(tree, id).children.filter(
    (child): child is ReactTestInstance => typeof child !== 'string',
  );
}
beforeEach(() => {
  mockWidth = 626;
  mockHeight = 800;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
    setWindowTraitsOverride(regular);
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});

describe('Today on Duo', () => {
  test.each(['today-pair-grid', 'today-explore-tiles'])(
    '%s has two equal columns at 626pt and clears the active fold',
    (id) => {
      const content =
        id === 'today-pair-grid' ? (
          <DailyPair today="2026-11-11" attempt={0} />
        ) : (
          <MoreToExplore />
        );
      const tree = render(surface(content));
      const initial = cells(tree, id).map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      );
      expect(new Set(initial).size).toBe(1);
      expect(initial[0]).toBeGreaterThan(250);
      expect(initial[0]).toBeLessThan(281);
      act(() => tree.update(surface(content, fold)));
      expect(StyleSheet.flatten(native(tree, id).props.style).columnGap).toBe(
        40,
      );
      for (const cell of cells(tree, id))
        expect(StyleSheet.flatten(cell.props.style).width).toBe(261);
      act(() =>
        tree.update(
          surface(content, {
            ...fold,
            divisions: [{ ...fold.divisions[0]!, active: false }],
          }),
        ),
      );
      expect(
        cells(tree, id).map(
          (cell) => StyleSheet.flatten(cell.props.style).width,
        ),
      ).toEqual(initial);
    },
  );
  test('320pt masthead and cards retain wrapping phone type and a scrollable stack', () => {
    mockWidth = 380;
    mockHeight = 560;
    act(() => setWindowTraitsOverride(compact));
    const tree = render(
      surface(
        <>
          <Masthead now={new Date('2026-11-11T00:00:00Z')} />
          <DailyPair today="2026-11-11" attempt={0} />
        </>,
        emptyReservedRegions,
        320,
      ),
    );
    expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    const date = tree.root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'today-screen-message')!;
    expect(date.props.numberOfLines).toBeUndefined();
    expect(date.props.variant).toBe('secondary');
  });
  test.each([320, 375, 390, 402, 414, 430, 440, 956])(
    'the phone rule at %spt retains the daily pair stack',
    (width) => {
      mockWidth = width;
      act(() => {
        setWindowTraitsOverride(null);
        resetAdaptiveDeviceForTests();
        setWindowTraitsOverride({
          horizontal: width === 956 ? 'regular' : 'compact',
          vertical: width === 956 ? 'compact' : 'regular',
          foldable: false,
        });
      });
      const tree = render(
        surface(
          <DailyPair today="2026-11-11" attempt={0} />,
          emptyReservedRegions,
          width,
        ),
      );
      expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    },
  );
});

const seat = index.electorates.find((entry) => entry.name === 'Grayndler')!;
const electorate = electorateFor(decodeElectorate(pinned(seat.detail_url)));
describe('Your MP on Duo', () => {
  test('stat rows have two equal columns at 626pt, retaining the even split around a fold', () => {
    const card = <ElectorateCard seat={seat} view={electorate} />;
    const tree = render(surface(card));
    const initial = cells(tree, 'your-mp-stats-grid').map(
      (cell) => StyleSheet.flatten(cell.props.style).width,
    );
    expect(initial).toEqual([273, 273, 273]);
    // The grid is inside the card's own padding, measured independently.
    const grid = native(tree, 'your-mp-stats-grid');
    let bounds = grid.parent!;
    while (
      !bounds.props.onLayout ||
      bounds.props.testID === 'your-mp-stats-grid'
    )
      bounds = bounds.parent!;
    act(() =>
      bounds.props.onLayout({
        nativeEvent: { layout: { width: 530, height: 180 } },
      }),
    );
    act(() =>
      grid.props.onLayout({
        nativeEvent: { layout: { width: 530, height: 180 } },
      }),
    );
    expect(
      cells(tree, 'your-mp-stats-grid').map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      ),
    ).toEqual([257, 257, 257]);
    act(() =>
      tree.update(
        surface(card, {
          ...fold,
          divisions: [{ ...fold.divisions[0]!, x: 245 }],
        }),
      ),
    );
    expect(
      StyleSheet.flatten(native(tree, 'your-mp-stats-grid').props.style)
        .columnGap,
    ).toBe(40);
    expect(
      cells(tree, 'your-mp-stats-grid').map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      ),
    ).toEqual([245, 245, 245]);
  });
  test('at 320pt long figures and labels wrap in full without ellipses', () => {
    mockWidth = 380;
    mockHeight = 560;
    act(() => setWindowTraitsOverride(compact));
    const tree = render(
      surface(
        <ElectorateCard seat={seat} view={electorate} />,
        emptyReservedRegions,
        320,
      ),
    );
    expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    const figures = tree.root
      .findAllByType(Text)
      .filter((node) => node.props.variant === 'strong' && node.props.tabular);
    expect(figures).toHaveLength(3);
    for (const figure of figures) {
      const value = figure.props.children;
      const row = figure.parent!;
      act(() => {
        row.props.onLayout({
          nativeEvent: { layout: { width: 256, height: 44 } },
        });
        figure.props.onTextLayout({
          nativeEvent: { lines: [{ width: 220 }, { width: 80 }] },
        });
      });
      expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('column');
      expect(figure.props.children).toBe(value);
      expect(figure.props.numberOfLines).toBeUndefined();
      const label = row
        .findAllByType(Text)
        .find((node) => node.props.variant === 'body')!;
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.wordSafe).toBe(true);
    }
  });
  test.each([320, 375, 390, 402, 414, 430, 440, 956])(
    'phone rule at %spt retains the existing full-width stat rows',
    (width) => {
      mockWidth = width;
      act(() => {
        setWindowTraitsOverride(null);
        resetAdaptiveDeviceForTests();
        setWindowTraitsOverride({
          horizontal: width === 956 ? 'regular' : 'compact',
          vertical: width === 956 ? 'compact' : 'regular',
          foldable: false,
        });
      });
      const tree = render(
        surface(
          <ElectorateCard seat={seat} view={electorate} />,
          emptyReservedRegions,
          width,
        ),
      );
      expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    },
  );
});

describe('Party on Duo', () => {
  beforeAll(async () => {
    const api = new Catalogs({
      get: async (path, decode) => ({
        data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
        stale: false,
        savedAt: 1,
        asOf: null,
      }),
    });
    jest
      .mocked(runtime.partyPage)
      .mockResolvedValue(await api.partyPage('Labor'));
  });
  test('related sections pair on the inner phone display and their fold gutter stays empty', async () => {
    const tree = render(surface(<PartyPage input="Labor" />));
    await act(async () => {});
    expect(tree.root.findAllByType(Grid)).toHaveLength(2);
    expect(
      cells(tree, 'party-members-grid').map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      ),
    ).toEqual([263, 263]);
    act(() => tree.update(surface(<PartyPage input="Labor" />, fold)));
    expect(
      StyleSheet.flatten(native(tree, 'party-members-grid').props.style)
        .columnGap,
    ).toBe(40);
    expect(
      cells(tree, 'party-members-grid').map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      ),
    ).toEqual([261, 261]);
  });
  test.each([320, 375, 390, 402, 414, 430, 440, 956])(
    'the phone rule at %spt retains the section stack and wrapping header',
    async (width) => {
      mockWidth = width;
      mockHeight = 560;
      act(() => {
        setWindowTraitsOverride(null);
        resetAdaptiveDeviceForTests();
        setWindowTraitsOverride({
          horizontal: width === 956 ? 'regular' : 'compact',
          vertical: width === 956 ? 'compact' : 'regular',
          foldable: false,
        });
      });
      const tree = render(
        surface(<PartyPage input="Labor" />, emptyReservedRegions, width),
      );
      await act(async () => {});
      expect(tree.root.findAllByType(Grid)).toHaveLength(0);
      const title = tree.root
        .findAllByType(Text)
        .find((node) => node.props.testID === 'party-title')!;
      expect(title.props.children).toBe('Labor');
      expect(title.props.numberOfLines).toBeUndefined();
    },
  );
});

const savedChat = {
  v: 1 as const,
  active: 'duo-fixture',
  chats: [
    {
      id: 'duo-fixture',
      title: 'A fixture question',
      kind: 'all' as const,
      speaker: '',
      created: 1,
      updated: 1,
      thread: [
        { role: 'user' as const, text: 'A fixture question' },
        {
          role: 'answer' as const,
          text: '',
          result: {
            answer: 'The fixture record supports this sentence.',
            citations: {},
            sources: [1, 2].map((n) => ({
              resource: `fixture-${n}`,
              title: `Fixture source ${n}`,
              slug: `fixture-${n}`,
              href: `/bill/fixture-${n}`,
              snippet: `Synthetic passage ${n}.`,
              cited: true,
              answerRanges: [[0, 42] as [number, number]],
            })),
          },
        },
      ],
    },
  ],
};
function press(tree: TestRenderer.ReactTestRenderer, id: string) {
  const button = tree.root.findAll(
    (node) =>
      node.props.testID === id && typeof node.props.onPress === 'function',
  )[0]!;
  act(() => button.props.onPress());
}
describe('Ask on Duo', () => {
  beforeEach(() => {
    mockThreadMounts = 0;
    jest.mocked(chatsSnapshot).mockReturnValue(savedChat);
    act(() => {
      askSession.start();
      askSession.open('duo-fixture');
      selectCitation(null);
    });
  });
  afterEach(() => {
    act(() => {
      askSession.start();
      askSession.setDraft('');
      selectCitation(null);
    });
  });
  test('thread, scroll anchor, focused input, draft and source selection survive regular/compact/regular', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    const blur = jest.spyOn(TextInput.prototype, 'blur');
    // Ask docks its sources pane from the 700 pt split breakpoint, so the
    // regular window here is the unfolded Duo's region beside its tab rail.
    mockWidth = 880;
    const tree = render(withNavigationOptions(<AskScreen />, () => {}));
    await act(async () => {});
    const thread = tree.root.findByProps({ testID: 'ask-thread' });
    const input = tree.root.findByType(TextInput);
    const scroll = tree.root
      .findAllByType(ScrollView)
      .find((node) => node.props.testID === 'ask-screen')!;
    act(() => {
      native(tree, 'ask-anchor-0').props.onLayout({
        nativeEvent: { layout: { y: 0 } },
      });
      native(tree, 'ask-anchor-1').props.onLayout({
        nativeEvent: { layout: { y: 100 } },
      });
    });
    act(() => input.props.onChangeText('A draft kept while folding'));
    input.instance.focus();
    act(() =>
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 184 } } }),
    );
    press(tree, 'ask-pane-source-2');
    expect(citationSelection()?.n).toBe(2);
    scrollTo.mockClear();
    blur.mockClear();
    for (const traits of [compact, regular]) {
      mockWidth = traits === compact ? 380 : 880;
      mockHeight = traits === compact ? 560 : 800;
      act(() => setWindowTraitsOverride(traits));
      act(() =>
        native(tree, 'ask-anchor-1').props.onLayout({
          nativeEvent: { layout: { y: traits === compact ? 160 : 100 } },
        }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: traits === compact ? 244 : 184,
        animated: false,
      });
      expect(tree.root.findByType(TextInput)).toBe(input);
      expect(tree.root.findByType(TextInput).instance).toBe(input.instance);
      expect(input.props.value).toBe('A draft kept while folding');
      expect(tree.root.findByProps({ testID: 'ask-thread' })).toBe(thread);
      expect(
        tree.root
          .findAllByType(ScrollView)
          .find((node) => node.props.testID === 'ask-screen'),
      ).toBe(scroll);
      expect(scroll.props.maintainVisibleContentPosition).toEqual({
        minIndexForVisible: 0,
      });
      expect(mockThreadMounts).toBe(1);
      expect(citationSelection()?.n).toBe(2);
    }
    expect(
      tree.root
        .findAllByType(Text)
        .some((node) => node.props.children === 'Synthetic passage 2.'),
    ).toBe(true);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(blur).not.toHaveBeenCalled();
    scrollTo.mockRestore();
    blur.mockRestore();
  });
  test.each([false, true])(
    'composer clears a vertical fold and camera, docked = %s',
    (docked) => {
      const regions: ReservedRegions = {
        divisions: [{ x: 293, y: 0, width: 40, height: 800, active: true }],
        occlusions: [
          {
            x: docked ? 240 : 550,
            y: 700,
            width: 53,
            height: 100,
            active: true,
          },
        ],
      };
      const tree = render(
        surface(
          <AskColumns
            docked={docked}
            content={<View />}
            dock={<View />}
            sources={<View />}
            keyboard={0}
            ground="sunken"
          />,
          regions,
          626,
        ),
      );
      act(() => {
        native(tree, 'ask-composer-bounds').props.onLayout({
          nativeEvent: { layout: { width: docked ? 293 : 626, height: 800 } },
        });
        native(tree, 'ask-composer-position').props.onLayout({
          nativeEvent: { layout: { width: 293, height: 80 } },
        });
      });
      const position = StyleSheet.flatten(
        native(tree, 'ask-composer-position').props.style,
      );
      expect(position.width).toBe(293);
      expect(position.left).toBe(docked ? 0 : 333);
      expect(position.top).toBe(620);
      if (docked) {
        expect(
          StyleSheet.flatten(
            native(tree, 'ask-conversation-column').props.style,
          ).width,
        ).toBe(293);
        expect(
          StyleSheet.flatten(native(tree, 'ask-sources-column').props.style),
        ).toMatchObject({ width: 293, marginLeft: 40 });
      }
    },
  );
  test('outer dock leaves the sides to the screen, keeps its bottom, and uses the measured 320 by 560 content area', () => {
    mockWidth = 380;
    mockHeight = 560;
    act(() => setWindowTraitsOverride(compact));
    const tree = render(
      surface(
        <AskColumns
          docked={false}
          content={<View />}
          dock={<View />}
          sources={null}
          keyboard={0}
          ground="sunken"
        />,
        emptyReservedRegions,
        380,
      ),
    );
    // AskScreen's SidebarSafe pads the rail's side once; padding it here as
    // well drew the folded Duo's composer a whole rail short of the column.
    const edges = tree.root
      .findAllByType(SafeAreaView)
      .map((node) => (node.props.edges ?? []) as string[]);
    expect(edges.some((e) => e.includes('left') || e.includes('right'))).toBe(
      false,
    );
    expect(edges.some((e) => e.includes('bottom'))).toBe(true);
    // Native safe-area layout: left 0, right 60, then the area's own measurement.
    act(() => {
      native(tree, 'ask-composer-bounds').props.onLayout({
        nativeEvent: { layout: { width: 320, height: 560 } },
      });
      native(tree, 'ask-composer-position').props.onLayout({
        nativeEvent: { layout: { width: 320, height: 80 } },
      });
    });
    expect(
      StyleSheet.flatten(native(tree, 'ask-composer-position').props.style),
    ).toMatchObject({ left: 0, top: 480, width: 320 });
  });
  test.each([320, 375, 390, 402, 414, 430, 440, 956])(
    'the phone rule at %spt keeps the phone dock and sources closed',
    async (width) => {
      mockWidth = width;
      act(() => {
        setWindowTraitsOverride(null);
        resetAdaptiveDeviceForTests();
        setWindowTraitsOverride({
          horizontal: width === 956 ? 'regular' : 'compact',
          vertical: width === 956 ? 'compact' : 'regular',
          foldable: false,
        });
      });
      const tree = render(withNavigationOptions(<AskScreen />, () => {}));
      await act(async () => {});
      expect(
        StyleSheet.flatten(native(tree, 'ask-sources-column').props.style)
          .display,
      ).toBe('none');
      expect(
        tree.root.findAll((node) => node.props.testID === 'ask-sources-pane'),
      ).toHaveLength(0);
      expect(tree.root.findByType(TextInput).props.value).toBe('');
    },
  );
});
