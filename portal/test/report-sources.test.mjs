// A report's largest receipt sources are the money map's donors in its industries,
// ranked by the figure each donor's record shows (receiptFigures): each receipt once,
// from the party's own return. Never a sum of receipt rows by donor spelling.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {receiptFigures} from '../public/donor-disclosure.js';
import {reportSources, reportSourceFiles, withReportSources} from '../../scripts/build_report_sources.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const read = path => JSON.parse(readFileSync(join(publicDir, path), 'utf8'));
const SOURCE_FIELDS = ['top_donors', 'top_sources', 'top_sources_scope'];
const withoutSources = report => {
  const copy = structuredClone(report);
  for (const key of SOURCE_FIELDS) delete copy.stats?.donations?.[key];
  return copy;
};

// Invented donors. Example Minerals gave one $100,000 gift: the party's return lists it
// once, its own donor return declares it again, and a second return spells it in capitals.
// The old spelling sum counted $300,000 across two names; its record shows $100,000.
const fixtureGraph = {
  meta: {}, edges: [],
  nodes: [
    {id: 'donor:example minerals', kind: 'donor', label: 'Example Minerals Pty Ltd', source_name: 'Example Minerals Pty Ltd',
      industry: 'mining', aliases: ['EXAMPLE MINERALS PTY LTD'], total: 300000, count: 3,
      by_type: {donation_received: 100000}, by_type_year: {'2020-21': {donation_received: [100000, 1]}}},
    {id: 'donor:sample coal', kind: 'donor', label: 'Sample Coal Ltd', source_name: 'Sample Coal Ltd', industry: 'fossil_fuels',
      total: 90000, count: 2, by_type: {donation_received: 40000, other_receipt: 5000},
      by_type_year: {'2018-19': {donation_received: [40000, 1], other_receipt: [5000, 1]}}},
    // Declared only on its own donor return: the parties' returns list nothing, so no rank.
    {id: 'donor:quiet quarry', kind: 'donor', label: 'Quiet Quarry Pty Ltd', industry: 'mining', total: 500000, count: 1,
      by_type: {}, by_type_year: {}},
    // Another industry: not in a mining report.
    {id: 'donor:invented bank', kind: 'donor', label: 'Invented Bank', industry: 'finance', total: 900000, count: 4,
      by_type: {donation_received: 900000}, by_type_year: {'2021-22': {donation_received: [900000, 4]}}},
    {id: 'party:example', kind: 'party', label: 'Example Party', industry: 'mining', total: 1e9},
  ],
};

test('a donor counted three times by spelling ranks once, at its record figure', () => {
  const out = reportSources(['mining', 'fossil_fuels'], fixtureGraph);
  assert.deepEqual(out.top_donors, [['Example Minerals Pty Ltd', 100000], ['Sample Coal Ltd', 45000]]);
  assert.deepEqual(out.top_sources, [
    {id: 'donor:example minerals', label: 'Example Minerals Pty Ltd', total: 100000, href: '/subject/donor/Example%20Minerals%20Pty%20Ltd'},
    {id: 'donor:sample coal', label: 'Sample Coal Ltd', total: 45000, href: '/subject/donor/Sample%20Coal%20Ltd'},
  ]);
  assert.equal(out.top_sources_scope, 'All receipt types, 2018–19 to 2020–21, as the parties reported them in federal returns');
  for (const s of out.top_sources) assert.equal(s.total, receiptFigures(fixtureGraph.nodes.find(n => n.id === s.id)).total);
});

test('the rebuild changes the source fields and nothing else', () => {
  const report = {slug: 'x', stats: {speech_count: 5, timeline: [['2020', 5]],
    donations: {industries: ['mining'], total: 123, count: 4, top_donors: [['EXAMPLE MINERALS PTY LTD', 300000]], by_year: [['2020-21', 123]]}}};
  const before = withoutSources(report);
  const after = withReportSources(structuredClone(report), fixtureGraph);
  assert.deepEqual(withoutSources(after), before);
  assert.deepEqual(after.stats.donations.top_donors, [['Example Minerals Pty Ltd', 100000]]);
  assert.equal(withReportSources({stats: {speech_count: 1}}, fixtureGraph), null, 'a report without donation stats is left alone');
});

