import {
  BILL_STAGE_TOKENS,
  CHAMBER_STAGES,
  billHouse,
  billStageToken,
  billStatusReading,
  type BillDivisionRow,
  type BillHouse,
  type BillStageRow,
  type BillStageToken,
} from '../../api/bill-status';
import type { TermId } from '../learn/glossary';

/**
 * The bill-stage tracker's model: six steps a reader can follow, built from
 * the bill's recorded stages (README §8.3 of the newcomer design pass).
 *
 *   1 Introduced in <first house>   2 Second reading
 *   3 Consideration in detail       4 Passed <first house>
 *   5 <The other house>             6 Royal Assent
 *
 * The register's stage names are a small closed set, written by
 * scripts/bills_registry/bills_common.py from ParlInfo's wording:
 * introduced, second_reading, committee, third_reading, passed,
 * royal_assent and other. Measured against ParlInfo's own words for every
 * federal bill (tests/fixtures/bill-stages), not guessed:
 * - `committee` is Committee of the Whole (Senate) or consideration in
 *   detail (House): the whole house going through the bill part by part. It
 *   is never a committee inquiry, which the stage list doesn't record, so a
 *   bill with none is "None recorded", never "Not referred". In the older
 *   records it can also be the Federation Chamber, filed before the second
 *   reading is agreed, so only a row after the second reading counts.
 * - `other` is everything else: messages between the houses, the
 *   Federation Chamber, lapsing, removal from the Notice Paper. It never
 *   moves a step on its own.
 * - The status folds every dead bill (negatived, lapsed, discharged,
 *   removed) into `lapsed`. Where it stopped and why is the status pill's
 *   word, from the one helper both call (api/bill-status.ts), so the pill
 *   and the tracker never disagree: the export's `ended` when it carries
 *   one ("Voted down", "Removed from the Notice Paper"); without it,
 *   "Voted down" only on firm evidence in the bill's own record, otherwise
 *   the register's "Lapsed".
 *
 * A step that must have happened but has no row is done with no date: the
 * tracker never invents one. Anything the six steps can't say truthfully
 * (an unknown stage name or house, a status the steps don't cover, a
 * Constitution Alteration past both houses, which goes to a referendum
 * instead) returns `null`, and How it moved keeps its dated list.
 */

export type TrackerStepId =
  | 'introduced'
  | 'second'
  | 'detail'
  | 'passedFirst'
  | 'other'
  | 'assent';

export type TrackerStepState =
  /** The record says it happened. */
  | 'done'
  /** Where the bill is now. */
  | 'current'
  /** Still ahead of a live bill. */
  | 'upcoming'
  /** An optional step the bill went past with none recorded. */
  | 'skipped'
  /** Where a dead bill stopped. */
  | 'ended'
  /** After the step where a bill stopped. */
  | 'unreached';

/** The status pill's word for a dead bill: "Voted down", "Lapsed". */
export type TrackerStopWord = string;

export interface TrackerStep {
  id: TrackerStepId;
  /** 1 to 6. */
  number: number;
  label: string;
  state: TrackerStepState;
  /** The day the record gives for the step, or null. */
  date: string | null;
  /**
   * The word under the label when no date stands there: "Now", "None
   * recorded", "No date recorded", or the stop word.
   */
  note: string | null;
}

export interface Tracker {
  /** The house the bill started in. */
  first: TrackerHouse;
  steps: TrackerStep[];
  /** One line: what VoiceOver reads first and the card shows first. */
  summary: string;
}

export type TrackerHouse = BillHouse;

/** A stage row as the bill payload carries it (`key_dates`). */
export type TrackerStageRow = BillStageRow;

/** A counted vote, as the bill payload carries it (`divisions`). */
export type TrackerDivision = BillDivisionRow;

