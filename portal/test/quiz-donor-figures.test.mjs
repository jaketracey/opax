// The quiz states a donor's figure the way the donor's record states it (BACKLOG A29).
// The app's Money deck said Santos gave $4.4m while its money record said $2.4m to
// 3 parties: the deck was a snapshot of the legacy all-record total (the parties'
// returns plus the donor's own declarations of the same gifts, 5 parties), the
// record reads the typed cells (receiptGraph / receiptFigures): each receipt once,
// from the parties' own returns, all receipt types. Every donor figure in the quiz
// goes through receiptGraph, the report question included, and the questions say
// "receipts" and "reported": "gave", "donated" and "donors" mean Donation Received
// only (A34), which is a smaller figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {hasPartyReceipts, receiptFigures} from '../public/donor-disclosure.js';
import {TEMPLATES, buildRound, createRng, makeQuizContext, validateQuestion} from '../public/quiz.js';

const template = (id) => TEMPLATES.find((t) => t.id === id);

// ---- An invented donor with receipts to three parties --------------------------
// Ironbark's legacy cells double each gift (declared by both sides) and carry a
// fourth party that only its own donor return names; the typed cells hold each
// receipt once, to three parties.
const typed = (cells) => {
  const by_type = {}, by_type_year = {};
  for (const [fy, type, dollars, n] of cells) {
    by_type[type] = (by_type[type] || 0) + dollars;
    (by_type_year[fy] ||= {})[type] = [dollars, n];
  }
  return {by_type, by_type_year};
};
const flow = (source, target, legacy, cells) => ({
  source, target, total: legacy, count: 2 * cells.length, firstYear: 2019, lastYear: 2021,
  byYear: {2019: [legacy, 2 * cells.length]}, ...typed(cells),
});
const IRONBARK = 'donor:ironbark gas holdings';
const ironbarkFlows = [
  flow(IRONBARK, 'party:Harbour Party', 1800000, [['2019-20', 'donation_received', 600000, 2], ['2019-20', 'other_receipt', 300000, 3]]),
  flow(IRONBARK, 'party:Ridge Party', 880000, [['2020-21', 'other_receipt', 440000, 4]]),
  flow(IRONBARK, 'party:River Party', 420000, [['2021-22', 'donation_received', 160000, 1], ['2021-22', 'subscription', 50000, 1]]),
  flow(IRONBARK, 'party:Coast Party', 240000, []),
];
const peerFlows = [
  flow('donor:saltbush energy', 'party:Harbour Party', 2400000, [['2020-21', 'donation_received', 1200000, 3]]),
  flow('donor:coolabah petroleum', 'party:Ridge Party', 2000000, [['2020-21', 'other_receipt', 1000000, 2]]),
  flow('donor:wattle resources', 'party:River Party', 480000, [['2021-22', 'donation_received', 240000, 1]]),
];
const donorNode = (id, label, flows) => {
  const cells = flows.flatMap((f) => Object.entries(f.by_type_year).flatMap(([fy, types]) =>
    Object.entries(types).map(([type, [dollars, n]]) => [fy, type, dollars, n])));
  const node = {id, label, kind: 'donor', industry: 'fossil_fuels', total: flows.reduce((s, f) => s + f.total, 0),
    count: 9, firstYear: 2019, lastYear: 2021, byYear: {}, by_type: {}, by_type_year: {}};
  for (const [fy, type, dollars, n] of cells) {
    node.by_type[type] = (node.by_type[type] || 0) + dollars;
    const year = (node.by_type_year[fy] ||= {});
    year[type] = [(year[type]?.[0] || 0) + dollars, (year[type]?.[1] || 0) + n];
  }
  return node;
};
const graph = {
  meta: {},
  nodes: [
    donorNode(IRONBARK, 'Ironbark Gas Holdings Pty Ltd', ironbarkFlows),
    donorNode('donor:saltbush energy', 'Saltbush Energy Ltd', [peerFlows[0]]),
    donorNode('donor:coolabah petroleum', 'Coolabah Petroleum Ltd', [peerFlows[1]]),
    donorNode('donor:wattle resources', 'Wattle Resources Ltd', [peerFlows[2]]),
    ...['Harbour Party', 'Ridge Party', 'River Party', 'Coast Party'].map((p) => ({id: 'party:' + p, label: p, kind: 'party', total: 1, byYear: {}})),
  ],
  edges: [...ironbarkFlows, ...peerFlows],
};
// A report whose own top_donors list sums every row by spelling (the old source of the
// report question): Ironbark there is many times its record.
const reports = {energy: {title: 'Energy', stats: {speech_count: 10, donations: {
  industries: ['fossil_fuels'],
  top_donors: [['IRONBARK GAS HOLDINGS PTY LTD', 9100000], ['Saltbush Energy Ltd', 5000000], ['Coolabah Petroleum Ltd', 4000000], ['Wattle Resources Ltd', 900000]],
}}}};

