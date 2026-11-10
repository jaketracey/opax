import { act } from 'react';
import { FlatList, Text as NativeText, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useReduceMotion } from '../src/design/accessibility';
import { Text } from '../src/design/text';
import { colors } from '../src/design/tokens';
import { ReaderList, findMatches } from '../src/features/records/ReaderList';

jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: jest.fn(() => false),
}));
const parts = [
  { id: 'one', text: 'Fixture first paragraph' },
  { id: 'two', text: 'Fixture second paragraph' },
];

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
