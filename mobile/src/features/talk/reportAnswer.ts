import type { VoiceSource } from '../../voice';
import { reportAnswer, reportAnswerUrl } from '../../voice/report-answer';

export type ReportAnswer = (recordPath: string | null) => void | Promise<void>;

export { reportAnswer };

/**
 * The records a report can name. Sources describe the call as a whole;
 * captions never travel with a report. More than one record is offered as
 * a choice in the More menu (menu.ts).
 */
export function reportChoices(sources: readonly VoiceSource[]): VoiceSource[] {
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
  return [...records.values()];
}
