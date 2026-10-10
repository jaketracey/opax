import { act } from 'react';
import { Modal, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  Disclosure,
  Heading,
  InfoButton,
  MachineLabel,
  ViewOriginal,
} from '../src/design/primitives';
import { showMenu } from '../src/design/menu';
import { shareRecord } from '../src/navigation/share';
import { AnswerView, reportThanks } from '../src/features/ask/AnswerView';
import { reportAnswer, reportAnswerUrl } from '../src/voice/report-answer';
import { AnswerSources } from '../src/features/ask/AnswerSources';
import type { Source, Turn } from '../src/features/ask/model';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// No portraits here: no source names a roster parliamentarian.
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
jest.mock('../src/navigation/share', () => ({
  shareRecord: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/voice/report-answer', () => ({
  ...jest.requireActual('../src/voice/report-answer'),
  reportAnswer: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => true,
}));

// Design pass 3D (concept board 5): the answer leads under its question,
// with one machine label and no "Answer" heading or ⓘ; the five utility
// rows (From the record, Retrieved records, Dates in the record, Viewed,
// Share answer) become one source line and ⋯. Synthetic fixture records.
const source = (n: number, cited: boolean): Source => ({
  resource: `r${n}`,
  title: `Synthetic Fixture Bill ${n}`,
  slug: `r${n}`,
  href: `/bill/fixture-${n}`,
  snippet: `Synthetic passage ${n} from the record.`,
  cited,
  date: `2026-08-1${n}`,
  url: `https://example.org/fixture-${n}`,
  answerRanges: cited ? [[0, 46]] : [],
});
const question: Turn = { role: 'user', text: 'Who spoke on the fixture bill?' };
const turn: Turn = {
  role: 'answer',
  text: '',
  result: {
    answer: 'The linked record is Synthetic Fixture Bill 1.',
    sources: [source(1, true), source(2, false), source(3, false)],
    citations: {},
  },
};

function draw(actions = [{ title: 'Start a new conversation', onPress: jest.fn() }]) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerView
        turn={turn}
        question={question}
        people={new Map()}
        actions={actions}
      />,
    );
  });
  const text = () =>
    renderer.root
      .findAllByType(NativeText)
      .map((n) => n.props.children)
      .flat(Infinity)
      .filter((c) => typeof c === 'string')
      .join('\n');
  const byId = (id: string) =>
    renderer.root.find(
      (n) => n.props.testID === id && typeof n.props.onPress === 'function',
    );
  return { renderer, text, byId };
}

test('the answer leads: no Answer heading or ⓘ, one machine label', () => {
  const { renderer, text } = draw();
  expect(
    renderer.root
      .findAllByType(Heading)
      .map((h) => h.props.children)
      .filter((c) => c === 'Answer'),
  ).toEqual([]);
  expect(renderer.root.findAllByType(InfoButton)).toHaveLength(0);
  expect(
    renderer.root.findAll((n) => n.props.testID === 'ask-answer-info'),
  ).toHaveLength(0);
  expect(renderer.root.findAllByType(MachineLabel)).toHaveLength(1);
  expect(text()).toContain('The linked record is Synthetic Fixture Bill 1.');
  // The cited record stays one tap away under the answer.
  expect(text()).toContain('[1] Synthetic Fixture Bill 1');
});

test('the utility rows become one source line and ⋯', () => {
  const { renderer, text, byId } = draw();
  // None of the old rows or disclosures are drawn.
  expect(renderer.root.findAllByType(Disclosure)).toHaveLength(0);
  expect(renderer.root.findAllByType(ViewOriginal)).toHaveLength(0);
  for (const old of [
    'From the record',
    'Retrieved records',
    'Dates in the record',
    'Share answer',
    'Report this answer',
    'Start a new conversation',
  ])
    expect(text()).not.toContain(old);
  // One line: the date viewed and the records behind the answer.
  expect(text()).toMatch(/Viewed \d{1,2} \w{3} \d{4} · /);
  expect(text()).toContain('3 records');
  // ⋯ offers Share and Report, then the conversation's own actions.
  act(() => byId('ask-answer-more').props.onPress());
  const [title, actions] = jest.mocked(showMenu).mock.calls.at(-1)!;
  expect(title).toBe('This answer');
  expect(actions.map((a) => a.title)).toEqual([
    'Share answer',
    'Report this answer',
    'Start a new conversation',
  ]);
  act(() => actions[0]!.onPress());
  expect(shareRecord).toHaveBeenCalledWith(
    expect.objectContaining({ path: '/ask', title: question.text }),
  );
});

