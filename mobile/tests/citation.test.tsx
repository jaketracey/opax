import { act, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import { router, type NativeStackHeaderItem } from 'expo-router';
import Citation from '../src/app/citation';
import { copyCitation } from '../src/features/ask/cite';
import {
  citationSelection,
  citationSheetLeft,
  firstClaim,
  showCitation,
} from '../src/features/ask/citation-state';
import { answerBlocks } from '../src/features/ask/answer-markdown';
import { answerTurn } from '../src/features/ask/session';
import { bindShortLastWord } from '../src/design/record-title';
import { presentSheet } from '../src/navigation/sheets';
import type { Answer, Source, Turn } from '../src/features/ask/model';
import { expectPublicSiteAction } from './more-menu-web';
import { menuTitle } from '../src/design/menu-title';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), back: jest.fn() },
  useSegments: () => [],
}));
// The shared frame (detents, the undimmed half) is the sheets lane's; here it
// keeps the options it is given so the bar can be read.
const mockFrame: { title?: string; options?: Record<string, unknown> } = {};
jest.mock('../src/features/sheets/frame', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    SheetFrame: (props: {
      title: string;
      options?: Record<string, unknown>;
      testID?: string;
      children: ReactNode;
    }) => {
      mockFrame.title = props.title;
      mockFrame.options = props.options;
      return React.createElement(
        View,
        { testID: props.testID },
        props.children,
      );
    },
    MissingPayload: () =>
      React.createElement(View, { testID: 'citation-missing' }),
  };
});
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/features/ask/session', () => ({ answerTurn: jest.fn() }));
jest.mock('../src/navigation/sheets', () => ({ presentSheet: jest.fn() }));
jest.mock('../src/navigation/share', () => ({
  trackShare: jest.fn(),
  canShare: true,
  shareRecord: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/records/actions', () => ({
  copyText: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/features/ask/cite', () => ({
  ...jest.requireActual('../src/features/ask/cite'),
  copyCitation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));

const passage =
  'The levy applies to licensed online wagering providers. It is collected each financial year and paid into general revenue.';
const source = (n: number, extra: Partial<Source> = {}): Source => ({
  resource: `r${n}`,
  title: `Synthetic Fixture Bill ${n}`,
  slug: `fixture-${n}`,
  href: `/bill/fixture-${n}`,
  snippet: n === 1 ? passage : `Synthetic passage ${n}.`,
  cited: true,
  date: `2026-08-1${n}`,
  url: `https://www.aph.gov.au/fixture-${n}`,
  answerRanges: [],
  ...extra,
});
const first = 'The bill would charge a levy.';
const text = `${first} It passed the House in August.`;
function fixture(sources: Source[]): Answer {
  return { answer: text, sources, citations: {} };
}
const two = fixture([
  source(1, {
    answerRanges: [[0, first.length]],
    speaker: 'Sam Placeholder',
  }),
  source(2, { answerRanges: [[first.length, text.length]] }),
]);
function found(result: Answer) {
  const question: Turn = { role: 'user', text: 'What is the levy?' };
  const answer: Turn = { role: 'answer', text: '', result };
  jest.mocked(answerTurn).mockReturnValue({
    chat: 'fixture-chat',
    index: 1,
    question,
    answer,
  });
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => citationSheetLeft());
  jest.clearAllMocks();
});
function draw() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Citation />);
  });
  mounted.push(renderer);
  const words = () => {
    const out: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') out.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object' && 'children' in node)
        walk((node as { children: unknown }).children);
    };
    walk(renderer.toJSON());
    return out.join('');
  };
  const host = (id: string) =>
    renderer.root.findAll(
      (n) => n.props.testID === id && typeof n.type === 'string',
    );
  const press = (id: string) =>
    renderer.root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress();
  return { renderer, words, host, press };
}
type Bar = {
  unstable_headerLeftItems?: () => NativeStackHeaderItem[];
  unstable_headerRightItems?: () => NativeStackHeaderItem[];
};
const bar = () => mockFrame.options as Bar;
const left = () => bar().unstable_headerLeftItems?.() ?? [];
const right = () => bar().unstable_headerRightItems?.() ?? [];
type Row = {
  type: string;
  label: string;
  inline?: boolean;
  items?: Row[];
  onPress?: () => void;
};
function menuRows(): Row[] {
  const menu = right().find((item) => item.type === 'menu') as unknown as {
    menu: { items: Row[] };
  };
  return menu.menu.items;
}

test('with nothing selected the sheet says there is nothing to show', () => {
  const { host } = draw();
  expect(host('citation-missing')).toHaveLength(1);
});

test.each(['fixture-1', undefined])(
  'the source More menu opens a permitted public page (slug: %s)',
  (slug) => {
    found(fixture([source(1, { slug })]));
    act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
    draw();
    expectPublicSiteAction(menuRows(), slug ? `/doc/${slug}` : '/');
  },
);

test('the source sheet shows decoded titles without decoding literal entities twice', () => {
  found(
    fixture([source(1, { title: 'Australia&#039;s &amp;amp; interests' })]),
  );
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  const { words, renderer } = draw();
  expect(words()).toContain("Australia's &amp; interests");
  expect(
    renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel ===
        "Source 1, Australia's &amp; interests",
    ).length,
  ).toBeGreaterThan(0);
});

