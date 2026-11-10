import { act } from 'react';
import { FlatList } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useReduceMotion } from '../src/design/accessibility';
import { ReaderList } from '../src/features/records/ReaderList';

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
