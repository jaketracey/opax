import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {donorDisclosure, receiptFigures, receiptGraph} from '../public/donor-disclosure.js';

const graph = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
const audit = JSON.parse(await readFile(new URL('../../docs/reports/2026-11-13-donor-receipt-aliases.json', import.meta.url), 'utf8'));
const matching = graph.meta.receipt_types.donor_matching;

test('released spelling coverage permits only the documented ambiguous branch exception', () => {
  // The exception list is named in the report; no private disclosure names in tests.
  assert.deepEqual(matching.exceptions, [{
    key_sha256: '00d8834ea8c8747af6a6e6ef50ee7c0a13f08fe8df17d480f2ad167dead7a39b',
    rows: 6, aud: 23050, candidate_nodes: 2, method: 'brackets',
  }]);
  const ambiguous = matching.exceptions.reduce((sum, x) => sum + x.rows, 0);
  assert.equal(ambiguous, matching.by_result.ambiguous[0], 'every ambiguous row has a listed exception');
  assert.equal(matching.exceptions.filter(x => x.method === 'normalised').reduce((sum, x) => sum + x.rows, 0), 0,
    'zero unmatched case/punctuation/spacing-only rows');
  assert.deepEqual(matching.by_result.matched_brackets, [106, 1436332]);
  assert.deepEqual(matching.by_result.matched_normalised, [43, 993924]);
});

test('released typed cells reconcile with the before/after audit and receipt coverage counts', () => {
  const donorFigures = graph.nodes.filter(n => n.kind === 'donor').map(receiptFigures);
  const total = donorFigures.reduce((sum, n) => sum + n.total, 0);
  const rows = donorFigures.reduce((sum, n) => sum + n.count, 0);
  assert.equal(total, audit.counts.after_exported.aud);
  assert.equal(rows, audit.counts.after_exported.rows);
  assert.equal(rows, graph.meta.receipt_types.counts.exported_rows);
  assert.equal(total - audit.counts.before_exported.aud, 2430256);
  assert.equal(rows - audit.counts.before_exported.rows, 149);
  assert.equal(audit.donors_gaining, 32);
  assert.equal(audit.counts.existing_match_changed?.rows ?? 0, 0);
  assert.deepEqual([audit.counts.after_unmatched_node.rows, audit.counts.after_unmatched_node.aud], [38917, 507878484]);
  assert.equal(audit.counts.after_unmatched_node.rows, matching.by_result.unmatched[0] + matching.by_result.ambiguous[0]);
});

test('the recovered individual receipts reach the donor page projection, map, party register and Ask', async () => {
  // Find the measured release case by its figures, without embedding a private name.
  const candidates = graph.nodes.filter(n => n.kind === 'donor' && receiptFigures(n).total === 891049 && receiptFigures(n).count === 23);
  assert.equal(candidates.length, 1);
  const node = candidates[0];
  const projected = receiptGraph(graph).nodes.find(n => n.id === node.id);
  assert.deepEqual([projected.total, projected.count], [891049, 23]);
  const root = new URL('../', import.meta.url).pathname;
  const built = await build({stdin: {contents: `
    export {callTool} from './src/tools/index';
    export {partyMoneyResponse} from './src/party-money-table';
    export {receiptGraphView} from './graph/index';
  `, resolveDir: root}, bundle: true, write: false, platform: 'node', format: 'esm', external: ['node:*']});
  const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const mapped = api.receiptGraphView(graph).nodes.find(n => n.id === node.id);
  assert.deepEqual([mapped.total, mapped.count], [891049, 23]);
  const asset = async path => path === '/graph/money.json' ? structuredClone(graph) : null;
  const ASSETS = {fetch: async () => Response.json(graph)};
  const answer = await api.callTool({origin: 'https://opax.test', asset, ASSETS}, 'money_totals', {donor: node.label});
  assert.deepEqual([answer.rows[0].total_aud, answer.rows[0].receipts], [891049, 23]);
  let registered = 0;
  for (const edge of graph.edges.filter(e => e.source === node.id && !e.flow && !e.grant && receiptFigures(e).count > 0)) {
    const request = new Request('https://opax.test/api/register/party-money?partyId=' + encodeURIComponent(edge.target));
    const response = await (await api.partyMoneyResponse(request, ASSETS)).json();
    const row = response.rows.find(r => r.label === donorDisclosure(node).name);
    assert.equal(row.total, receiptFigures(edge).total);
    registered += row.total;
  }
  assert.equal(registered, 891049);
});