// The donor record: its headline (receiptFigures of the node) and "Where the money went"
// (each flow the parties' returns list, receiptFigures of the edge), as on the donor page.
const ironbark = graph.nodes.find((n) => n.id === IRONBARK);
const recordFlows = graph.edges.filter((e) => e.source === IRONBARK && hasPartyReceipts(e));
const RECORD = receiptFigures(ironbark).total;

test('the invented record: $1,550,000 to three parties, against a legacy $3,340,000 to four', () => {
  assert.equal(RECORD, 1550000);
  assert.equal(recordFlows.length, 3, 'the party only the donor return names is not one of them');
  assert.equal(recordFlows.reduce((s, e) => s + receiptFigures(e).total, 0), RECORD, 'the parties sum to the headline');
  assert.equal(ironbark.total, 3340000, 'the legacy cells the quiz must not read');
  assert.equal(receiptFigures(ironbark).byType.donation_received, 760000, 'Donation Received alone is a smaller figure');
});

/** The first question a template builds about Ironbark, over a run of seeds. */
function aboutIronbark(id, ctx, mentions) {
  for (let seed = 1; seed <= 400; seed++) {
    const q = template(id).build(ctx, createRng(seed));
    if (q && validateQuestion(q) && mentions(q)) return q;
  }
  assert.fail(id + ' never asked about Ironbark');
}

test('every donor question states the figure on the donor\'s record', () => {
  const ctx = makeQuizContext({money: graph, reports});
  assert.equal(ctx.donorsById.get(IRONBARK).total, RECORD);
  const name = 'Ironbark Gas Holdings Pty Ltd';

  const figure = aboutIronbark('money-donor-figure', ctx, (q) => q.prompt.includes(name));
  assert.equal(figure.answer, RECORD);
  assert.equal(figure.fact, name + ': $1.6 million');

  const order = aboutIronbark('money-donor-order', ctx, (q) => q.answer.includes(name));
  assert.equal(order.options.find((o) => o.label === name).value, RECORD);
  assert.deepEqual(order.answer, [name, 'Saltbush Energy Ltd', 'Coolabah Petroleum Ltd']);

  const versus = aboutIronbark('money-donor-higher-lower', ctx, (q) => [q.comparison.shownLabel, q.comparison.hiddenLabel].includes(name));
  const side = versus.comparison.shownLabel === name ? 'shownValue' : 'hiddenValue';
  assert.equal(versus.comparison[side], RECORD);

  const report = aboutIronbark('money-top-donor-in-report', ctx, (q) => q.options.some((o) => o.correct && o.label === name));
  assert.equal(report.fact, name + ': $1.6 million', 'the record figure, not the report list\'s $9.1 million');
  for (const listed of ['$5 million', '$4 million', '$900,000']) assert.ok(!report.explanation.includes(listed), 'no report-list figure: ' + listed);
  assert.match(report.explanation, /^Parties reported \$[\d.,]+(?: million)? from [A-Z].* and \$[\d.,]+(?: million)? from [A-Z]/);
  assert.equal(report.link.href, '/subject/donor/Ironbark%20Gas%20Holdings%20Pty%20Ltd', 'the link opens the record that states the same figure');
  assert.ok(report.scope, 'the reveal says what the figure counts');
});

test('the industry-to-party question sums the same three flows', () => {
  const ctx = makeQuizContext({money: graph, reports});
  const toHarbour = ctx.money.edges.filter((e) => e.target === 'party:Harbour Party').reduce((s, e) => s + e.total, 0);
  assert.equal(toHarbour, receiptFigures(ironbarkFlows[0]).total + receiptFigures(peerFlows[0]).total);
  assert.ok(!ctx.money.edges.some((e) => e.target === 'party:Coast Party'), 'a flow only the donor declared is not a receipt');
});

// ---- The released graph: Santos and every other donor ------------------------------
const publicDir = new URL('../public/', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, publicDir), 'utf8'));
const published = json('graph/money.json');
const releasedReports = {};
for (const file of readdirSync(new URL('reports/', publicDir))) {
  if (file !== 'index.json' && file.endsWith('.json')) releasedReports[file.slice(0, -5)] = json('reports/' + file);
}
const releasedCtx = makeQuizContext({money: published, reports: releasedReports});

