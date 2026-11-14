import type { Turn } from './model';
import { citedSources, sourceLink } from './source-present';
import {
  answerOf,
  answerPlainText,
  answeredShort,
  type Legacy,
} from './share-answer';

/**
 * The report sheet's Mail fallback (journeys/ask.md 4.9): nothing is sent by
 * the app; Mail opens with the question, this answer and links to the
 * records it cites. Records are linked, not quoted, and the body stays under
 * 2,000 characters, the answer cut first.
 */
export const reportAddress = 'corrections@opax.com.au';
export const reportReasons = [
  'A source doesn’t say this',
  'A date, name or figure is wrong',
  'It isn’t neutral',
  'Something else',
] as const;
export const reportLimit = 2000;

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return '…';
  const head = text.slice(0, max - 1);
  const space = head.search(/\s\S*$/);
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}
export function reportMail({
  reason,
  note,
  question,
  answer,
  legacy,
}: {
  reason: string;
  note?: string;
  question: Turn;
  answer: Turn;
  legacy?: Legacy;
}): { url: string; subject: string; body: string } {
  const data = answerOf(answer);
  const q = question.text.replace(/\s+/g, ' ').trim();
  const subject = `Report: ${cut(q, 60)}`;
  const { cited } = citedSources(data.sources);
  const links = cited.map(sourceLink).filter(Boolean);
  const when = answeredShort(answer, legacy);
  const head = [
    `Reason: ${reason}`,
    note?.trim() ? `Detail: ${note.trim()}` : '',
    `Question: ${q}`,
    when ?? '',
  ].filter(Boolean);
  const foot = links.length ? ['Records cited', ...links] : [];
  const assemble = (text: string) =>
    [head.join('\n'), text, foot.join('\n')].filter(Boolean).join('\n\n');
  const full = answerPlainText(data);
  const room = reportLimit - 1 - assemble('').length - 2;
  let body = assemble(cut(full, Math.max(0, room)));
  // A very long note or many records: the whole body is still capped.
  if (body.length >= reportLimit) body = cut(body, reportLimit - 1);
  return {
    subject,
    body,
    url: `mailto:${reportAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}
/** "Copy report": the same message as plain text, for a device without Mail. */
export function reportText(mail: { subject: string; body: string }): string {
  return `To: ${reportAddress}\nSubject: ${mail.subject}\n\n${mail.body}`;
}