test('the source line opens the sources: cited, also retrieved, dates and notes', () => {
  const { renderer, byId } = draw();
  expect(renderer.root.findAllByType(AnswerSources)).toHaveLength(0);
  act(() => byId('ask-answer-sources').props.onPress());
  const sheet = renderer.root.findByType(AnswerSources);
  expect(sheet.findAllByType(Modal)).toHaveLength(1);
  const words = sheet
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('\n');
  expect(words).toContain('Cited in the answer');
  expect(words).toContain('1. Synthetic Fixture Bill 1');
  expect(words).toContain('Synthetic passage 1 from the record.');
  expect(words).toContain('Also retrieved, not cited');
  expect(words).toContain('Synthetic Fixture Bill 3');
  expect(words).toContain('Dates in the record');
  expect(words).toContain('About this answer');
  expect(words).toContain(
    'Answers may be cached. Cite the sources, not this text.',
  );
  // Each record keeps its original, one tap from the sheet.
  expect(words.match(/View original/g)).toHaveLength(3);
});

test('while a question runs, ⋯ offers only Share and Report', () => {
  const { byId } = draw([]);
  act(() => byId('ask-answer-more').props.onPress());
  const [, actions] = jest.mocked(showMenu).mock.calls.at(-1)!;
  expect(actions.map((a) => a.title)).toEqual([
    'Share answer',
    'Report this answer',
  ]);
});

// Guideline 5.1.2(i) and Talk parity: every answer can be reported, by
// Talk's own path (src/voice/report-answer.ts): OPAX's support page in the
// in-app browser. No answer text, question, account or model call goes with
// it; the support page asks the reader for the question and the wrong words.
test('Report this answer opens Talk’s support page, then thanks the reader', async () => {
  const fetch = jest.fn();
  global.fetch = fetch as unknown as typeof global.fetch;
  const { text, byId } = draw();
  expect(text()).not.toContain(reportThanks);
  act(() => byId('ask-answer-more').props.onPress());
  const [, actions] = jest.mocked(showMenu).mock.calls.at(-1)!;
  await act(async () =>
    actions.find((a) => a.title === 'Report this answer')!.onPress(),
  );
  expect(reportAnswer).toHaveBeenCalledTimes(1);
  expect(reportAnswer).toHaveBeenCalledWith(null);
  expect(text()).toContain('Thanks. We’ll look at this answer.');
  expect(fetch).not.toHaveBeenCalled();
  // The page it opens: the published support page, with nothing appended.
  expect(new URL(reportAnswerUrl(null, true)).pathname).toBe('/support');
  expect(new URL(reportAnswerUrl(null, true)).search).toBe('');
});

test('a report that cannot open is not thanked', async () => {
  const onReport = jest.fn().mockRejectedValue(new Error('No browser'));
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerView
        turn={turn}
        question={question}
        people={new Map()}
        onReport={onReport}
      />,
    );
  });
  act(() =>
    renderer.root
      .find(
        (n) =>
          n.props.testID === 'ask-answer-more' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  const [, actions] = jest.mocked(showMenu).mock.calls.at(-1)!;
  await act(async () => {
    actions.find((a) => a.title === 'Report this answer')!.onPress();
  });
  expect(onReport).toHaveBeenCalledWith(null);
  expect(
    renderer.root.findAll((n) => n.props.testID === 'ask-report-thanks'),
  ).toHaveLength(0);
});
