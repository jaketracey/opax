import { router } from 'expo-router';
import { act, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, StyleSheet } from 'react-native';
import { confirmAction } from '../src/design/menu';
import { CitationMark } from '../src/design/citation-mark';
import { haptic } from '../src/design/haptics';
import { dispatchKeyCommand } from '../src/design/keyboard';
import { FigureBlock } from '../src/design/record';
import { RecordRow } from '../src/design/rows';
import type { SourceDetails } from '../src/design/source';
import { AnswerBody } from '../src/features/ask/AnswerBody';
import {
  AnswerView,
  answerReadyAnnouncement,
  askSourceDetails,
} from '../src/features/ask/AnswerView';
import { useAskSources } from '../src/features/ask/SourcesPane';
import { RecordDetail } from '../src/features/split/RecordDetail';
import { parseAnswer } from '../src/features/ask/answer-markdown';
import {
  citationSelection,
  citationSheetLeft,
} from '../src/features/ask/citation-state';
import { copyCitation } from '../src/features/ask/cite';
import {
  decodeAnswer,
  type Source,
  type Turn,
} from '../src/features/ask/model';
import type { AskPerson } from '../src/features/ask/people';
import { copyText } from '../src/features/records/actions';
import { shareRecord, trackShare } from '../src/navigation/share';
import { track } from '../src/analytics';
import { presentSheet, presentSource } from '../src/navigation/sheets';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const Pass = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Link: Object.assign(Pass, {
      Trigger: Pass,
      Preview: () => null,
      Menu: Pass,
      MenuAction: Pass,
    }),
    router: { push: jest.fn(), back: jest.fn() },
    useSegments: () => [],
  };
});
// SwiftUI views as plain views that keep their props, so the answer menu's
// buttons can be found and pressed.
jest.mock('@expo/ui/swift-ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const view = (kind: string) => {
    const SwiftView = ({ children, ...props }: { children?: unknown }) =>
      React.createElement(View, { ...props, swift: kind }, children);
    SwiftView.displayName = kind;
    return SwiftView;
  };
  return {
    Host: view('Host'),
    Menu: view('Menu'),
    Button: view('Button'),
    Section: view('Section'),
  };
});
jest.mock(
  '@expo/ui/swift-ui/modifiers',
  () =>
    new Proxy(
      {},
      {
        get:
          (_target, name) =>
          (...args: unknown[]) => ({ modifier: name, args }),
      },
    ),
);
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/navigation/sheets', () => ({
  presentSource: jest.fn(),
  presentSheet: jest.fn(),
}));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('../src/navigation/share', () => ({
  trackShare: jest.fn(),
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
jest.mock('../src/design/menu', () => ({
  ...jest.requireActual('../src/design/menu'),
  confirmAction: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
// The reader's own member, worked out on the device from the saved seat.
jest.mock('../src/features/your-mp/useIsMyMember', () => ({
  useIsMyMember: (slug: string) => slug === 'sam-placeholder',
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: () => null,
  RecordShare: () => null,
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => true,
}));

// Synthetic fixture records; the only person is the neutral placeholder.
const source = (
  n: number,
  cited: boolean,
  ranges: [number, number][] = [],
  extra: Partial<Source> = {},
): Source => ({
  resource: `r${n}`,
  title: `Synthetic Fixture Bill ${n}`,
  slug: `r${n}`,
  href: `/bill/fixture-${n}`,
  snippet: `Synthetic passage ${n} from the record.`,
  cited,
  date: `2026-08-1${n}`,
  url: `https://example.org/fixture-${n}`,
  answerRanges: ranges,
  ...extra,
});
const first = 'The bill would charge a levy.';
const second = ' It passed the House in August.';
const text = first + second;
const question: Turn = {
  role: 'user',
  text: 'What did parliament say about the fixture bill?',
};
const answer = (over: Partial<NonNullable<Turn['result']>> = {}): Turn => ({
  role: 'answer',
  text: '',
  at: Date.parse('2026-11-08T22:41:00Z'),
  result: {
    answer: text,
    sources: [
      source(1, true, [[0, first.length]]),
      source(2, true, [[0, first.length]], {
        speaker: 'Sam Placeholder',
        party: 'Example Party',
      }),
      source(3, true, [[first.length, text.length]]),
      source(4, false),
    ],
    citations: {},
    ...over,
  },
});
const profiles = new Map<string, AskPerson>([
  [
    'Sam Placeholder',
    {
      name: 'Sam Placeholder',
      slug: 'sam-placeholder',
      party: 'Example Party',
      place: 'Member for Example, New South Wales',
    },
  ],
]);

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => citationSheetLeft());
  jest.clearAllMocks();
});
function draw(turn: Turn = answer(), pane = false, onRephrase = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerView
        turn={turn}
        question={question}
        index={1}
        chat="fixture-chat"
        profiles={profiles}
        paneShowsSources={pane}
        onRephrase={onRephrase}
      />,
    );
  });
  mounted.push(renderer);
  return helpers(renderer);
}
function helpers(renderer: TestRenderer.ReactTestRenderer) {
  // Every string the host views draw, in order.
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
  const ids = (id: string) =>
    renderer.root.findAll(
      (n) => n.props.testID === id && typeof n.type !== 'string',
    );
  const press = (id: string) =>
    renderer.root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress();
  const menuButton = (label: string) =>
    renderer.root.find(
      (n) => n.props.swift === 'Button' && n.props.label === label,
    );
  return { renderer, words, ids, press, menuButton };
}

