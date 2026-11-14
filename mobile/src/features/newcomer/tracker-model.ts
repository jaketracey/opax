/**
 * The bill-stage tracker's model (newcomer design pass; prototype).
 *
 * Six steps every reader can follow, built from a bill's dated stages:
 *   Introduced, Second reading, Committee, Passed the first house,
 *   The other house, Royal Assent.
 * The first house is wherever the bill started: a bill that starts in the
 * Senate reads "Passed the Senate" then "House of Representatives".
 * - `done`: a dated stage says so.
 * - `current`: the first step with no record yet, on a bill still alive.
 * - `skipped`: no record, but a later step is done (most bills never go to
 *   a committee): drawn small, "Not referred", never as a gap.
 * - `ended`: where a bill stopped (negatived, lapsed, withdrawn); every
 *   later step is `unreached`.
 */
export type StepId =
  | 'introduced'
  | 'second'
  | 'committee'
  | 'passedFirst'
  | 'other'
  | 'assent';
export type StepState =
  | 'done'
  | 'current'
  | 'upcoming'
  | 'skipped'
  | 'ended'
  | 'unreached';
export interface TrackerStep {
  id: StepId;
  label: string;
  state: StepState;
  date: string | null;
  /** The line under the label: a date, "Now", "Not referred", "Lapsed". */
  note: string | null;
}
export interface TrackerStage {
  stage: string;
  house: string | null;
  date: string;
}
type House = 'representatives' | 'senate';
const houseName = (house: House) =>
  house === 'senate' ? 'the Senate' : 'the House';
const other = (house: House): House =>
  house === 'senate' ? 'representatives' : 'senate';

/** How a dead bill's status reads on the step where it stopped. */
export function endWord(status: string | null | undefined): string | null {
  const s = (status ?? '').toLowerCase();
  if (/negatived|not passed|defeated/.test(s)) return 'Voted down';
  if (/lapsed/.test(s)) return 'Lapsed';
  if (/withdrawn|discharged|removed/.test(s)) return 'Withdrawn';
  return null;
}

export function trackerSteps(
  stages: readonly TrackerStage[],
  status?: string | null,
): TrackerStep[] {
  const first: House =
    stages.find((s) => s.house)?.house === 'senate'
      ? 'senate'
      : 'representatives';
  const second = other(first);
  const find = (test: RegExp, house?: House) =>
    stages.find(
      (s) => test.test(s.stage) && (!house || !s.house || s.house === house),
    )?.date ?? null;
  const inHouse = (house: House) =>
    stages.find((s) => s.house === house)?.date ?? null;
  const assent = find(/assent/i);
  const passedSecond =
    stages.find(
      (s) => /third reading|passed/i.test(s.stage) && s.house === second,
    )?.date ?? null;
  const dates: Record<StepId, string | null> = {
    introduced:
      find(/introduc|first reading/i, first) ?? stages[0]?.date ?? null,
    second: find(/second reading/i, first),
    committee: find(/committee|inquiry|referred|consideration in detail/i),
    passedFirst:
      stages.find(
        (s) => /third reading|passed/i.test(s.stage) && s.house === first,
      )?.date ?? null,
    other: passedSecond ?? (assent ? inHouse(second) : null),
    assent,
  };
  const labels: Record<StepId, string> = {
    introduced: `Introduced in ${houseName(first)}`,
    second: 'Second reading',
    committee: 'Committee',
    passedFirst: `Passed ${houseName(first)}`,
    other: second === 'senate' ? 'The Senate' : 'The House',
    assent: 'Royal Assent',
  };
  const order: StepId[] = [
    'introduced',
    'second',
    'committee',
    'passedFirst',
    'other',
    'assent',
  ];
  const lastDone = order.reduce((at, id, i) => (dates[id] ? i : at), -1);
  const end = endWord(status);
  // In the other house but not yet through it: that step is where it is now.
  const inOther = !dates.other && inHouse(second) !== null;
  let placed = false;
  return order.map((id, i) => {
    const date = dates[id];
    let state: StepState;
    let note: string | null = null;
    if (date) state = 'done';
    else if (i < lastDone || (id === 'committee' && inOther)) {
      state = 'skipped';
      note = id === 'committee' ? 'Not referred' : 'No date recorded';
    } else if (!placed) {
      placed = true;
      state = end ? 'ended' : 'current';
      note = end ?? 'Now';
    } else state = end ? 'unreached' : 'upcoming';
    return { id, label: labels[id], state, date, note };
  });
}

/** Four bills the tracker must read well on (capture fixtures, not real bills). */
export const trackerFixtures: readonly {
  title: string;
  status: string;
  stages: TrackerStage[];
}[] = [
  {
    title: 'In the Senate now (started in the House)',
    status: 'Before Senate',
    stages: [
      {
        stage: 'Introduced and read a first time',
        house: 'representatives',
        date: '2026-08-17',
      },
      {
        stage: 'Second reading agreed to',
        house: 'representatives',
        date: '2026-08-19',
      },
      {
        stage: 'Third reading agreed to',
        house: 'representatives',
        date: '2026-08-19',
      },
      {
        stage: 'Introduced and read a first time',
        house: 'senate',
        date: '2026-08-24',
      },
    ],
  },
  {
    title: 'Became law (started in the Senate, went to a committee)',
    status: 'Act',
    stages: [
      {
        stage: 'Introduced and read a first time',
        house: 'senate',
        date: '2026-05-11',
      },
      {
        stage: 'Second reading agreed to',
        house: 'senate',
        date: '2026-05-13',
      },
      { stage: 'Referred to committee', house: 'senate', date: '2026-05-14' },
      { stage: 'Third reading agreed to', house: 'senate', date: '2026-06-22' },
      {
        stage: 'Third reading agreed to',
        house: 'representatives',
        date: '2026-06-25',
      },
      { stage: 'Assent', house: null, date: '2026-07-01' },
    ],
  },
  {
    title: 'Voted down at its second reading',
    status: 'Negatived',
    stages: [
      {
        stage: 'Introduced and read a first time',
        house: 'representatives',
        date: '2026-03-02',
      },
    ],
  },
  {
    title: 'Lapsed in the other house',
    status: 'Lapsed',
    stages: [
      {
        stage: 'Introduced and read a first time',
        house: 'representatives',
        date: '2025-02-10',
      },
      {
        stage: 'Second reading agreed to',
        house: 'representatives',
        date: '2025-02-12',
      },
      {
        stage: 'Third reading agreed to',
        house: 'representatives',
        date: '2025-02-13',
      },
      {
        stage: 'Introduced and read a first time',
        house: 'senate',
        date: '2025-03-03',
      },
    ],
  },
];

/** Each step's explainer: the glossary term it opens. */
export const stepTerm: Record<StepId, import('./terms').TermId> = {
  introduced: 'bill',
  second: 'reading',
  committee: 'committee',
  passedFirst: 'reading',
  other: 'parliament',
  assent: 'assent',
};
