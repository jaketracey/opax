import { RouteOptions } from '../src/navigation/preview';
import { exploreScreens } from '../src/navigation/stack/explore';
/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation is an inert host in component tests. */
import { Picker, Slider } from '@expo/ui/swift-ui';
import { router } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { useAccessibilitySize } from '../src/design/accessibility';
import { Portrait } from '../src/design/people';
import Quiz from '../src/features/explore/Quiz';
import {
  formatGuess,
  type Question,
  type QuizRecord,
} from '../src/features/explore/quiz-model';
import { quizSession } from '../src/features/explore/quiz-session';
import { quizStore } from '../src/features/explore/quiz-store';
import { choicePortrait } from '../src/features/explore/quiz/ChoiceList';
import { frontPageDeck, quizRounds } from '../src/features/explore/quiz/data';

let mockRecord: QuizRecord | null = null;
jest.mock('../src/features/explore/quiz-store', () => ({
  quizStore: {
    read: jest.fn(async () => mockRecord),
    save: jest.fn(async (value: QuizRecord) => {
      mockRecord = value;
    }),
  },
}));
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
    Stack: {
      Screen: host('StackScreen'),
      Toolbar: Object.assign(host('Toolbar'), { View: host('ToolbarView') }),
    },
    useSegments: () => ['(tabs)', '(today)'],
    useNavigation: () => ({
      getState: () => ({ routes: [] }),
      setOptions: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    router: {
      push: jest.fn(),
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      back: jest.fn(),
    },
  };
});
jest.mock('../src/api/runtime', () => ({
  apiClient: { getForAction: jest.fn(), get: jest.fn() },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/navigation/share', () => ({
  canShare: true,
  shareRecord: jest.fn(),
  copyRecordLink: jest.fn(),
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useAccessibilitySize: jest.fn(() => false),
}));

let renderer: TestRenderer.ReactTestRenderer | null = null;
async function mount(element: React.ReactElement) {
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}
const root = () => renderer!.root;
/** The outermost element with this test ID: the composite with its props. */
const byID = (id: string) => {
  const found = root().findAll((node) => node.props.testID === id);
  if (!found.length) throw new Error(`No ${id}`);
  return found[0]!;
};
/** The first element with this test ID that carries `prop`. */
const withProp = (id: string, prop: string) =>
  root().find(
    (node) => node.props.testID === id && node.props[prop] !== undefined,
  );
const has = (id: string) =>
  root().findAll((node) => node.props.testID === id).length > 0;
const texts = () =>
  root()
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string);
const allText = () =>
  root()
    .findAll((node) => node.props.children !== undefined)
    .flatMap((node) =>
      ([] as unknown[])
        .concat(node.props.children)
        .filter((child): child is string => typeof child === 'string'),
    )
    .join(' | ');
const press = async (id: string) => {
  const node = withProp(id, 'onPress');
  await act(async () => {
    node.props.onPress();
  });
};
const options = () => root().findAllByType(RouteOptions).at(-1)!.props.options;
/** The pinned footer above the tab bar (iOS below AX1). */
const footer = () =>
  root().findAll(
    (node) =>
      typeof node.type === 'string' && node.props.testID === 'quiz-footer',
  );
const toolbars = () => root().findAllByType('Toolbar' as never);

/** Answers a question correctly, through its own control. */
async function answer(q: Question) {
  if (q.kind === 'order') {
    for (const label of q.answer as string[])
      await press(
        `quiz-answer-${q.options!.findIndex((o) => o.label === label)}`,
      );
  } else if (q.kind === 'slider' || q.kind === 'year') {
    await press('quiz-guess-value');
    const field = root().find(
      (node) =>
        node.props.testID === 'quiz-number' &&
        typeof node.props.onChangeText === 'function',
    );
    await act(async () => field.props.onChangeText(String(q.answer)));
    await press('quiz-number-done');
  } else {
    await press(`quiz-answer-${q.options!.findIndex((o) => o.correct)}`);
  }
}

beforeEach(() => {
  mockRecord = null;
  jest.spyOn(Math, 'random').mockReturnValue(0);
  (useAccessibilitySize as jest.Mock).mockReturnValue(false);
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = null;
  act(() => quizSession.clear());
  jest.restoreAllMocks();
});