test('the answer leads with one machine pill and its records, cited once each', () => {
  const { words, ids, renderer } = draw();
  expect(ids('ask-machine-label').length).toBeGreaterThan(0);
  expect(
    renderer.root.findAll(
      (n) =>
        n.props.testID === 'ask-machine-label' && typeof n.type === 'string',
    ).length,
  ).toBeGreaterThan(0);
  expect(ids('ask-answer-kind')).toHaveLength(0);
  expect(ids('ask-answer-1').length).toBeGreaterThan(0);
  expect(words()).toContain('Records cited (3)');
  for (const n of [1, 2, 3])
    expect(ids(`ask-citation-${n}`).length).toBeGreaterThan(0);
  // Retrieved but not cited stays in the sources sheet, not under the answer.
  expect(words()).not.toContain('Synthetic Fixture Bill 4');
  expect(words()).not.toMatch(/\[\d\] Synthetic|Also retrieved|retrieved/);
});

test("a cited row says the speaker's party and exposes both record links", () => {
  const { renderer } = draw();
  const row = renderer.root
    .findAllByType(RecordRow)
    .find((node) => node.props.testID === 'ask-citation-2')!;
  const title = row.find(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.accessibilityLabel?.startsWith('2.') &&
      node.props.accessible === true,
  );
  expect(title.props.accessibilityLabel).toMatch(
    /Sam Placeholder, Example Party$/,
  );
  // The shared row exposes sibling links, so each can receive focus directly.
  const links = row.findAll((node) => node.props.accessibilityRole === 'link');
  for (const label of ['Open Sam Placeholder', 'Open Example Party party page'])
    expect(links.some((node) => node.props.accessibilityLabel === label)).toBe(
      true,
    );
});

test('adjacent citations merge into one mark that opens the first source beside its claim', () => {
  const { renderer, press } = draw();
  const marks = renderer.root.findAllByType(CitationMark);
  expect(marks.map((m) => m.props.testID)).toEqual([
    'ask-citation-mark-1',
    'ask-citation-mark-3',
  ]);
  expect(marks.map((m) => m.props.label)).toEqual(['1, 2', '3']);
  const link = marks[0]!.find((n) => n.props.accessibilityRole === 'link');
  expect(link.props.accessibilityLabel).toBe(
    'Sources 1 and 2. Double-tap to show the first passage.',
  );
  act(() => press('ask-citation-mark-1'));
  expect(presentSheet).toHaveBeenCalledTimes(1);
  expect(presentSheet).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'citation', citation: { number: 1 } }),
  );
  expect(citationSelection()).toEqual({
    turn: 'fixture-chat:1',
    n: 1,
    claim: { block: '0', sentence: 0 },
  });
  // The claim's sentence is highlighted while its citation is open.
  expect(
    renderer.root.findAll(
      (n) =>
        n.props.testID === 'ask-sentence-highlight' &&
        typeof n.type !== 'string',
    ).length,
  ).toBeGreaterThan(0);
  // With the sheet open, the second mark and a Records cited row re-target it.
  act(() => press('ask-citation-mark-3'));
  expect(presentSheet).toHaveBeenCalledTimes(1);
  expect(citationSelection()?.n).toBe(3);
  act(() => press('ask-citation-2'));
  expect(presentSheet).toHaveBeenCalledTimes(1);
  expect(citationSelection()?.n).toBe(2);
});

