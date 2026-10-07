import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Button } from '../src/design/primitives';
import { AnswerCaption } from '../src/features/talk/AnswerCaption';
import { canReport, talkMenu, timeLeft } from '../src/features/talk/menu';
import type { TranscriptTurn, VoiceSource } from '../src/voice';
import { reportChoices } from '../src/features/talk/reportAnswer';

const answered: TranscriptTurn[] = [
  { role: 'agent', id: 1, text: 'Synthetic answer' },
];
// Reporting moved from each caption to Talk's More menu.
function menuFor(
  transcript: TranscriptTurn[],
  onReport: (path: string | null) => void = jest.fn(),
  sources: VoiceSource[] = [],
) {
  const item = talkMenu({
    live: true,
    active: true,
    typing: false,
    report: canReport(transcript),
    records: reportChoices(sources),
    consent: true,
    onType: jest.fn(),
    onReport,
    onPrivacy: jest.fn(),
    onWithdraw: jest.fn(),
  });
  if (item.type !== 'menu') throw new Error('Expected the More menu');
  return item.menu.items;
}
const reportItem = (
  transcript: TranscriptTurn[],
  onReport?: (path: string | null) => void,
  sources?: VoiceSource[],
) =>
  menuFor(transcript, onReport, sources).find(
    (entry) => entry.label === 'Report this answer',
  );
const press = (item: ReturnType<typeof reportItem>) => {
  if (item?.type !== 'action') throw new Error('Expected a report action');
  act(() => item.onPress());
};

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
  press(item);
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(null);
});

test('caption corrections cannot change the data sent by the report control', () => {
  const report = jest.fn();
  const sources = [{ path: '/bill/example', title: 'Bill record' }];
  press(
    reportItem(
      [{ role: 'agent', id: 1, text: 'Original synthetic answer' }],
      report,
      sources,
    ),
  );
  press(
    reportItem(
      [{ role: 'agent', id: 1, text: 'Corrected synthetic answer' }],
      report,
      sources,
    ),
  );
  expect(report.mock.calls).toEqual([['/bill/example'], ['/bill/example']]);
});

test('during a call the menu title changes only at five minutes and each minute after', () => {
  const titles = new Set(
    Array.from({ length: 601 }, (_, seconds) => timeLeft(true, seconds, null)),
  );
  expect([...titles]).toEqual([
    'Under a minute left in this call',
    '1 min left in this call',
    '2 min left in this call',
    '3 min left in this call',
    '4 min left in this call',
    '5 min left in this call',
    'Over 5 min left in this call',
  ]);
});

test('the menu keeps web pages out of a call and offers withdrawal only after consent', () => {
  const during = talkMenu({
    live: true,
    active: true,
    typing: false,
    report: false,
    records: [],
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
    records: [],
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
    expect(reportChoices(sources)).toEqual([]);
    const report = jest.fn();
    press(reportItem(answered, report, sources));
    expect(report).toHaveBeenCalledWith(null);
  },
);

test('reports only the single valid call record path, never its title', () => {
  const report = jest.fn();
  press(
    reportItem(answered, report, [
      { path: '/bill/example', title: 'Private caption words' },
      { path: '/subject/electorate/example', title: 'Other words' },
      { path: '/bill/example', title: 'Duplicate source' },
    ]),
  );
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith('/bill/example');
  expect(JSON.stringify(report.mock.calls)).not.toContain('caption');
});

test('chooses among call-level records by title and reports only the selected path', () => {
  const report = jest.fn();
  const item = reportItem(answered, report, [
    { path: '/bill/example', title: 'Bill record' },
    { path: '/money/receipts', title: 'Receipt records' },
  ]);
  if (item?.type !== 'submenu') throw new Error('Expected a record choice');
  expect(report).not.toHaveBeenCalled();
  expect(item.items.map((entry) => entry.label)).toEqual([
    'Bill record',
    'Receipt records',
  ]);
  const receipts = item.items[1]!;
  if (receipts.type !== 'action') throw new Error('Expected an action');
  act(() => receipts.onPress());
  expect(report).toHaveBeenCalledWith('/money/receipts');
  expect(report.mock.calls).toEqual([['/money/receipts']]);
});