test('the intro promises sources, explains the deck, and hides past play on first run', async () => {
  await mount(<Quiz />);
  const shown = texts();
  expect(shown).toContain('The record quiz');
  expect(shown).toContain(
    'Eight questions from the public record, each with its source.',
  );
  expect(shown).toContain('Four from each');
  expect(allText()).not.toMatch(/Choose a deck|Your record|Best streak|Deck/);
  expect(has('quiz-best')).toBe(false);
  expect(byID('quiz-start').props).toMatchObject({
    label: 'Start',
    variant: 'primary',
    fullWidth: true,
  });
  expect(byID('quiz-start').props.disabled).toBeFalsy();
  const picker = root().findByType(Picker);
  await act(async () => picker.props.onSelectionChange('money'));
  expect(texts()).toContain('Money to parties, and who gives it');
  await act(async () => picker.props.onSelectionChange('words'));
  expect(texts()).toContain('What parliament talks about, and who speaks');
  expect(byID('quiz-as-at').props.citation).toBe('OPAX quiz questions');
  expect(options().title).toBeUndefined();
});

test('past play shows the best streak and the last round, with no header', async () => {
  mockRecord = { version: 1, bestStreak: 4, lastPoints: 640, lastCorrect: 6 };
  await mount(<Quiz />);
  expect(byID('quiz-past').props.tiles).toEqual([
    { value: '4', label: 'Best streak', testID: 'quiz-best' },
    { value: '6 of 8', label: 'Last round', testID: 'quiz-last' },
  ]);
});

