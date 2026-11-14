import { billSentenceCase, billStatusWord } from './bill-transforms';

/**
 * The one place a bill's status becomes words: the status pill on every
 * bill row and header, its VoiceOver label, the status event beside it, the
 * status filters, the follows line, and where the bill-stage tracker says a
 * bill stopped. Everything calls `billStatusReading` or `billStatusLabel`, so
 * the pill and the tracker can't disagree.
 *
 * The register's `status` files every bill that died as `lapsed`:
 * negatived, discharged, removed from the Notice Paper and lapsed alike.
 *
 * - When the bills export carries `ended` (ParlInfo's own ending, on index
 *   rows and bill files alike), that is the word, everywhere: "Voted down",
 *   "Removed from the Notice Paper", "Discharged from the Notice Paper". A
 *   counted vote, when one is linked, only adds where and when.
 * - Without it (an export or a cache from before `ended`), a bill file reads
 *   "Voted down" only on firm evidence in its own record (`billVotedDown`):
 *   its last recorded stage fell on the day of a counted vote, at that
 *   reading and in that house, against the bill's own question; or
 *   ParlInfo's first-reading pattern. 56 bills, every one negatived in
 *   ParlInfo (tests/fixtures/bill-stages/voted-down-keys.json). An index
 *   row has no record to read and says the register's "Lapsed".
 */

export type BillHouse = 'representatives' | 'senate';

/** The register's stage names: scripts/bills_registry/bills_common.py. */
export type BillStageToken =
  | 'introduced'
  | 'second_reading'
  | 'committee'
  | 'third_reading'
  | 'passed'
  | 'royal_assent'
  | 'other';

export const BILL_STAGE_TOKENS: ReadonlySet<string> = new Set<BillStageToken>([
  'introduced',
  'second_reading',
  'committee',
  'third_reading',
  'passed',
  'royal_assent',
  'other',
]);

/** Stages that name the house they happened in. */
export const CHAMBER_STAGES: ReadonlySet<string> = new Set<BillStageToken>([
  'introduced',
  'second_reading',
  'committee',
  'third_reading',
  'other',
]);

