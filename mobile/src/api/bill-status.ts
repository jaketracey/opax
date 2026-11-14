import { billStatusWord } from './bill-transforms';

/**
 * The one place a bill's status becomes words: the status pill on every
 * bill row and header, its VoiceOver label, the status event beside it, the
 * status filters, the follows line, and where the bill-stage tracker says a
 * bill stopped. Everything calls `billStatusReading` or `billStatusLabel`, so
 * the pill and the tracker can't disagree.
 *
 * The register files every bill that died as `lapsed`: negatived,
 * discharged, removed from the Notice Paper and lapsed alike. A bill reads
 * "Voted down" only on firm evidence in its own record (`billVotedDown`):
 * its last recorded stage fell on the day of a counted vote, at that reading
 * and in that house, against the bill's own question; or ParlInfo's
 * first-reading pattern. Measured against ParlInfo's wording for every
 * federal bill: 56 of 56 right (tests/fixtures/bill-stages). Other dead bills
 * keep the register's word. When the export carries ParlInfo's own
 * distinction (a `negatived` status), this is where it maps, to the same
 * "Voted down".
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
}

/** Where a bill was voted down: the reading, the house and the day. */
export interface BillVotedDown {
  stage: 'introduced' | 'second_reading' | 'third_reading';
  house: BillHouse;
  date: string;
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
  /** The firm evidence behind "Voted down", when the record holds it. */
  votedDown: BillVotedDown | null;
  /**
   * The day a bill stopped, when its record dates it: the vote that
   * defeated it, or the row the register files a lapse or a removal under
   * (`other`, "Lapsed at dissolution") when nothing comes after it.
   */
  stoppedOn: string | null;
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
  return against ? found() : null;
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
  return { word, state, votedDown, stoppedOn };
}

/** The status pill's word (and its VoiceOver label's). */
export function billStatusLabel(
  status: string | null | undefined,
  evidence?: BillStatusEvidence | null,
): string {
  return billStatusReading(status, evidence).word;
}
