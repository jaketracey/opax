import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  stdin: { contents: "export { constrainStep, guardToolPeriod } from './src/ask-constraints'; export { getTool, parseToolArgs } from './src/tools/index';", resolveDir: new URL('..', import.meta.url).pathname },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const properties = api.getTool('count_records').inputSchema.properties;

function constraints(since, until) {
  return { period: { kind: 'window', since, until, label: 'requested period' }, dated: true, people: [], trend: false };
}

function result(since, until, total = 7, extra = {}) {
  return {
    tool: 'count_records', ok: true,
    data: {
      total, rows: [{ period: 'requested period', count: total }],
      coverage: {
        since, until, requested_since: since, requested_until: until, as_of: null,
        first_record_date: '1998-11-10', last_record_date: '2026-10-29',
        completeness: 'published-records-only',
        note: 'Query scope for exact counts over the full published snapshot; not proof of complete parliamentary history.',
      },
      ...extra,
    },
    cite: [{ kind: 'count', label: `${total} published records`, value: total, url: 'https://opax.test/divisions' }], notes: [],
  };
}

const selectors = [
  [{ date: '2024-02-29' }, '2024-02-29', '2024-02-29'],
  [{ month: '2024-02' }, '2024-02-01', '2024-02-29'],
  [{ year: 2024 }, '2024-01-01', '2024-12-31'],
  [{ financial_year: '2023-24' }, '2023-07-01', '2024-06-30'],
  [{ term: '47th' }, '2022-07-26', '2025-03-28'],
];

test('Ask preserves exclusive day, month, year, financial year and term count selectors', () => {
  for (const [selector, since, until] of selectors) {
    const planned = { tool: 'count_records', args: { record_type: 'divisions', chamber: 'senate', ...selector } };
    const c = constraints(since, until), step = api.constrainStep(planned, c, properties);
    assert.deepEqual(step.args, planned.args);
    assert.deepEqual(api.parseToolArgs('count_records', step.args), planned.args);
    const counted = result(since, until), guarded = api.guardToolPeriod(counted, step, c);
    assert.equal(guarded.data.total, 7, JSON.stringify(selector));
    assert.equal(guarded.data.coverage_only, undefined);
    assert.deepEqual(guarded.notes, [], 'known query dates must not produce an unconfirmed-period warning');
  }
});

test('separate yearly comparisons retain each narrower selector and count', () => {
  const c = constraints('2023-01-01', '2024-12-31');
  for (const year of [2023, 2024]) {
    const planned = { tool: 'count_records', args: { record_type: 'bills', year } };
    const step = api.constrainStep(planned, c, properties);
    assert.deepEqual(step.args, planned.args);
    assert.deepEqual(api.parseToolArgs('count_records', step.args), planned.args);
    const guarded = api.guardToolPeriod(result(`${year}-01-01`, `${year}-12-31`, year === 2023 ? 2 : 3), step, c);
    assert.equal(guarded.data.total, year === 2023 ? 2 : 3);
  }
});

test('a selector outside the requested period keeps its rows with a period note from the guard', () => {
  for (const [selector, since, until] of selectors) {
    const c = constraints('2026-01-01', '2026-12-31');
    const step = api.constrainStep({ tool: 'count_records', args: { record_type: 'divisions', ...selector } }, c, properties);
    assert.deepEqual(api.parseToolArgs('count_records', step.args), step.args);
    const guarded = api.guardToolPeriod(result(since, until), step, c);
    assert.equal(guarded.data.coverage_only, undefined, JSON.stringify(selector));
    assert.equal(guarded.data.total, 7);
    assert.equal(guarded.coverage.matched, false);
    assert.match(guarded.notes[0], /^The requested period is 2026-01-01 to 2026-12-31; these records /);
  }
});

test('a genuine zero in a known query window remains a numeric count', () => {
  const c = constraints('2024-04-01', '2024-04-01');
  const step = api.constrainStep({ tool: 'count_records', args: { record_type: 'divisions', date: '2024-04-01' } }, c, properties);
  const guarded = api.guardToolPeriod(result('2024-04-01', '2024-04-01', 0), step, c);
  assert.equal(guarded.data.total, 0);
  assert.equal(guarded.data.coverage_only, undefined);
  assert.equal(guarded.cite[0].value, 0);
});

test('bill terms preserve registry cohort membership and its status denominator', () => {
  const c = constraints('2022-07-26', '2025-03-28');
  const args = { record_type: 'bills', term: '47th', status: 'passed' };
  const step = api.constrainStep({ tool: 'count_records', args }, c, properties);
  assert.deepEqual(step.args, args, 'term cohorts must not be converted to date filters');
  assert.deepEqual(api.parseToolArgs('count_records', step.args), args);
  const counted = result(c.period.since, c.period.until, 2, { denominator: 5, share_percent: 40 });
  const guarded = api.guardToolPeriod(counted, step, c);
  assert.equal(guarded.data, counted.data);
  assert.equal(guarded.data.total, 2);
  assert.equal(guarded.data.denominator, 5);
  assert.equal(guarded.data.share_percent, 40);
  assert.equal(guarded.data.coverage.first_record_date, '1998-11-10', 'observed record bounds remain distinct from query scope');
});

test('counts without a compact selector still inherit the requested inclusive range', () => {
  const c = constraints('2023-01-01', '2024-12-31');
  const step = api.constrainStep({ tool: 'count_records', args: { record_type: 'divisions' } }, c, properties);
  assert.deepEqual(step.args, { record_type: 'divisions', since: c.period.since, until: c.period.until });
  assert.deepEqual(api.parseToolArgs('count_records', step.args), step.args);
});
