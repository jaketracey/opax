#!/usr/bin/env node
// research:local: run the Ask research loop on this Mac against real services, no deploy.
//
//   npm run research:local -- [questionIds...] [--model slug] [--port 8967] [--keep] [--json out.json]
//
// --prior-turn PATH carries one saved {q,payload} turn; question sets can use followup_of.
// --trace PATH saves local model requests/results, tool results and grounding decisions.
// --legacy-context reproduces the previous browser's compact source hints for baselines.
// IDs or literal questions are accepted. --questions PATH selects a regression set.
// --serve starts the server without Asks; --portal PATH selects a detached baseline checkout.
// --check-assets builds the slim asset folder, prints its file count and skip list, and exits.
// --no-opening-line turns the ASK_OPENING_LINE kill switch off for this server, to compare a stream without the line.
// --stream asks over SSE (?stream=1) and prints the event timeline: first status, first delta, done, retries.
// --start-only starts wrangler dev, waits for its health URL, reports the time and stops it
// before any question (no model call); add --local-data to keep it off remote bindings too.
// --local-data disables remote bindings and blocks outbound requests except the model provider.
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
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chatContext} from '../portal/public/chat-context.js';
import {buildSlimAssets, BULK_PREFIX, FD_LIMIT, isBulkAssetPath, stopGroup, stopGroupOnExit, waitForHealth} from './research_local_assets.mjs';

const sourcePortal = fileURLToPath(new URL('../portal/', import.meta.url));
const localTelemetry = new Map();
const questionHash = question => createHash('sha256').update(question.normalize('NFKC').toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()).digest('hex');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const portal = flag('--portal', sourcePortal);
const startOnly = args.includes('--start-only');
const serveOnly = args.includes('--serve') || startOnly;
const localData = args.includes('--local-data');
const port = Number(flag('--port', 8967));
const model = flag('--model', 'deepseek/deepseek-v4.1-flash');
const keep = args.includes('--keep'), reuse = args.includes('--reuse');
const jsonOut = flag('--json', null);
const traceOut = flag('--trace', null);
const priorFile = flag('--prior-turn', null);
const legacyContext = args.includes('--legacy-context');
const streamed = args.includes('--stream');
const traceEvents = [];
let activeQuestion;
const ids = args.filter((a, i) => !a.startsWith('--') && !['--model', '--port', '--json', '--portal', '--questions', '--trace', '--prior-turn'].includes(args[i - 1]));
const available = JSON.parse(readFileSync(flag('--questions', new URL('research_local_questions.json', import.meta.url)), 'utf8'));
const questions = serveOnly ? [] : ids.length ? ids.map((id, i) => {
  const known = available.find(q => q.id === id);
  if (known) return known;
  if (/\s/.test(id)) return {id: `literal-${i + 1}`, kind: 'literal', question: id};
  throw new Error(`Unknown question id: ${id}`);
}) : available;

const slimDir = portal + '.research-assets/';
function slimAssets() {
  try { return buildSlimAssets(portal + 'public', slimDir); }
  catch (e) { console.error(e.message); process.exit(3); }
}
if (args.includes('--check-assets')) {
  const {files, skipped, trimmed} = slimAssets();
  console.log(`Research asset folder: ${files} files (limit ${FD_LIMIT} open files)\nskipped: ${skipped.join(', ') || '-'}\ntrimmed: ${trimmed.join(', ') || '-'}`);
  process.exit(0);
}

// --start-only asks nothing, so it can run without portal/.dev.vars.
const vars = startOnly && !existsSync(portal + '.dev.vars') ? {} : Object.fromEntries(readFileSync(portal + '.dev.vars', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, '')]));
if (!startOnly) for (const k of ['OPENROUTER_API_KEY', 'ARAG_KB_ID', 'ARAG_KB_TOKEN', 'DAILY_POST_OPERATOR_SECRET'])
  if (!vars[k]) { console.error(`portal/.dev.vars is missing ${k}`); process.exit(2); }

