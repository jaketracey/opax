import { router } from 'expo-router';
import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { StatTile } from '../src/design/record';
import { DivisionRow } from '../src/design/rows';
import { resetTermClaimsForTests, useTermWords } from '../src/design/term';
import { Text } from '../src/design/text';
import { AskSuggestionRow } from '../src/features/ask/AskRows';
import { starterList as starters } from '../src/features/ask/starters';
import { PartyVotes } from '../src/features/bills/parts';
import { resetLearnSettingsForTests } from '../src/features/learn/settings';
import {
  chamberTerm,
  roleTerm,
  sittingTerm,
  stageTerm,
  starterTerm,
} from '../src/features/learn/term-map';
import { ProfileHeader } from '../src/features/people/ProfileHeader';
import { SittingText } from '../src/features/today/SittingLine';

jest.mock('../src/api/runtime', () => ({}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: 1 }),
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
    useLocalSearchParams: () => ({}),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const push = router.push as jest.Mock;
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}
const marked = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) =>
      node.props.testID === `term-inline-${id}` &&
      typeof node.type === 'string',
  );
/** The host element with the id that carries accessibility actions. */
const actionsOn = (tree: TestRenderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    (node) =>
      node.props.testID === testID &&
      typeof node.type === 'string' &&
      node.props.accessibilityActions,
  )[0]!;
const openedTerm = (id: string) =>
  expect(push).toHaveBeenCalledWith({ pathname: '/term', params: { id } });

