import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {donorDisclosure, publicFundingOnly, receiptFigures, receiptGraph} from '../public/donor-disclosure.js';

const graph = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
const full = JSON.parse(await readFile(new URL('../public/graph/money-receipts.json', import.meta.url), 'utf8'));
const historicalAudit = JSON.parse(await readFile(new URL('../../docs/reports/2026-11-13-donor-receipt-aliases.json', import.meta.url), 'utf8'));
const sharedIdentity = JSON.parse(await readFile(new URL('../../docs/reports/2026-11-14-shared-money-identities.json', import.meta.url), 'utf8'));
const audit = sharedIdentity.row160_current_audit;
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
  assert.deepEqual(matching.by_result.matched_brackets, [71, 1011066]);
  assert.deepEqual(matching.by_result.matched_normalised, [43, 993924]);
  assert.deepEqual(matching.by_result.annotation_review, [1, 190322]);
  assert.deepEqual(matching.by_result.state_branch, [34, 234944]);
  assert.deepEqual(matching.by_result.transaction_qualifier, [1, 1450000]);
});

test('released typed cells reconcile with the before/after audit and receipt coverage counts', () => {
  const donorFigures = graph.nodes.filter(n => n.kind === 'donor').map(receiptFigures);
  const total = donorFigures.reduce((sum, n) => sum + n.total, 0);
  const rows = donorFigures.reduce((sum, n) => sum + n.count, 0);
  assert.equal(total, audit.counts.after_exported.aud);
  assert.equal(rows, audit.counts.after_exported.rows);
  const publicDollars = donorFigures.reduce((sum, n) => sum + n.publicFunding[0], 0);
  const publicRows = donorFigures.reduce((sum, n) => sum + n.publicFunding[1], 0);
  assert.equal(rows + publicRows, graph.meta.receipt_types.counts.exported_rows);
  assert.deepEqual(audit.counts.after_exported_cells, {rows: rows + publicRows, aud: total + publicDollars});
  assert.equal(total - audit.counts.before_exported.aud, 554990);
  assert.equal(rows - audit.counts.before_exported.rows, 113);
  assert.equal(audit.donors_gaining, 27);
  assert.equal(audit.counts.existing_match_changed?.rows ?? 0, 1);
  // The shared guard preserves 32 branch receipts and one $1.45m Loan-labelled receipt outside their former parent identities.
  assert.deepEqual([audit.counts.after_unmatched_node.rows, audit.counts.after_unmatched_node.aud], [38987, 511411545]);
  assert.equal(audit.counts.after_unmatched_node.rows,
    matching.by_result.unmatched[0] + matching.by_result.ambiguous[0] + matching.by_result.state_branch[0] + matching.by_result.transaction_qualifier[0]);
  assert.deepEqual(graph.nodes.filter(publicFundingOnly).map(n => n.id), ['donor:nsw efa'], '#355 public-funding assertion stays in force');
});

test('the historical row-160 audit retains its original release figures', () => {
  assert.equal(historicalAudit.counts.after_exported.aud-historicalAudit.counts.before_exported.aud,2202974);
  assert.equal(historicalAudit.counts.after_exported.rows-historicalAudit.counts.before_exported.rows,146);
  assert.equal(historicalAudit.donors_gaining,30);
  assert.equal(historicalAudit.counts.existing_match_changed?.rows ?? 0,0);
});

test('the released annotated restatement stays in review and does not add a third gift', () => {
  const candidates = graph.nodes.filter(n => n.kind === 'donor' && receiptFigures(n).total === 740646 && receiptFigures(n).count === 8);
  assert.equal(candidates.length, 1, 'the reviewed donor keeps its original receipt figure');
  assert.deepEqual(audit.counts.annotation_review, {rows: 1, aud: 190322});
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
  const asset = async path => {
    assert.notEqual(path, '/graph/money.json', 'Ask must read the uncapped receipt source');
    return path === '/graph/money-receipts.json' ? structuredClone(full) : null;
  };
  const ASSETS = {fetch: async request => {
    assert.equal(new URL(request.url).pathname, '/graph/money-receipts.json');
    return Response.json(full);
  }};
  const answer = await api.callTool({origin: 'https://opax.test', asset, ASSETS}, 'money_totals', {donor: node.label});
  assert.deepEqual([answer.rows[0].total_aud, answer.rows[0].receipts], [891049, 23]);
  assert.equal(answer.measure, 'all_types');
  const donations = await api.callTool({origin: 'https://opax.test', asset, ASSETS}, 'money_totals', {donor: node.label, measure: 'donations'});
  assert.deepEqual([donations.rows[0].total_aud, donations.rows[0].receipts], [881049, 22]);
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
