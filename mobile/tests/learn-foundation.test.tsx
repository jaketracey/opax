import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { router } from 'expo-router';
import { act, type ReactElement } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Text } from '../src/design/text';
import {
  findTermWords,
  resetTermClaimsForTests,
  Term,
  termA11y,
  TermText,
} from '../src/design/term';
import AccountTerms, {
  AccountTermsRow,
} from '../src/features/learn/AccountLearn';
import {
  glossaryTerms,
  learnChapters,
  learnExamples,
  learnSource,
  termIds,
} from '../src/features/learn/content.generated';
import {
  glossaryTerm,
  isTermId,
  termsAtoZ,
  termTitle,
} from '../src/features/learn/glossary';
import GlossaryScreen, {
  glossaryLetters,
} from '../src/features/learn/GlossaryScreen';
import { openTerm } from '../src/features/learn/open-term';
import {
  hideLearnCard,
  learnSettingsSnapshot,
  loadLearnSettings,
  resetLearnSettingsForTests,
  setExplainTerms,
  setUnderlineTerms,
} from '../src/features/learn/settings';
import TermSheet from '../src/features/learn/TermSheet';
import TermTip from '../src/features/learn/TermTip';
import { setSheetSegments } from '../src/navigation/sheets';

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
const mockDisk = new Map<string, string>();
let mockTourSeen = false;
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
  },
}));
jest.mock('../src/onboarding/state', () => ({
  tourSeen: async () => mockTourSeen,
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => {}),
}));

const push = router.push as jest.Mock;
const replace = router.replace as jest.Mock;
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
/** Host elements: what VoiceOver and the native views receive. */
const byTestID = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) => node.props.testID === id && typeof node.type === 'string',
  );
/** The outermost element with the id and a press handler. */
const pressable = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) => node.props.testID === id && !!node.props.onPress,
  )[0]!;
const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