test('the answer text stays selectable and its marks still open on a tap; streamed text does not select', () => {
  const { renderer, press } = draw();
  const mark = renderer.root.findAllByType(CitationMark)[0]!;
  // The block's own Text, the nearest ancestor drawing the sentence.
  let block = mark.parent;
  while (block && block.props.selectable === undefined) block = block.parent;
  expect(block?.props.selectable).toBe(true);
  act(() => press('ask-citation-mark-1'));
  expect(presentSheet).toHaveBeenCalledTimes(1);
  let streamed!: TestRenderer.ReactTestRenderer;
  act(() => {
    streamed = TestRenderer.create(
      <AnswerBody
        blocks={parseAnswer('Partly written [1]', { streaming: true })}
        streaming
      />,
    );
  });
  expect(streamed.root.findAll((n) => n.props.selectable === true)).toEqual([]);
  act(() => streamed.unmount());
  expect(
    renderer.root.findAllByProps({ testID: 'ask-selection-done' }),
  ).toHaveLength(0);
});

test('the answer’s ⋯ draws in a fixed 44 pt frame, so it stays on the foot’s line', () => {
  // A content-sized host re-measured late after a width change (an iPhone
  // Duo folding or rotating) and drew its glyph a line below its row.
  const { renderer } = draw();
  const menu = renderer.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.swift === 'Menu' &&
      node.props.label === 'Answer options',
  );
  let host = menu.parent;
  while (
    host &&
    !(typeof host.type === 'string' && host.props.swift === 'Host')
  )
    host = host.parent;
  expect(host).toBeTruthy();
  expect(host!.props.matchContents).toBeUndefined();
  expect(StyleSheet.flatten(host!.props.style)).toMatchObject({
    width: 44,
    height: 44,
  });
});

test('Android enables text selection on demand and returns to citation taps', () => {
  const original = Platform.OS;
  Platform.OS = 'android';
  try {
    const { renderer, press } = draw();
    const selectable = () => {
      let block = renderer.root.findAllByType(CitationMark)[0]!.parent;
      while (block && block.props.selectable === undefined)
        block = block.parent;
      return block?.props.selectable;
    };
    expect(selectable()).toBe(false);
    act(() => press('ask-answer-menu'));
    const choices = jest.mocked(confirmAction).mock.calls.at(-1)![1];
    const select = choices.find((item) => item.title === 'Select text')!;
    act(() => select.onPress());
    expect(selectable()).toBe(true);
    expect(
      renderer.root.findAllByProps({ testID: 'ask-selection-done' }).length,
    ).toBeGreaterThan(0);
    act(() => press('ask-selection-done'));
    expect(selectable()).toBe(false);
    act(() => press('ask-citation-mark-1'));
    expect(presentSheet).toHaveBeenCalledTimes(1);
  } finally {
    Platform.OS = original;
  }
});
test('People in this answer are full person rows, the reader’s own member marked', () => {
  const { ids, words } = draw();
  expect(ids('ask-people').length).toBeGreaterThan(0);
  expect(words()).toContain('People in this answer');
  const row = ids('ask-person-sam-placeholder')[0]!;
  expect(row.props).toMatchObject({
    name: 'Sam Placeholder',
    party: 'Example Party',
    place: 'Member for Example, New South Wales',
    yourMP: true,
  });
});

test('Records cited decode titles once while People keep their roster names', () => {
  const title = "Australia's &amp; interests";
  const turn = answer({
    sources: [
      source(1, true, [], {
        title: 'Australia&#039;s &amp;amp; interests',
        speaker: 'Sam Placeholder',
      }),
    ],
  });
  const { words, ids } = draw(turn);
  expect(words()).toContain(title);
  expect(words()).not.toContain('&#039;');
  expect(
    ids('ask-citation-1').some((row) =>
      row.props.accessibilityLabel?.includes(title),
    ),
  ).toBe(true);
  expect(ids('ask-person-sam-placeholder')[0]!.props.name).toBe(
    'Sam Placeholder',
  );
});

