import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { privacySourceGraphs } from '../../scripts/withhold_donor_assets.mjs';
import { donorPrivacyIndex, donorNameWithheld } from '../public/donor-entity.js';

const adapter = readFileSync(new URL('../graph/index.ts', import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../public/money-map.js', import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;

test('the money map draws no withheld-donor aggregate over its canvas', () => {
  // The aggregate box sat over the year scrub; it lives in node cards only now.
  for (const source of [adapter, bundle]) {
    assert.doesNotMatch(source, /mm-individual-summary/);
    assert.doesNotMatch(source, /position:absolute;left:12px;bottom:12px/);
  }
  const scaffold = adapter.slice(adapter.indexOf('// --- DOM scaffolding'), adapter.indexOf("const card = el('div', 'mm-card', container)"));
  assert.ok(scaffold.length > 0);
  assert.doesNotMatch(scaffold, /donorAggregateDetail|unnamedDonorLabel|withheldDonorTotals/);
  assert.doesNotMatch(adapter, /container\.append\([^)]*(?:donorAggregateDetail|Summary)/);
});

const start = adapter.indexOf('    const visibleNodes = windowNodes.filter(');
const filterBlock = adapter.slice(start, adapter.indexOf('    const visibleIds =', start));
test('the map renders no withheld donor node or label', () => {
  const graphs = privacySourceGraphs(), index = donorPrivacyIndex(graphs);
  const withheld = n => n.kind === 'donor' && donorNameWithheld(index, n.label);
  let hidden = 0;
  for (const graph of graphs) {
    hidden += graph.nodes.filter(withheld).length;
    // Every donor active, every cluster open, public money on: the widest scene.
    const visibleNodes = runInNewContext(`${transpile(filterBlock)}; visibleNodes`, {
      windowNodes: graph.nodes, windowEdges: graph.edges, withheld, grantsOn: true, activeGroup: null, researchFilters: {},
      activeDonors: new Set(graph.edges.flatMap(e => [e.source, e.target])),
    });
    assert.ok(visibleNodes.some(n => n.kind === 'donor'));
    assert.equal(visibleNodes.filter(withheld).length, 0);
  }
  assert.ok(hidden > 0, 'the export holds withheld donors to keep off the map');
});