test('released: the quiz figure for Santos is its record figure, from three parties\' returns', () => {
  const node = published.nodes.find((n) => n.id === 'donor:santos');
  const record = receiptFigures(node);
  assert.equal(releasedCtx.donorsById.get('donor:santos').total, record.total);
  const parties = published.edges.filter((e) => e.source === 'donor:santos' && !e.grant && !e.flow && hasPartyReceipts(e));
  assert.equal(parties.length, 3);
  assert.equal(parties.reduce((s, e) => s + receiptFigures(e).total, 0), record.total);
  assert.ok(node.total > record.total, 'the legacy all-record cells are larger: they add the donor\'s own declarations');
});

test('released: every donor the quiz can name carries its record figure, and the report question names only those figures', () => {
  for (const node of published.nodes.filter((n) => n.kind === 'donor' && n.by_type)) {
    assert.equal(releasedCtx.donorsById.get(node.id).total, receiptFigures(node).total, node.id);
  }
  const byLabel = new Map(releasedCtx.donors.map((d) => [d.label, d.total]));
  for (let seed = 1; seed <= 60; seed++) {
    const q = template('money-top-donor-in-report').build(releasedCtx, createRng(seed));
    assert.ok(q && validateQuestion(q), 'builds from the released reports at seed ' + seed);
    const top = q.options.find((o) => o.correct).label;
    assert.ok(q.options.every((o) => byLabel.has(o.label)), 'every option is a donor on the money map');
    assert.ok(q.options.every((o) => byLabel.get(o.label) <= byLabel.get(top)));
    assert.equal(q.scope, releasedCtx.receiptScope);
  }
});

// ---- Wording: receipts the parties reported, never "gave" or "donated" -------------
const RECEIPT_TEMPLATES = ['money-industry-most', 'money-industry-magnitude', 'money-party-from-industry',
  'money-donor-higher-lower', 'money-donor-order', 'money-donor-figure', 'money-top-donor-in-report'];
const GIVING = /\b(?:gave|give[ns]?|giving|donat\w*|donors?|disclose[sd]? (?:a|the most))\b/i;

test('wording: every donor and industry figure is put as receipts the parties reported', () => {
  const names = [...published.nodes.map((n) => n.label), ...releasedCtx.donors.map((d) => d.label)]
    .filter(Boolean).sort((a, b) => b.length - a.length);
  const strip = (text) => names.reduce((s, name) => s.split(name).join('<name>'), text);
  for (const id of RECEIPT_TEMPLATES) {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const q = template(id).build(releasedCtx, createRng(seed));
      if (!q) continue;
      seen++;
      const copy = strip(q.prompt + ' ' + q.explanation);
      if (id.startsWith('money-industry-') || id === 'money-party-from-industry') assert.match(copy, /donations/, id);
      else assert.doesNotMatch(copy, GIVING, id + ': ' + copy);
      assert.match(q.prompt, /receipts|reported|donations/, id + ' says what the figure counts: ' + q.prompt);
      assert.ok(!/—/.test(q.prompt + q.explanation), id + ' has no em dash');
      if (id.startsWith('money-industry-') || id === 'money-party-from-industry') assert.match(q.scope, /donations only/, id);
      else assert.equal(q.scope, releasedCtx.receiptScope, id + ' carries the scope line');
    }
    assert.ok(seen > 0, id + ' builds from the released data');
  }
});

test('wording: the exact prompts', () => {
  const ctx = makeQuizContext({money: graph, reports});
  const name = 'Ironbark Gas Holdings Pty Ltd';
  assert.equal(aboutIronbark('money-donor-figure', ctx, (q) => q.prompt.includes(name)).prompt,
    'In total, how much have parties reported in receipts from Ironbark Gas Holdings Pty Ltd?');
  assert.equal(aboutIronbark('money-donor-order', ctx, (q) => q.answer.includes(name)).prompt,
    'Order these fossil fuels receipt sources by what parties reported from each, largest first.');
  assert.equal(aboutIronbark('money-donor-higher-lower', ctx, (q) => q.comparison.hiddenLabel === name).prompt,
    'Did parties report a higher or lower total in receipts from Ironbark Gas Holdings Pty Ltd?');
  assert.equal(aboutIronbark('money-top-donor-in-report', ctx, () => true).prompt,
    'These three are among the largest receipt sources in the industries the Energy report covers. Which one did parties report the most receipts from?');
});

test('a full money round still builds from the released data', () => {
  for (const seed of [7, 48, 2909]) {
    const round = buildRound({money: published, reports: releasedReports}, createRng(seed), 12, 'money');
    assert.equal(round.length, 12);
    assert.ok(round.every(validateQuestion));
  }
});