/** "second_reading", "Second reading" and "second reading" are one stage. */
export function billStageToken(stage: string | null | undefined): string {
  return String(stage ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function billHouse(house: string | null | undefined): BillHouse | null {
  const h = String(house ?? '')
    .trim()
    .toLowerCase();
  if (h === 'representatives' || h === 'house' || h === 'reps') {
    return 'representatives';
  }
  if (h === 'senate') return 'senate';
  return null;
}

export interface BillStageRow {
  stage: string;
  date: string;
  house: string | null;
}

export interface BillDivisionRow {
  date: string;
  house: string;
  stage: string | null;
  outcome: string;
  question?: string | null;
  title?: string | null;
}

/** What the bill's own record holds, when the caller has it. */
export interface BillStatusEvidence {
  stages?: readonly BillStageRow[] | null;
  divisions?: readonly BillDivisionRow[] | null;
  /** The export's `ended`: how ParlInfo says a dead bill ended. */
  ended?: string | null;
  /** The export's `ended_label`: its words, for a code the app doesn't know. */
  ended_label?: string | null;
}

/** A bill's `ended` and `ended_label`, as index rows and bill files carry them. */
export const billEnding = (bill: {
  ended?: string | null;
  ended_label?: string | null;
}): BillStatusEvidence => ({
  ended: bill.ended,
  ended_label: bill.ended_label,
});

/** Where a bill was voted down: the stage, the house and the day. */
export interface BillVotedDown {
  stage: 'introduced' | 'second_reading' | 'committee' | 'third_reading';
  house: BillHouse;
  date: string;
  /** A counted vote is linked: the division behind it. */
  counted: boolean;
}

export type BillStatusState =
  | 'alive'
  | 'passed'
  | 'stopped'
  | 'draft'
  | 'unknown';

export interface BillStatusReading {
  /** The pill's word: "Voted down", "Lapsed", "Passed", "Before parliament". */
  word: string;
  state: BillStatusState;
  /** The export's `ended` code the word came from, or null. */
  ended: string | null;
  /** Where and when it was voted down, when the record shows it. */
  votedDown: BillVotedDown | null;
  /**
   * The day a bill stopped, when its record dates it: the vote that
   * defeated it (or, negatived with none linked, its final recorded day), or
   * the row the register files a lapse or a removal under (`other`, "Lapsed
   * at dissolution") when nothing comes after it.
   */
  stoppedOn: string | null;
}

/**
 * The export's ending codes (scripts/export_bills.py ENDED_LABELS), in the
 * same words. A code not listed here reads its `ended_label`.
 */
const ENDED_WORDS: Record<string, string> = {
  negatived: 'Voted down',
  removed: 'Removed from the Notice Paper',
  discharged: 'Discharged from the Notice Paper',
  withdrawn: 'Withdrawn',
  laid_aside: 'Laid aside',
  not_proceeding: 'Not proceeding',
  lapsed: 'Lapsed',
};

function endingOf(evidence: BillStatusEvidence | null | undefined) {
  const code = String(evidence?.ended ?? '')
    .trim()
    .toLowerCase();
  if (!code) return null;
  const word =
    ENDED_WORDS[code] ??
    (String(evidence?.ended_label ?? '').trim() || billSentenceCase(code));
  return { code, word };
}

const STOPPED =
  /^(lapsed|withdrawn|negatived|defeated|discharged|failed|not passed|not proceeding|not proceeded with|removed from the notice paper)\b/;
const DEFEATED = /^(negatived|defeated|failed|not passed)\b/;
const FOLDED = /^lapsed\b/;

const READING: Record<string, RegExp> = {
  introduced: /^first reading$/i,
  second_reading: /^second reading$/i,
  third_reading: /^third reading$/i,
};

/**
 * Words that mark a vote on a procedure, not on the bill itself: "First
 * Reading - Suspend the usual procedural rules", an amendment to the second
 * reading motion. They Vote For You names a division "<bill> - <stage> -
 * <what was asked>", so only the last part is read (bill titles say
 * "Amendment" too).
 */
const PROCEDURAL =
  /suspen|procedur|amendment|adjourn|closure|end debate|limitation|postpone|refer|defer|business|leave|instruction/i;

function asked(division: BillDivisionRow): string {
  const q = String(division.question || division.title || '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = q.split(/\s+[-–—]\s+/);
  return parts.length >= 3 ? parts[parts.length - 1]! : q.slice(0, 200);
}

/** The record's dated stage rows, in order: an undated row can't place. */
function datedRows(evidence: BillStatusEvidence | null | undefined) {
  return (evidence?.stages ?? [])
    .map((s, index) => ({
      token: billStageToken(s.stage),
      date: String(s.date ?? '').slice(0, 10),
      house: billHouse(s.house),
      index,
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
}

/**
 * The firm evidence that a bill was voted down, read from its own record,
 * or null. Says nothing about whether the bill is dead: callers ask the
 * status that (`billStatusReading`).
 */
export function billVotedDown(
  evidence: BillStatusEvidence | null | undefined,
): BillVotedDown | null {
  const rows = datedRows(evidence);
  const stages = rows.filter(
    (r) => CHAMBER_STAGES.has(r.token) && r.token !== 'other',
  );
  const last = stages[stages.length - 1];
  if (!last?.house) return null;
  // A bill the record moves on after that reading was not stopped there.
  if (rows.some((r) => r.date > last.date)) return null;
  const found = (): BillVotedDown => ({
    stage: last.token as BillVotedDown['stage'],
    house: last.house!,
    date: last.date,
    counted: false,
  });
  // ParlInfo's "First reading negatived" is filed as a second `introduced`
  // row, the same day and house as the first: the house refused to let the
  // bill in (7 of 7 across the record, with or without a counted vote).
  if (
    stages.every((r) => r.token === 'introduced') &&
    stages.some((r, i) =>
      stages.some(
        (o, j) => j !== i && o.date === r.date && o.house === r.house,
      ),
    )
  ) {
    return found();
  }
  const reading = READING[last.token];
  if (!reading) return null;
  const against = (evidence?.divisions ?? []).some(
    (d) =>
      /^negative$/i.test(String(d.outcome).trim()) &&
      billHouse(d.house) === last.house &&
      d.date === last.date &&
      reading.test(String(d.stage ?? '').trim()) &&
      !PROCEDURAL.test(asked(d)),
  );
  return against ? { ...found(), counted: true } : null;
}

/**
 * Where ParlInfo's "negatived" fell, when no counted vote is linked: the
 * bill's last recorded stage in a house ("Second reading negatived",
 * "Negatived in Committee of the Whole").
 */
function negativedAt(
  evidence: BillStatusEvidence | null | undefined,
): BillVotedDown | null {
  const stages = datedRows(evidence).filter(
    (r) => CHAMBER_STAGES.has(r.token) && r.token !== 'other' && r.house,
  );
  const last = stages[stages.length - 1];
  return last
    ? {
        stage: last.token as BillVotedDown['stage'],
        house: last.house!,
        date: last.date,
        counted: false,
      }
    : null;
}

/** The bill's final recorded day. */
function finalDay(evidence: BillStatusEvidence | null | undefined) {
  const rows = datedRows(evidence);
  return rows.length ? rows[rows.length - 1]!.date : null;
}

/** The day of the last recorded row, when it is an `other` row. */
function lapsedOn(evidence: BillStatusEvidence | null | undefined) {
  const rows = datedRows(evidence);
  const last = rows[rows.length - 1];
  return last?.token === 'other' ? last.date : null;
}

/** A bill's status as the reader sees it, with what it rests on. */
export function billStatusReading(
  status: string | null | undefined,
  evidence?: BillStatusEvidence | null,
): BillStatusReading {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  const state: BillStatusState =
    s === 'before parliament'
      ? 'alive'
      : s === 'passed' || s === 'act' || s === 'assent'
        ? 'passed'
        : STOPPED.test(s)
          ? 'stopped'
          : s === 'exposure draft'
            ? 'draft'
            : 'unknown';
  const ending = state === 'stopped' ? endingOf(evidence) : null;
  if (ending) {
    // ParlInfo's own ending decides the word. A linked vote only adds where
    // and when; without one, the final recorded day dates it.
    const votedDown =
      ending.code === 'negatived'
        ? (billVotedDown(evidence) ?? negativedAt(evidence))
        : null;
    const stoppedOn =
      ending.code === 'negatived'
        ? (votedDown?.date ?? finalDay(evidence))
        : lapsedOn(evidence);
    return {
      word: ending.word,
      state,
      ended: ending.code,
      votedDown,
      stoppedOn,
    };
  }
  // The register's `lapsed` folds every dead bill together, so only the
  // record can say one was voted down. A word ParlInfo gave itself
  // (negatived, withdrawn, discharged) is taken as it stands.
  const defeated = DEFEATED.test(s);
  const votedDown = defeated || FOLDED.test(s) ? billVotedDown(evidence) : null;
  const word =
    defeated || votedDown
      ? 'Voted down'
      : billStatusWord(status) || 'Status not recorded';
  const stoppedOn =
    state !== 'stopped' ? null : (votedDown?.date ?? lapsedOn(evidence));
  return { word, state, ended: null, votedDown, stoppedOn };
}

/** The status pill's word (and its VoiceOver label's). */
export function billStatusLabel(
  status: string | null | undefined,
  evidence?: BillStatusEvidence | null,
): string {
  return billStatusReading(status, evidence).word;
}
