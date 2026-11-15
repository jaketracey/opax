import { router } from 'expo-router';
import { act, type ReactElement } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { resetTermClaimsForTests } from '../src/design/term';
import { chapterPlaceWords } from '../src/features/learn/copy';
import { learnChapters } from '../src/features/learn/glossary';
import LearnChapter from '../src/features/learn/LearnChapter';
import LearnHub from '../src/features/learn/LearnHub';
import {
  chapterProgress,
  keepLearnPlace,
  learnPlacesSnapshot,
  loadLearnPlaces,
  resetLearnPlacesForTests,
} from '../src/features/learn/place';
import { resetLearnSettingsForTests } from '../src/features/learn/settings';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: 1 }),
}));
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_dir: string, name: string) {
      this.name = name;
    }
    get exists() {
      return mockFiles.has(this.name);
    }
    async text() {
      return mockFiles.get(this.name) ?? '';
    }
    write(body: string) {
      mockFiles.set(this.name, body);
    }
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

const push = router.push as jest.Mock;
const replace = router.replace as jest.Mock;
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
const rowText = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  pressable(tree, id)
    .findAllByType(NativeText)
    .map((node) => textOf(node));
const settle = () => act(async () => {});

const bill = learnChapters.find((c) => c.slug === 'bill-to-act')!;
const total = bill.screens.length;
const first = learnChapters[0]!;
const final = learnChapters.at(-1)!;

beforeEach(() => {
  mockParams = {};
  mockFiles.clear();
  push.mockClear();
  replace.mockClear();
  resetTermClaimsForTests();
  resetLearnSettingsForTests({ card: 'hidden' });
  resetLearnPlacesForTests({});
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

describe('the hub keeps the reader’s place', () => {
  test('a chapter not opened says nothing and opens at its start', () => {
    const tree = render(<LearnHub />);
    const row = pressable(tree, 'learn-chapter-bill-to-act');
    expect(row.props.accessibilityLabel).toBe(`${bill.title}, ${bill.summary}`);
    expect(rowText(tree, 'learn-chapter-bill-to-act')).toEqual([
      bill.title,
      bill.summary,
    ]);
    act(() => row.props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: '/learn/[chapter]',
      params: { chapter: 'bill-to-act' },
    });
  });

  test('a chapter left part-way says where and opens there', () => {
    resetLearnPlacesForTests({ 'bill-to-act': { at: 4, read: false } });
    const tree = render(<LearnHub />);
    const row = pressable(tree, 'learn-chapter-bill-to-act');
    expect(rowText(tree, 'learn-chapter-bill-to-act')).toContain(
      `4 of ${total}`,
    );
    expect(row.props.accessibilityLabel).toBe(
      `${bill.title}, idea 4 of ${total}, ${bill.summary}`,
    );
    act(() => row.props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: '/learn/[chapter]',
      params: { chapter: 'bill-to-act', screen: '4' },
    });
    // Every other chapter is untouched.
    expect(
      pressable(tree, `learn-chapter-${first.slug}`).props.accessibilityLabel,
    ).toBe(`${first.title}, ${first.summary}`);
  });

  test('a chapter read to its last idea says Read and opens at its start', () => {
    resetLearnPlacesForTests({ 'bill-to-act': { at: 3, read: true } });
    const tree = render(<LearnHub />);
    const row = pressable(tree, 'learn-chapter-bill-to-act');
    expect(rowText(tree, 'learn-chapter-bill-to-act')).toContain('Read');
    expect(row.props.accessibilityLabel).toBe(
      `${bill.title}, Read, ${bill.summary}`,
    );
    act(() => row.props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: '/learn/[chapter]',
      params: { chapter: 'bill-to-act' },
    });
  });

  test('only the first idea seen is not a place worth naming', () => {
    resetLearnPlacesForTests({ 'bill-to-act': { at: 1, read: false } });
    const tree = render(<LearnHub />);
    expect(rowText(tree, 'learn-chapter-bill-to-act')).toEqual([
      bill.title,
      bill.summary,
    ]);
  });

  test('the hub redraws when a place is kept while it is open', async () => {
    const tree = render(<LearnHub />);
    await act(async () => {
      await keepLearnPlace('bill-to-act', 2, total);
    });
    expect(rowText(tree, 'learn-chapter-bill-to-act')).toContain(
      `2 of ${total}`,
    );
  });
});

