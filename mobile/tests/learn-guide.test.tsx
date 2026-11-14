import { router } from 'expo-router';
import { act, useEffect, type ReactElement } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { resetTermClaimsForTests } from '../src/design/term';
import { learnChapters, learnExamples } from '../src/features/learn/glossary';
import LearnChapter from '../src/features/learn/LearnChapter';
import { LearnCard, WithLearnCard } from '../src/features/learn/LearnCard';
import LearnHub from '../src/features/learn/LearnHub';
import { guideRoute, openGuideLink } from '../src/features/learn/links';
import {
  learnSettingsSnapshot,
  resetLearnSettingsForTests,
} from '../src/features/learn/settings';
import { MoreToExplore } from '../src/features/today/MoreToExplore';
import { webOrigin } from '../src/design/environment';
import { openSource } from '../src/navigation/external';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 402,
    height: 874,
    scale: 3,
    fontScale: mockFontScale,
  }),
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    get exists() {
      return false;
    }
    async text() {
      return '';
    }
    write() {}
  },
}));
jest.mock('../src/onboarding/state', () => ({ tourSeen: async () => true }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    ...jest.requireActual('expo-router'),
    Link,
    router: {
      push: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    },
    Stack: { Screen: () => null },
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => {}),
}));

const push = router.push as jest.Mock;
const back = router.back as jest.Mock;
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}
const host = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) => node.props.testID === id && typeof node.type === 'string',
  );
const pressable = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) => node.props.testID === id && !!node.props.onPress,
  )[0]!;
const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
const allText = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(NativeText)
    .map((node) => textOf(node))
    .join('\n');

