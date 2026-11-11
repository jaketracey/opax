// Local wall-clock benchmark of the real /api/search-all handler. Corpus reads
// are a fixed local fixture; catalogue reads use the built assets on disk.
// No source sites, KB credentials, production data services or deployments.
// Run after npm run build:search: node test/report-search-local.mjs
import { build } from 'esbuild';
import { readFile, stat, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

const publicRoot = new URL('../public/', import.meta.url);
const bundle = await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
  plugins: [{ name: 'omit-unrelated-image-renderer', setup(b) {
    b.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'images', namespace: 'benchmark' }));
    b.onLoad({ filter: /.*/, namespace: 'benchmark' }, () => ({ contents: 'export const renderOgPng=()=>{}; export const renderOgJpeg=()=>{}; export const renderStoryJpeg=()=>{};', loader: 'js' }));
  } }],
});
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const env = {
  COMMUNITY_ORIGIN: 'https://opax.com.au', REPORTS_ENABLED: 'false',
  ASSETS: { async fetch(request) {
    try { return new Response(await readFile(new URL(new URL(request.url).pathname.slice(1), publicRoot))); }
    catch { return new Response('Missing', { status: 404 }); }
  } },
  STAGING_API: { fetch: async () => Response.json({ results: [{ kind: 'speech', slug: 'local-corpus-fixture', title: 'Local corpus fixture', date: '2024-01-01' }], truncated: false }) },
};
async function run(q) {
  const request = new Request('https://opax.com.au/api/search-all?' + new URLSearchParams({ q, kind: 'all', per: '20' }));
  const start = performance.now();
  const response = await worker.fetch(request, env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { ms: performance.now() - start, reports: body.results.filter(r => r.kind === 'report').length, rows: body.results.length };
}
const queries = ['robodebt', 'Woodside'], samples = Object.fromEntries(queries.map(q => [q, []]));
const cold = {};
for (const q of queries) cold[q] = await run(q);
for (let i = 0; i < 10; i++) for (const q of queries) await run(q);
for (let i = 0; i < 100; i++) for (const q of i % 2 ? [...queries].reverse() : queries) samples[q].push((await run(q)).ms);
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const manifest = JSON.parse(await readFile(new URL('search-catalog/manifest.json', publicRoot)));
const files = await readdir(new URL('report-records/', publicRoot));
let detailBytes = 0, rowBytes = 0;
const types = {};
for (const file of files) {
  const record = JSON.parse(await readFile(new URL('report-records/' + file, publicRoot)));
  detailBytes += (await stat(new URL('report-records/' + file, publicRoot))).size;
  types[record.report_type] = (types[record.report_type] || 0) + 1;
}
for (const file of await readdir(new URL('search-catalog/' + manifest.version + '/', publicRoot))) if (/^records-\d+\.json$/.test(file)) {
  const rows = JSON.parse(await readFile(new URL('search-catalog/' + manifest.version + '/' + file, publicRoot)));
  for (const row of rows) if (row.report_type) rowBytes += Buffer.byteLength(JSON.stringify(row));
}
assert.ok(cold.robodebt.reports > 0); assert.equal(cold.Woodside.reports, 0);
console.log(JSON.stringify({ runtime: process.version, mode: 'Node, disk-backed ASSETS, fixed corpus service fixture, kind=all, per=20',
  catalogue: { total: manifest.count, report_count: files.length, types, report_row_bytes: rowBytes, exact_name_bytes: (await stat(new URL(`search-catalog/${manifest.version}/report-names.json`, publicRoot))).size, detail_bytes: detailBytes },
  cold, warm: Object.fromEntries(queries.map(q => [q, { n: samples[q].length, median_ms: quantile(samples[q], .5), p95_ms: quantile(samples[q], .95) }])) }, null, 2));
