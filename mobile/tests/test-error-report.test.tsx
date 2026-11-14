import { act } from 'react';
import { Alert } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { scrubEvent, type AnalyticsContext } from '../src/analytics/events';
import {
  TEST_REPORT_TAPS,
  TEST_REPORT_WINDOW_MS,
  resetTestReportTaps,
  testReportCopy,
  testReportTap,
} from '../src/analytics/test-report';
import { VersionFoot, linksCopy } from '../src/features/account/parts';

// docs/ANALYTICS.md, "Test error report": the version line at the foot of
// Account, tapped seven times within a few seconds, then confirmed.
const mockEnabled = jest.fn(() => true);
const mockSend = jest.fn(() => true);
jest.mock('../src/analytics', () => ({
  analyticsEnabled: () => mockEnabled(),
  sendTestErrorReport: () => mockSend(),
}));
jest.mock('../src/features/records/actions', () => ({
  copyText: jest.fn(async () => true),
}));

type Button = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const buttons = (call = 0) => (alert.mock.calls[call]![2] ?? []) as Button[];
beforeEach(() => {
  resetTestReportTaps();
  alert.mockClear();
  mockEnabled.mockReset().mockReturnValue(true);
  mockSend.mockReset().mockReturnValue(true);
});
const tap = (count: number, from = 0, gap = 100) => {
  for (let index = 0; index < count; index++) testReportTap(from + index * gap);
};

test('six taps do nothing; the seventh asks, and only Send sends', () => {
  expect(TEST_REPORT_TAPS).toBe(7);
  tap(6);
  expect(alert).not.toHaveBeenCalled();
  tap(1, 600);
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0]!.slice(0, 2)).toEqual([
    testReportCopy.title,
    testReportCopy.body,
  ]);
  // Asking is not sending.
  expect(mockSend).not.toHaveBeenCalled();
  expect(buttons().map((button) => button.text)).toEqual(['Cancel', 'Send']);
  buttons()[0]!.onPress?.();
  expect(mockSend).not.toHaveBeenCalled();
  buttons()[1]!.onPress!();
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[1]!.slice(0, 2)).toEqual([
    testReportCopy.sentTitle,
    testReportCopy.sentBody,
  ]);
});

test('slow taps never add up, and the count starts again after asking', () => {
  // Seven taps, but never seven inside the window.
  tap(20, 0, TEST_REPORT_WINDOW_MS / 6 + 1);
  expect(alert).not.toHaveBeenCalled();
  resetTestReportTaps();
  tap(7);
  expect(alert).toHaveBeenCalledTimes(1);
  tap(6, 700);
  expect(alert).toHaveBeenCalledTimes(1);
});

test('a build that sends nothing says so and offers no Send', () => {
  mockEnabled.mockReturnValue(false);
  tap(7);
  expect(alert.mock.calls).toEqual([
    [testReportCopy.offTitle, testReportCopy.offBody],
  ]);
  expect(mockSend).not.toHaveBeenCalled();
});

test('a send that did not go says the same', () => {
  mockSend.mockReturnValue(false);
  tap(7);
  buttons()[1]!.onPress!();
  expect(alert.mock.calls[1]).toEqual([
    testReportCopy.offTitle,
    testReportCopy.offBody,
  ]);
});

test('the copy has no em dashes', () => {
  for (const line of Object.values(testReportCopy))
    expect(line).not.toMatch(/[–—]/);
});

test('the version line counts taps and keeps its label, role and long press', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<VersionFoot />);
  });
  const row = tree.root.find(
    (node) =>
      node.props.testID === 'account-version' &&
      typeof node.props.onPress === 'function',
  );
  expect(row.props.accessibilityRole).toBe('text');
  expect(row.props.accessibilityLabel).toBe(linksCopy.versionSpoken('', ''));
  expect(typeof row.props.onLongPress).toBe('function');
  expect(row.props.accessibilityActions).toEqual([
    { name: 'copy', label: expect.any(String) },
  ]);
  for (let index = 0; index < 6; index++) row.props.onPress();
  expect(alert).not.toHaveBeenCalled();
  row.props.onPress();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0]![0]).toBe(testReportCopy.title);
  act(() => tree.unmount());
});

test('the test marker survives the scrubber as a flag only', () => {
  const context: AnalyticsContext = {
    platform: 'android',
    appVersion: '1.1.4',
    appBuild: '71',
    environment: 'production',
  };
  const exception = {
    $exception_list: [
      { type: 'OpaxTestReport', value: 'OPAX test error report' },
    ],
  };
  const scrub = (extra: Record<string, unknown>) =>
    scrubEvent(
      { event: '$exception', properties: { ...exception, ...extra } },
      context,
    )?.properties;
  expect(scrub({ opax_test: true })).toMatchObject({
    opax_test: true,
    $exception_list: [
      { type: 'OpaxTestReport', value: 'OPAX test error report' },
    ],
  });
  expect(scrub({})).not.toHaveProperty('opax_test');
  for (const value of ['true', 1, 'Jane Citizen', { a: 1 }])
    expect(scrub({ opax_test: value })).not.toHaveProperty('opax_test');
});
