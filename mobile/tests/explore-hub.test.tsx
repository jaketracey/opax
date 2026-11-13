import { RouteOptions } from '../src/navigation/preview';
/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation is an inert host in component tests. */
import { router } from 'expo-router';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { apiClient } from '../src/api/runtime';
import ExploreHub, { tools } from '../src/features/explore/Hub';
import { ExploreChrome, exploreMenu } from '../src/features/explore/parts';
import { quizSession } from '../src/features/explore/quiz-session';
import { frontPageDeck, quizRounds } from '../src/features/explore/quiz/data';
import { openOnWeb } from '../src/navigation/external';
import { exploreWebPath, hubInStack } from '../src/navigation/routes/explore';
import { copyRecordLink, shareRecord } from '../src/navigation/share';
import { exploreToolTitle } from '../src/navigation/stack/explore';
import { menuTitle } from '../src/design/menu-title';

let mockState: { routes: { name: string }[] } = { routes: [] };
jest.mock('expo-router', () => {
  const React = require('react');
  const host = (name: string) =>
    Object.assign(
      (props: object): unknown => React.createElement(name, props),
      { displayName: name },
    );
  return {
    Link: Object.assign(host('Link'), {
      Trigger: host('LinkTrigger'),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Redirect: host('Redirect'),
    Stack: { Screen: host('StackScreen'), Toolbar: host('Toolbar') },
    useSegments: () => ['(tabs)', '(today)'],
    useNavigation: () => ({ getState: () => mockState, setOptions: jest.fn() }),
    useLocalSearchParams: jest.fn(() => ({})),
    router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  };
});
jest.mock('../src/api/runtime', () => ({
  apiClient: { getForAction: jest.fn(), get: jest.fn() },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/navigation/share', () => ({
  trackShare: jest.fn(),
  canShare: true,
  shareRecord: jest.fn(),
  copyRecordLink: jest.fn(),
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
}));

const render = (element: React.ReactElement) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};
const texts = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string);

afterEach(() => {
  act(() => quizSession.clear());
  jest.clearAllMocks();
});

