#!/usr/bin/env node
// research:local: run the Ask research loop on this Mac against real services, no deploy.
//
//   npm run research:local -- [questionIds...] [--model slug] [--port 8967] [--keep] [--json out.json]
//
// --serve starts the server without Asks; --portal PATH selects a detached baseline checkout.
// Remote public D1/KV reads are retained; telemetry is local and KV writes are suppressed.
// Starts `wrangler dev` from portal/ with a generated config whose D1 and KV bindings are
// remote (real data), loads secrets from portal/.dev.vars (OPENROUTER_API_KEY, ARAG_KB_ID,
// ARAG_KB_TOKEN, DAILY_POST_OPERATOR_SECRET; gitignored, never printed), then asks each
// question through the operator-only `x-opax-research: loop` override and prints per turn:
// serving provider, ms, tokens in/out/cached; the trail; the answer or fallback reason; and
// quick checks. Loop code edits hot-reload in wrangler dev; rerun with --port to reuse it.
import {createServer} from 'node:http';
import {createReadStream, statSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {spawn} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, symlinkSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const sourcePortal = fileURLToPath(new URL('../portal/', import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const portal = flag('--portal', sourcePortal);
const serveOnly = args.includes('--serve');
const port = Number(flag('--port', 8967));
const model = flag('--model', 'deepseek/deepseek-v4.1-flash');
const keep = args.includes('--keep'), reuse = args.includes('--reuse');
const jsonOut = flag('--json', null);
const ids = args.filter((a, i) => !a.startsWith('--') && !['--model', '--port', '--json', '--portal'].includes(args[i - 1]));
const questions = JSON.parse(readFileSync(new URL('research_local_questions.json', import.meta.url), 'utf8'))
  .filter(q => !serveOnly && (!ids.length || ids.includes(q.id)));

const vars = Object.fromEntries(readFileSync(portal + '.dev.vars', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, '')]));
for (const k of ['OPENROUTER_API_KEY', 'ARAG_KB_ID', 'ARAG_KB_TOKEN', 'DAILY_POST_OPERATOR_SECRET'])
  if (!vars[k]) { console.error(`portal/.dev.vars is missing ${k}`); process.exit(2); }

// Bulk bill/division JSON stays outside Wrangler's file watcher, but remains available to tools on demand.
let assetOrigin;
const bulkRoot = resolve(portal, 'public');
const bulkAssets = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(bulkRoot, '.' + pathname);
  if (!/^\/(?:bills|divisions)\/[a-zA-Z0-9_.-]+\.json$/.test(pathname) || !file.startsWith(bulkRoot + sep)) { response.writeHead(404).end(); return; }
  try {
    if (!statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, {'content-type': 'application/json'});
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404).end(); }
});

