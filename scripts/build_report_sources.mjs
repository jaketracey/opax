#!/usr/bin/env node
// The largest receipt sources on each topic report, ranked by the record rule.
//
// A report's stats.donations.top_donors used to sum every receipt row by donor
// spelling (scripts/report_stats.py): the donor's own declarations, the parties'
// returns and other returns all went in, so one gift could count two or three
// times and a report could show several times the figure on the donor's record.
// This step ranks the federal money map's donors in the report's industries by
// receiptFigures (portal/public/donor-disclosure.js), the figure each donor's
// record shows: each receipt once, from the party's own return.
//
// It runs at build time from the published money graph, so the list follows the
// nightly money refresh. Two fields are written:
//   top_donors  [[label, dollars]] pairs, the shape the app decodes (two items exactly)
//   top_sources [{id, label, total, href}] the map's donor id and label, and the record link
//   top_sources_scope  what the figures count, in a reader's words
// Every other report field is left byte for byte as it was.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {receiptFigures, hasPartyReceipts, donorDisclosure, receiptScopeLabel} from '../portal/public/donor-disclosure.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'portal', 'public');
export const REPORT_SOURCES_LIMIT = 6;

/** The report's industries' donors on the money graph, ranked by their record figure. */
export function reportSources(industries, graph, limit = REPORT_SOURCES_LIMIT) {
  const wanted = new Set(industries || []);
  const rows = [];
  let typed = false, firstYear = null, lastYear = null;
  for (const node of graph?.nodes || []) {
    if (node?.kind !== 'donor' || !wanted.has(node.industry) || !hasPartyReceipts(node)) continue;
    const figures = receiptFigures(node);
    if (!(figures.total > 0)) continue;
    rows.push({node, figures});
  }
  rows.sort((a, b) => b.figures.total - a.figures.total || String(a.node.label).localeCompare(String(b.node.label)));
  const top = rows.slice(0, limit);
  for (const {figures} of top) {
    typed ||= figures.typed;
    if (figures.firstYear != null) firstYear = firstYear == null ? figures.firstYear : Math.min(firstYear, figures.firstYear);
    if (figures.lastYear != null) lastYear = lastYear == null ? figures.lastYear : Math.max(lastYear, figures.lastYear);
  }
  const sources = top.map(({node, figures}) => ({
    id: node.id, label: node.label, total: Math.round(figures.total), href: donorDisclosure(node).href,
  }));
  return {
    top_donors: sources.map(s => [s.label, s.total]),
    top_sources: sources,
    top_sources_scope: sources.length ? receiptScopeLabel({typed, firstYear, lastYear}) : '',
  };
}

/** A report with its donation sources rebuilt; null when it has no donation stats. */
export function withReportSources(report, graph) {
  const donations = report?.stats?.donations;
  if (!donations || !Array.isArray(donations.industries)) return null;
  // Assigning in place keeps the key order, so only these fields change in the file.
  Object.assign(donations, reportSources(donations.industries, graph));
  return report;
}

export function reportSourceFiles(publicRoot = PUBLIC) {
  const graph = JSON.parse(readFileSync(join(publicRoot, 'graph/money.json'), 'utf8'));
  const dir = join(publicRoot, 'reports');
  const out = [];
  for (const name of readdirSync(dir).filter(n => n.endsWith('.json') && n !== 'index.json').sort()) {
    const path = join(dir, name);
    const before = readFileSync(path, 'utf8');
    const report = withReportSources(JSON.parse(before), graph);
    if (!report) continue;
    out.push({path, name, before, text: JSON.stringify(report) + '\n'});
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = reportSourceFiles();
  const stale = files.filter(f => f.before !== f.text);
  if (process.argv.includes('--check')) {
    if (stale.length) {
      console.error(`build_report_sources: stale (${stale.map(f => f.name).join(', ')}); run node scripts/build_report_sources.mjs.`);
      process.exitCode = 1;
    } else console.log('build_report_sources: current.');
  } else {
    for (const f of stale) writeFileSync(f.path, f.text);
    console.log(stale.length ? `build_report_sources: written (${stale.map(f => f.name).join(', ')}).` : 'build_report_sources: current.');
  }
}
