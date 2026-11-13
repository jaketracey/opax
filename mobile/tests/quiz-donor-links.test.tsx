/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation is an inert host in component tests. */
import { router } from 'expo-router';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { apiClient } from '../src/api/runtime';
import type { SourceDetails } from '../src/design/source';
import { quizDestination } from '../src/features/explore/quiz-links';
import type { Question } from '../src/features/explore/quiz-model';
import { QuizSourceLine } from '../src/features/explore/quiz/Reveal';
import { decodeMoneyGraph } from '../src/features/money/data';
import { forgetMoneyGraphs } from '../src/features/money/lookup';
import { OriginalsGroup } from '../src/features/sheets/SourceSheet';

// A donor round's source sheet opens that donor's own money record by its
// graph id, as the money page's "Largest donors" rows do. Every name here is
// invented.
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
    useSegments: () => ['(tabs)', '(today)'],
    useNavigation: () => ({ getState: () => ({ routes: [] }) }),
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

const cells = (total: number) => ({
  total,
  count: 2,
  firstYear: 2023,
  lastYear: 2024,
  byYear: { '2023': [total / 2, 1], '2024': [total / 2, 1] },
});
const raw = {
  meta: {
    generated: '2026-11-10',
    coverage: '2023-24 to 2024-25',
    source: 'AEC',
    methodology: 'Invented fixture.',
    exclusions: [],
    party_totals_note: 'Party node totals cover all cleaned rows.',
  },
  nodes: [
    {
      ...cells(900_000),
      // The graph id is not the name: a name-shaped id never opens it.
      id: 'donor:wattleby',
      label: 'Wattleby Holdings Pty Ltd',
      kind: 'donor',
      group: 'property',
      industry: 'property',
      aliases: ['Wattleby Holdings'],
    },
    {
      ...cells(5_000_000),
      id: 'party:Labor',
      label: 'Labor',
      kind: 'party',
      group: 'party',
      industry: 'party',
    },
  ],
  edges: [
    { ...cells(900_000), source: 'donor:wattleby', target: 'party:Labor' },
  ],
};

const donorRound = (name: string): Question =>
  ({
    template: 'money-donor-figure',
    deck: 'money',
    kind: 'slider',
    prompt: `How much has ${name} disclosed in total?`,
    answer: 900_000,
    min: 20_000,
    max: 2_000_000,
    scale: 'log',
    format: 'money',
    fact: `${name}: $900,000`,
    explanation: 'Invented round.',
    source: "AEC disclosures via OPAX's money data",
    link: {
      href: `/subject/donor/${encodeURIComponent(name)}`,
      label: `Open ${name} in the record`,
    },
  }) as Question;

let renderer: TestRenderer.ReactTestRenderer | null = null;
async function mount(q: Question) {
  await act(async () => {
    renderer = TestRenderer.create(
      <QuizSourceLine q={q} testID="quiz-source-0" />,
    );
  });
  // The graph load resolves after mount.
  await act(async () => {});
  return renderer!.root.find(
    (node) =>
      node.props.testID === 'quiz-source-0' &&
      node.props.citation !== undefined,
  ).props as SourceDetails;
}

beforeEach(() => {
  jest.clearAllMocks();
  forgetMoneyGraphs();
  jest.mocked(apiClient.get).mockImplementation(async (_path, decode) => ({
    data: decode(raw),
    stale: false,
    asOf: '2026-11-10',
    savedAt: 1,
  }));
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

test("a donor round's source opens the donor's money record by its graph id", async () => {
  const details = await mount(donorRound('Wattleby Holdings Pty Ltd'));
  expect(apiClient.get).toHaveBeenCalledWith(
    '/graph/money.json',
    expect.any(Function),
    false,
    expect.anything(),
  );
  expect(details.originals).toEqual([
    {
      label: 'Wattleby Holdings Pty Ltd',
      url: '/money?node=donor%3Awattleby',
      record: 'donations',
    },
  ]);
  // Pressing the sheet's row pushes the donor's record, never a grants rid.
  let sheet!: TestRenderer.ReactTestRenderer;
  act(() => {
    sheet = TestRenderer.create(
      <OriginalsGroup details={details} testID="sheet" />,
    );
  });
  const row = sheet.root.find(
    (node) =>
      node.props.testID === 'sheet-original-0' &&
      typeof node.props.onPress === 'function',
  );
  expect(row.props.external).toBe(false);
  act(() => row.props.onPress());
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/money-record',
    params: { node: 'donor:wattleby' },
  });
  expect(jest.mocked(router.push).mock.calls[0]![0]).not.toHaveProperty(
    'params.rid',
  );
  act(() => sheet.unmount());
});

test('a recorded spelling of the name finds the same donor; the route matches', () => {
  const graph = decodeMoneyGraph(raw);
  const destination = quizDestination(donorRound('Wattleby Holdings'), graph);
  expect(destination?.kind === 'original' && destination.route()).toEqual({
    pathname: '/money-record',
    params: { node: 'donor:wattleby', name: 'Wattleby Holdings Pty Ltd' },
  });
});

test('a donor the graph does not hold, or a graph that fails to load, gives no link', async () => {
  expect(
    (await mount(donorRound('Quillon Example Pty Ltd'))).originals,
  ).toEqual([]);
  // No partial match either: the map search's substring is not confident.
  expect(
    quizDestination(donorRound('Wattleby'), decodeMoneyGraph(raw)),
  ).toBeNull();
  act(() => renderer?.unmount());
  forgetMoneyGraphs();
  jest.mocked(apiClient.get).mockRejectedValue(new Error('offline'));
  expect(
    (await mount(donorRound('Wattleby Holdings Pty Ltd'))).originals,
  ).toEqual([]);
});

test('a round with no donor never loads the money graph', async () => {
  const q = {
    ...donorRound('Wattleby Holdings Pty Ltd'),
    template: 'money-industry-magnitude',
    link: { href: '/money?industry=property', label: 'Open the money map' },
  } as Question;
  const details = await mount(q);
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(details.originals).toHaveLength(1);
});