// The donor page finds its node the way app.js findMoneyNode does: the label, then a recorded spelling.
const normName = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(pty|ltd|limited|the|inc|co|holdings)\b/g, '').replace(/\s+/g, ' ').trim();
const findDonor = (graph, name) => {
  const nn = normName(name);
  const donors = graph.nodes.filter(n => n.kind === 'donor');
  return donors.find(n => normName(n.label) === nn) || donors.find(n => [...n.aliases || [], ...n.lookup_names || []].some(a => normName(a) === nn)) || null;
};

test('released reports: every source is a map donor at its record figure, and the lists are current', () => {
  const graph = read('graph/money.json');
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const files = reportSourceFiles(publicDir);
  assert.ok(files.length >= 4, 'the topic reports with donation stats');
  for (const {name, before, text} of files) {
    assert.equal(before, text, `${name}: run node scripts/build_report_sources.mjs`);
    const don = JSON.parse(before).stats.donations;
    assert.ok(don.top_sources.length >= 3, `${name}: a list to show`);
    assert.deepEqual(don.top_donors, don.top_sources.map(s => [s.label, s.total]), `${name}: the app's pairs match`);
    for (const pair of don.top_donors) assert.equal(pair.length, 2, `${name}: the app decodes exactly two items`);
    assert.match(don.top_sources_scope, /^All receipt types, .* as the parties reported them in federal returns$/);
    let previous = Infinity;
    for (const s of don.top_sources) {
      const node = byId.get(s.id);
      assert.ok(node && node.kind === 'donor', `${name}: ${s.id} is on the map`);
      assert.ok(don.industries.includes(node.industry), `${name}: ${s.label} is in the report's industries`);
      assert.equal(s.label, node.label);
      assert.equal(s.total, Math.round(receiptFigures(node).total), `${name}: ${s.label} at its record figure`);
      assert.ok(s.total <= previous, `${name}: ranked`);
      previous = s.total;
      // The link opens this donor's record, whose headline is the same receiptFigures total.
      assert.equal(findDonor(graph, decodeURIComponent(s.href.replace('/subject/donor/', '')))?.id, s.id, `${name}: ${s.href}`);
    }
    // Nothing in the industry outranks the top entry on the record rule.
    const best = Math.max(...graph.nodes.filter(n => n.kind === 'donor' && don.industries.includes(n.industry)).map(n => receiptFigures(n).total));
    assert.equal(don.top_sources[0].total, Math.round(best), `${name}: top entry`);
  }
});

test('released climate report: Mineralogy at its record figure, not the spelling sum', () => {
  const top = read('reports/climate.json').stats.donations.top_sources[0];
  assert.equal(top.id, 'donor:mineralogy');
  assert.ok(top.total > 50e6 && top.total < 70e6, `${top.total} is the record's $59.3m, not the old $441m`);
});

test('released reports: no other report stat moved from report_stats.json', () => {
  const stats = JSON.parse(readFileSync(join(here, '..', '..', 'scripts', 'report_stats.json'), 'utf8'));
  for (const file of readdirSync(join(publicDir, 'reports')).filter(f => f.endsWith('.json') && f !== 'index.json')) {
    const report = read('reports/' + file);
    const slug = file.slice(0, -5);
    const don = report.stats?.donations;
    if (!don || !stats[slug]?.donations) continue;
    const {top_donors, top_sources, top_sources_scope, ...rest} = don;
    assert.deepEqual(rest, stats[slug].donations, `${slug}: industries, total, count and by_year as built`);
    assert.equal('top_donors' in stats[slug].donations, false, `${slug}: report_stats.json no longer carries a spelling sum`);
  }
});

test('the report page shows the record-rule list, linked to each record', () => {
  const app = readFileSync(join(publicDir, 'app.js'), 'utf8');
  const block = app.slice(app.indexOf('function renderStats('), app.indexOf('let currentReportSlug'));
  assert.match(block, /don\?\.top_sources/);
  assert.match(block, /heading: "Largest receipt sources"/);
  assert.match(block, /scope: don\.top_sources_scope/);
  assert.match(block, /row\?\.\[2\]/);
});
