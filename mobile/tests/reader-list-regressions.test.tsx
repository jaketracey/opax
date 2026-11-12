import { act } from 'react';
import { FlatList, Text as NativeText, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useReduceMotion } from '../src/design/accessibility';
import { Text } from '../src/design/text';
import { colors } from '../src/design/tokens';
import { ReaderList, findMatches } from '../src/features/records/ReaderList';
import { entityMatches } from '../src/features/records/find';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: jest.fn(() => false),
}));
const parts = [
  { id: 'one', text: 'Fixture first paragraph' },
  { id: 'two', text: 'Fixture second paragraph' },
];

test.each([
  ['Example & Co.', 'EXAMPLE and CO'],
  ['Example and Co', 'Example & Co.'],
  [
    'CFMEU Construction & General Division VIC/TAS Branch',
    'CFMEU Construction and General Division Victoria–Tasmania branch',
  ],
  ['Example, Workers (Union)', 'EXAMPLE WORKERS UNION'],
  ['Constructor & Co', 'CONSTRUCTOR and CO'],
  ...[
    ['NSW', 'New South Wales'],
    ['VIC', 'Victoria'],
    ['QLD', 'Queensland'],
    ['WA', 'Western Australia'],
    ['SA', 'South Australia'],
    ['TAS', 'Tasmania'],
    ['ACT', 'Australian Capital Territory'],
    ['NT', 'Northern Territory'],
  ].flatMap(([short, full]) => [
    [`Example ${short} branch`, `Example ${full} branch`],
    [`Example ${full} branch`, `Example ${short} branch`],
  ]),
])(
  'entity find tolerates %s and preserves the exact source highlight',
  async (query, spelling) => {
    const text = `😀 Before ${spelling}; after.`;
    const start = text.indexOf(spelling);
    const matches = entityMatches(text, query);
    const highlight = spelling.replace(/\.$/, '');
    expect(matches).toEqual([{ start, end: start + highlight.length }]);
    expect(
      findMatches([{ id: 'entity', text }], query, { tolerant: true }),
    ).toEqual([{ part: 0, start }]);
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <ReaderList
          parts={[{ id: 'entity', text }]}
          header={null}
          testID="entity-reader"
          find={{ query, tolerant: true, current: { part: 0, start } }}
        />,
      );
    });
    const marked = view.root
      .findAllByType(Text)
      .filter(
        (node) =>
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
          colors.navyWash,
      );
    expect(marked.map((node) => node.props.children)).toEqual([highlight]);
    await act(async () => view.unmount());
  },
);

test('the folded whole-word pass cannot match inside another word', () => {
  expect(entityMatches('Unrelated', 'related')).toEqual([]);
});

const territoryText =
  'Fair Work Act; ACT; NT; NSW. Australian territory; new south; the Act.';
test.each([
  ['Australian', [{ start: 29, end: 39 }]],
  ['territory', [{ start: 40, end: 49 }]],
  ['new', [{ start: 51, end: 54 }]],
  ['south', [{ start: 55, end: 60 }]],
  ['the Act', [{ start: 62, end: 69 }]],
  [
    'Act',
    [
      { start: 10, end: 13 },
      { start: 66, end: 69 },
    ],
  ],
  ['ACT', [{ start: 15, end: 18 }]],
  ['NT', [{ start: 20, end: 22 }]],
  ['NSW', [{ start: 24, end: 27 }]],
] as const)(
  '%s counts and highlights only complete source tokens',
  async (query, expected) => {
    expect(entityMatches(territoryText, query)).toEqual(expected);
    const parts = [{ id: 'territories', text: territoryText }];
    const matches = findMatches(parts, query, { tolerant: true });
    expect(matches).toEqual(expected.map(({ start }) => ({ part: 0, start })));
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <ReaderList
          parts={parts}
          header={null}
          testID="territory-reader"
          find={{ query, tolerant: true, current: matches[0]! }}
        />,
      );
    });
    const marks = view.root
      .findAllByType(Text)
      .filter(
        (node) =>
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
          colors.navyWash,
      );
    expect(marks.map((node) => node.props.children)).toEqual(
      expected.map(({ start, end }) => territoryText.slice(start, end)),
    );
    await act(async () => view.unmount());
  },
);

test.each(['Australian', 'territory', 'new', 'south'])(
  '%s has zero matches and highlights when only abbreviations and Act occur',
  async (query) => {
    const parts = [
      { id: 'abbreviations', text: 'Fair Work Act; ACT; NT; NSW.' },
    ];
    expect(entityMatches(parts[0]!.text, query)).toEqual([]);
    expect(findMatches(parts, query, { tolerant: true })).toEqual([]);
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <ReaderList
          parts={parts}
          header={null}
          testID="no-territory-reader"
          find={{ query, tolerant: true, current: null }}
        />,
      );
    });
    const marks = view.root
      .findAllByType(Text)
      .filter(
        (node) =>
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
          colors.navyWash,
      );
    expect(marks).toHaveLength(0);
    await act(async () => view.unmount());
  },
);

test.each([
  ['ACT', 'Australian Capital Territory'],
  ['WA', 'Western Australia'],
  ['SA', 'South Australia'],
  ['NT', 'Northern Territory'],
  ['NSW', 'New South Wales'],
  ['VIC', 'Victoria'],
  ['QLD', 'Queensland'],
  ['TAS', 'Tasmania'],
])('%s expands only when the source token is all capitals', (short, full) => {
  const titleCase = short[0]! + short.slice(1).toLowerCase();
  const text = `${short.toLowerCase()}; ${titleCase}; ${short}`;
  expect(entityMatches(text, full)).toEqual([
    { start: text.lastIndexOf(short), end: text.length },
  ]);
  expect(entityMatches(full, short.toLowerCase())).toEqual([]);
  expect(entityMatches(full, titleCase)).toEqual([]);
});