export interface TrackerInput {
  stages: readonly TrackerStageRow[];
  status: string | null | undefined;
  /** The bill's `originating_house`, when the record names one. */
  originatingHouse?: string | null;
  title?: string | null;
  divisions?: readonly TrackerDivision[];
  /** The Acts the bill became (`acts`): proof of assent, with its day. */
  acts?: readonly { assent_date: string | null }[];
  /** The export's `ended` and `ended_label`: ParlInfo's own ending. */
  ended?: string | null;
  ended_label?: string | null;
}

/** Why a bill keeps the dated list instead of the tracker. */
export type TrackerFallback =
  | { reason: 'unknown-stage'; value: string }
  | { reason: 'unknown-house'; value: string }
  | { reason: 'unknown-status'; value: string }
  | { reason: 'no-stages' }
  | { reason: 'contradiction'; value: string }
  | { reason: 'referendum' }
  /**
   * Passed, with neither assent nor final passage filed: the register's
   * `passed` also covers "Passed both houses", so the steps can't say
   * whether it is law.
   */
  | { reason: 'unproven-assent' };

export type TrackerResult =
  | { kind: 'tracker'; tracker: Tracker }
  | { kind: 'fallback'; fallback: TrackerFallback };

type Token = BillStageToken;

export const TRACKER_STEPS = 6;

const ORDER: readonly TrackerStepId[] = [
  'introduced',
  'second',
  'detail',
  'passedFirst',
  'other',
  'assent',
];

const other = (house: TrackerHouse): TrackerHouse =>
  house === 'senate' ? 'representatives' : 'senate';

interface Row {
  token: Token;
  date: string;
  house: TrackerHouse | null;
  index: number;
}

function lastDate(rows: readonly Row[]): string | null {
  return rows.length ? rows[rows.length - 1]!.date : null;
}