test('starting a round keeps the named Back button when the question installs its bar', async () => {
  const route = { key: 'quiz', name: 'explore/[tool]' };
  const navigation = {
    setOptions: jest.fn(),
    isFocused: () => true,
    addListener: () => () => {},
    getState: () => ({
      routes: [
        { key: 'today', name: 'index' },
        { key: 'hub', name: 'explore/index' },
        route,
      ],
    }),
  };
  const registration = exploreScreens().find(
    (screen) => screen.props.name === 'explore/[tool]',
  )!;
  const initial = registration.props.options({ route, navigation });
  expect(initial).toMatchObject({
    headerBackTitle: 'Tools',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
  await mount(
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={route}>
        <Quiz />
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>,
  );
  await press('quiz-start');
  expect(options()).toMatchObject({
    title: 'The record quiz',
    headerTitle: 'The record quiz',
  });
  expect(options()).not.toHaveProperty('headerBackTitle');
  for (const [delta] of navigation.setOptions.mock.calls)
    expect(Object.keys(delta).filter((key) => key.startsWith('headerBack'))).toEqual([]);
});

test('a full round: typed guesses exact, every answer then its source, and the result with eight reviews', async () => {
  await mount(<Quiz />);
  await press('quiz-start');
  const round = quizRounds.mixed[0]!;
  expect(options().title).toBe('The record quiz');
  for (const [i, q] of round.entries()) {
    expect(byID('quiz-question').props.accessibilityLabel).toBe(q.prompt);
    expect(byID('quiz-progress').props.accessibilityLabel).toMatch(
      new RegExp(`^Question ${i + 1} of 8\\. `),
    );
    expect(byID('quiz-confirm').props.disabled).toBe(true);
    // Below AX1 the footer is pinned above the tab bar, never a bottom
    // toolbar the floating tab bar would cover (explore-04).
    expect(toolbars()).toHaveLength(0);
    expect(footer()).toHaveLength(1);
    expect(
      footer()[0]!.findAll(
        (node) =>
          node.props.testID === 'quiz-confirm' &&
          typeof node.props.onPress === 'function',
      ).length,
    ).toBeGreaterThan(0);
    if (q.kind === 'slider' || q.kind === 'year') {
      await press('quiz-guess-value');
      expect(footer()).toHaveLength(0);
      const field = root().find(
        (node) =>
          node.props.testID === 'quiz-number' &&
          typeof node.props.onChangeText === 'function',
      );
      await act(async () => field.props.onChangeText('1'));
      await press('quiz-number-done');
      expect(allText()).toMatch(/Enter a (figure|year|number) from/);
      await act(async () => field.props.onChangeText(String(q.answer)));
      await press('quiz-number-done');
      expect(footer()).toHaveLength(1);
      expect(byID('quiz-guess-value').props.accessibilityLabel).toBe(
        `Your guess, ${formatGuess(q, Number(q.answer))}`,
      );
      if (q.format === 'money')
        expect(byID('quiz-guess-value').props.accessibilityLabel).toBe(
          'Your guess, $929,297',
        );
      expect(
        root()
          .findByType(Slider)
          .props.modifiers.map((m: { $type?: string; type?: string }) => m)
          .length,
      ).toBeGreaterThan(0);
    } else await answer(q);
    expect(byID('quiz-confirm').props.disabled).toBe(false);
    await press('quiz-confirm');
    expect(has('quiz-confirm')).toBe(false);
    const source = withProp(`quiz-source-${i}`, 'citation');
    expect(source.props.asOf).toBe('2026-09-21');
    expect(['AEC annual returns', 'OPAX topics', 'OPAX']).toContain(
      source.props.citation,
    );
    expect(byID('quiz-fact').props.children).toBe(q.fact);
    expect(byID('quiz-next').props.label).toBe(
      i === 7 ? 'See result' : 'Next question',
    );
    await press('quiz-next');
  }
  expect(byID('quiz-result').props.children).toBe(
    '8 of 8 right · best streak 8',
  );
  expect(byID('quiz-rank').props.children).toBe('Speaker of the House');
  expect(allText()).not.toMatch(/Streak saved|Copy result|\u2014/);
  for (let i = 0; i < 8; i++) expect(has(`quiz-review-${i}`)).toBe(true);
  expect(byID('quiz-again').props.label).toBe('Play again');
  expect(has('quiz-decks')).toBe(true);
  expect(has('quiz-save')).toBe(false);
  expect(quizStore.save).toHaveBeenCalledWith(
    expect.objectContaining({ bestStreak: 8, lastCorrect: 8 }),
  );
  expect(quizSession.inProgress()).toBeNull();
  // The review shows the guess as typed, never a second answer for a figure.
  await press('quiz-review-0');
  expect(allText()).toContain('$929,297');
  expect(allText()).not.toMatch(/Answer: \$/);
  const share = options().unstable_headerRightItems()[0];
  const { shareRecord } = jest.requireMock('../src/navigation/share');
  share.onPress();
  expect(shareRecord).toHaveBeenCalledWith({
    path: '/explore?game=quiz',
    text: expect.stringMatching(
      /^I scored [\d,]+ in The record quiz on OPAX: 8 of 8 right\.$/,
    ),
    title: expect.stringMatching(
      /^I scored [\d,]+ in The record quiz on OPAX: 8 of 8 right\.$/,
    ),
  });
});

test('the reveal keeps the reader’s own answer and marks the right one, by word', async () => {
  await mount(<Quiz />);
  await press('quiz-start');
  const q = quizRounds.mixed[0]![0]!;
  await answer(q);
  await press('quiz-confirm');
  await press('quiz-next');
  const second = quizRounds.mixed[0]![1]!;
  const wrong = second.options!.findIndex((o) => !o.correct);
  await press(`quiz-answer-${wrong}`);
  await press('quiz-confirm');
  expect(
    withProp(`quiz-answer-${wrong}`, 'accessibilityLabel').props
      .accessibilityLabel,
  ).toMatch(/Your answer$/);
  expect(
    withProp(
      `quiz-answer-${second.options!.findIndex((o) => o.correct)}`,
      'accessibilityLabel',
    ).props.accessibilityLabel,
  ).toMatch(/Correct answer$/);
  expect(byID('quiz-grade').props.children).toBe('Not this time');
  expect(byID('quiz-points').props.children).toBe('+0 points');
});

test('leaving mid-round keeps it for this session, and the intro offers to resume', async () => {
  await mount(<Quiz />);
  await press('quiz-start');
  await answer(quizRounds.mixed[0]![0]!);
  await press('quiz-confirm');
  await press('quiz-next');
  act(() => renderer!.unmount());
  expect(quizSession.inProgress()).toEqual({ index: 1 });
  await mount(<Quiz />);
  expect(byID('quiz-resume').props.label).toBe('Resume question 2 of 8');
  expect(byID('quiz-start').props.label).toBe('Start a new round');
  await press('quiz-resume');
  expect(byID('quiz-question').props.accessibilityLabel).toBe(
    quizRounds.mixed[0]![1]!.prompt,
  );
  act(() => renderer!.unmount());
  await mount(<Quiz resume />);
  expect(byID('quiz-progress').props.accessibilityLabel).toMatch(
    /^Question 2 of 8\./,
  );
});

test("Today's question opens on that question and never touches a round in progress", async () => {
  const q = frontPageDeck.find((item) => item.kind === 'tf')!;
  await act(async () => {
    const round = quizSession.begin('words', quizRounds.words[0]!, 0);
    quizSession.update({ ...round, index: 3 });
  });
  const before = quizSession.current();
  await mount(<Quiz q={q.id} />);
  expect(options().title).toBe("Today's question");
  expect(has('quiz-progress')).toBe(false);
  expect(byID('quiz-question').props.accessibilityLabel).toBe(q.prompt);
  await answer(q);
  await press('quiz-confirm');
  expect(has('quiz-points')).toBe(false);
  expect(byID('quiz-resume').props.label).toBe('Resume question 4 of 8');
  expect(byID('quiz-start').props.label).toBe('Start a new round');
  expect(quizSession.current()).toBe(before);
  const menu = options().unstable_headerRightItems()[1].menu.items;
  const { copyRecordLink } = jest.requireMock('../src/navigation/share');
  menu[0].onPress();
  expect(copyRecordLink).toHaveBeenCalledWith(`/explore?game=quiz&q=${q.id}`);
});

test("Today's question with no round offers a Mixed round; an unknown id opens the intro", async () => {
  const q = frontPageDeck[0]!;
  await mount(<Quiz q={q.id} />);
  await answer(q);
  await press('quiz-confirm');
  expect(byID('quiz-play').props.label).toBe('Play a round');
  await press('quiz-play');
  expect(quizSession.current()?.deck).toBe('mixed');
  expect(has('quiz-progress')).toBe(true);
  act(() => renderer!.unmount());
  act(() => quizSession.clear());
  await mount(<Quiz q="q-unknown" />);
  expect(has('quiz-start')).toBe(true);
});

test('a speaker link in a source sheet drafts in Ask and never sends', async () => {
  const q = frontPageDeck.find((item) => item.template === 'words-year-voice')!;
  await mount(<Quiz q={q.id} />);
  await answer(q);
  await press('quiz-confirm');
  const source = withProp('quiz-source-0', 'citation');
  let extra!: TestRenderer.ReactTestRenderer;
  act(() => {
    extra = TestRenderer.create(source.props.extra);
  });
  const row = extra.root.findAll(
    (node) =>
      node.props.testID === 'quiz-source-0-sheet-ask' &&
      typeof node.props.onPress === 'function',
  )[0]!;
  expect(row.props.title).toMatch(/^Ask about .+ in \d{4}$/);
  act(() => row.props.onPress());
  expect(router.back).toHaveBeenCalled();
  expect(router.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/ask',
      params: expect.objectContaining({
        question: expect.stringMatching(
          /^What did .+ say in parliament in \d{4}\?$/,
        ),
      }),
    }),
  );
  expect(router.navigate.mock.calls[0][0].params).not.toHaveProperty('send');
  act(() => extra.unmount());
});