test('the selected source: numeral and title, meta, the whole passage, Open record', () => {
  found(two);
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  expect(presentSheet).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'citation', testID: 'citation-sheet' }),
  );
  const { words, host } = draw();
  // No bar title: the numeral and title lead the content.
  expect(mockFrame.title).toBe('');
  expect(host('citation-title').length).toBeGreaterThan(0);
  // The title binds its short last word (design/record-title.ts).
  expect(words()).toContain(bindShortLastWord('Synthetic Fixture Bill 1'));
  expect(host('citation-meta').length).toBeGreaterThan(0);
  expect(words()).toContain('Sam Placeholder');
  // The whole passage, no sentence picked inside it.
  expect(host('citation-passage')).toHaveLength(1);
  expect(host('citation-no-passage')).toHaveLength(0);
  expect(words()).toContain(passage);
  expect(host('citation-open-record').length).toBeGreaterThan(0);
  expect(words()).toContain('ParlInfo');
  expect(words()).not.toMatch(/—|retrieved/);
});

test('a passage that only repeats the title is not drawn; the sheet says there is no passage', () => {
  for (const snippet of [
    // The cleaned title, in another case and with punctuation.
    'synthetic fixture bill 1.',
    // The stored title, stage and all.
    'Synthetic Fixture Bill 1 — Second Reading',
  ]) {
    found(
      fixture([
        source(1, {
          title: 'Synthetic Fixture Bill 1 — Second Reading',
          snippet,
        }),
      ]),
    );
    act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
    const { words, host } = draw();
    expect(host('citation-passage')).toHaveLength(0);
    expect(host('citation-no-passage')).toHaveLength(1);
    expect(words()).toContain('This record has no passage to show.');
    // Above Open record.
    expect(words().indexOf('This record has no passage')).toBeLessThan(
      words().indexOf('Open record'),
    );
  }
});

test('a record with no passage at all says so above Open record', () => {
  found(fixture([source(1, { snippet: '' })]));
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  const { words, host } = draw();
  expect(host('citation-passage')).toHaveLength(0);
  expect(host('citation-no-passage')).toHaveLength(1);
  expect(words().indexOf('This record has no passage')).toBeLessThan(
    words().indexOf('Open record'),
  );
});

test('Previous and Next appear with two or more sources and stop at the ends', () => {
  found(two);
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  const { words } = draw();
  let [previous, next] = left() as {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }[];
  expect(previous!.label).toBe('Previous source');
  expect(next!.label).toBe('Next source');
  expect(previous!.disabled).toBe(true);
  expect(next!.disabled).toBe(false);
  act(() => next!.onPress());
  // The claim moves to the source's first mark in the answer.
  expect(citationSelection()).toEqual({
    turn: 'fixture-chat:1',
    n: 2,
    claim: firstClaim(answerBlocks(two), 2),
  });
  expect(citationSelection()?.claim).toEqual({ block: '0', sentence: 1 });
  expect(words()).toContain('Synthetic passage 2.');
  [previous, next] = left() as (typeof previous)[];
  expect(previous!.disabled).toBe(false);
  expect(next!.disabled).toBe(true);
});

test('one cited source: no Previous or Next', () => {
  found(fixture([source(1, { answerRanges: [[0, first.length]] })]));
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  draw();
  expect(left()).toEqual([]);
  // ⋯ then Done at the trailing edge.
  expect(
    right().map((item) => (item.type === 'button' ? item.label : item.type)),
  ).toEqual(['menu', 'Done']);
});

test('⋯ holds an inline Cite section, then Copy link, Share and Report', () => {
  found(two);
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  draw();
  const rows = menuRows();
  expect(rows.map((row) => row.label)).toEqual([
    'Cite',
    'Copy link',
    'Share',
    'Report a problem with this source',
    menuTitle('Open on opax.com.au'),
  ]);
  expect(rows[0]!.inline).toBe(true);
  expect(rows[0]!.items!.map((row) => row.label)).toEqual([
    'Copy APA 7',
    'Copy AGLC',
    'Copy BibTeX',
    'Copy RIS',
    'Citation formats…',
  ]);
  act(() => rows[0]!.items![0]!.onPress!());
  expect(copyCitation).toHaveBeenCalledWith(
    [expect.objectContaining({ resource: 'r1' })],
    'apa',
  );
});

test('Report and Open record leave the sheet first', () => {
  const frame = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  found(two);
  act(() => showCitation({ turn: 'fixture-chat:1', n: 2 }));
  const { press } = draw();
  act(() =>
    menuRows().find((row) => row.label === 'Report a problem with this source')!
      .onPress!(),
  );
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/ask-report',
    params: { turn: 'fixture-chat:1', source: '2' },
  });
  act(() => press('citation-open-record'));
  expect(router.back).toHaveBeenCalledTimes(2);
  expect(router.push).toHaveBeenCalledTimes(2);
  frame.mockRestore();
});

test('leaving the sheet clears the selection, and the highlight with it', () => {
  found(two);
  act(() => showCitation({ turn: 'fixture-chat:1', n: 1 }));
  const { renderer } = draw();
  expect(citationSelection()).not.toBeNull();
  act(() => renderer.unmount());
  mounted.splice(0);
  expect(citationSelection()).toBeNull();
  // The next mark opens a new sheet rather than re-targeting a gone one.
  act(() => showCitation({ turn: 'fixture-chat:1', n: 2 }));
  expect(presentSheet).toHaveBeenCalledTimes(2);
});
