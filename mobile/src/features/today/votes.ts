import {
  count,
  date,
  nonempty,
  nullable,
  optional,
  rows,
  shape,
  text,
  type Decoded,
} from '../../api/validation';
import { formatDate, unbroken } from '../../design/format';
import { isProcedural, outcomeWord } from '../bills/divisions';

/**
 * `/divisions/recent.json` (data lane D1): the newest divisions with their
 * stage. Until the file ships the read is a 404 and How parliament voted is
 * not drawn. Rows the decoder cannot read are dropped (and counted as a
 * partial file), never guessed.
 */
const division = shape({
  bill_key: nonempty,
  title: nonempty,
  short_title: optional(nullable(text)),
  division_key: nonempty,
  stage: optional(nullable(text)),
  question_type: optional(nullable(text)),
  chamber: optional(nullable(text)),
  date,
  outcome: optional(nullable(text)),
  ayes: count,
  noes: count,
});
export const decodeRecentDivisions = shape({
  generated_at: date,
  divisions: rows(division, 'division'),
});
export type RecentDivisions = Decoded<typeof decodeRecentDivisions>;
export type RecentDivision = RecentDivisions['divisions'][number];

/** The rule said in its sheet, word for word (DIR 5.12). */
export const VOTES_RULE =
  'The newest votes on whether a bill be read a second or third time. Procedural votes and amendments are left out.';

const READING = /\b(second|third) reading\b/i;
const AMENDMENT = /amendment/i;
/** Second- and third-reading votes only; procedure and amendments are out. */
export function isReadingVote(
  row: Pick<RecentDivision, 'stage' | 'question_type'>,
) {
  const stage = String(row.stage ?? '').replace(/_/g, ' ');
  if (row.question_type === 'procedural' || row.question_type === 'amendment')
    return false;
  return READING.test(stage) && !AMENDMENT.test(stage) && !isProcedural(stage);
}

/** "House of Representatives" / "Senate" from the record's chamber word. */
export function chamberWord(chamber: string | null | undefined): string | null {
  const c = String(chamber ?? '').toLowerCase();
  if (/senate/.test(c)) return 'Senate';
  if (/house|representatives|reps/.test(c)) return 'House of Representatives';
  return null;
}

/** "Second reading", "Third reading": the stage as a reader says it. */
export function stageWords(stage: string | null | undefined): string | null {
  const match = READING.exec(String(stage ?? '').replace(/_/g, ' '));
  return match
    ? `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1).toLowerCase()} reading`
    : null;
}

/** The block's rows: the newest reading votes, newest first. */
export function recentReadingVotes(file: RecentDivisions, limit = 3) {
  return file.divisions
    .filter(isReadingVote)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.division_key.localeCompare(a.division_key, undefined, {
          numeric: true,
        }),
    )
    .filter(
      (row, index, all) =>
        all.findIndex(
          (other) =>
            other.bill_key === row.bill_key &&
            other.date.slice(0, 10) === row.date.slice(0, 10),
        ) === index,
    )
    .slice(0, Math.max(0, limit))
    .map((row) => ({
      ...row,
      name: row.short_title?.trim() || row.title,
      outcomeWord: outcomeWord(row.outcome, row),
      stageWords: stageWords(row.stage),
      chamberWords: chamberWord(row.chamber),
    }));
}
export type ReadingVote = ReturnType<typeof recentReadingVotes>[number];

/**
 * A Today vote row's meta line: "Second reading · House · 19 Aug 2026". The
 * chamber is its short name on Today and the date never breaks, so the line
 * never ends on a lone date or splits one (sweep 1, item 3).
 */
export function voteMeta(
  vote: Pick<ReadingVote, 'stageWords' | 'chamberWords' | 'date'>,
): string {
  const chamber =
    vote.chamberWords === 'House of Representatives'
      ? 'House'
      : vote.chamberWords;
  const day = formatDate(vote.date, 'short');
  return [vote.stageWords, chamber, day ? unbroken(day) : null]
    .filter(Boolean)
    .join(' · ');
}
