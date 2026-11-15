/**
 * The hidden "send a test error report" control (docs/ANALYTICS.md): the
 * version line at the foot of Account, tapped seven times within a few
 * seconds, then confirmed. It proves end to end that error reports arrive
 * and are symbolicated. It lives here, not in features/account, because the
 * voice-off release bundles only a few files from that folder.
 */
import { Alert } from 'react-native';
import { analyticsEnabled, sendTestErrorReport } from './index';

export const TEST_REPORT_TAPS = 7;
export const TEST_REPORT_WINDOW_MS = 4000;
export const testReportCopy = {
  title: 'Send a test error report?',
  body: 'This sends one anonymous test report, marked as a test, so we can check that error reports arrive. It holds nothing about you or what you read.',
  cancel: 'Cancel',
  send: 'Send',
  sentTitle: 'Test report sent',
  sentBody: 'It can take a few minutes to arrive.',
  offTitle: 'Test reports are off in this build',
  offBody:
    'Only store release builds with anonymous diagnostics send error reports. This build sends nothing.',
};

let taps: number[] = [];
/** Forget the taps so far (tests). */
export function resetTestReportTaps() {
  taps = [];
}

/**
 * One tap on the version line. Nothing happens until the seventh tap inside
 * the window; then a confirmation, and only its Send sends. A build that
 * sends nothing says so instead.
 */
export function testReportTap(now: number = Date.now()) {
  taps = [
    ...taps.filter((at) => now >= at && now - at < TEST_REPORT_WINDOW_MS),
    now,
  ];
  if (taps.length < TEST_REPORT_TAPS) return;
  taps = [];
  const off = () =>
    Alert.alert(testReportCopy.offTitle, testReportCopy.offBody);
  if (!analyticsEnabled()) {
    off();
    return;
  }
  Alert.alert(testReportCopy.title, testReportCopy.body, [
    { text: testReportCopy.cancel, style: 'cancel' },
    {
      text: testReportCopy.send,
      onPress: () => {
        if (sendTestErrorReport())
          Alert.alert(testReportCopy.sentTitle, testReportCopy.sentBody);
        else off();
      },
    },
  ]);
}
