import type { SourceCitation } from '../../design/source';
import { formatCount } from '../../design/format';

/**
 * Topic counts come from OPAX's labels over six parliaments' Hansard: the
 * line says "OPAX and 6 more", the sheet names each one.
 */
export const TOPIC_CITATION: readonly SourceCitation[] = [
  { label: 'OPAX', title: 'OPAX topic labels' },
  { label: 'Federal Hansard', title: 'Federal Hansard' },
  { label: 'NSW Hansard', title: 'NSW Hansard' },
  { label: 'Victorian Hansard', title: 'Victorian Hansard' },
  { label: 'Queensland Hansard', title: 'Queensland Hansard' },
  { label: 'South Australian Hansard', title: 'South Australian Hansard' },
  { label: 'ACT Hansard', title: 'ACT Hansard' },
];
/** The decade bars are federal only. */
export const TIDE_CITATION: readonly SourceCitation[] = [
  { label: 'OPAX', title: 'OPAX topic labels' },
  { label: 'Federal Hansard', title: 'Federal Hansard' },
];
/** One name on the line, both holders in the sheet. */
export const MONEY_CITATION: readonly SourceCitation[] = [
  { label: 'AEC and OPAX', title: 'AEC annual returns' },
  { label: 'AEC and OPAX', title: 'OPAX money graph' },
];
export const SPEECHES_CITATION: readonly SourceCitation[] = [
  { label: 'OPAX', title: 'OPAX labelled speech search' },
];

export const LABEL_NOTE =
  'A model reads each speech and gives it the topics it is about. The labels are OPAX’s reading, not the record’s, and a speech can carry more than one.';
export const MONEY_CAVEAT =
  'Shown beside the debate for comparison, not as a cause.';
export const AEC_FLOOR_NOTE =
  'Donations under the disclosure threshold are not reported, so these totals are a floor, not a ceiling.';
export const PARTY_GAP_NOTE = (count: number) =>
  `Some speeches carry no party label, so parties add up to fewer than ${formatCount(count)}.`;

/** The topics source sheet's notes. */
export function topicNotes(labelled: number): string[] {
  return [
    `${formatCount(labelled)} speeches carry a topic label so far. Not every speech is labelled yet, so counts grow as labelling continues.`,
    LABEL_NOTE,
  ];
}

/** "financial years 1998-99 to 2025-26" as "1998–99 to 2025–26". */
export function moneyYears(coverage: string): string | null {
  const years = /(\d{4})-(\d{2})\D+(\d{4})-(\d{2})/.exec(coverage);
  return years ? `${years[1]}–${years[2]} to ${years[3]}–${years[4]}` : null;
}
