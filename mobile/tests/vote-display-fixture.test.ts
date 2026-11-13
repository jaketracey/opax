import { billQuestionParts } from '../src/api/bill-transforms';
import { decodeBill } from '../src/api/catalog-decoders';
import {
  divisionMotion,
  divisionTitle,
  stageTitle,
} from '../src/features/bills/divisions';
import reviewed from './fixtures/vote-titles.json';
import { pinned, servedFiles } from './pinned';

// These decisions were reviewed against the explicit questions in the
// pinned records. Every unlisted vote keeps its pre-sweep recorded title.
// New fixture votes or a changed interpretation require another review.
const decisions: Record<string, string> = reviewed;
const records = servedFiles
  .filter((path) => /^\/bills\/au-federal-.*\.json$/.test(path))
  .flatMap((path) => {
    const bill = decodeBill(pinned(path));
    return bill.divisions.map((division) => ({ bill, division }));
  });

test('all 200 fixture rows match the reviewed decision or retain their recorded title', () => {
  expect(records).toHaveLength(200);
  expect(new Set(records.map(({ division }) => division.key)).size).toBe(155);
  const mismatches = records.flatMap(({ bill, division }) => {
    const head = billQuestionParts(division, bill).head;
    const old =
      division.title?.trim() ||
      stageTitle(division.stage) ||
      head?.trim() ||
      'Division';
    const title = divisionTitle({ ...division, head });
    const expected = decisions[division.key] ?? old;
    return title === expected
      ? []
      : [
          {
            bill: bill.key,
            key: division.key,
            old,
            title,
            expected,
            question: division.question,
          },
        ];
  });
  expect(mismatches).toEqual([]);
});

test('every fixture motion line is bounded and starts with words, not stray punctuation', () => {
  for (const { division } of records) {
    const motion = divisionMotion(division.question);
    if (!motion) continue;
    expect(motion.length).toBeLessThanOrEqual(240);
    expect(motion).toMatch(/^That \p{L}/u);
  }
});