/** The tracker for a bill, or why it keeps the dated list. */
export function billTracker(input: TrackerInput): TrackerResult {
  const fallback = (f: TrackerFallback): TrackerResult => ({
    kind: 'fallback',
    fallback: f,
  });
  const rows: Row[] = [];
  // A row with no usable day still says the stage happened; it only can't
  // date a step or take a place in the order.
  const undated = new Set<string>();
  for (const [index, s] of input.stages.entries()) {
    const t = billStageToken(s.stage);
    if (!BILL_STAGE_TOKENS.has(t)) {
      return fallback({ reason: 'unknown-stage', value: String(s.stage) });
    }
    const house = billHouse(s.house);
    if (CHAMBER_STAGES.has(t) && !house) {
      return fallback({ reason: 'unknown-house', value: String(s.house) });
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(s.date ?? ''))) {
      undated.add(CHAMBER_STAGES.has(t) ? `${t}:${house}` : t);
      continue;
    }
    rows.push({
      token: t as Token,
      date: String(s.date).slice(0, 10),
      // "Finally passed both Houses" names the house that passed it last.
      house: CHAMBER_STAGES.has(t) || t === 'passed' ? house : null,
      index,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  // The status as the pill reads it: alive, passed, or stopped and why.
  const reading = billStatusReading(input.status, {
    stages: input.stages,
    divisions: input.divisions,
    ended: input.ended,
    ended_label: input.ended_label,
  });
  const life =
    reading.state === 'alive' || reading.state === 'passed'
      ? reading.state
      : reading.state === 'stopped'
        ? { dead: reading.word }
        : null;
  if (!life) {
    return fallback({
      reason: 'unknown-status',
      value: String(input.status ?? ''),
    });
  }
  const chamberRows = rows.filter((r) => r.house);
  if (!chamberRows.length) return fallback({ reason: 'no-stages' });

  const first =
    billHouse(input.originatingHouse) ??
    rows.find((r) => r.token === 'introduced')?.house ??
    chamberRows[0]!.house!;
  const second = other(first);
  const inHouse = (house: TrackerHouse, t?: Token) =>
    rows.filter((r) => r.house === house && (!t || r.token === t));

  const assentRows = rows.filter((r) => r.token === 'royal_assent');
  const acts = input.acts ?? [];
  const assented =
    assentRows.length > 0 || acts.length > 0 || undated.has('royal_assent');
  const passedRows = rows.filter((r) => r.token === 'passed');
  const firstThird = inHouse(first, 'third_reading');
  const secondRows = inHouse(second).filter((r) => r.token !== 'other');
  const inSecondUndated = [...undated].some(
    (u) => u.endsWith(`:${second}`) && !u.startsWith('other:'),
  );
  const secondThird = inHouse(second, 'third_reading');

  if (life === 'alive' && assented) {
    return fallback({ reason: 'contradiction', value: 'royal_assent' });
  }
  const bothHouses =
    passedRows.length > 0 ||
    undated.has('passed') ||
    assented ||
    life === 'passed';
  if (bothHouses && /^constitution alteration\b/i.test(input.title ?? '')) {
    // Past both houses, a change to the Constitution goes to the voters,
    // not straight to the Governor-General.
    return fallback({ reason: 'referendum' });
  }
  if (
    life === 'passed' &&
    !assented &&
    !passedRows.length &&
    !secondRows.length &&
    !inSecondUndated
  ) {
    return fallback({ reason: 'contradiction', value: 'passed' });
  }
  if (
    life === 'passed' &&
    !assented &&
    !passedRows.length &&
    !undated.has('passed')
  ) {
    return fallback({ reason: 'unproven-assent' });
  }

  // Where a dead bill was voted down, when the record shows it, and the
  // pill's word for why it stopped.
  const downAt = reading.votedDown;
  const stopWord: TrackerStopWord | null =
    typeof life === 'object' ? life.dead : null;
  const downInFirst = (t: Token) =>
    downAt?.stage === t && downAt.house === first;

  // How far the record proves the bill went. Each test is "this step, or
  // anything that can only come after it".
  const reachedSecondHouse =
    secondRows.length > 0 || inSecondUndated || bothHouses;
  const thirdInFirst =
    firstThird.length > 0 || undated.has(`third_reading:${first}`);
  const passedFirst =
    (thirdInFirst && !downInFirst('third_reading')) || reachedSecondHouse;
  const firstSecond = inHouse(first, 'second_reading');
  // Rows are in the record's order, so "after the second reading" is a
  // position, not a day: much of a bill's passage can fall on one day.
  const at = (r: Row | undefined) => (r ? rows.indexOf(r) : -1);
  const lastSecond = at(firstSecond[firstSecond.length - 1]);
  const lastThird = at(firstThird[firstThird.length - 1]);
  const committeeRows = inHouse(first, 'committee');
  // The second reading was agreed once consideration in detail began after
  // it.
  let detailRows = committeeRows.filter(
    (r) =>
      lastSecond >= 0 &&
      at(r) > lastSecond &&
      (lastThird < 0 || at(r) < lastThird),
  );
  // A committee row before the second reading ends is the Federation
  // Chamber taking the bill (older records file it so); the first one after
  // is the Chamber handing it back, not consideration in detail.
  if (lastSecond >= 0 && committeeRows.some((r) => at(r) < lastSecond)) {
    detailRows = detailRows.slice(1);
  }
  const pastSecond = passedFirst || detailRows.length > 0 || thirdInFirst;

  // The day each done step finished. The second reading's is its last
  // day before the house moved on.
  const next = at(detailRows[0] ?? firstThird[0]);
  const beforeNext =
    next < 0 ? firstSecond : firstSecond.filter((r) => at(r) < next);
  const dates: Record<TrackerStepId, string | null> = {
    introduced: inHouse(first, 'introduced')[0]?.date ?? null,
    second: pastSecond ? lastDate(beforeNext) : null,
    detail: lastDate(detailRows),
    passedFirst: lastDate(firstThird),
    // The other house's third reading, or its final passage when ParlInfo
    // files only that.
    other: bothHouses
      ? (lastDate(secondThird) ?? lastDate(inHouse(second, 'passed')))
      : null,
    assent:
      assentRows[0]?.date ??
      acts.find((a) => a.assent_date)?.assent_date?.slice(0, 10) ??
      null,
  };
  const done: Record<TrackerStepId, boolean> = {
    // Voted down at the first reading: the bill never got in.
    introduced: !downInFirst('introduced'),
    second: pastSecond,
    // Negatived in Committee of the Whole: stopped there.
    detail: detailRows.length > 0 && !downInFirst('committee'),
    passedFirst,
    other: bothHouses,
    // Passed both houses with no assent recorded is waiting for it.
    assent: assented,
  };
  // An optional step the bill went past: consideration in detail.
  const skipped = (id: TrackerStepId) =>
    id === 'detail' && !done.detail && (passedFirst || thirdInFirst);
  // The other house passed it, but not yet in the same words as the first:
  // it is back where it started, for the other house's changes.
  const backWith =
    !bothHouses && secondThird.length > 0
      ? first === 'senate'
        ? 'the Senate'
        : 'the House'
      : null;

  // Steps 1 and 4 say what happened once it has, and name the stage until
  // then, so a bill stopped there never reads "Passed the House".
  const firstName = first === 'senate' ? 'the Senate' : 'the House';
  const labels = (id: TrackerStepId, isDone: boolean): string => {
    switch (id) {
      case 'introduced':
        return isDone ? `Introduced in ${firstName}` : 'First reading';
      case 'second':
        return 'Second reading';
      case 'detail':
        return 'Consideration in detail';
      case 'passedFirst':
        return isDone ? `Passed ${firstName}` : 'Third reading';
      case 'other':
        return second === 'senate' ? 'The Senate' : 'The House';
      case 'assent':
        return 'Royal Assent';
    }
  };

  let placed = false;
  const steps: TrackerStep[] = ORDER.map((id, i) => {
    const isDone = !placed && done[id];
    const base = { id, number: i + 1, label: labels(id, isDone) };
    if (isDone) {
      const date = dates[id];
      return {
        ...base,
        state: 'done',
        date,
        note: date ? null : 'No date recorded',
      };
    }
    if (!placed && skipped(id)) {
      return { ...base, state: 'skipped', date: null, note: 'None recorded' };
    }
    if (!placed) {
      placed = true;
      if (stopWord) {
        return {
          ...base,
          state: 'ended',
          date: reading.stoppedOn,
          note: stopWord,
        };
      }
      return {
        ...base,
        state: 'current',
        date: null,
        note:
          id === 'other' && backWith ? `Passed, back in ${backWith}` : 'Now',
      };
    }
    return {
      ...base,
      state: stopWord ? 'unreached' : 'upcoming',
      date: null,
      note: null,
    };
  });
  return {
    kind: 'tracker',
    tracker: { first, steps, summary: trackerSummary(steps) },
  };
}

/** The tracker's one line, which leads the card and VoiceOver. */
export function trackerSummary(steps: readonly TrackerStep[]): string {
  const at = steps.find((s) => s.state === 'current' || s.state === 'ended');
  if (!at) return `All ${steps.length} steps done: this bill is law.`;
  if (at.state === 'ended') {
    return `Stopped at step ${at.number} of ${steps.length}: ${at.label}. ${at.note}.`;
  }
  return at.note && at.note !== 'Now'
    ? `Step ${at.number} of ${steps.length}: ${at.label}. ${at.note}.`
    : `Step ${at.number} of ${steps.length}: ${at.label}, now.`;
}

/** Each step's explainer: its glossary term (content/learn/glossary.json). */
export function trackerStepTerm(
  id: TrackerStepId,
  first: TrackerHouse,
): TermId {
  switch (id) {
    case 'introduced':
      return 'first-reading';
    case 'second':
      return 'second-reading';
    case 'detail':
      return 'consideration-in-detail';
    case 'passedFirst':
      return 'third-reading';
    case 'other':
      return first === 'senate' ? 'house-of-representatives' : 'senate';
    case 'assent':
      return 'royal-assent';
  }
}