test('at accessibility sizes the footer flows after the content and the typed guess stays', async () => {
  (useAccessibilitySize as jest.Mock).mockReturnValue(true);
  await mount(<Quiz />);
  await press('quiz-start');
  expect(footer()).toHaveLength(0);
  expect(toolbars()).toHaveLength(0);
  expect(has('quiz-confirm')).toBe(true);
  expect(has('quiz-guess-value')).toBe(true);
  await answer(quizRounds.mixed[0]![0]!);
  await press('quiz-confirm');
  expect(has('quiz-next')).toBe(true);
});

test('a failed save says so, once, with a way to try again', async () => {
  (quizStore.save as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  await mount(<Quiz />);
  await press('quiz-start');
  for (const q of quizRounds.mixed[0]!) {
    await answer(q);
    await press('quiz-confirm');
    await press('quiz-next');
  }
  const failure = byID('quiz-save');
  expect(failure.props.message).toBe("Your best streak couldn't be saved.");
  await act(async () => failure.props.onRetry());
  expect(has('quiz-save')).toBe(false);
});

export type { ReactTestInstance };

test('a portrait choice insets its text by the size the portrait draws', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Portrait size={choicePortrait.size} name="Julia Gillard" />,
    );
  });
  const sizes = renderer.root
    .findAll((node) => typeof node.props.style === 'object')
    .flatMap((node) => [node.props.style].flat())
    .filter(
      (style): style is { width: number } =>
        !!style && typeof style.width === 'number',
    )
    .map((style) => style.width);
  expect(sizes.length).toBeGreaterThan(0);
  expect(new Set(sizes)).toEqual(new Set([choicePortrait.drawn]));
  act(() => renderer.unmount());
});