beforeEach(() => {
  mockDisk.clear();
  mockTourSeen = false;
  mockFontScale = 1;
  mockParams = {};
  push.mockClear();
  replace.mockClear();
  back.mockClear();
  resetTermClaimsForTests();
  resetLearnSettingsForTests({});
  setSheetSegments(['(tabs)']);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

describe('the guide content module', () => {
  test('is in sync with content/learn at the recorded SHA', () => {
    execFileSync(
      process.execPath,
      ['scripts/build-learn-content.mjs', '--check'],
      { cwd: join(__dirname, '..'), stdio: 'pipe' },
    );
    expect(learnSource.sha).toBe('39d9d33bc');
  });

  test('holds 87 terms, 7 chapters and 17 examples, every link resolved', () => {
    expect(termIds).toHaveLength(87);
    expect(learnChapters.map((chapter) => chapter.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(learnExamples).toHaveLength(17);
    for (const term of glossaryTerms)
      for (const other of term.seeAlso) expect(isTermId(other)).toBe(true);
    for (const chapter of learnChapters) {
      expect(chapter.screens.at(-1)?.heading).toBe('See it in OPAX');
      for (const screen of chapter.screens)
        for (const block of screen.blocks) {
          const runs =
            block.kind === 'p'
              ? block.inline
              : block.items.flatMap((item) => item.note);
          for (const run of runs) {
            if (typeof run === 'string') {
              expect(run).not.toMatch(/\[\[f:|\{\{|\}\}/);
            } else if ('term' in run) expect(isTermId(run.term)).toBe(true);
            // Site paths: origins belong in build config (qa-static).
            else expect(run.url).toMatch(/^\/[a-z]/);
          }
        }
    }
  });

  test('the A to Z order is alphabetical by title and covers every term', () => {
    expect(new Set(termsAtoZ)).toEqual(new Set(termIds));
    expect(termTitle('bill')).toBe('Bill');
    expect(termTitle(termsAtoZ[0]!).charAt(0)).toBe('A');
    const letters = glossaryLetters(termsAtoZ).map((group) => group.letter);
    expect(letters).toEqual([...letters].sort());
  });
});

describe('the guide settings', () => {
  beforeEach(() => resetLearnSettingsForTests(null));

  test('a new install: terms underlined, explain off, the Home card shown', async () => {
    mockTourSeen = false;
    const settings = await loadLearnSettings();
    expect(settings).toEqual({ underline: true, explain: false, card: 'show' });
  });

  test('an existing install: terms underlined too, but never the card', async () => {
    mockTourSeen = true;
    const settings = await loadLearnSettings();
    expect(settings).toEqual({
      underline: true,
      explain: false,
      card: 'never',
    });
  });

  test('switches persist, and hiding the card is for good', async () => {
    await loadLearnSettings();
    await setUnderlineTerms(false);
    await setExplainTerms(true);
    await hideLearnCard();
    expect(learnSettingsSnapshot()).toEqual({
      underline: false,
      explain: true,
      card: 'hidden',
    });
    resetLearnSettingsForTests(null);
    mockTourSeen = false;
    expect(await loadLearnSettings()).toEqual({
      underline: false,
      explain: true,
      card: 'hidden',
    });
  });

  test('the Account switches show and change both settings', async () => {
    await loadLearnSettings();
    const row = render(<AccountTermsRow />);
    expect(
      row.root.findAll(
        (node) =>
          node.props.testID === 'account-terms-row' &&
          node.props.onPress !== undefined,
      ).length,
    ).toBeGreaterThan(0);
    const tree = render(<AccountTerms />);
    const underline = byTestID(tree, 'account-underline-terms')[0]!;
    const explain = byTestID(tree, 'account-explain-terms')[0]!;
    expect(underline.props.accessibilityRole).toBe('switch');
    expect(underline.props.accessibilityState.checked).toBe(true);
    expect(explain.props.accessibilityState.checked).toBe(false);
    await act(async () => {
      pressable(tree, 'account-explain-terms').props.onPress();
    });
    expect(learnSettingsSnapshot().explain).toBe(true);
    expect(
      byTestID(tree, 'account-explain-terms')[0]!.props.accessibilityState
        .checked,
    ).toBe(true);
  });
});

describe('openTerm and the answer sheet', () => {
  test('openTerm pushes the term sheet; an unknown id opens nothing', () => {
    openTerm('division');
    expect(push).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'division' },
    });
    push.mockClear();
    openTerm('not-a-term' as never);
    expect(push).not.toHaveBeenCalled();
  });

  test('above the welcome or Account the sheet is told so', () => {
    setSheetSegments(['welcome']);
    openTerm('electorate');
    expect(push).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'electorate', over: '1' },
    });
  });

  test('the sheet shows the guide’s answer, its record and the glossary', () => {
    mockParams = { id: 'bill' };
    const tree = render(<TermSheet />);
    const term = glossaryTerm('bill');
    const text = tree.root
      .findAllByType(NativeText)
      .map((node) => textOf(node))
      .join('\n');
    expect(text).toContain(term.short);
    expect(text).toContain(term.more);
    expect(text).toContain('See it in OPAX');
    expect(text).toContain(term.example!.label);
    act(() => pressable(tree, 'term-bill-glossary').props.onPress());
    expect(back).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ pathname: '/learn/glossary' });
    push.mockClear();
    back.mockClear();
    act(() => pressable(tree, 'term-bill-example').props.onPress());
    expect(back).toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
  });

  test('a term without a record has no "See it" row; above tabs, no glossary row', () => {
    mockParams = { id: 'act', over: '1' };
    const tree = render(<TermSheet />);
    expect(byTestID(tree, 'term-act-example')).toHaveLength(0);
    expect(byTestID(tree, 'term-act-glossary')).toHaveLength(0);
  });

  test('an unknown id is an empty state, not a crash', () => {
    mockParams = { id: 'nope' };
    const tree = render(<TermSheet />);
    expect(byTestID(tree, 'term-sheet').length).toBeGreaterThan(0);
  });
});

