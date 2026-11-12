import { act } from 'react';
import { FlatList, Text as NativeText, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useReduceMotion } from '../src/design/accessibility';
import { Text } from '../src/design/text';
import { colors } from '../src/design/tokens';
import { ReaderList, findMatches } from '../src/features/records/ReaderList';
import { entityMatches, findAliases } from '../src/features/records/find';

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
    ['Vic', 'Victoria'],
    ['Qld', 'Queensland'],
    ['WA', 'Western Australia'],
    ['SA', 'South Australia'],
    ['Tas', 'Tasmania'],
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
    const matches = entityMatches(text, [query]);
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

test('aliases merge overlapping hits once, in reading order, without matching inside other names', () => {
  expect(
    entityMatches('A short Example Union and Example Workers Association.', [
      'Example Union',
      'Example Workers Association',
      'Example Workers',
    ]),
  ).toEqual([
    { start: 8, end: 21 },
    { start: 26, end: 53 },
  ]);
  expect(entityMatches('Unrelated', ['related'])).toEqual([]);
  expect(findAliases('{broken')).toEqual([]);
  expect(findAliases('["Known alias", false, 42]')).toEqual(['Known alias']);
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
