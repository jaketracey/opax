import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const load = async (entry) => {
  const out = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const { moneyOverviewPrompt, verifiedOverview } = await load('../src/ask-money-overview.ts');
const { rankedMoneyAnswer } = await load('../src/ask-money.ts');
const assets = { fetch: async (req) => new Response(await readFile(new URL('../public' + new URL(req.url).pathname, import.meta.url))) };

const facts = {
  question: 'Who receives the most funding from fossil fuel donors?',
  ranked_by: 'recipient party',
  selection: 'Financial years: 1998–99 to 2024–25. 9 donors with matching receipts. Federal (AEC).',
  rows: [
    { name: 'Liberal', amount: '$9,013,973', records: '508 disclosed receipt records' },
    { name: 'Labor', amount: '$8,526,686', records: '743 disclosed receipt records' },
  ],
  derived: ['Gap between Liberal and Labor: $487,287', 'Everything below Liberal, added together: $8,526,686', "Liberal's share of the shown total ($17,540,659): 51%"],
  limits: ['These are party receipts, not personal payments to politicians.'],
};

test('the prompt hands over the figures and forbids working any out', () => {
  const prompt = moneyOverviewPrompt(facts);
  assert.match(prompt, /\$9,013,973/);
  assert.match(prompt, /Gap between Liberal and Labor: \$487,287/);
  assert.match(prompt, /copied from THE FIGURES above, character for character/);
  assert.match(prompt, /Work nothing out/);
  assert.match(prompt, /not personal payments to politicians/);
});

test('an opening that only restates the sheet is kept', () => {
  const written = 'Liberal and Labor are close: $487,287 separates them, across 508 and 743 disclosed receipt records. Disclosed receipts record who gave, not why, and cannot show what any payment was expected to achieve.';
  assert.equal(verifiedOverview(written, facts), written);
});

test('a figure that is not on the sheet is dropped, not repaired', () => {
  // $487,286 is one dollar out; 62% was never given.
  assert.equal(verifiedOverview('Liberal leads Labor by $487,286, and these receipts cannot show intent at all on their own.', facts), '');
  assert.equal(verifiedOverview('Liberal takes 62% of the money shown, which cannot show intent on its own in these records.', facts), '');
  assert.equal(verifiedOverview('Liberal leads with $9,013,973 across 508 records, against Labor on 744 records here.', facts), '');
});

test('a claim disclosure records cannot support is dropped', () => {
  for (const claim of [
    'Liberal leads Labor by $487,287, which proves that fossil fuel money bought the policy outcome.',
    'These receipts show donations paid for access to ministers across the whole period recorded here.',
  ]) assert.equal(verifiedOverview(claim, facts), '');
});

test('markdown, links and runaway length are dropped', () => {
  assert.equal(verifiedOverview('**Liberal** leads Labor by $487,287 and that cannot show intent by itself in these records.', facts), '');
  assert.equal(verifiedOverview('See https://example.com for more; Liberal leads Labor by $487,287 across the period.', facts), '');
  assert.equal(verifiedOverview('Too short.', facts), '');
  assert.equal(verifiedOverview('Liberal leads. '.repeat(40), facts), '');
});

test('a calculated ranking carries a sheet whose figures match its own table', async () => {
  const result = await rankedMoneyAnswer({ question: 'Who receives the most funding from fossil fuel donors?' }, assets);
  assert.equal(result.answer_status, 'calculated');
  assert.ok(result.money_facts, 'a calculated ranking hands over a sheet');
  assert.equal(result.money_facts.ranked_by, 'recipient party');
  for (const row of result.money_facts.rows) {
    // Every row on the sheet is a row in the table the reader sees.
    assert.ok(result.answer.includes(`| ${row.name} | ${row.amount} |`), `${row.name} is in the table`);
  }
  assert.ok(result.money_facts.derived.some((line) => /^Gap between .+: \$[\d,]+$/.test(line)), 'the gap between the top two is worked out for the model');
  assert.ok(result.money_facts.derived.every((line) => !/\.$/.test(line)), 'the sheet gives values to write from, never ready-made sentences');
  assert.ok(result.money_facts.limits.length >= 3);
  // The sheet is the model's, never the reader's: the route strips it.
  assert.equal(result.money_overview, undefined);
});

test('a clarification answer is never given a sheet to write from', async () => {
  const vague = await rankedMoneyAnswer({ question: 'Who gets the most money from the biggest donors?' }, assets);
  if (vague && vague.answer_status !== 'calculated') assert.equal(vague.money_facts, undefined);
});