describe('a chapter keeps the idea showing', () => {
  test('Next moves the place; the last idea marks the chapter read for good', async () => {
    mockParams = { chapter: 'bill-to-act', screen: String(total - 1) };
    const tree = render(<LearnChapter />);
    await settle();
    expect(learnPlacesSnapshot()['bill-to-act']).toEqual({
      at: total - 1,
      read: false,
    });
    act(() => pressable(tree, 'learn-next').props.onPress());
    await settle();
    expect(learnPlacesSnapshot()['bill-to-act']).toEqual({
      at: total,
      read: true,
    });
    // Going through it again moves the place and keeps it read.
    await act(async () => {
      await keepLearnPlace('bill-to-act', 1, total);
    });
    expect(learnPlacesSnapshot()['bill-to-act']).toEqual({ at: 1, read: true });
  });

  test('the place is written to the device and read back', async () => {
    await keepLearnPlace('bill-to-act', 5, total);
    expect([...mockFiles.keys()]).toEqual([
      expect.stringMatching(/^opax-learn-place-v1(\.b)?\.json$/),
    ]);
    resetLearnPlacesForTests(null);
    expect(learnPlacesSnapshot()).toEqual({});
    await expect(loadLearnPlaces()).resolves.toEqual({
      'bill-to-act': { at: 5, read: false },
    });
  });

  test('a place kept before the file is read keeps the file’s Read', async () => {
    await keepLearnPlace('bill-to-act', total, total);
    resetLearnPlacesForTests(null);
    await keepLearnPlace('bill-to-act', 2, total);
    expect(learnPlacesSnapshot()['bill-to-act']).toEqual({ at: 2, read: true });
  });

  test('a damaged file, or a place outside the chapter, keeps nothing', async () => {
    mockFiles.set(
      'opax-learn-place-v1.json',
      JSON.stringify({
        version: 1,
        generation: 1,
        chapters: { a: { at: 0 }, b: 'x', c: { at: 2.5 }, d: { at: 3 } },
      }),
    );
    resetLearnPlacesForTests(null);
    await expect(loadLearnPlaces()).resolves.toEqual({
      d: { at: 3, read: false },
    });
    await keepLearnPlace('bill-to-act', total + 1, total);
    await keepLearnPlace('bill-to-act', 0, total);
    expect(learnPlacesSnapshot()['bill-to-act']).toBeUndefined();
  });

  test('a place past the end of a shorter chapter is its last idea', () => {
    expect(chapterProgress({ at: 9, read: false }, 4)).toEqual({
      kind: 'part',
      at: 4,
    });
    expect(chapterProgress({ at: 9, read: true }, 4)).toEqual({ kind: 'read' });
    expect(chapterProgress(undefined, 4)).toBeNull();
    expect(chapterPlaceWords({ kind: 'part', at: 4 }, 4)).toEqual({
      value: '4 of 4',
      spoken: 'idea 4 of 4',
    });
  });
});

describe('a chapter the guide does not have', () => {
  test('says so, and one button opens the guide in its place', () => {
    mockParams = { chapter: 'no-such-chapter' };
    const tree = render(<LearnChapter />);
    const state = tree.root.find(
      (node) =>
        node.props.testID === 'learn-chapter-missing' && 'title' in node.props,
    );
    expect(state.props).toMatchObject({
      title: 'This chapter isn’t in the guide',
      body: 'The link may be old. The guide lists every chapter.',
    });
    expect(state.props.action.label).toBe('Open the guide');
    act(() => state.props.action.onPress());
    expect(replace).toHaveBeenCalledWith({ pathname: '/learn' });
    // Nothing is kept for a chapter that is not there.
    expect(learnPlacesSnapshot()).toEqual({});
  });
});

describe('the last idea points to the chapter that follows', () => {
  test('the next chapter in the guide’s order, taking this one’s place', () => {
    const at = learnChapters.indexOf(bill);
    const following = learnChapters[at + 1]!;
    mockParams = { chapter: 'bill-to-act', screen: String(total) };
    const tree = render(<LearnChapter />);
    const row = pressable(tree, 'learn-following-row');
    const drawn = host(tree, 'learn-following-row')[0]!;
    expect(drawn.props.accessibilityRole).toBe('button');
    expect(drawn.props.accessibilityLabel).toBe(
      `${following.title}, ${following.summary}`,
    );
    expect(
      host(tree, 'learn-following')[0]!
        .findAllByType(NativeText)
        .map((node) => textOf(node))
        .join('\n')
        .toLowerCase(),
    ).toContain('next chapter');
    act(() => row.props.onPress());
    expect(replace).toHaveBeenCalledWith({
      pathname: '/learn/[chapter]',
      params: { chapter: following.slug },
    });
    // Back to the guide is still the page's last button.
    expect(pressable(tree, 'learn-next').props.accessibilityLabel).toBe(
      'Back to the guide',
    );
  });

  test('no row before the last idea, and none after the last chapter', () => {
    mockParams = { chapter: 'bill-to-act' };
    expect(host(render(<LearnChapter />), 'learn-following')).toHaveLength(0);
    mockParams = {
      chapter: final.slug,
      screen: String(final.screens.length),
    };
    expect(host(render(<LearnChapter />), 'learn-following')).toHaveLength(0);
  });

  test('a reused route starts the new chapter at its own first idea', () => {
    mockParams = { chapter: 'bill-to-act', screen: String(total) };
    const tree = render(<LearnChapter />);
    const following = learnChapters[learnChapters.indexOf(bill) + 1]!;
    mockParams = { chapter: following.slug };
    act(() => tree.update(<LearnChapter />));
    expect(textOf(host(tree, 'learn-kicker')[0]!)).toBe(
      `${following.title} · 1 of ${following.screens.length}`,
    );
  });
});