test('the foot is the dated Answered line and one answer menu', async () => {
  const { ids, press, menuButton, renderer } = draw();
  const foot = ids('ask-answer-sources')[0]!;
  // The reader's zone, the turn's own time (Sydney: 9 Nov 2026, 9:41 am).
  expect(foot.props.name).toMatch(
    /^Answered \d{1,2} (Nov) 2026, \d{1,2}:41 [ap]m · OPAX$/,
  );
  expect(foot.props.accessibilityLabel).toMatch(/Source: OPAX$/);
  for (const label of [
    'Copy answer',
    'Share question',
    'Copy APA 7',
    'Copy AGLC',
    'Report a problem',
  ])
    expect(menuButton(label)).toBeTruthy();
  // The ⋯ label itself is a 44 by 44 target.
  const menu = renderer.root.find((n) => n.props.swift === 'Menu');
  expect(
    renderer.root
      .findAll((n) => n.props.swift === 'Button')
      .map((n) => n.props.label),
  ).not.toContain('Select text');
  expect(menu.props.modifiers).toContainEqual({
    modifier: 'frame',
    args: [{ minWidth: 44, minHeight: 44 }],
  });
  await act(async () => menuButton('Copy answer').props.onPress());
  expect(copyText).toHaveBeenCalledWith(expect.stringContaining(question.text));
  expect(haptic).toHaveBeenCalledWith('success');
  // One opax_share of kind "answer", never the copied words.
  expect(jest.mocked(trackShare).mock.calls).toEqual([['answer']]);
  jest.mocked(copyText).mockResolvedValueOnce(false);
  await act(async () => menuButton('Copy answer').props.onPress());
  expect(trackShare).toHaveBeenCalledTimes(1);
  act(() => menuButton('Share question').props.onPress());
  expect(shareRecord).toHaveBeenCalledWith(
    expect.objectContaining({ path: '/ask', title: question.text }),
  );
  act(() => menuButton('Copy APA 7').props.onPress());
  expect(copyCitation).toHaveBeenCalledWith(
    [
      expect.objectContaining({ resource: 'r1' }),
      expect.anything(),
      expect.anything(),
    ],
    'apa',
  );
  act(() => menuButton('Report a problem').props.onPress());
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/ask-report',
    params: { turn: 'fixture-chat:1' },
  });
  act(() => press('ask-answer-sources'));
  expect(presentSource).toHaveBeenCalledWith(expect.anything(), {
    testID: 'ask-answer-sources',
  });
});

test('the sources sheet never repeats a record title as a serif line', () => {
  const details: SourceDetails = askSourceDetails({
    turn: answer(),
    question,
    chat: 'fixture-chat',
    index: 1,
    legacy: null,
  });
  expect(details.report?.label).toBe('Report this answer');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<>{details.extra}</>);
  });
  mounted.push(renderer);
  const texts = renderer.root
    .findAll(
      (n) => typeof n.type !== 'string' && typeof n.props.variant === 'string',
    )
    .map((n) => ({
      variant: n.props.variant as string,
      text: [n.props.children]
        .flat(Infinity)
        .filter((c) => typeof c === 'string')
        .join(''),
    }));
  expect(
    texts.filter(
      (t) => /record|serif/i.test(t.variant) && t.variant !== 'rowRecord',
    ),
  ).toEqual([]);
  // Each title is one row title in Cited, and once more only among Also found.
  const titled = (n: number) =>
    texts.filter(
      (t) =>
        t.variant === 'rowRecord' && t.text === `Synthetic Fixture Bill ${n}`,
    );
  for (const n of [1, 2, 3, 4]) expect(titled(n)).toHaveLength(1);
  const { words } = helpers(renderer);
  // The group is headed "Cited": the details it sits in already say answer.
  expect(
    renderer.root.findAll((n) => n.props.header === 'Cited').length,
  ).toBeGreaterThan(0);
  expect(words()).not.toContain('Cited in the answer');
  expect(words()).toContain('Also found, not cited');
  expect(words()).not.toMatch(/retrieved|—/);
});

test('source notes and original-source labels decode their raw titles once', () => {
  const turn = answer({
    sources: [
      source(1, true, [], {
        title: 'Australia&#039;s &amp;amp; interests',
        source: 'Science &amp; &quot;Industry&quot;',
      }),
    ],
  });
  turn.carried = { source: 'Australia&#039;s &amp;amp; interests' };
  const details = askSourceDetails({
    turn,
    question,
    chat: 'fixture-chat',
    index: 1,
    legacy: null,
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<>{details.extra}</>);
  });
  mounted.push(renderer);
  const { words } = helpers(renderer);
  expect(words()).toContain('Science & "Industry"');
  expect(words()).toContain("passage from “Australia's &amp; interests”");
  expect(words()).not.toMatch(/&#039;|&amp;amp;|&quot;/);
});

