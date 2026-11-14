import fs from 'node:fs';
import path from 'node:path';
import sample from './fixtures/bill-stages/sample.json';
import {
  billStatusLabel,
  billStatusReading,
  billVotedDown,
} from '../src/api/bill-status';
import { billDisplay } from '../src/api/bill-transforms';
import { billRowText as listRowText } from '../src/features/bills/filters';
import { billTracker } from '../src/features/bills/tracker-model';
import { billRowText as feedRowText } from '../src/features/today/BillFeed';
import { bills } from './pinned';

// The Today feed reads the catalogs at runtime; these tests read only its
// row words.
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));

/**
 * The bill status pill and the stage tracker read one helper
 * (src/api/bill-status.ts), so they can't disagree: a bill the tracker
 * shows voted down is "Voted down" on its pill, and a lapsed bill with no
 * vote that defeated it is "Lapsed" in both.
 */
type SampleBill = (typeof sample.bills)[number];
const evidence = (b: SampleBill) => ({
  stages: b.key_dates,
  divisions: b.divisions,
});
const tracked = (b: SampleBill) => {
  const result = billTracker({
    stages: b.key_dates,
    status: b.status,
    originatingHouse: b.originating_house,
    title: b.title,
    divisions: b.divisions,
    acts: b.acts,
  });
  return result.kind === 'tracker' ? result.tracker : null;
};

describe('every sampled bill: the pill says what the tracker says', () => {
  test.each(sample.bills.map((b) => [b.key, b] as const))('%s', (_key, b) => {
    const pill = billStatusLabel(b.status, evidence(b));
    const tracker = tracked(b);
    const ended = tracker?.steps.find((s) => s.state === 'ended');
    if (ended) expect(ended.note).toBe(pill);
    if (/Voted down\.$/.test(b.expected)) expect(pill).toBe('Voted down');
    if (/Lapsed\.$/.test(b.expected)) expect(pill).toBe('Lapsed');
  });
});

test('the voted-down cases: "Voted down" on the pill and the tracker', () => {
  const down = sample.bills.filter((b) => /Voted down\.$/.test(b.expected));
  expect(down.length).toBeGreaterThanOrEqual(10);
  for (const b of down) {
    expect(billStatusLabel(b.status, evidence(b))).toBe('Voted down');
    expect(tracked(b)!.summary).toMatch(/\. Voted down\.$/);
    // The register's own status is the folded `lapsed`.
    expect(b.status).toBe('lapsed');
  }
});

test('a lapsed bill with no vote evidence stays "Lapsed" in both', () => {
  // ParlInfo: "Second reading negatived", with no counted vote linked.
  const b = sample.bills.find((x) => x.key === 'au-federal-s1503')!;
  expect(billVotedDown(evidence(b))).toBeNull();
  expect(billStatusLabel(b.status, evidence(b))).toBe('Lapsed');
  expect(tracked(b)!.summary).toBe(
    'Stopped at step 2 of 6: Second reading. Lapsed.',
  );
  // And without the record at all (an index row), the register's word.
  const down = sample.bills.find((x) => x.key === 'au-federal-s986')!;
  expect(billStatusLabel(down.status)).toBe('Lapsed');
});

test('a voted-down reading says where and when', () => {
  const b = sample.bills.find((x) => x.key === 'au-federal-r5728')!;
  expect(billStatusReading(b.status, evidence(b))).toEqual({
    word: 'Voted down',
    state: 'stopped',
    votedDown: {
      stage: 'second_reading',
      house: 'senate',
      date: '2016-11-07',
    },
    stoppedOn: '2016-11-07',
  });
});

test('a status ParlInfo words itself is the one place it maps', () => {
  // When the bills export carries ParlInfo's own distinction, the helper
  // maps it; until then the register sends `lapsed` for all of these.
  expect(billStatusLabel('negatived')).toBe('Voted down');
  expect(billStatusLabel('defeated')).toBe('Voted down');
  expect(billStatusLabel('withdrawn')).toBe('Withdrawn');
  expect(billStatusLabel('discharged')).toBe('Discharged');
  expect(billStatusLabel('removed_from_the_notice_paper')).toBe(
    'Removed from the notice paper',
  );
  // Everywhere else the pill keeps its wording.
  expect(billStatusLabel('passed')).toBe('Passed');
  expect(billStatusLabel('before_parliament')).toBe('Before parliament');
  expect(billStatusLabel('exposure_draft')).toBe('Exposure draft');
  expect(billStatusLabel('lapsed')).toBe('Lapsed');
  expect(billStatusLabel('')).toBe('Status not recorded');
  // A word ParlInfo gave itself is not second-guessed by the record.
  const down = sample.bills.find((x) => x.key === 'au-federal-s986')!;
  expect(billStatusLabel('withdrawn', evidence(down))).toBe('Withdrawn');
});

describe('every row that draws a status pill reads the helper', () => {
  const indexRow = bills.bills[0]!;
  const row = { ...indexRow, ...billDisplay(indexRow), status: 'negatived' };
  test('the bills list and the iPad split sidebar (bills/filters.ts)', () => {
    expect(listRowText(row).status).toBe('Voted down');
  });
  test("Today's bill feed", () => {
    expect(feedRowText(row).status).toBe('Voted down');
  });
});

test('no screen words a bill status but the helper', () => {
  // Every pill site calls billStatusLabel or billStatusReading; nothing
  // else turns a status into words (billStatusWord is the helper's own).
  const root = path.join(__dirname, '../src');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (/\.tsx?$/.test(name)) {
        const rel = path.relative(root, file);
        const text = fs.readFileSync(file, 'utf8');
        if (
          rel !== path.join('api', 'bill-status.ts') &&
          rel !== path.join('api', 'bill-transforms.ts') &&
          /\bbillStatusWord\b/.test(text)
        )
          offenders.push(rel);
      }
    }
  };
  walk(root);
  expect(offenders).toEqual([]);
  // The sites, each through the helper.
  for (const site of [
    'api/selectors.ts',
    'features/bills/BillDetail.tsx',
    'features/bills/status-event.ts',
    'features/bills/filters.ts',
    'features/bills/tracker-model.ts',
    'features/today/BillFeed.tsx',
    'features/explore/YearBills.tsx',
    'features/search/rows.tsx',
    'features/records/DocumentReader.tsx',
    'features/follows/FollowRow.tsx',
    'features/follows/markers.ts',
  ]) {
    expect([site, fs.readFileSync(path.join(root, site), 'utf8')]).toEqual([
      site,
      expect.stringMatching(/\bbillStatus(Label|Reading)\b/),
    ]);
  }
});