function localConfig() {
  const require = createRequire(portal + 'package.json');
  const {experimental_readRawConfig} = require('wrangler');
  const {rawConfig} = experimental_readRawConfig({config: portal + 'wrangler.jsonc'});
  const cfg = structuredClone(rawConfig);
  delete cfg.env; delete cfg.routes; delete cfg.triggers;
  // With a `secrets` block wrangler dev only exposes the declared names, so declare exactly the ones .dev.vars holds.
  mkdirSync(portal + '.wrangler', {recursive: true});
  writeFileSync(portal + '.wrangler/research-entry.ts', `import worker from '../src/index.ts';
export default { ...worker, fetch(request, env, ctx) {
  const assets = env.ASSETS; env.ASSETS = {fetch(request) {const url = new URL(request.url); return /^\\/(?:bills|divisions)\\//.test(url.pathname) ? fetch(new URL(url.pathname, ${JSON.stringify(assetOrigin)})) : assets.fetch(request);}};
  for (const key of ${JSON.stringify((cfg.kv_namespaces || []).map(k => k.binding))}) { const binding = env[key]; if (binding) env[key] = { get: binding.get.bind(binding), getWithMetadata: binding.getWithMetadata?.bind(binding), list: binding.list?.bind(binding), put: async () => {}, delete: async () => {} }; }
  return worker.fetch(request, env, ctx);
} };
`);
  cfg.main = './.wrangler/research-entry.ts';
  cfg.secrets = {required: Object.keys(vars)};
  cfg.d1_databases = (cfg.d1_databases || []).map(d => ({...d, remote: d.binding !== 'COMMUNITY_DB'}));
  cfg.kv_namespaces = (cfg.kv_namespaces || []).map(k => ({...k, remote: true}));
  // wrangler dev holds every asset file open: the full public/ (~22.5k files) stalls at the fd limit
  // or fails with spawn EBADF. Serve a symlinked subset without the bulk folders Ask never reads.
  const slim = portal + '.research-assets/', skip = new Set(['divisions', 'bills', 'growth', 'photos', 'grants']);
  rmSync(slim, {recursive: true, force: true}); mkdirSync(slim);
  for (const name of readdirSync(portal + 'public')) if (!skip.has(name)) symlinkSync(portal + 'public/' + name, slim + name);
  cfg.vars = {...cfg.vars, INDEXNOW_ENABLED: 'false', INDEXNOW_DRY_RUN: 'true'};
  cfg.assets = {...cfg.assets, directory: './.research-assets'};
  // Lives in portal/ (gitignored) so relative paths and .dev.vars resolve as for the real config.
  const path = portal + 'research-local.wrangler.jsonc';
  writeFileSync(path, JSON.stringify(cfg, null, 2));
  return path;
}

async function up(base) { try { return (await fetch(base + '/', {signal: AbortSignal.timeout(3000)})).ok; } catch { return false; } }

