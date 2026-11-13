import { formatDate } from '../../design/format';
import type { SourceDetails } from '../../design/source';
import type { MoneyGraph } from '../money/data';
import { quizDestination } from './quiz-links';
import type { Question } from './quiz-model';

/** The publisher short names (explore spec 1.4): who produced the fact. */
export const QUIZ_PUBLISHERS = [
  'AEC annual returns',
  'OPAX topics',
  'OPAX',
  'ParlInfo',
  'Hansard',
  'Wikimedia Commons',
  'OPAX quiz questions',
] as const;
export type QuizPublisher = (typeof QUIZ_PUBLISHERS)[number];

/** Speech counts computed from OPAX's topic labels. */
const topicTemplates = new Set([
  'words-topic-figure',
  'words-topic-higher-lower',
  'words-year-order',
  'words-peak-year',
  'words-portrait-topic',
]);
/** OPAX's own text, samples and counts that are not topic counts. */
const opaxTemplates = new Set([
  'words-year-voice',
  'words-biggest-source',
  'words-record-true-false',
]);

/**
 * The E4 table, applied where the engine has not set `publisher`: by
 * template first, then by source. Machine text and topic counts are never
 * Hansard's: only a question about one speech as itself is.
 */
export function quizPublisher(q: Question): QuizPublisher {
  if (
    q.publisher &&
    (QUIZ_PUBLISHERS as readonly string[]).includes(q.publisher)
  )
    return q.publisher as QuizPublisher;
  const t = q.template;
  if (t === 'money-true-false')
    return /^AEC\b/.test(q.source) ? 'AEC annual returns' : 'OPAX';
  if (t.startsWith('money-')) return 'AEC annual returns';
  if (topicTemplates.has(t)) return 'OPAX topics';
  if (opaxTemplates.has(t)) return 'OPAX';
  if (t.startsWith('bill-')) return 'ParlInfo';
  if (t.startsWith('speech-')) return 'Hansard';
  if (t.startsWith('photo-')) return 'Wikimedia Commons';
  if (/^AEC\b/.test(q.source)) return 'AEC annual returns';
  if (/^ParlInfo\b/.test(q.source)) return 'ParlInfo';
  return 'OPAX';
}

/** The year a year-brief question was drawn from. */
const briefYear = (q: Question) =>
  q.template === 'words-year-voice'
    ? (/\b(19|20)\d{2}\b/.exec(q.source)?.[0] ?? null)
    : null;

/** The question's source, in plain words, for its sheet's notes. */
export function quizSourceNotes(q: Question): string[] {
  const year = briefYear(q);
  if (q.template === 'words-year-voice')
    return [
      `Counts of speeches in OPAX's sample of the debates ${year ? `its ${year} brief` : 'its year brief'} was written from. This shows who is most heard in those debates, not who spoke most in parliament.`,
      `Machine-written from the passages found for ${year ?? 'the year'}. A reading aid, not the record.`,
    ];
  switch (quizPublisher(q)) {
    case 'AEC annual returns':
      return /^AEC disclosure rules/.test(q.source)
        ? [
            'From the AEC disclosure rules and how OPAX builds its money data from annual returns.',
          ]
        : [
            "Figures are receipts disclosed in annual returns to the Australian Electoral Commission, as OPAX holds them. Each receipt is counted once, from the party's own return.",
          ];
    case 'OPAX topics':
      return [
        'Counts of speeches in the parliamentary record that have this topic label from OPAX. One speech can have more than one topic.',
      ];
    case 'ParlInfo':
      return ['From the bill as published on ParlInfo.'];
    case 'Hansard':
      return ['From the speech as published in Hansard.'];
    default:
      return q.template.startsWith('money-')
        ? ['From how OPAX builds its money data from AEC annual returns.']
        : ["From OPAX's own count of the documents it holds from each source."];
  }
}

/**
 * The reveal's source line and sheet: dated from the quiz file, published
 * by whoever produced the fact, with the question's record as its original.
 */
export function quizSourceDetails(
  q: Question,
  asOf: string,
  graph?: MoneyGraph | null,
): SourceDetails & { citation: QuizPublisher } {
  const destination = quizDestination(q, graph);
  return {
    asOf,
    citation: quizPublisher(q),
    originals: destination?.kind === 'original' ? [destination.original] : [],
    notes: quizSourceNotes(q),
  };
}

/** The intro's line and sheet: the question set as a whole. */
export function quizSetDetails(asOf: string, roundsPerDeck: number) {
  return {
    asOf,
    citation: 'OPAX quiz questions' as const,
    rule: `Each round is drawn at random from ${roundsPerDeck} rounds of eight questions for the chosen deck.`,
    notes: [
      `Questions are written from AEC annual returns and the parliamentary record as at ${formatDate(asOf, 'long')}. Figures may have changed since.`,
    ],
  } satisfies SourceDetails;
}
