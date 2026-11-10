import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

const built = await build({
  stdin: { contents: "export { runAgentic, inferPeriod } from './src/agentic-ask'; export { createResearch, RESEARCH_RESULT_BYTES } from './src/research-loop'; export { createResearchCreditCooldown } from './src/research-credit';", resolveDir: new URL('..', import.meta.url).pathname },
  bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const call = (toolName, args, toolCallId) => ({ type: 'tool-call', toolName, toolCallId, input: JSON.stringify(args) });
const reply = calls => ({
  content: calls, finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
  usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, warnings: [],
});

test('192 monthly count groups fit the loop result budget without duplicating canonical rows', async () => {
  const periods = Array.from({ length: 192 }, (_, index) => `${2010 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
  // Alternate a recorded division and a quiet month to prove zero periods survive.
  const divisions = periods.filter((_, index) => index % 2 === 0).map(period => ({ key: `federal-representatives-fixture-${period}`, date: `${period}-01`, bills: [] }));
  const args = { record_type: 'divisions', chamber: 'representatives', since: '2010-01-01', until: '2025-12-31', group_by: 'month' };
  const question = 'How many House of Representatives divisions were recorded each month from 2010 to 2025?';
  const failures = [];
  let shown, plannerCalls = 0, turns = 0;
  const model = new MockLanguageModelV4({ doGenerate: options => {
      if (turns++ === 0) return reply([call('count_records', args, 'monthly-counts')]);
      const returned = options.prompt.filter(message => message.role === 'tool').flatMap(message => message.content).find(part => part.toolName === 'count_records');
      assert.ok(returned, 'the model receives the actual tool result');
      shown = returned.output.type === 'json' ? returned.output.value : JSON.parse(returned.output.value);
      assert.ok(Buffer.byteLength(JSON.stringify(shown)) <= api.RESEARCH_RESULT_BYTES);
      assert.equal(shown.data.rows, undefined, 'the model receives count facts without a duplicate row series');
      assert.equal(shown.data.total, divisions.length);
      assert.ok(shown.facts.length <= 30, 'the full series is selectable within the answer fact budget');
      const facts = shown.facts.map(fact => fact.text).join('\n');
      for (const [index, period] of periods.entries()) {
        assert.match(facts, new RegExp(`\\b${index % 2 === 0 ? 1 : 0}\\b[^;\\n]*${period}`), period);
      }
      return reply([call('answer', { facts: shown.facts.map(fact => fact.id) }, 'monthly-answer')]);
  } });
  const research = Object.assign(api.createResearch({
    model, modelBudgetSpent: async () => false,
    dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown(),
  }), { write: undefined });
  const run = await api.runAgentic(question, {
    origin: 'https://opax.test',
    asset: async path => path === '/divisions/index.json' ? { count: divisions.length, divisions } : null,
    kb: async () => { throw Error('Exact count tools must not search ranked records'); },
    generate: async () => { plannerCalls++; throw Error('The monthly series must finish in the research loop'); },
    research, onResearchFailure: async failure => failures.push(failure),
  }, async () => {}, 40_000, api.inferPeriod(question), {}, { people: [], parties: [], bills: [], ambiguous: false, unresolved: false });
  assert.deepEqual(failures, []);
  assert.equal(plannerCalls, 0);
  assert.equal(run.research.mode, 'loop');
  assert.equal(run.answered, true);
  assert.equal(model.doGenerateCalls.length, 2);
  assert.ok(shown);
  for (const period of periods) assert.ok(run.answer.includes(period), `the selected answer retains ${period}`);
});