test.each([
  ['ACT', 'Australian capital'],
  ['ACT', 'capital territory'],
  ['NT', 'northern'],
  ['NSW', 'south wales'],
  ['NSW branch', 'south wales branch'],
  ['new NSW', 'new new south'],
])('%s cannot match a partial expansion for %s', (text, query) => {
  expect(entityMatches(text, query)).toEqual([]);
});

test.each([
  ['tax', '😀 Taxes are recorded.', 'Tax'],
  ['housing afford', 'About housing affordability.', 'housing afford'],
  ['İ', '😀 İSTANBUL', 'İ'],
])(
  'tolerant find falls back to literal %s with unchanged source offsets',
  async (query, text, highlight) => {
    const parts = [{ id: 'literal', text }];
    const matches = findMatches(parts, query, { tolerant: true });
    expect(matches).toEqual([{ part: 0, start: text.indexOf(highlight) }]);
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <ReaderList
          parts={parts}
          header={null}
          testID="literal-reader"
          find={{ query, tolerant: true, current: matches[0]! }}
        />,
      );
    });
    const marks = view.root
      .findAllByType(Text)
      .filter(
        (node) =>
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
          colors.navyWash,
      );
    expect(marks.map((node) => node.props.children)).toEqual([highlight]);
    await act(async () => view.unmount());
  },
);

test('whole-word matches anywhere in the document take precedence over substring fallback', async () => {
  const parts = [
    { id: 'one', text: 'Taxes' },
    { id: 'two', text: 'A tax' },
  ];
  const matches = findMatches(parts, 'tax', { tolerant: true });
  expect(matches).toEqual([{ part: 1, start: 2 }]);
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <ReaderList
        parts={parts}
        header={null}
        testID="whole-reader"
        find={{ query: 'tax', tolerant: true, current: matches[0]! }}
      />,
    );
  });
  const marks = view.root
    .findAllByType(Text)
    .filter(
      (node) =>
        StyleSheet.flatten(node.props.style)?.backgroundColor ===
        colors.navyWash,
    );
  expect(marks.map((node) => node.props.children)).toEqual(['tax']);
  await act(async () => view.unmount());
});

test('changing Reduce Motion preserves manual reading position and affects only the next jump', async () => {
  const scroll = jest
    .spyOn(FlatList.prototype, 'scrollToIndex')
    .mockImplementation(() => {});
  jest.mocked(useReduceMotion).mockReturnValue(false);
  let jump = { index: 1, attempt: 1, position: 0.33 };
  const draw = () => (
    <ReaderList
      parts={parts}
      header={null}
      testID="fixture-reader"
      jumpTo={jump}
    />
  );
  let view!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      view = TestRenderer.create(draw());
    });
    expect(scroll).toHaveBeenLastCalledWith({
      index: 1,
      animated: true,
      viewPosition: 0.33,
    });
    jest.mocked(useReduceMotion).mockReturnValue(true);
    await act(async () => view.update(draw()));
    expect(scroll).toHaveBeenCalledTimes(1);
    jump = { ...jump, attempt: 2 };
    await act(async () => view.update(draw()));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith({
      index: 1,
      animated: false,
      viewPosition: 0.33,
    });
    jest.mocked(useReduceMotion).mockReturnValue(false);
    await act(async () => view.update(draw()));
    expect(scroll).toHaveBeenCalledTimes(2);
    jump = { ...jump, index: 0, attempt: 3 };
    await act(async () => view.update(draw()));
    expect(scroll).toHaveBeenLastCalledWith({
      index: 0,
      animated: true,
      viewPosition: 0.33,
    });
  } finally {
    scroll.mockRestore();
  }
});

test.each([
  ['İ first and FIRST', 'first', ['first', 'FIRST']],
  ['İİ before TARGET after TARGET', 'target', ['TARGET', 'TARGET']],
  ['😀İ text TARGET', 'target', ['TARGET']],
  ['İstanbul next', 'i\u0307stanbul', ['İstanbul']],
  [
    'i\u0307stanbul / İSTANBUL next',
    'İstanbul',
    ['i\u0307stanbul', 'İSTANBUL'],
  ],
  ['ΟΣ next', 'ος', ['ΟΣ']],
])(
  'find offsets and highlights stay in the source text for %s',
  async (text, query, expected) => {
    const parts = [{ id: 'unicode', text }];
    let from = 0;
    const starts = expected.map((match) => {
      const at = text.indexOf(match, from);
      from = at + match.length;
      return { part: 0, start: at };
    });
    expect(findMatches(parts, query)).toEqual(starts);
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <ReaderList
          parts={parts}
          header={null}
          testID="unicode-reader"
          find={{ query, current: starts[0]!, passage: true }}
        />,
      );
    });
    const highlights = view.root
      .findAllByType(Text)
      .filter(
        (node) =>
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
          colors.navyWash,
      );
    expect(highlights.map((node) => node.props.children)).toEqual(expected);
    expect(highlights[0]!.props.testID).toBe('doc-passage-highlight');
    const source = view.root
      .findAllByType(NativeText)
      .find((node) => node.props.testID === 'reader-text-0')!;
    function plain(node: TestRenderer.ReactTestInstance | string): string {
      return typeof node === 'string'
        ? node
        : node.children.map(plain).join('');
    }
    expect(plain(source)).toBe(text);
  },
);