describe('the inline term', () => {
  test('only the first use on a screen is marked', () => {
    const tree = render(
      <Text>
        The <Term id="senate">Senate</Term> sits. The{' '}
        <Term id="senate">Senate</Term> votes.
      </Text>,
    );
    expect(byTestID(tree, 'term-inline-senate')).toHaveLength(1);
    const run = byTestID(tree, 'term-inline-senate')[0]!;
    expect(run.props.accessibilityRole).toBe('link');
    expect(run.props.accessibilityHint).toBe('Explains Senate');
    expect(run.props.style).toMatchObject({
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
    });
  });

  test('a tap opens the popover at the word', () => {
    const tree = render(
      <Text>
        <Term id="division" />
      </Text>,
    );
    act(() =>
      pressable(tree, 'term-inline-division').props.onPress({
        nativeEvent: { pageX: 120, pageY: 300 },
      }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/term-tip',
      params: { id: 'division', x: '120', y: '300' },
    });
  });

  test('at accessibility sizes the tap opens the sheet instead', () => {
    mockFontScale = 3.1;
    const tree = render(
      <Text>
        <Term id="division" />
      </Text>,
    );
    act(() =>
      pressable(tree, 'term-inline-division').props.onPress({
        nativeEvent: { pageX: 1, pageY: 1 },
      }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'division' },
    });
  });

  test('with underlines turned off a term is plain text', () => {
    resetLearnSettingsForTests({ underline: false });
    const tree = render(
      <Text>
        <Term id="division" />
      </Text>,
    );
    expect(byTestID(tree, 'term-inline-division')).toHaveLength(0);
    expect(textOf(tree.root.findAllByType(NativeText)[0]!)).toBe('division');
  });

  test('TermText marks the word inside standing text and carries the hint and action', () => {
    expect(findTermWords('2,929 divisions voted in', 'division')).toEqual({
      start: 6,
      end: 15,
    });
    expect(findTermWords('subdivision', 'division')).toBeNull();
    const tree = render(
      <TermText term="division" testID="stat">
        2,929 divisions voted in
      </TermText>,
    );
    const line = byTestID(tree, 'stat')[0]!;
    expect(line.props.accessibilityHint).toBe('Explains division');
    expect(line.props.accessibilityActions).toEqual([
      { name: 'activate' },
      { name: 'explain-division', label: 'Explain division' },
    ]);
    act(() =>
      line.props.onAccessibilityAction({
        nativeEvent: { actionName: 'activate' },
      }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'division' },
    });
    expect(textOf(byTestID(tree, 'term-inline-division')[0]!)).toBe(
      'divisions',
    );
  });

  test('a row’s custom action opens the term', () => {
    const a11y = termA11y('crossbench');
    expect(a11y.accessibilityActions).toEqual([
      { name: 'explain-crossbench', label: 'Explain crossbench' },
    ]);
    a11y.onAccessibilityAction({
      nativeEvent: { actionName: 'explain-crossbench' },
    } as never);
    expect(push).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'crossbench' },
    });
  });
});

describe('the popover', () => {
  test('shows the term and its one line; More swaps in the sheet', () => {
    mockParams = { id: 'second-reading', x: '100', y: '200' };
    const tree = render(<TermTip />);
    const text = tree.root
      .findAllByType(NativeText)
      .map((node) => textOf(node))
      .join('\n');
    expect(text).toContain('Second reading');
    expect(text).toContain(glossaryTerm('second-reading').short);
    act(() => pressable(tree, 'term-tip-second-reading-more').props.onPress());
    expect(replace).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'second-reading' },
    });
    act(() => pressable(tree, 'term-tip-backdrop').props.onPress());
    expect(back).toHaveBeenCalled();
  });
});

describe('the glossary screen', () => {
  test('lists every term under its letter and opens a term', () => {
    const tree = render(<GlossaryScreen />);
    const rows = tree.root.findAll(
      (node) =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('learn-glossary-term-') &&
        typeof node.type !== 'string' &&
        node.props.onPress,
    );
    const ids = new Set(
      rows.map((row) => row.props.testID.replace('learn-glossary-term-', '')),
    );
    expect(ids.size).toBe(87);
    act(() => pressable(tree, 'learn-glossary-term-pair').props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: '/term',
      params: { id: 'pair' },
    });
  });
});