test('mounting and re-rendering the Explore hub never calls a paid or static reader', () => {
  const renderer = render(<ExploreHub />);
  act(() => renderer.update(<ExploreHub />));
  expect(apiClient.getForAction).not.toHaveBeenCalled();
  expect(apiClient.get).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('the hub is five tiles in a fixed order, the quiz leading, no ballot and no lede', () => {
  expect(tools.map((tool) => tool.game)).toEqual([
    'quiz',
    'tm',
    'tide',
    'matrix',
    'wd',
  ]);
  const renderer = render(<ExploreHub />);
  const grid = renderer.root.findByProps({ testID: 'explore-tools' });
  expect(grid.props.lead).toBe(true);
  const tiles = renderer.root.findAll(
    (node) =>
      typeof node.props.testID === 'string' &&
      /^explore-(quiz|tm|tide|matrix|wd)$/.test(node.props.testID) &&
      typeof node.props.title === 'string',
  );
  expect(tiles.map((tile) => tile.props.title)).toEqual([
    'The record quiz',
    'Time machine',
    'The tide',
    'Who owns which debate',
    'Words per dollar',
  ]);
  for (const tile of tiles) {
    // Years name a span; no line carries a count.
    expect(tile.props.line.replace(/\b(19|20)\d{2}\b/g, '')).not.toMatch(/\d/);
    expect(tile.props.line).not.toMatch(/labelled|ballot/i);
    expect(tile.props.line).not.toBe(tile.props.title);
  }
  const shown = texts(renderer);
  expect(shown).toContain('Quizzes and tools');
  expect(shown).not.toContain('Play with the parliamentary record');
  expect(JSON.stringify(shown)).not.toMatch(/ballot/i);
  expect(tiles[0]!.props.href).toEqual({
    pathname: '/explore/[tool]',
    params: { tool: 'quiz' },
  });
  act(() => renderer.unmount());
});

test('with a round left at question 4, the quiz tile resumes it', () => {
  act(() => {
    const round = quizSession.begin('mixed', quizRounds.mixed[0]!, 0);
    quizSession.update({ ...round, index: 3 });
  });
  const renderer = render(<ExploreHub />);
  const quiz = renderer.root.find(
    (node) =>
      node.props.testID === 'explore-quiz' &&
      typeof node.props.line === 'string',
  );
  expect(quiz.props.line).toBe('Resume question 4 of 8');
  expect(quiz.props.href.params).toEqual({ tool: 'quiz', resume: '1' });
  act(() => quizSession.clear());
  expect(
    renderer.root.find(
      (node) =>
        node.props.testID === 'explore-quiz' &&
        typeof node.props.line === 'string',
    ).props.line,
  ).toBe('Eight questions on donations and debates');
  act(() => renderer.unmount());
});

test('every Explore screen gets Share and one menu: Copy link, then Open on opax.com.au', () => {
  const renderer = render(<ExploreChrome game="quiz" params={{ q: 'q1' }} />);
  const options = renderer.root.findByType(RouteOptions).props.options;
  expect(options.title).toBeUndefined();
  const items = options.unstable_headerRightItems();
  expect(items.map((item: { label: string }) => item.label)).toEqual([
    'Share',
    'More',
  ]);
  items[0].onPress();
  expect(shareRecord).toHaveBeenCalledWith({
    path: '/explore?game=quiz&q=q1',
    title: 'The record quiz',
  });
  expect(
    items[1].menu.items.map((item: { label: string }) => item.label),
  ).toEqual(['Copy link', menuTitle('Open on opax.com.au')]);
  items[1].menu.items[0].onPress();
  expect(copyRecordLink).toHaveBeenCalledWith('/explore?game=quiz&q=q1');
  items[1].menu.items[1].onPress();
  expect(openOnWeb).toHaveBeenCalledWith(
    '/explore?game=quiz&q=q1',
    'The record quiz',
  );
  act(() => renderer.unmount());
});

test('a sort adds a Sort by submenu first, above a divider', () => {
  const onChange = jest.fn();
  const menu = exploreMenu({
    name: 'The tide',
    path: exploreWebPath('tide'),
    sort: {
      value: 'change',
      options: [
        { value: 'change', label: 'Biggest change' },
        { value: 'az', label: 'A to Z' },
      ],
      onChange,
    },
  });
  expect(Platform.OS).toBe('ios');
  expect(menu.map((item) => item.title)).toEqual(['Sort by', '']);
  const sortBy = menu[0] as Extract<(typeof menu)[number], { items: unknown }>;
  expect(sortBy.items.map((item) => [item.title, item.symbol])).toEqual([
    ['Biggest change', 'checkmark'],
    ['A to Z', undefined],
  ]);
  (sortBy.items[1] as { onPress: () => void }).onPress();
  expect(onChange).toHaveBeenCalledWith('az');
});

test('the quiz stack title says "Today\'s question" only for a question in the front-page deck', () => {
  const id = frontPageDeck[0]!.id;
  expect(exploreToolTitle({ tool: 'quiz', q: id })).toBe("Today's question");
  expect(exploreToolTitle({ tool: 'quiz', q: 'qnot-a-question' })).toBe(
    'The record quiz',
  );
  expect(exploreToolTitle({ tool: 'quiz', q: '' })).toBe('The record quiz');
  expect(exploreToolTitle({ tool: 'quiz' })).toBe('The record quiz');
  expect(exploreToolTitle({ tool: 'tide', q: id })).toBe('The tide');
});

describe('unknown tools land on the hub', () => {
  const ExploreTool = () =>
    require('../src/app/(tabs)/(today,your-mp,bills,search,ask)/explore/[tool]')
      .default;
  const { useLocalSearchParams } = jest.requireMock('expo-router') as {
    useLocalSearchParams: jest.Mock;
  };
  test.each(['ballot', 'anything', undefined])(
    'without a hub in the stack, %s redirects to it',
    (tool) => {
      mockState = { routes: [{ name: 'index' }, { name: 'explore/[tool]' }] };
      useLocalSearchParams.mockReturnValue({ tool });
      const Tool = ExploreTool();
      const renderer = render(<Tool />);
      expect(renderer.root.findByType('Redirect' as never).props.href).toEqual({
        pathname: '/explore',
      });
      expect(router.dismissTo).not.toHaveBeenCalled();
      act(() => renderer.unmount());
    },
  );
  test('with the hub already open, it returns to that hub', () => {
    mockState = {
      routes: [
        { name: 'index' },
        { name: 'explore/index' },
        { name: 'explore/[tool]' },
      ],
    };
    useLocalSearchParams.mockReturnValue({ tool: 'ballot' });
    const Tool = ExploreTool();
    const renderer = render(<Tool />);
    expect(renderer.root.findAllByType('Redirect' as never)).toHaveLength(0);
    expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/explore' });
    act(() => renderer.unmount());
  });
  test('the stack check reads route names', () => {
    expect(hubInStack(undefined)).toBe(false);
    expect(hubInStack({ routes: [{ name: 'explore/index' }] })).toBe(true);
  });
});

test('no string "This Explore tool is not available." remains in the app', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(resolve(__dirname, '../src'));
  for (const file of files)
    expect(readFileSync(file, 'utf8')).not.toContain(
      'This Explore tool is not available',
    );
});
