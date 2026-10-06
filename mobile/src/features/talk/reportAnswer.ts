import { ActionSheetIOS } from 'react-native';
import type { VoiceSource } from '../../voice';
import { reportAnswerUrl } from '../../voice/report-answer';

export type ReportAnswer = (recordPath: string | null) => void | Promise<void>;

// The production voice lane supplies the reporting path. No answer is stored
// or sent by this e2e/dev integration point.
export const reportAnswer: ReportAnswer = () => {};

/** Sources describe the call as a whole; captions never travel with a report. */
export function reportFromSources(
  sources: VoiceSource[],
  report: ReportAnswer,
) {
  const records = new Map<string, VoiceSource>();
  for (const source of sources) {
    try {
      // Reuse the phase-1 helper's exact public-record validation, without I/O.
      reportAnswerUrl(source.path);
      records.set(source.path, source);
    } catch {
      // Electorates, queries, fragments and other non-record paths are omitted.
    }
  }
  const choices = [...records.values()];
  if (choices.length < 2) {
    void report(choices[0]?.path ?? null);
    return;
  }
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: 'Report a linked record',
      options: [...choices.map((source) => source.title), 'Cancel'],
      cancelButtonIndex: choices.length,
    },
    (index) => {
      const source = choices[index];
      if (source) void report(source.path);
    },
  );
}