test('a figure is drawn only with its own date and source', () => {
  const { renderer } = draw(
    answer({
      answer_status: 'calculated',
      pay_answer: true,
      figures: [
        {
          value: '$233,660',
          as_at: '2026-07-01',
          source: 'Remuneration Tribunal',
        },
        { value: '$1', as_at: '2026-07-01' },
        { value: '$2', source: 'Remuneration Tribunal' },
      ],
    } as Partial<NonNullable<Turn['result']>>),
  );
  const figures = renderer.root.findAllByType(FigureBlock);
  expect(figures).toHaveLength(1);
  expect(figures[0]!.props.value).toBe('$233,660');
  expect(figures[0]!.props.citation).toEqual({
    citation: 'Remuneration Tribunal',
    asOf: expect.stringContaining('2026'),
  });
});

test('an empty answer describes the search, offers rephrasing and Search, and retains related records', () => {
  const onRephrase = jest.fn();
  const { words, ids, press } = draw(answer({ answer: '' }), false, onRephrase);
  expect(words()).toContain(
    'No written answer came back. The records found are listed below.',
  );
  expect(ids('ask-error-empty').length).toBeGreaterThan(0);
  expect(words()).toContain(`Searched OPAX records for “${question.text}”.`);
  expect(words()).toContain('Try naming a person, bill or topic and a year.');
  expect(words()).toContain('Records found');
  expect(words()).not.toContain('Records cited');
  act(() => press('ask-rephrase'));
  expect(onRephrase).toHaveBeenCalledWith(question.text);
  act(() => press('ask-search-opax'));
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({ scope: 'all', q: question.text }),
    }),
  );
  const none = draw(answer({ answer: '', sources: [] }));
  expect(none.words()).toContain('No written answer came back.');
  expect(none.words()).not.toContain('listed below');
});

test('a written evidence gap keeps its answer and ready announcement', () => {
  const limitation = 'No verified position in the selected speeches.';
  const turn = answer({
    answer: limitation,
    answer_status: 'evidence_gap',
    sources: [],
  });
  const { words, ids } = draw(turn);
  expect(words()).toContain(limitation);
  expect(ids('ask-answer-1').length).toBeGreaterThan(0);
  expect(ids('ask-machine-label').length).toBeGreaterThan(0);
  expect(ids('ask-no-answer')).toHaveLength(0);
  expect(ids('ask-error-empty')).toHaveLength(0);
  expect(words()).not.toContain('No written answer came back');
  expect(answerReadyAnnouncement(turn)).toBe('Answer ready, no records cited');
});

test('a cited evidence gap retains its limitation text, citation marks and cited record links', () => {
  const limitation =
    'The selected records do not establish that no receipts occurred.';
  const payload = {
    answer: limitation,
    answer_status: 'evidence_gap',
    money_ranking: true,
    model_written: false,
    citations: { 'r1/f/text/0': [[0, limitation.length]] },
    sources: [source(1, true)],
  };
  const turn = answer(decodeAnswer(payload));
  const { words, ids, renderer, press } = draw(turn);
  expect(words()).toContain(limitation);
  expect(words()).toContain('Records cited (1)');
  expect(words()).not.toContain('Records found');
  expect(ids('ask-no-answer')).toHaveLength(0);
  expect(ids('ask-citation-1').length).toBeGreaterThan(0);
  expect(
    renderer.root.findAllByType(CitationMark).map((mark) => mark.props.label),
  ).toEqual(['1']);
  act(() => press('ask-citation-mark-1'));
  expect(citationSelection()).toMatchObject({ turn: 'fixture-chat:1', n: 1 });
  expect(turn.result?.answer).toBe(payload.answer);
  expect(turn.result?.citations).toEqual(payload.citations);
  expect(answerReadyAnnouncement(turn)).toBe('Answer ready, 1 record cited');
});

test('on iPad with the pane the column hides Records cited', () => {
  const { ids } = draw(answer(), true);
  expect(ids('ask-records-1')).toHaveLength(0);
  expect(ids('ask-answer-1').length).toBeGreaterThan(0);
});

test('the ready announcement counts cited records', () => {
  expect(answerReadyAnnouncement(answer())).toBe(
    'Answer ready, 3 records cited',
  );
  expect(answerReadyAnnouncement(answer({ sources: [source(1, true)] }))).toBe(
    'Answer ready, 1 record cited',
  );
  expect(answerReadyAnnouncement(answer({ sources: [] }))).toBe(
    'Answer ready, no records cited',
  );
});

