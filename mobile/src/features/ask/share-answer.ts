import { questionShareURL } from '../../navigation/share';
import { answerBlocks, parseAnswer, plainText } from './answer-markdown';
import { kindLine, pills } from './calculated';
import { defaultOptions, type Answer, type Turn } from './model';
import {
  citedSources,
  sourceDate,
  sourceLink,
  sourceTitle,
} from './source-present';

/**
 * When an answer was written, in the reader's own time zone (specs/ask.md
 * 6.1): "Answered 8 Nov 2026, 9:41 am · OPAX". Answers saved before answer
 * times were stored read from their conversation: the first answer from
 * `Chat.created` ("Answered 3 Nov 2026"), later ones from `Chat.updated`, a
 * bound ("Answered by 3 Nov 2026"). Never "Saved", never the capture date.
 */
export type Legacy = { at: number; bound: boolean } | null | undefined;

const SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
function parts(ms: number, timeZone?: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return {
    year: values.year!,
    month: Number(values.month) - 1,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    period: (values.dayPeriod ?? '').toLowerCase(),
  };
}
function dated(ms: number, style: 'short' | 'long', timeZone?: string) {
  const p = parts(ms, timeZone);
  return `${p.day} ${(style === 'short' ? SHORT : LONG)[p.month]} ${p.year}`;
}
function timed(ms: number, style: 'short' | 'long', timeZone?: string) {
  const p = parts(ms, timeZone);
  return `${dated(ms, style, timeZone)}, ${p.hour}:${p.minute} ${p.period}`;
}
function answered(
  turn: Turn,
  legacy: Legacy,
  style: 'short' | 'long',
  timeZone?: string,
): string | null {
  if (turn.at) return `Answered ${timed(turn.at, style, timeZone)}`;
  if (legacy)
    return `Answered ${legacy.bound ? 'by ' : ''}${dated(legacy.at * 1000, style, timeZone)}`;
  return null;
}
/** The answer's foot line: "Answered 8 Nov 2026, 9:41 am · OPAX". */
export function answeredText(
  turn: Turn,
  legacy?: Legacy,
  timeZone?: string,
): string {
  const line = answered(turn, legacy, 'short', timeZone);
  return line ? `${line} · OPAX` : 'OPAX';
}
/** The source sheet's header: "Answered 8 November 2026, 9:41 am". */
export function answeredLong(
  turn: Turn,
  legacy?: Legacy,
  timeZone?: string,
): string {
  return answered(turn, legacy, 'long', timeZone) ?? 'Answered';
}
/** "Answered 8 Nov 2026, 9:41 am" without the publisher, for reports. */
export function answeredShort(
  turn: Turn,
  legacy?: Legacy,
  timeZone?: string,
): string | null {
  return answered(turn, legacy, 'short', timeZone);
}

export function answerOf(turn: Turn): Answer {
  return (
    turn.result ?? {
      answer: turn.text,
      sources: turn.sources ?? [],
      citations: {},
    }
  );
}
/** The answer's words as plain text, the overview first when there is one. */
export function answerPlainText(answer: Answer): string {
  return [
    answer.money_overview?.trim()
      ? plainText(parseAnswer(answer.money_overview))
      : '',
    plainText(answerBlocks(answer)),
  ]
    .filter(Boolean)
    .join('\n\n');
}
/** "Records cited" (numbered as in the answer) or "Records found". */
export function recordLines(answer: Answer): string[] {
  const { cited, numbered } = citedSources(answer.sources);
  if (!cited.length) return [];
  return [
    numbered ? 'Records cited' : 'Records found',
    ...cited.map((source, i) => {
      const line = [sourceTitle(source), sourceDate(source), sourceLink(source)]
        .filter(Boolean)
        .join(', ');
      return numbered ? `[${i + 1}] ${line}` : `- ${line}`;
    }),
  ];
}
/**
 * Copy answer (journeys/ask.md 4.10): the answer as written, with its label
 * and sources, so a pasted answer keeps both.
 */
export function answerCopyText(
  question: Turn,
  answer: Turn,
  legacy?: Legacy,
  timeZone?: string,
): string {
  const data = answerOf(answer);
  const pill = pills(data);
  const when = answer.at
    ? dated(answer.at, 'short', timeZone)
    : legacy
      ? dated(legacy.at * 1000, 'short', timeZone)
      : null;
  const kind = kindLine(data);
  const sections = [
    [question.text, question.askedAs ? `Answered as: ${question.askedAs}` : '']
      .filter(Boolean)
      .join('\n'),
    [kind, answerPlainText(data)].filter(Boolean).join('\n'),
    pill.overview || pill.body
      ? `Machine-written by OPAX${when ? ` on ${when}` : ''}`
      : '',
    recordLines(data).join('\n'),
  ];
  return sections.filter(Boolean).join('\n\n');
}
/**
 * Share question (journeys/ask.md 4.10): the question and its web link,
 * which asks again. Named for what it is, not as the answer.
 */
export function questionShare(
  question: Turn,
  answer: Turn,
): { message: string; url: string } {
  return {
    message: question.text,
    url: questionShareURL(
      question.fundingQuestion || question.askedAs || question.text,
      question.options ?? answer.options ?? { ...defaultOptions },
    ),
  };
}
