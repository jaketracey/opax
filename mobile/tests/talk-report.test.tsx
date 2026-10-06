import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ActionSheetIOS } from 'react-native';
import { Button } from '../src/design/primitives';
import { AnswerCaption } from '../src/features/talk/AnswerCaption';
import type { TranscriptTurn, VoiceSource } from '../src/voice';
import { reportFromSources } from '../src/features/talk/reportAnswer';

test.each<TranscriptTurn>([
  { role: 'user', id: 1, text: 'Synthetic question' },
  { role: 'agent', id: 2, text: ' ' },
])('does not offer reporting for $role caption "$text"', (turn) => {
  const report = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerCaption turn={turn} onReport={report} />,
    );
  });
  expect(renderer.root.findAllByType(Button)).toHaveLength(0);
  expect(report).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('an explicit report tap passes no caption words or answer ID', () => {
  const report = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <>
        <AnswerCaption
          turn={{ role: 'agent', id: 1, text: 'First synthetic answer' }}
          onReport={report}
        />
        <AnswerCaption
          turn={{ role: 'agent', id: 2, text: 'Second synthetic answer' }}
          onReport={report}
        />
      </>,
    );
  });
  expect(report).not.toHaveBeenCalled();
  const button = renderer.root.findAllByType(Button)[1]!;
  expect(button.props.label).toBe('Report this answer');
  act(() => button.props.onPress());
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith();
  act(() => renderer.unmount());
});

test('caption corrections cannot change the data sent by the report control', () => {
  const report = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerCaption
        turn={{ role: 'agent', id: 1, text: 'Original synthetic answer' }}
        onReport={report}
      />,
    );
    renderer.update(
      <AnswerCaption
        turn={{ role: 'agent', id: 1, text: 'Corrected synthetic answer' }}
        onReport={report}
      />,
    );
  });
  expect(report).not.toHaveBeenCalled();
  act(() => renderer.root.findByType(Button).props.onPress());
  expect(report).toHaveBeenCalledWith();
  act(() => renderer.unmount());
});

test.each<{ sources: VoiceSource[] }>([
  { sources: [] },
  { sources: [{ path: '/subject/electorate/example', title: 'Electorate' }] },
  {
    sources: [{ path: '/bill/example?text=Private%20caption', title: 'Query' }],
  },
  { sources: [{ path: '/bill/example#Private-caption', title: 'Fragment' }] },
  {
    sources: [
      { path: 'https://example.invalid/bill/example', title: 'External' },
    ],
  },
])(
  'reports without a record when no call source is reportable: $sources',
  ({ sources }) => {
    const report = jest.fn();
    reportFromSources(sources, report);
    expect(report).toHaveBeenCalledWith(null);
  },
);

test('reports only the single valid call record path, never its title', () => {
  const report = jest.fn();
  reportFromSources(
    [
      { path: '/bill/example', title: 'Private caption words' },
      { path: '/subject/electorate/example', title: 'Other words' },
      { path: '/bill/example', title: 'Duplicate source' },
    ],
    report,
  );
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith('/bill/example');
  expect(JSON.stringify(report.mock.calls)).not.toContain('caption');
});

test('chooses among call-level records by title and reports only the selected path', () => {
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
  const report = jest.fn();
  reportFromSources(
    [
      { path: '/bill/example', title: 'Bill record' },
      { path: '/money/receipts', title: 'Receipt records' },
    ],
    report,
  );
  expect(report).not.toHaveBeenCalled();
  const [options, choose] = sheet.mock.calls[0]!;
  expect(options.options).toEqual(['Bill record', 'Receipt records', 'Cancel']);
  choose(options.cancelButtonIndex!);
  expect(report).not.toHaveBeenCalled();
  choose(1);
  expect(report).toHaveBeenCalledWith('/money/receipts');
  expect(report.mock.calls[0]).toEqual(['/money/receipts']);
  sheet.mockRestore();
});