describe('the iPad pane is never empty', () => {
  function Pane({
    thread,
    chat = 'fixture-chat',
  }: {
    thread: Turn[];
    chat?: string;
  }) {
    return useAskSources(thread, {
      chat,
      profiles,
      onAsk: mockAsk,
    }).pane;
  }
  const mockAsk = jest.fn();
  function drawPane(thread: Turn[]) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Pane thread={thread} />);
    });
    mounted.push(renderer);
    return helpers(renderer);
  }
  test('a source title is decoded once in the pane and its opened record', () => {
    const title = "Australia's &amp; interests";
    const turn = answer({
      sources: [
        source(1, true, [], {
          title: 'Australia&#039;s &amp;amp; interests',
          slug: 'press-pmt-fixture-title',
          href: '/doc/press-pmt-fixture-title',
        }),
      ],
    });
    const { words, ids, press, renderer } = drawPane([question, turn]);
    expect(words()).toContain(title);
    expect(ids('citation-title')[0]!.props.children).toBe(title);
    act(() => press('citation-open-record'));
    expect(renderer.root.findByType(RecordDetail).props.entry.title).toBe(
      title,
    );
    // The pane's record opened in place: one source open, placed, unnamed.
    expect(
      jest
        .mocked(track)
        .mock.calls.filter(([event]) => event === 'opax_source_open'),
    ).toEqual([
      [
        'opax_source_open',
        {
          from_section: 'other',
          destination: 'app',
          placement: 'sources_pane',
        },
      ],
    ]);
  });
  test('idle: Try asking, whose starters ask at once', () => {
    const { words, renderer, press } = drawPane([]);
    expect(words()).toContain('Try asking');
    expect(words()).not.toContain('Sources appear here');
    const starters = renderer.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        /^ask-pane-starter-\d$/.test(n.props.testID) &&
        typeof n.props.onPress === 'function',
    );
    expect(starters.length).toBeGreaterThanOrEqual(3);
    act(() => press('ask-pane-starter-0'));
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(words()).toContain(mockAsk.mock.calls[0]![0]);
  });
  test('after an answer: citation 1 in the citation anatomy, then the records', () => {
    const { words, ids, press } = drawPane([question, answer()]);
    expect(words()).toContain('Synthetic passage 1 from the record.');
    expect(ids('citation-passage').length).toBeGreaterThan(0);
    expect(ids('citation-open-record').length).toBeGreaterThan(0);
    expect(words()).toContain('Records cited (3)');
    expect(words()).toContain('Also found, not cited');
    expect(words()).toContain('Synthetic Fixture Bill 4');
    // A record row selects its citation in the pane and highlights its claim.
    act(() => press('ask-pane-source-3'));
    expect(words()).toContain('Synthetic passage 3 from the record.');
    expect(citationSelection()).toEqual({
      turn: 'fixture-chat:1',
      n: 3,
      claim: { block: '0', sentence: 1 },
    });
    act(() => press('ask-pane-previous'));
    expect(citationSelection()?.n).toBe(2);
    expect(presentSheet).not.toHaveBeenCalled();
  });
  test('Up and Down move between sources; they never open a record', () => {
    const { words } = drawPane([question, answer()]);
    act(() => dispatchKeyCommand('list-down'));
    act(() => dispatchKeyCommand('list-down'));
    expect(citationSelection()?.n).toBe(2);
    expect(words()).toContain('Synthetic passage 2 from the record.');
    act(() => dispatchKeyCommand('list-up'));
    expect(citationSelection()?.n).toBe(1);
    expect(presentSheet).not.toHaveBeenCalled();
  });
  test('another conversation with the same number of turns starts at its first citation', () => {
    const { words, press, renderer } = drawPane([question, answer()]);
    act(() => press('ask-pane-source-3'));
    const next = answer({ sources: [source(1, true)] });
    act(() =>
      renderer.update(<Pane chat="fixture-other" thread={[question, next]} />),
    );
    expect(words()).toContain('Synthetic passage 1 from the record.');
    expect(citationSelection()).toBeNull();
  });
  test('an earlier citation stays available when another answer arrives in the same conversation', () => {
    const { press, renderer } = drawPane([question, answer()]);
    act(() => press('ask-pane-source-3'));
    const selected = citationSelection();
    act(() =>
      renderer.update(
        <Pane thread={[question, answer(), question, answer()]} />,
      ),
    );
    expect(citationSelection()).toEqual(selected);
  });
});
