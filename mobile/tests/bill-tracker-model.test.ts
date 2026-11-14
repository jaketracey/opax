import sample from './fixtures/bill-stages/sample.json';
import {
  billTracker,
  trackerStepTerm,
  type TrackerInput,
  type TrackerStep,
} from '../src/features/bills/tracker-model';

/**
 * The bill-stage tracker against 72 real federal bills, read from the live
 * app payload on 14 Nov 2026 (tests/fixtures/bill-stages/sample.json). Each
 * expected line was checked by hand against ParlInfo's own wording for the
 * bill, which the fixture carries beside the payload as `parlinfo`.
 */
type SampleBill = (typeof sample.bills)[number];

const input = (bill: SampleBill): TrackerInput => ({
  stages: bill.key_dates,
  status: bill.status,
  originatingHouse: bill.originating_house,
  title: bill.title,
  divisions: bill.divisions,
  acts: bill.acts,
});

const read = (bill: SampleBill) => {
  const result = billTracker(input(bill));
  return result.kind === 'tracker'
    ? result.tracker.summary
    : `Falls back: ${result.fallback.reason}`;
};

const bill = (key: string) => {
  const found = sample.bills.find((b) => b.key === key);
  if (!found) throw new Error(`${key} is not in the sample`);
  return found;
};

const steps = (key: string): TrackerStep[] => {
  const result = billTracker(input(bill(key)));
  if (result.kind !== 'tracker') throw new Error(`${key} fell back`);
  return result.tracker.steps;
};

const compact = (key: string) =>
  steps(key).map((s) =>
    [s.number, s.label, s.state, s.date ?? s.note].join(' | '),
  );

test('the sample covers every case the brief names, in at least 60 bills', () => {
  expect(sample.bills.length).toBeGreaterThanOrEqual(60);
  const cases = new Set(sample.bills.map((b) => b.case));
  for (const c of [
    'senate-first-now',
    'senate-first-law-detail',
    'senate-first-lapsed',
    'lapsed-first-house',
    'lapsed-other-house',
    'voted-down-first-reading',
    'voted-down-second-reading',
    'voted-down-third-reading',
    'voted-down-other-house',
    'withdrawn-discharged',
    'consideration-in-detail',
    'federation-chamber',
    'amended-in-other-house',
    'amendments-back-and-forth',
    'no-date-recorded',
    'old-sparse',
  ]) {
    expect(cases).toContain(c);
  }
});

describe('every sampled bill reads its checked line', () => {
  test.each(sample.bills.map((b) => [b.key, b.case, b] as const))(
    '%s (%s)',
    (_key, _case, b) => {
      expect(read(b)).toBe(b.expected);
    },
  );
});

test('how many sampled bills map cleanly and how many keep the dated list', () => {
  const fallbacks = sample.bills.filter(
    (b) => billTracker(input(b)).kind === 'fallback',
  );
  expect(sample.bills.length - fallbacks.length).toBe(69);
  expect(fallbacks.map((b) => b.key)).toEqual([
    'au-federal-r7019',
    'au-federal-ed-online-safety-digital-duty-of-care-2026',
    'au-federal-alrc-4163',
  ]);
});

test('stage names the tracker does not know fall back, and are listed here', () => {
  const known = new Set([
    'introduced',
    'second_reading',
    'committee',
    'third_reading',
    'passed',
    'royal_assent',
    'other',
  ]);
  const unknown = sample.bills.flatMap((b) =>
    b.key_dates.map((d) => d.stage).filter((s) => !known.has(s)),
  );
  // The one in the live record: an exposure draft, before Parliament.
  expect([...new Set(unknown)]).toEqual(['Exposure draft released']);
  const draft = bill('au-federal-ed-online-safety-digital-duty-of-care-2026');
  expect(billTracker(input(draft))).toEqual({
    kind: 'fallback',
    fallback: { reason: 'unknown-stage', value: 'Exposure draft released' },
  });
});