beforeEach(() => {
  push.mockClear();
  resetTermClaimsForTests();
  resetLearnSettingsForTests({});
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

describe('the term map', () => {
  test('stages', () => {
    expect(stageTerm('Second reading · House · 19 Aug')).toEqual({
      term: 'second-reading',
    });
    expect(stageTerm('Third reading')).toEqual({ term: 'third-reading' });
    expect(stageTerm('Consideration in detail')).toEqual({
      term: 'consideration-in-detail',
    });
    expect(stageTerm('Amendment')).toBeNull();
  });
  test('chambers', () => {
    expect(
      chamberTerm('Introduced 17 Sep 2026 · House of Representatives'),
    ).toEqual({ term: 'house-of-representatives' });
    expect(chamberTerm('Introduced 3 Jul 2024 · Senate')).toEqual({
      term: 'senate',
    });
    expect(chamberTerm('Exposure draft, not yet introduced')).toBeNull();
  });
  test('roles', () => {
    expect(roleTerm('Prime Minister')).toEqual({ term: 'prime-minister' });
    expect(roleTerm('Minister for Health and Ageing and 1 more')).toEqual({
      term: 'minister',
      phrase: 'Minister',
    });
    expect(roleTerm('Shadow Minister for Defence')).toEqual({
      term: 'shadow-minister',
      phrase: 'Shadow Minister',
    });
    expect(roleTerm('Senator for Victoria')).toEqual({
      term: 'senator',
      phrase: 'Senator',
    });
    expect(roleTerm('Member for Grayndler')).toEqual({
      term: 'member-of-parliament',
      phrase: 'Member',
    });
    expect(roleTerm('Former Member for Warringah')).toBeNull();
  });
  test('the sitting line', () => {
    expect(sittingTerm('The Senate is sitting today')).toEqual({
      term: 'senate',
    });
    expect(sittingTerm('The House next sits Monday 16 November')).toEqual({
      term: 'house-of-representatives',
      phrase: 'House',
    });
    expect(sittingTerm('Parliament is sitting today')).toEqual({
      term: 'sitting-week',
      phrase: 'sitting',
    });
  });
  test('Ask starters: only words the glossary explains', () => {
    expect(starterTerm('What gifts have senators declared this year?')).toEqual(
      { term: 'senator' },
    );
    expect(starterTerm('Which bills became law most recently?')).toEqual({
      term: 'bill',
    });
    expect(starterTerm('How much is a federal backbencher paid?')).toBeNull();
    // Every starter maps to a real glossary term or to nothing.
    for (const question of starters) starterTerm(question);
  });
});

describe('wired places', () => {
  test('useTermWords marks the words inside an existing Text', () => {
    function Line({ term }: { term: 'senate' | null }) {
      return (
        <Text testID="line">{useTermWords('The Senate next sits', term)}</Text>
      );
    }
    const tree = render(<Line term="senate" />);
    expect(marked(tree, 'senate')).toHaveLength(1);
    // Unmarked, the Text keeps a plain string (helpers and labels read it).
    const plain = render(<Line term={null} />);
    expect(
      plain.root.findAll(
        (node) => node.props.testID === 'line' && node.type === Text,
      )[0]!.props.children,
    ).toBe('The Senate next sits');
  });

  test('a profile’s divisions tile: the word, and the tile’s action', () => {
    const tree = render(
      <StatTile
        value="2,929"
        label="divisions"
        term="division"
        onPress={() => {}}
        testID="tile"
      />,
    );
    expect(marked(tree, 'division')).toHaveLength(1);
    const tile = actionsOn(tree, 'tile');
    expect(tile.props.accessibilityActions).toEqual([
      { name: 'explain-division', label: 'Explain division' },
    ]);
    act(() =>
      tile.props.onAccessibilityAction({
        nativeEvent: { actionName: 'explain-division' },
      }),
    );
    openedTerm('division');
  });

  test('a division row: the stage in its meta, the row’s action beside its own', () => {
    const tree = render(
      <DivisionRow
        title="A bill"
        meta="Second reading · House · 19 Aug"
        metaTerm={stageTerm('Second reading')}
        outcome="Agreed to"
        ayes={82}
        noes={54}
        countsStyle="ayesNoes"
        testID="vote"
      />,
    );
    expect(marked(tree, 'second-reading')).toHaveLength(1);
    const row = actionsOn(tree, 'vote');
    expect(row.props.accessibilityActions).toContainEqual({
      name: 'explain-second-reading',
      label: 'Explain second reading',
    });
    act(() =>
      row.props.onAccessibilityAction({
        nativeEvent: { actionName: 'explain-second-reading' },
      }),
    );
    openedTerm('second-reading');
  });

  test('the profile role line', () => {
    const tree = render(
      <ProfileHeader
        name="Test Person"
        role="Minister for Testing"
        testID="profile"
      />,
    );
    expect(marked(tree, 'minister')).toHaveLength(1);
  });

  test('a vote’s crossbench bloc and its pairs', () => {
    const tree = render(
      <PartyVotes
        splits={[
          { party: 'Labor', label: 'Labor', ayes: 70, noes: 0 },
          { party: 'Independent', label: 'Independent', ayes: 2, noes: 8 },
        ]}
        paired={3}
        recorded
        testID="vote-parties"
      />,
    );
    expect(marked(tree, 'crossbench')).toHaveLength(1);
    expect(marked(tree, 'pair')).toHaveLength(1);
  });

  test('the sitting line keeps its button and gains the term’s action', () => {
    const tree = render(
      <SittingText
        text="The Senate is sitting today"
        details={{ citation: 'Sitting calendar', originals: [] } as never}
      />,
    );
    expect(marked(tree, 'senate')).toHaveLength(1);
    const line = actionsOn(tree, 'today-sitting');
    expect(line.props.accessibilityLabel).toBe('The Senate is sitting today');
    expect(line.props.accessibilityActions).toEqual([
      { name: 'explain-senate', label: 'Explain Senate' },
    ]);
  });

  test('an Ask starter keeps its question as its name', () => {
    const tree = render(
      <AskSuggestionRow
        question="What gifts have senators declared this year?"
        variant="send"
        onPress={() => {}}
        term={starterTerm('What gifts have senators declared this year?')}
        testID="starter"
      />,
    );
    expect(marked(tree, 'senator')).toHaveLength(1);
    const row = actionsOn(tree, 'starter');
    expect(row.props.accessibilityLabel).toBe(
      'What gifts have senators declared this year?',
    );
    expect(row.props.accessibilityActions).toEqual([
      { name: 'explain-senator', label: 'Explain senator' },
    ]);
  });

  test('with underlines off nothing is marked', () => {
    resetLearnSettingsForTests({ underline: false });
    const tree = render(
      <StatTile value="12" label="divisions" term="division" testID="tile" />,
    );
    expect(marked(tree, 'division')).toHaveLength(0);
  });
});