// Bulk bill/division/grant JSON stays outside Wrangler's file watcher, but remains available to tools on demand.
let assetOrigin;
const bulkRoot = resolve(portal, 'public');
const bulkAssets = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(bulkRoot, '.' + pathname);
  if (!isBulkAssetPath(pathname) || !file.startsWith(bulkRoot + sep)) { response.writeHead(404).end(); return; }
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
${traceOut ? `globalThis.__opaxResearchTrace = (stage, detail) => console.log(JSON.stringify({kind:'research_local_trace',stage,detail}));
const tracedFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (request, init) => {
  const target = new URL(typeof request === 'string' || request instanceof URL ? request : request.url);
  const response = await tracedFetch(request, init);
  if (target.hostname === 'openrouter.ai' || /\\/(?:ask|find)$/.test(target.pathname)) {
    let body; try {body=JSON.parse(typeof init?.body === 'string' ? init.body : request instanceof Request ? await request.clone().text() : '{}')} catch {}
    const copy=response.clone(); copy.text().then(text=>{let result;try{result=JSON.parse(text)}catch{result=text}globalThis.__opaxResearchTrace('model.transport',{service:target.hostname==='openrouter.ai'?'model':'kb',operation:target.pathname.split('/').at(-1),status:response.status,request:body,response:result})}).catch(()=>{});
  }
  return response;
};` : ''}
${localData ? `const modelFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (request, init) => {
  const url = new URL(typeof request === 'string' || request instanceof URL ? request : request.url);
  if (url.hostname !== 'openrouter.ai' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Local-data evaluation blocked a non-model remote request');
  return modelFetch(request, init);
};` : ''}
export default { ...worker, fetch(request, env, ctx) {
  const assets = env.ASSETS; env.ASSETS = {fetch(request) {const url = new URL(request.url); return ${BULK_PREFIX}.test(url.pathname) ? fetch(new URL(url.pathname, ${JSON.stringify(assetOrigin)})) : assets.fetch(request);}};
  for (const key of ${JSON.stringify((cfg.kv_namespaces || []).map(k => k.binding))}) { const binding = env[key]; if (binding) env[key] = { get: binding.get.bind(binding), getWithMetadata: binding.getWithMetadata?.bind(binding), list: binding.list?.bind(binding), put: async () => {}, delete: async () => {} }; }
  return worker.fetch(request, env, ctx);
} };
`);
  cfg.main = './.wrangler/research-entry.ts';
  cfg.secrets = {required: Object.keys(vars)};
  cfg.d1_databases = (cfg.d1_databases || []).map(d => ({...d, remote: !localData && d.binding !== 'COMMUNITY_DB'}));
  cfg.kv_namespaces = (cfg.kv_namespaces || []).map(k => ({...k, remote: !localData}));
  if (localData) { delete cfg.ai; delete cfg.services; }
  // wrangler dev holds every asset file open: the full public/ (~22.5k files) stalls at the fd limit
  // or fails with spawn EBADF. Serve a symlinked subset without the bulk folders Ask never reads,
  // and stop here with a clear message if it would still be too large.
  const {files} = slimAssets();
  console.error(`Research asset folder: ${files} files.`);
  cfg.vars = {...cfg.vars, INDEXNOW_ENABLED: 'false', INDEXNOW_DRY_RUN: 'true', ...(args.includes('--no-opening-line') ? {ASK_OPENING_LINE: 'off'} : {})};
  cfg.assets = {...cfg.assets, directory: './.research-assets'};
  // Lives in portal/ (gitignored) so relative paths and .dev.vars resolve as for the real config.
  const path = portal + 'research-local.wrangler.jsonc';
  writeFileSync(path, JSON.stringify(cfg, null, 2));
  return path;
}

async function up(base) { try { return (await fetch(base + '/', {signal: AbortSignal.timeout(3000)})).ok; } catch { return false; } }

const START_TIMEOUT_MS = 90_000;
let worker = null, leaveRunning = false, stopping = false;
// Stop the wrangler group this run started (TERM, then KILL after 5 s), close the bulk server, exit.
async function stopWorker() {
  bulkAssets.close();
  // `worker` stays set until the group is gone, so a second Ctrl-C meanwhile still reaches the 'exit' fallback.
  if (worker && !leaveRunning) await stopGroup(worker.pid, {graceMs: 5000});
  worker = null;
}
async function shutdown(code) {
  if (stopping) process.exit(code); // a second Ctrl-C: the 'exit' fallback below still stops the group
  stopping = true; await stopWorker(); process.exit(code);
}
async function startServer(base) {
  if (reuse && await up(base)) return null;
  const t0 = Date.now();
  await new Promise(resolve => bulkAssets.listen(0, '127.0.0.1', resolve));
  assetOrigin = 'http://127.0.0.1:' + bulkAssets.address().port;
  const config = localConfig();
  const child = spawn('bash', ['-c', `ulimit -n ${FD_LIMIT}; exec npx --no-install wrangler dev -c "${config}" --port ${port}`],
    {cwd: portal, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: {...process.env, WRANGLER_SEND_METRICS: 'false'}});
  // Own process group (detached), led by child.pid: stopping it stops wrangler, esbuild and workerd.
  // Every exit path stops that group: TERM, then KILL if any of it is still there 5 s later.
  worker = child;
  process.on('exit', () => { if (worker && !leaveRunning) stopGroupOnExit(worker.pid, {graceMs: 5000}); });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { leaveRunning = false; shutdown(130); });
  let log = '';
  let pendingLog = '';
  child.stdout.on('data', d => {
    log += d; pendingLog += d;
    const lines = pendingLog.split('\n'); pendingLog = lines.pop();
    for (const line of lines) if (/^\{"kind":"research_local_trace"/.test(line)) {
      try {traceEvents.push({question_id:activeQuestion,...JSON.parse(line)});writeFileSync(traceOut,JSON.stringify(traceEvents,null,1))} catch {}
    } else if (/^\{"kind":"research_loop_/.test(line)) {
      console.log(line);
      try { const event = JSON.parse(line); if (event.kind === 'research_loop_fallback') localTelemetry.set(event.question_hash, event); } catch {}
    }
  }); child.stderr.on('data', d => { log += d; });
  const health = await waitForHealth(() => up(base), {timeoutMs: START_TIMEOUT_MS,
    failed: () => child.exitCode !== null || /Build failed|Could not resolve/.test(log)});
  if (health.ok) {
    child.startMs = Date.now() - t0;
    if (serveOnly && !startOnly) child.once('exit',(code,signal)=>{console.error(`Local research Worker stopped (exit=${code}, signal=${signal??'none'}).`);process.exit(code??3)});
    return child;
  }
  console.error(`wrangler dev did not answer ${base}/ within ${(health.ms / 1000).toFixed(0)} s (limit ${START_TIMEOUT_MS / 1000} s). Last log lines:\n`
    + log.split('\n').filter(l => !/KEY|TOKEN|SECRET/.test(l)).slice(-25).join('\n'));
  await shutdown(3);
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

function priorContext(row, question) {
  if (Array.isArray(row)) row = row.at(-1);
  if (!row) throw new Error('The prior-turn file contains no turn');
  const d=row.payload ?? row.response ?? row;
  return chatContext([{role:'user',text:row.q?.question ?? row.question ?? ''},{role:'answer',text:d.answer ?? '',sources:d.sources??[]}],question);
}
async function ask(base, q, prior) {
  activeQuestion=q.id;
  const request={...(prior?priorContext(prior,q.question):{}),...(q.request??{}),question:q.question};
  if (legacyContext && request.context) request.context = request.context.map(t => t.author === 'answer' ? {...t,sources:(t.sources??[]).map(s=>Object.fromEntries(['slug','kind','source','state','chamber'].filter(k=>s[k]).map(k=>[k,s[k]])))} : t);
  const t0 = Date.now();
  const res = await fetch(base + '/api/ask' + (streamed ? '?stream=1' : ''), {method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: {'content-type': 'application/json', ...(streamed ? {accept: 'text/event-stream'} : {}), 'x-opax-research': 'loop', 'x-opax-research-model': model,
      authorization: 'Bearer ' + vars.DAILY_POST_OPERATOR_SECRET},
    body: JSON.stringify(request)});
  if (streamed && (res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    // Each event with its arrival time; a retry clears the text the reader had been shown.
    const events = [], decoder = new TextDecoder();
    let pending = '', d = {error: 'no done event'};
    for await (const chunk of res.body) {
      const at = Date.now() - t0;
      pending += decoder.decode(chunk, {stream: true});
      let i;
      while ((i = pending.indexOf('\n\n')) >= 0) {
        const block = pending.slice(0, i); pending = pending.slice(i + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1], raw = /^data: (.+)$/m.exec(block)?.[1];
        let data; try { data = JSON.parse(raw ?? 'null'); } catch { data = raw; }
        events.push({at, event, ...(event === 'status' ? {phase: data?.phase} : event === 'delta' ? {chars: data?.text?.length ?? 0, text: data?.text} : event === 'retry' ? {reason: data?.reason} : {})});
        if (event === 'done') d = data;
      }
    }
    const first = name => events.find(e => e.event === name)?.at;
    const done = first('done'), firstDelta = first('delta'), firstStatus = first('status');
    const shown = events.findIndex(e => e.event === 'delta'), reset = events.some((e, i) => e.event === 'retry' && shown >= 0 && i > shown);
    const stream = {first_status_ms: firstStatus, first_delta_ms: firstDelta, done_ms: done, delta_after_status_ms: firstDelta == null ? null : firstDelta - (firstStatus ?? 0),
      delta_to_done_ms: firstDelta == null || done == null ? null : done - firstDelta, retries: events.filter(e => e.event === 'retry').length, reset_after_text: reset, events};
    return {status: res.status, ms: Date.now() - t0, d, request, stream, telemetry: localTelemetry.get(questionHash(q.question))};
  }
  const text = await res.text();
  let d; try { d = JSON.parse(text); } catch { d = {error: text.slice(0, 200)}; }
  return {status: res.status, ms: Date.now() - t0, d, request, telemetry: localTelemetry.get(questionHash(q.question))};
}

const base = `http://127.0.0.1:${port}`;
const server = await startServer(base);
if (startOnly) { console.log(`Local research Worker answered on port ${port} after ${((server?.startMs ?? 0) / 1000).toFixed(1)} s; stopping it before any question.`); await shutdown(0); }
if (serveOnly) { console.log(`Local research server ready on port ${port}; process group ${server?.pid}`); await new Promise(() => {}); }
const rows = [], dump = [];
try {
  for (const q of questions) {
    const prior=q.followup_of?dump.find(r=>r.q.id===q.followup_of):priorFile?JSON.parse(readFileSync(priorFile,'utf8')):undefined;
    if(q.followup_of&&!prior)throw new Error('Missing prior turn: '+q.followup_of);
    const {status, ms, d, request, stream, telemetry} = await ask(base, q, prior);
    const r = {...(d.research || {})}, c = checks(d);
    if (telemetry) {
      r.cost_usd ??= telemetry.cost_usd;
      r.failure ??= telemetry.reason;
      r.turns ??= telemetry.turns;
      r.rounds ??= telemetry.rounds;
    }
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
    if (stream) console.log(`  stream: status ${stream.first_status_ms} ms, first delta ${stream.first_delta_ms ?? '-'} ms (+${stream.delta_after_status_ms ?? '-'}), done ${stream.done_ms} ms, delta to done ${stream.delta_to_done_ms ?? '-'} ms, retries ${stream.retries}${stream.reset_after_text ? ' RESET AFTER TEXT' : ''}\n  events: ${stream.events.map(e => `${(e.at / 1000).toFixed(1)}:${e.event}${e.phase ? '/' + e.phase : e.chars ? '/' + e.chars : e.reason ? '/' + e.reason : ''}`).join(' ')}`);
    console.log(`  checks: loop=${c.loop} quotes=${c.quotes} verbatim=${c.verbatim} unbound-markers=${c.unbound} placeholder=${c.placeholder}`);
    rows.push({id: q.id, kind: q.kind, s: (ms / 1000).toFixed(1), mode: r.mode ?? '-', failure: r.failure ?? '', cost: r.cost_usd ?? null, kept: r.answer_stats ? `${r.answer_stats.points_kept}/${r.answer_stats.points_in}` : '-', ...c});
    dump.push({q, request, status, ms, payload: d, ...(stream ? {stream} : {}), ...(telemetry ? {local_telemetry: telemetry} : {})});
    if (jsonOut) writeFileSync(jsonOut, JSON.stringify(dump, null, 1));
  }
} finally {
  if (keep && server) leaveRunning = true; else await stopWorker();
}
console.log('\nid    kind          s     mode     failure            $       kept   quotes verbatim unbound placeholder');
for (const r of rows)
  console.log(`${r.id.padEnd(5)} ${r.kind.padEnd(13)} ${String(r.s).padStart(5)} ${r.mode.padEnd(8)} ${String(r.failure).padEnd(18)} ${r.cost == null ? '   -   ' : r.cost.toFixed(4)}  ${String(r.kept).padStart(5)} ${String(r.quotes).padStart(6)} ${String(r.verbatim).padStart(8)} ${String(r.unbound).padStart(7)} ${r.placeholder}`);
const loops = rows.filter(r => r.mode === 'loop').length, cost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
console.log(`loop answered ${loops}/${rows.length}  total $${cost.toFixed(4)}  model ${model}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(dump, null, 1));
if (server && keep) console.log(`wrangler dev left running on ${base} (pid ${server.pid}); rerun with --reuse --port ${port}`);