describe('started in the Senate', () => {
  test('the first house is the Senate and the other house is the House', () => {
    expect(compact('au-federal-s1518')).toEqual([
      '1 | Introduced in the Senate | done | 2026-09-15',
      '2 | Second reading | done | 2026-09-17',
      '3 | Consideration in detail | skipped | None recorded',
      '4 | Passed the Senate | done | 2026-09-17',
      '5 | The House | current | Now',
      '6 | Royal Assent | upcoming | ',
    ]);
    expect(read(bill('au-federal-s1518'))).toBe('Step 5 of 6: The House, now.');
  });

  test('became law through the Senate and its committee of the whole', () => {
    // ParlInfo: "Committee of the Whole debate (Amendment details: 21
    // Government, 6 Opposition and 1 Australian Greens agreed to)".
    expect(compact('au-federal-s990')).toEqual([
      '1 | Introduced in the Senate | done | 2014-12-03',
      '2 | Second reading | done | 2015-05-11',
      '3 | Consideration in detail | done | 2015-05-11',
      '4 | Passed the Senate | done | 2015-05-11',
      '5 | The House | done | 2015-05-13',
      '6 | Royal Assent | done | 2015-05-26',
    ]);
  });

  test('its explainer for the other house is the House', () => {
    expect(trackerStepTerm('other', 'senate')).toBe('house-of-representatives');
    expect(trackerStepTerm('other', 'representatives')).toBe('senate');
  });
});

describe('lapsed', () => {
  test('in the other house: stopped there, later steps not reached', () => {
    // ParlInfo: passed the Senate, then "Lapsed at dissolution" in the House.
    expect(compact('au-federal-s1384')).toEqual([
      '1 | Introduced in the Senate | done | 2023-06-22',
      '2 | Second reading | done | 2024-08-21',
      '3 | Consideration in detail | done | 2024-08-21',
      '4 | Passed the Senate | done | 2024-08-21',
      '5 | The House | ended | Lapsed',
      '6 | Royal Assent | unreached | ',
    ]);
  });

  test('before its third reading, the step names the stage, never "Passed"', () => {
    expect(read(bill('au-federal-r6256'))).toBe(
      'Stopped at step 4 of 6: Third reading. Lapsed.',
    );
  });

  test('a discharged bill reads the register status, Lapsed', () => {
    // The register files ParlInfo's "Discharged from Notice Paper" as lapsed.
    expect(read(bill('au-federal-s1284'))).toBe(
      'Stopped at step 2 of 6: Second reading. Lapsed.',
    );
  });
});

describe('voted down', () => {
  test('at the second reading, on the day of the counted vote', () => {
    // ParlInfo: "Second reading negatived", 4 Dec 2014.
    expect(compact('au-federal-s986')).toEqual([
      '1 | Introduced in the Senate | done | 2014-11-27',
      '2 | Second reading | ended | 2014-12-04',
      '3 | Consideration in detail | unreached | ',
      '4 | Third reading | unreached | ',
      '5 | The House | unreached | ',
      '6 | Royal Assent | unreached | ',
    ]);
    expect(steps('au-federal-s986')[1]!.note).toBe('Voted down');
  });

  test('in the other house', () => {
    expect(read(bill('au-federal-r5728'))).toBe(
      'Stopped at step 5 of 6: The Senate. Voted down.',
    );
  });

  test('at the third reading, which never reads "Passed the Senate"', () => {
    expect(read(bill('au-federal-s1464'))).toBe(
      'Stopped at step 4 of 6: Third reading. Voted down.',
    );
  });

  test('at the first reading: the house refused to let it in', () => {
    expect(read(bill('au-federal-s1463'))).toBe(
      'Stopped at step 1 of 6: First reading. Voted down.',
    );
    // The same fingerprint with the vote filed under "Bill".
    expect(read(bill('au-federal-s1500'))).toBe(
      'Stopped at step 1 of 6: First reading. Voted down.',
    );
  });

  test('a procedural vote at a reading is not the bill voted down', () => {
    const b = bill('au-federal-s1518');
    const result = billTracker({
      ...input(b),
      status: 'lapsed',
      divisions: [
        {
          date: '2026-09-17',
          house: 'representatives',
          stage: 'First Reading',
          outcome: 'negative',
          question:
            'Example Bill 2026 - First Reading - Suspend the usual procedural rules',
        },
      ],
    });
    expect(result.kind === 'tracker' && result.tracker.summary).toBe(
      'Stopped at step 5 of 6: The House. Lapsed.',
    );
  });

  test('a negatived bill with no linked vote keeps the register status', () => {
    expect(read(bill('au-federal-s1503'))).toBe(
      'Stopped at step 2 of 6: Second reading. Lapsed.',
    );
  });

  test('a status the register may send later says so directly', () => {
    const b = bill('au-federal-s1488');
    for (const [status, word] of [
      ['negatived', 'Voted down'],
      ['withdrawn', 'Withdrawn'],
      ['discharged', 'Withdrawn'],
      ['not_proceeded_with', 'Lapsed'],
    ] as const) {
      const result = billTracker({ ...input(b), status, divisions: [] });
      expect(result.kind === 'tracker' && result.tracker.summary).toBe(
        `Stopped at step 2 of 6: Second reading. ${word}.`,
      );
    }
  });
});

