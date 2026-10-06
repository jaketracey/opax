import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ActionSheetIOS } from 'react-native';
import { Button } from '../src/design/primitives';
import { AnswerCaption } from '../src/features/talk/AnswerCaption';
import { canReport, talkMenu } from '../src/features/talk/menu';
import type { TranscriptTurn, VoiceSource } from '../src/voice';
import { reportFromSources } from '../src/features/talk/reportAnswer';

// Reporting moved from each caption to Talk's More menu.
function menuFor(transcript: TranscriptTurn[], onReport = jest.fn()) {
  const item = talkMenu({
    live: true,
    active: true,
    typing: false,
    report: canReport(transcript),
    consent: true,
    onType: jest.fn(),
    onReport,
    onPrivacy: jest.fn(),
    onWithdraw: jest.fn(),
  });
  if (item.type !== 'menu') throw new Error('Expected the More menu');
  return item.menu.items.flatMap((entry) =>
    entry.type === 'action' ? [entry] : [],
  );
}
const reportItem = (transcript: TranscriptTurn[], onReport = jest.fn()) =>
  menuFor(transcript, onReport).find(
    (entry) => entry.label === 'Report this answer',
  );

test.each<TranscriptTurn>([
  { role: 'user', id: 1, text: 'Synthetic question' },
  { role: 'agent', id: 2, text: ' ' },
])('does not offer reporting for $role caption "$text"', (turn) => {
  expect(canReport([turn])).toBe(false);
  expect(reportItem([turn])).toBeUndefined();
});

test('captions carry no report control and name their speaker', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerCaption
        turn={{ role: 'agent', id: 1, text: 'First synthetic answer' }}
      />,
    );
  });
  expect(renderer.root.findAllByType(Button)).toHaveLength(0);
  expect(
    renderer.root.findByProps({ testID: 'talk-turn-agent' }).props
      .accessibilityLabel,
  ).toBe('OPAX said First synthetic answer');
  act(() => renderer.unmount());
});

test('an explicit report tap passes no caption words or answer ID', () => {
  const report = jest.fn();
  const item = reportItem(
    [
      { role: 'agent', id: 1, text: 'First synthetic answer' },
      { role: 'agent', id: 2, text: 'Second synthetic answer' },
    ],
    report,
  );
  expect(report).not.toHaveBeenCalled();
  act(() => item!.onPress());
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith();
});

test('caption corrections cannot change the data sent by the report control', () => {
  const report = jest.fn();
  const original = reportItem(
    [{ role: 'agent', id: 1, text: 'Original synthetic answer' }],
    report,
  );
  const corrected = reportItem(
    [{ role: 'agent', id: 1, text: 'Corrected synthetic answer' }],
    report,
  );
  act(() => original!.onPress());
  act(() => corrected!.onPress());
  expect(report.mock.calls).toEqual([[], []]);
});

test('the menu keeps web pages out of a call and offers withdrawal only after consent', () => {
  const during = talkMenu({
    live: true,
    active: true,
    typing: false,
    report: false,
    consent: true,
    onType: jest.fn(),
    onReport: jest.fn(),
    onPrivacy: jest.fn(),
    onWithdraw: jest.fn(),
  });
  const before = talkMenu({
    live: false,
    active: false,
    typing: false,
    report: false,
    consent: false,
    onType: jest.fn(),
    onReport: jest.fn(),
    onPrivacy: jest.fn(),
    onWithdraw: jest.fn(),
  });
  const labels = (item: typeof during) =>
    item.type === 'menu'
      ? item.menu.items.map((entry) =>
          entry.type === 'action' ? entry.label : '',
        )
      : [];
  expect(labels(during)).toEqual(['Type a message', 'Withdraw voice consent']);
  expect(labels(before)).toEqual(['Voice privacy']);
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
