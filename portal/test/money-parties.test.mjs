import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {MONEY_GRAPH_PATHS, MONEY_PARTIES_PATH, moneyPartiesFile} from '../public/money-parties.js';
import {personNameKey} from '../public/canonical-urls.js';

// A cold person or speech page parsed the four money graphs (2.9 MB) for one thing: the party
// colour on its share card (12 Nov 2026). The release build keeps the graphs' party nodes in
// /growth/money-parties.json, and the Worker indexes them with the same moneyIndex.
const root = new URL('../public/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path.slice(1), root), 'utf8'));
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = new Set(['foldName', 'moneyIndex']);
const statements = parsed.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(parsed))));
const context = {personNameKey};
runInNewContext(ts.transpileModule(statements.map(n => n.getText(parsed)).join('\n') + '\nthis.moneyIndex = moneyIndex;', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
const colours = parties => Object.fromEntries([...parties].map(([key, entry]) => [key, entry.colour ?? null]));
const graph = (generated, sourceShort, nodes) => ({meta: {generated, ...(sourceShort ? {sourceShort} : {})}, nodes, edges: []});
const party = (label, colour) => ({id: 'party:' + label, label, kind: 'party', colour, total: 1, count: 1});

test('money parties: every party colour matches the full graphs, published data and edge cases', () => {
  const published = MONEY_GRAPH_PATHS.map(json);
  const full = colours(context.moneyIndex(published).parties);
  assert.ok(Object.keys(full).length > 10);
  assert.deepEqual(colours(context.moneyIndex(moneyPartiesFile(published).files).parties), full);
  // Federal first; a later federal duplicate replaces an earlier one only when the federal source is not the AEC;
  // a state-only party stands in; donors never touch the party map.
  for (const federalSource of [undefined, 'Other register']) {
    const graphs = [
      graph('2026-11-01', federalSource, [party('Labor', '#f00'), party('labor', '#e00'), {id: 'donor:x', label: 'Greens', kind: 'donor', aliases: ['Liberal']}]),
      graph('2026-10-01', 'ECQ', [party('Labor', '#0f0'), party('Katter', '#a00'), party('Greens', '#0a0')]),
      graph('2026-10-01', 'VEC', [party('Liberal', '#00f'), party('Katter', '#b00')]),
      graph('2026-10-01', 'TEC', [party('Jacqui Lambie Network', undefined)]),
    ];
    assert.deepEqual(colours(context.moneyIndex(moneyPartiesFile(graphs).files).parties), colours(context.moneyIndex(graphs).parties));
  }
  assert.throws(() => moneyPartiesFile(published.slice(1)));
});

const compiled = await build({entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
  plugins: [{name: 'omit-renderer', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'money-test'})); b.onLoad({filter: /.*/, namespace: 'money-test'}, () => ({contents: 'export const renderOgPng = async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
globalThis.HTMLRewriter ??= class { on() { return this; } transform(res) { return res; } };
const worker = async () => (await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text + '\n//' + Math.random()).toString('base64'))).default;
const environment = (reads, missing = new Set()) => ({COMMUNITY_ORIGIN: 'https://opax.com.au', ASSETS: {async fetch(req) {
  const path = new URL(req.url).pathname;
  reads.push(path);
  const file = new URL(path === '/' ? 'index.html' : path.slice(1), root);
  return !missing.has(path) && existsSync(file) ? new Response(readFileSync(file), {headers: {'content-type': path.endsWith('.json') ? 'application/json' : 'text/html'}}) : new Response('Not found', {status: 404});
}}});
const personPath = () => {
  const roster = json('/parliamentarians.json');
  const p = roster.people.find(p => p.current && p.party && /^[a-z-]+$/.test(String(p.slug || '')));
  return '/subject/person/' + (p?.slug || 'anthony-albanese');
};

test('money parties: a cold person page reads the small file, not the graphs, and reads the graphs without it', {skip: !existsSync(new URL(MONEY_PARTIES_PATH.slice(1), root))}, async () => {
  const path = personPath();
  for (const [missing, expectGraphs] of [[new Set(), false], [new Set([MONEY_PARTIES_PATH]), true]]) {
    const reads = [];
    const w = await worker();
    const res = await w.fetch(new Request('https://opax.com.au' + path, {headers: {'x-opax-nocache': '1'}}), environment(reads, missing), {waitUntil() {}, passThroughOnException() {}});
    assert.equal(res.status, 200, path);
    await res.text();
    assert.equal(reads.includes(MONEY_PARTIES_PATH), true);
    assert.equal(MONEY_GRAPH_PATHS.some(g => reads.includes(g)), expectGraphs, `${expectGraphs ? 'graphs expected' : 'no graphs expected'}: ${reads.filter(r => r.startsWith('/graph/')).join(', ')}`);
  }
});