beforeEach(() => {
  mockParams = {};
  mockFontScale = 1;
  push.mockClear();
  back.mockClear();
  (openSource as jest.Mock).mockClear();
  resetTermClaimsForTests();
  resetLearnSettingsForTests({ card: 'show' });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

describe('the hub', () => {
  test('lists the seven chapters in order, then the glossary and the minute', () => {
    const tree = render(<LearnHub />);
    const text = allText(tree);
    expect(text).toContain('How Parliament works');
    let last = -1;
    for (const chapter of learnChapters) {
      const at = text.indexOf(chapter.title);
      expect(at).toBeGreaterThan(last);
      expect(text).toContain(chapter.summary);
      last = at;
    }
    expect(text.indexOf('A to Z glossary')).toBeGreaterThan(last);
    expect(text).toContain('Parliament in a minute');
    act(() => pressable(tree, 'learn-chapter-bill-to-act').props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: '/learn/[chapter]',
      params: { chapter: 'bill-to-act' },
    });
    act(() => pressable(tree, 'learn-minute-row').props.onPress());
    expect(push).toHaveBeenLastCalledWith({ pathname: '/learn/minute' });
  });

  test('opening the guide hides the Home card for good', async () => {
    render(<LearnHub />);
    await act(async () => {});
    expect(learnSettingsSnapshot().card).toBe('hidden');
  });
});

describe('a chapter', () => {
  test('one idea per screen: kicker, heading, Next swaps in place', () => {
    mockParams = { chapter: 'bill-to-act' };
    const chapter = learnChapters.find((c) => c.slug === 'bill-to-act')!;
    const total = chapter.screens.length;
    const tree = render(<LearnChapter />);
    expect(textOf(host(tree, 'learn-kicker')[0]!)).toBe(
      `How a bill becomes an Act · 1 of ${total}`,
    );
    expect(textOf(host(tree, 'learn-heading')[0]!)).toBe('What is a bill?');
    const next = pressable(tree, 'learn-next');
    expect(next.props.accessibilityLabel).toBe(
      `Next, How a bill becomes an Act · 2 of ${total}`,
    );
    act(() => pressable(tree, 'learn-next').props.onPress());
    expect(textOf(host(tree, 'learn-heading')[0]!)).toBe(
      chapter.screens[1]!.heading,
    );
    expect(push).not.toHaveBeenCalled();
  });

  test('terms are marked once per idea, from the guide’s own links', () => {
    mockParams = { chapter: 'bill-to-act' };
    const tree = render(<LearnChapter />);
    // Screen 1 links bill, Governor-General and Act.
    expect(host(tree, 'term-inline-bill')).toHaveLength(1);
    expect(host(tree, 'term-inline-governor-general')).toHaveLength(1);
    expect(host(tree, 'term-inline-act')).toHaveLength(1);
  });

  test('the last idea is "See it in OPAX": real records, then back to the guide', () => {
    const chapter = learnChapters.find((c) => c.slug === 'bill-to-act')!;
    mockParams = {
      chapter: 'bill-to-act',
      screen: String(chapter.screens.length),
    };
    const tree = render(<LearnChapter />);
    expect(textOf(host(tree, 'learn-heading')[0]!)).toBe('See it in OPAX');
    const text = allText(tree);
    expect(text).toContain(
      'Sport Legislation Amendment (World Anti-Doping Code Implementation) Bill 2026',
    );
    // The second record named inside a note has its own row.
    expect(text).toContain('The House then agreed to the changes');
    act(() =>
      pressable(tree, `learn-see-${chapter.screens.length}-0`).props.onPress(),
    );
    expect(push).toHaveBeenCalledTimes(1);
    expect(pressable(tree, 'learn-next').props.accessibilityLabel).toBe(
      'Back to the guide',
    );
    act(() => pressable(tree, 'learn-next').props.onPress());
    expect(back).toHaveBeenCalled();
  });

  test('an unknown chapter is an empty state', () => {
    mockParams = { chapter: 'nope' };
    const tree = render(<LearnChapter />);
    expect(host(tree, 'learn-chapter-missing').length).toBeGreaterThan(0);
  });

  test('every chapter screen draws at AX5 without throwing', () => {
    mockFontScale = 3.1;
    for (const chapter of learnChapters) {
      mockParams = { chapter: chapter.slug };
      const tree = render(<LearnChapter />);
      for (let i = 1; i < chapter.screens.length; i += 1)
        act(() => pressable(tree, 'learn-next').props.onPress());
      expect(textOf(host(tree, 'learn-heading')[0]!)).toBe('See it in OPAX');
    }
  });
});

describe('guide links', () => {
  // Every record the guide names, from its chapters and examples.json.
  const urls = [
    ...new Set([
      ...learnExamples.map((example) => example.url),
      ...learnChapters.flatMap((chapter) =>
        chapter.screens.flatMap((screen) =>
          screen.blocks.flatMap((block) =>
            block.kind === 'links'
              ? block.items.flatMap((item) => [
                  item.url,
                  ...item.note.flatMap((run) =>
                    typeof run !== 'string' && 'url' in run ? [run.url] : [],
                  ),
                ])
              : block.inline.flatMap((run) =>
                  typeof run !== 'string' && 'url' in run ? [run.url] : [],
                ),
          ),
        ),
      ),
    ]),
  ];

  test('each opens a native screen, except the six pages the app only has on the web', () => {
    // These open in the in-app browser sheet (openSource), as any web-only
    // OPAX page does. A native screen for one of them flips it here.
    const webOnly = [
      '/sitting',
      '/video/senate',
      '/estimates',
      '/money/receipts',
      '/subject/donor',
      '/register/state-bills',
    ];
    expect(urls.filter((url) => !guideRoute(url)).sort()).toEqual(
      [...webOnly].sort(),
    );
    // Site paths only: origins belong in build config (qa-static).
    for (const url of urls) expect(url).toMatch(/^\/[a-z]/);
  });

  test('a web-only page opens as a source on the app’s own origin', () => {
    openGuideLink('/sitting', 'Sitting weeks');
    expect(push).not.toHaveBeenCalled();
    expect(openSource).toHaveBeenCalledWith(
      new URL('/sitting', webOrigin).toString(),
      'Sitting weeks',
    );
  });
});

describe('entry points', () => {
  test('the Home card: title, one line, Open the guide, and a close button', async () => {
    const tree = render(<LearnCard />);
    expect(allText(tree)).toContain('How Parliament works');
    act(() => pressable(tree, 'today-learn-open').props.onPress());
    expect(push).toHaveBeenCalledWith({ pathname: '/learn' });
    const hide = pressable(tree, 'today-learn-hide');
    expect(hide.props.accessibilityLabel).toBe('Hide How Parliament works');
    await act(async () => {
      hide.props.onPress();
    });
    expect(learnSettingsSnapshot().card).toBe('hidden');
    expect(host(tree, 'today-learn')).toHaveLength(0);
  });

  test('an existing install never sees the card, and the block never remounts', () => {
    resetLearnSettingsForTests({ card: 'show' });
    const mounts = jest.fn();
    function Block() {
      useEffect(mounts, []);
      return <NativeText testID="block">Block</NativeText>;
    }
    const tree = render(
      <WithLearnCard>
        <Block />
      </WithLearnCard>,
    );
    expect(host(tree, 'today-learn')).toHaveLength(1);
    // Closing the card (or an existing install's `never`) leaves the block
    // alone in the same column: no card, no remount.
    act(() => resetLearnSettingsForTests({ card: 'never' }));
    act(() =>
      tree.update(
        <WithLearnCard>
          <Block />
        </WithLearnCard>,
      ),
    );
    expect(host(tree, 'today-learn')).toHaveLength(0);
    expect(host(tree, 'block')).toHaveLength(1);
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  test('More to explore has a How Parliament works row', () => {
    const tree = render(<MoreToExplore />);
    expect(allText(tree)).toContain('How Parliament works');
    expect(
      tree.root.findAll((node) => node.props.testID === 'today-learn-open')
        .length,
    ).toBeGreaterThan(0);
  });
});
