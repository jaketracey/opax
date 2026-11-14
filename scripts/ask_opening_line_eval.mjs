#!/usr/bin/env node
// Framing eval for the Ask opening line (portal/src/research-opening-line.ts), with no /api/ask call.
//
//   node scripts/ask_opening_line_eval.mjs --runs a.json [b.json ...] [--out lines.json] [--repeat 1]
//
// Each --runs file is a research:local --json dump (rows of {q, payload}). For every row the script takes the
// question and the fixed labels of its round-1 lookups from the recorded trail, exactly what the Worker gives the
// model, and asks the production model for the line with the Worker's own instructions and prompt. It prints each
// line with its latency and billed cost, and writes them to --out for a reader to judge: does the line state a fact,
// figure, date, outcome or characterisation? The script judges nothing itself.
// Needs OPENROUTER_API_KEY in portal/.dev.vars (never printed). About US$0.0001 per line.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const portal = fileURLToPath(new URL('../portal/', import.meta.url));
const args = process.argv.slice(2);
const list = name => { const i = args.indexOf(name); if (i < 0) return []; const out = []; for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) out.push(args[j]); return out; };
const files = list('--runs'), out = list('--out')[0], repeat = Number(list('--repeat')[0] ?? 1);
if (!files.length) { console.error('usage: ask_opening_line_eval.mjs --runs dump.json [...] [--out lines.json] [--repeat N]'); process.exit(64); }
const key = /^OPENROUTER_API_KEY=(.*)$/m.exec(readFileSync(portal + '.dev.vars', 'utf8'))?.[1]?.replace(/^"|"$/g, '');
if (!key) { console.error('portal/.dev.vars is missing OPENROUTER_API_KEY'); process.exit(2); }

// The Worker's own instructions and prompt, bundled from source so the eval cannot drift from what ships.
const {build} = createRequire(portal + 'package.json')('esbuild');
const bundle = await build({stdin: {contents: "export {OPENING_LINE_INSTRUCTIONS,openingLinePrompt,OPENING_LINE_OUTPUT_TOKENS} from './src/research-opening-line'", resolveDir: portal}, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'], logLevel: 'silent'});
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const vars = createRequire(portal + 'package.json')('wrangler').experimental_readRawConfig({config: portal + 'wrangler.jsonc'}).rawConfig.vars;

const rows = files.flatMap(file => JSON.parse(readFileSync(file, 'utf8')).filter(r => r.q?.question).map(r => ({
  question: r.q.question,
  reading: [...new Set((r.payload?.research?.trail ?? []).filter(t => t.round === 1 && !['answer', 'finish', 'decline'].includes(t.tool)).map(t => t.label).filter(Boolean))],
})));
const results = [];
for (const row of rows) for (let n = 0; n < repeat; n++) {
  const started = Date.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: {authorization: 'Bearer ' + key, 'content-type': 'application/json'},
    body: JSON.stringify({model: vars.RESEARCH_LOOP_MODEL_ID, provider: JSON.parse(vars.RESEARCH_LOOP_PROVIDER), reasoning: JSON.parse(vars.RESEARCH_LOOP_REASONING), usage: {include: true},
      max_tokens: api.OPENING_LINE_OUTPUT_TOKENS, messages: [{role: 'system', content: api.OPENING_LINE_INSTRUCTIONS}, {role: 'user', content: api.openingLinePrompt(row.question, row.reading)}]})});
  const body = await response.json().catch(() => ({}));
  const result = {...row, line: body.choices?.[0]?.message?.content?.trim() ?? null, finish: body.choices?.[0]?.finish_reason ?? null, ms: Date.now() - started, cost_usd: body.usage?.cost ?? null, status: response.status};
  results.push(result);
  console.log(`${String(result.ms).padStart(5)} ms  $${result.cost_usd?.toFixed?.(6) ?? '-'}  ${result.finish}  ${row.question}\n      [${row.reading.join(' | ')}]\n      -> ${result.line}`);
  if (out) writeFileSync(out, JSON.stringify(results, null, 1));
}
const costs = results.map(r => r.cost_usd).filter(c => typeof c === 'number').sort((a, b) => a - b), times = results.map(r => r.ms).sort((a, b) => a - b);
console.log(`\n${results.length} lines  median ${times[Math.floor((times.length - 1) / 2)]} ms  median $${costs[Math.floor((costs.length - 1) / 2)]?.toFixed(6)}  max $${costs.at(-1)?.toFixed(6)}  total $${costs.reduce((a, b) => a + b, 0).toFixed(5)}`);