async function startServer(base) {
  if (reuse && await up(base)) return null;
  await new Promise(resolve => bulkAssets.listen(0, '127.0.0.1', resolve));
  assetOrigin = 'http://127.0.0.1:' + bulkAssets.address().port;
  const config = localConfig();
  const child = spawn('bash', ['-c', `ulimit -n 8192; exec npx --no-install wrangler dev -c "${config}" --port ${port}`],
    {cwd: portal, stdio: ['ignore', 'pipe', 'pipe'], detached: true});
  // Own process group: stopping the runner stops wrangler, esbuild and workerd with it.
  const stop = () => { bulkAssets.close(); try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
  process.on('exit', stop); for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(130); });
  child.stop = stop;
  if(serveOnly)child.once('exit',(code,signal)=>{console.error(`Local research Worker stopped (exit=${code}, signal=${signal??'none'}).`);process.exit(code??3)});
  let log = '';
  child.stdout.on('data', d => { log += d; for (const line of String(d).split('\n')) if (/^\{"kind":"research_loop_/.test(line)) console.log(line); }); child.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 120; i++) {
    if (await up(base)) return child;
    if (child.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error('wrangler dev did not come up:\n' + log.split('\n').filter(l => !/KEY|TOKEN|SECRET/.test(l)).slice(-25).join('\n'));
  child.stop(); process.exit(3);
}

const short = (v, n = 40) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const PLACEHOLDER = /“[^”]*(Excerpt omitted|excerpt omitted)[^”]*”/;

function checks(d) {
  const answer = String(d.answer ?? d.text ?? '');
  const sources = Array.isArray(d.sources) ? d.sources.length : (d.research?.sources?.length ?? 0);
  const markers = [...answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
  const quotes = [...answer.matchAll(/“([^”]{12,})”/g)].map(m => m[1]);
  const passages = JSON.stringify(d.citations ?? d.sources ?? []);
  const verbatim = quotes.filter(q => passages.includes(q.slice(0, 60))).length;
  return {
    loop: d.research?.mode === 'loop',
    placeholder: PLACEHOLDER.test(answer),
    unbound: markers.filter(m => m < 1 || m > Math.max(sources, d.research?.sources?.length ?? 0)).length,
    quotes: quotes.length, verbatim,
  };
}

async function ask(base, q) {
  const t0 = Date.now();
  const res = await fetch(base + '/api/ask', {method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: {'content-type': 'application/json', 'x-opax-research': 'loop', 'x-opax-research-model': model,
      authorization: 'Bearer ' + vars.DAILY_POST_OPERATOR_SECRET},
    body: JSON.stringify({question: q.question})});
  const text = await res.text();
  let d; try { d = JSON.parse(text); } catch { d = {error: text.slice(0, 200)}; }
  return {status: res.status, ms: Date.now() - t0, d};
}

const base = `http://127.0.0.1:${port}`;
const server = await startServer(base);
if (serveOnly) { console.log(`Local research server ready on port ${port}; process group ${server?.pid}`); await new Promise(() => {}); }
const rows = [], dump = [];
try {
  for (const q of questions) {
    const {status, ms, d} = await ask(base, q);
    const r = d.research || {}, c = checks(d);
    console.log(`\n=== ${q.id} [${q.kind}] ${q.question}`);
    console.log(`HTTP ${status}  ${(ms / 1000).toFixed(1)} s  mode=${r.mode ?? '-'}  failure=${r.failure ?? '-'}  rounds=${r.rounds ?? '-'}  $${r.cost_usd?.toFixed?.(4) ?? '-'}  model=${short(r.model, 60)}`);
    for (const [i, t] of (r.turns || []).entries())
      console.log(`  turn ${i + 1}: ${String(t.ms).padStart(5)} ms  ${short(t.provider, 14).padEnd(14)} in ${t.input} out ${t.output} cached ${t.cached} reasoning ${t.reasoning}`);
    for (const s of r.trail || [])
      console.log(`  r${s.round ?? '?'} ${String(s.tool).padEnd(16)} ${short(s.arg ?? '', 34).padEnd(34)} ${String(s.ms ?? '').padStart(5)} ms  results ${s.results ?? '-'}  ${s.ok === false ? 'FAILED' : ''}`);
    const answer = String(d.answer ?? d.text ?? d.error ?? '').replace(/\s+/g, ' ');
    console.log(`  answer: ${answer.slice(0, 420)}${answer.length > 420 ? '…' : ''}`);
    if (r.rejections) console.log(`  rejected: ${r.rejections.join(" | ")}`);
    const a = r.answer_stats;
    if (a) console.log(`  points: ${a.points_kept}/${a.points_in} kept (${a.mode ?? 'points'})  repairs ${JSON.stringify(a.repairs)}  drops ${JSON.stringify(a.drops)}`);
    console.log(`  checks: loop=${c.loop} quotes=${c.quotes} verbatim=${c.verbatim} unbound-markers=${c.unbound} placeholder=${c.placeholder}`);
    rows.push({id: q.id, kind: q.kind, s: (ms / 1000).toFixed(1), mode: r.mode ?? '-', failure: r.failure ?? '', cost: r.cost_usd ?? null, kept: r.answer_stats ? `${r.answer_stats.points_kept}/${r.answer_stats.points_in}` : '-', ...c});
    dump.push({q, status, ms, payload: d});
  }
} finally {
  if (server && !keep) server.stop();
}
console.log('\nid    kind          s     mode     failure            $       kept   quotes verbatim unbound placeholder');
for (const r of rows)
  console.log(`${r.id.padEnd(5)} ${r.kind.padEnd(13)} ${String(r.s).padStart(5)} ${r.mode.padEnd(8)} ${String(r.failure).padEnd(18)} ${r.cost == null ? '   -   ' : r.cost.toFixed(4)}  ${String(r.kept).padStart(5)} ${String(r.quotes).padStart(6)} ${String(r.verbatim).padStart(8)} ${String(r.unbound).padStart(7)} ${r.placeholder}`);
const loops = rows.filter(r => r.mode === 'loop').length, cost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
console.log(`loop answered ${loops}/${rows.length}  total $${cost.toFixed(4)}  model ${model}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(dump, null, 1));
if (server && keep) console.log(`wrangler dev left running on ${base} (pid ${server.pid}); rerun with --reuse --port ${port}`);