describe('no date recorded', () => {
  test('a step the bill must have passed is done, undated, never invented', () => {
    // ParlInfo files no Senate third reading; the bill finally passed.
    expect(compact('au-federal-r5920')[4]).toBe(
      '5 | The Senate | done | No date recorded',
    );
    expect(steps('au-federal-r5920')[4]!.date).toBeNull();
    expect(compact('au-federal-alrc-2361')[3]).toBe(
      '4 | Passed the House | done | No date recorded',
    );
  });

  test("assent with no stage row takes the Act's assent date", () => {
    expect(steps('au-federal-r7421')[5]).toMatchObject({
      state: 'done',
      date: '2026-01-21',
    });
  });

  test('a stage row without a usable date is skipped, not dated', () => {
    const b = bill('au-federal-r7539');
    const result = billTracker({
      ...input(b),
      stages: b.key_dates.map((d) =>
        d.stage === 'royal_assent' ? { ...d, date: '' } : d,
      ),
      // With no Act either, nothing gives the assent a day.
      acts: [],
    });
    expect(result.kind).toBe('tracker');
    if (result.kind !== 'tracker') return;
    expect(result.tracker.steps[5]).toMatchObject({
      state: 'done',
      date: null,
      note: 'No date recorded',
    });
  });
});

describe('the other steps', () => {
  test('consideration in detail the bill went without reads None recorded', () => {
    expect(steps('au-federal-r7539')[2]).toMatchObject({
      state: 'skipped',
      note: 'None recorded',
    });
  });

  test('the Federation Chamber is not consideration in detail', () => {
    // Older records file "Referred to / Reported from Federation Chamber" as
    // committee rows; ParlInfo records no consideration in detail here.
    expect(steps('au-federal-alrc-2430')[2]).toMatchObject({
      state: 'skipped',
    });
  });

  test('passed by the other house, back in the first for its changes', () => {
    expect(read(bill('au-federal-r7500'))).toBe(
      'Step 5 of 6: The Senate. Passed, back in the House.',
    );
  });

  test('a Constitution Alteration past both houses keeps the dated list', () => {
    // It goes to a referendum, not to the Governor-General.
    expect(billTracker(input(bill('au-federal-r7019')))).toEqual({
      kind: 'fallback',
      fallback: { reason: 'referendum' },
    });
  });
});

describe('never crashes, never claims', () => {
  test('an unknown house falls back', () => {
    expect(
      billTracker({
        stages: [{ stage: 'introduced', date: '2026-01-01', house: 'Assent' }],
        status: 'before_parliament',
      }),
    ).toEqual({
      kind: 'fallback',
      fallback: { reason: 'unknown-house', value: 'Assent' },
    });
  });

  test.each([[null], [''], ['exposure_draft'], ['unknown']])(
    'status %p falls back',
    (status) => {
      const result = billTracker({
        ...input(bill('au-federal-r7539')),
        status,
      });
      expect(result.kind).toBe('fallback');
    },
  );

  test('a live bill with royal assent recorded is a contradiction', () => {
    const result = billTracker({
      ...input(bill('au-federal-r7539')),
      status: 'before_parliament',
    });
    expect(result).toEqual({
      kind: 'fallback',
      fallback: { reason: 'contradiction', value: 'royal_assent' },
    });
  });

  test('no stages at all falls back', () => {
    expect(billTracker({ stages: [], status: 'lapsed' }).kind).toBe('fallback');
  });

  test('odd input does not throw', () => {
    expect(() =>
      billTracker({
        stages: [
          // @ts-expect-error: a malformed row from an old cache
          { stage: null, date: null, house: undefined },
        ],
        status: 'passed',
      }),
    ).not.toThrow();
  });

  test('the sentence-cased stages the app shows read the same as the tokens', () => {
    const b = bill('au-federal-s1384');
    const cased = b.key_dates.map((d) => ({
      ...d,
      stage: d.stage.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    }));
    expect(billTracker({ ...input(b), stages: cased })).toEqual(
      billTracker(input(b)),
    );
  });
});
