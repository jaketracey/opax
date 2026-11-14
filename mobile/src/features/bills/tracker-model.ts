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
 *   removed) into `lapsed`. A bill reads "Voted down" only when its last
 *   recorded stage falls on the day of a counted vote, at that same reading
 *   and in that house, that went against the bill's own question (53 of 53
 *   right across the record). Otherwise it reads the register's "Lapsed".
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

export type TrackerStopWord = 'Voted down' | 'Lapsed' | 'Withdrawn';

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

export type TrackerHouse = 'representatives' | 'senate';

/** A stage row as the bill payload carries it (`key_dates`). */
export interface TrackerStageRow {
  stage: string;
  date: string;
  house: string | null;
}

/** A counted vote, as the bill payload carries it (`divisions`). */
export interface TrackerDivision {
  date: string;
  house: string;
  stage: string | null;
  outcome: string;
  question?: string | null;
  title?: string | null;
}

export interface TrackerInput {
  stages: readonly TrackerStageRow[];
  status: string | null | undefined;
  /** The bill's `originating_house`, when the record names one. */
  originatingHouse?: string | null;
  title?: string | null;
  divisions?: readonly TrackerDivision[];
  /** The Acts the bill became (`acts`): proof of assent, with its day. */
  acts?: readonly { assent_date: string | null }[];
}

/** Why a bill keeps the dated list instead of the tracker. */
export type TrackerFallback =
  | { reason: 'unknown-stage'; value: string }
  | { reason: 'unknown-house'; value: string }
  | { reason: 'unknown-status'; value: string }
  | { reason: 'no-stages' }
  | { reason: 'contradiction'; value: string }
  | { reason: 'referendum' };

export type TrackerResult =
  | { kind: 'tracker'; tracker: Tracker }
  | { kind: 'fallback'; fallback: TrackerFallback };

type Token =
  | 'introduced'
  | 'second_reading'
  | 'committee'
  | 'third_reading'
  | 'passed'
  | 'royal_assent'
  | 'other';

const TOKENS: ReadonlySet<string> = new Set<Token>([
  'introduced',
  'second_reading',
  'committee',
  'third_reading',
  'passed',
  'royal_assent',
  'other',
]);

/** Stages that say which house they happened in. */
const CHAMBER: ReadonlySet<Token> = new Set<Token>([
  'introduced',
  'second_reading',
  'committee',
  'third_reading',
  'other',
]);

export const TRACKER_STEPS = 6;

const ORDER: readonly TrackerStepId[] = [
  'introduced',
  'second',
  'detail',
  'passedFirst',
  'other',
  'assent',
];

/** "second_reading", "Second reading" and "second reading" are one stage. */
function token(stage: string): string {
  return String(stage ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function houseOf(house: string | null | undefined): TrackerHouse | null {
  const h = String(house ?? '')
    .trim()
    .toLowerCase();
  if (h === 'representatives' || h === 'house' || h === 'reps') {
    return 'representatives';
  }
  if (h === 'senate') return 'senate';
  return null;
}

const other = (house: TrackerHouse): TrackerHouse =>
  house === 'senate' ? 'representatives' : 'senate';

type Life = 'alive' | 'passed' | { dead: TrackerStopWord };

/**
 * The register's status as the tracker reads it, or null for one it doesn't
 * cover (an exposure draft, a status not recorded).
 */
function lifeOf(status: string | null | undefined): Life | null {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  if (s === 'before parliament') return 'alive';
  if (s === 'passed' || s === 'act' || s === 'assent') return 'passed';
  if (/^(negatived|defeated|not passed|failed)\b/.test(s)) {
    return { dead: 'Voted down' };
  }
  if (/^(withdrawn|discharged)\b/.test(s)) return { dead: 'Withdrawn' };
  if (
    /^(lapsed|not proceeding|not proceeded with|removed from the notice paper)\b/.test(
      s,
    )
  ) {
    return { dead: 'Lapsed' };
  }
  return null;
}

interface Row {
  token: Token;
  date: string;
  house: TrackerHouse | null;
  index: number;
}

const READING: Partial<Record<Token, RegExp>> = {
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

function asked(division: TrackerDivision): string {
  const q = String(division.question || division.title || '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = q.split(/\s+[-–—]\s+/);
  return parts.length >= 3 ? parts[parts.length - 1]! : q.slice(0, 200);
}

/**
 * Whether the bill's last recorded stage was a reading the house voted
 * down: a counted vote that day, in that house, at that reading, against
 * the bill's own question, with nothing recorded after it.
 */
function votedDownAt(
  rows: readonly Row[],
  divisions: readonly TrackerDivision[],
): Row | null {
  const stages = rows.filter(
    (r) => CHAMBER.has(r.token) && r.token !== 'other',
  );
  const last = stages[stages.length - 1];
  if (!last || !last.house) return null;
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
    return last;
  }
  const reading = READING[last.token];
  if (!reading) return null;
  if (rows.some((r) => r.date > last.date)) return null;
  const against = divisions.some(
    (d) =>
      /^negative$/i.test(String(d.outcome).trim()) &&
      houseOf(d.house) === last.house &&
      d.date === last.date &&
      reading.test(String(d.stage ?? '').trim()) &&
      !PROCEDURAL.test(asked(d)),
  );
  return against ? last : null;
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
    const t = token(s.stage);
    if (!TOKENS.has(t)) {
      return fallback({ reason: 'unknown-stage', value: String(s.stage) });
    }
    const house = houseOf(s.house);
    if (CHAMBER.has(t as Token) && !house) {
      return fallback({ reason: 'unknown-house', value: String(s.house) });
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(s.date ?? ''))) {
      undated.add(CHAMBER.has(t as Token) ? `${t}:${house}` : t);
      continue;
    }
    rows.push({
      token: t as Token,
      date: String(s.date).slice(0, 10),
      house: CHAMBER.has(t as Token) ? house : null,
      index,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const life = lifeOf(input.status);
  if (!life) {
    return fallback({
      reason: 'unknown-status',
      value: String(input.status ?? ''),
    });
  }
  const chamberRows = rows.filter((r) => r.house);
  if (!chamberRows.length) return fallback({ reason: 'no-stages' });

  const first =
    houseOf(input.originatingHouse) ??
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

  // Where a dead bill was voted down, when the record shows it.
  const downAt =
    typeof life === 'object' && life.dead === 'Lapsed'
      ? votedDownAt(rows, input.divisions ?? [])
      : null;
  const stopWord: TrackerStopWord | null =
    typeof life === 'object' ? (downAt ? 'Voted down' : life.dead) : null;
  const downInFirst = (t: Token) =>
    downAt?.token === t && downAt.house === first;

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
    other: bothHouses ? lastDate(secondThird) : null,
    assent:
      assentRows[0]?.date ??
      acts.find((a) => a.assent_date)?.assent_date?.slice(0, 10) ??
      null,
  };
  const done: Record<TrackerStepId, boolean> = {
    // Voted down at the first reading: the bill never got in.
    introduced: !downInFirst('introduced'),
    second: pastSecond,
    detail: detailRows.length > 0,
    passedFirst,
    other: bothHouses,
    // Passed both houses with no assent recorded is waiting for it; an
    // older record that says passed but files neither is done, undated.
    assent:
      assented ||
      (life === 'passed' && !passedRows.length && !undated.has('passed')),
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
          date: downAt?.date ?? null,
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
