// Independent expectations from the published JSON; no credentials, Ask or model calls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../portal/public');
export const ELECTORATE_GOLD_CASES = [
  { id: 'E01', question: 'What electorate has the lowest median income', args: { indicator: 'median_income', order: 'asc' } },
  { id: 'E02', question: 'Which federal electorate has the highest unemployment rate?', args: { indicator: 'unemployment_rate', order: 'desc' } },
  { id: 'E03', question: 'What is the median age in Corangamite?', args: { indicator: 'median_age', operation: 'lookup', electorate: 'Corangamite' } },
  { id: 'E04', question: 'Which Victorian state electorate has the lowest median income?', args: { indicator: 'median_income', jurisdiction: 'vic', chamber: 'vic_la', order: 'asc' } },
];
const units = { median_income: 'AUD/week', unemployment_rate: '%', median_age: 'years' };
export function computeElectorateGold(publicDir = PUBLIC) {
  const read = (url) => JSON.parse(fs.readFileSync(path.join(publicDir, url.replace(/^\//, '')), 'utf8'));
  const manifest = read('/electorates/manifest.json');
  const index = read(manifest.index_url).electorates;
  return ELECTORATE_GOLD_CASES.map((q) => {
    const jurisdiction = q.args.jurisdiction ?? 'federal';
    const chamber = q.args.chamber ?? 'representatives';
    const seats = index.filter((s) => s.status === 'current' && s.jurisdiction === jurisdiction && s.chamber === chamber && (!q.args.electorate || s.name === q.args.electorate));
    const available = [], missing = [];
    for (const s of seats) {
      const profile = read(s.detail_url).demographics.find((p) => p.year === 2021);
      const value = profile?.indicators[q.args.indicator];
      if (typeof value !== 'number' || !Number.isFinite(value)) { missing.push(s.name); continue; }
      available.push({ name: s.name, jurisdiction: s.jurisdiction, chamber: s.chamber, value, unit: units[q.args.indicator], url: `https://opax.com.au${s.url}`, source: '2021 Census (ABS)' });
    }
    const extreme = q.args.order === 'desc' ? Math.max(...available.map((r) => r.value)) : Math.min(...available.map((r) => r.value));
    const rows = (q.args.operation === 'lookup' ? available : available.filter((r) => r.value === extreme)).sort((a, b) => a.name.localeCompare(b.name));
    const label = q.args.indicator === 'median_income' ? 'median personal income' : q.args.indicator.replaceAll('_', ' ');
    const answer = rows.length ? rows.map((r) => `${r.name} (${r.jurisdiction}, ${r.chamber}): ${label} ${r.value} ${r.unit} (2021 Census (ABS))`).join('; ') + '.'
      : `The lowest ${label} cannot be determined: no published 2021 Census (ABS) values are available for current Victorian state electorates.`;
    return {
      id: q.id, category: 'electorates', question: q.question,
      note: q.id === 'E01' ? "Jake's question (13 Oct). Median income means personal weekly income, separate from household income. Census geography is not redistributed to current boundaries."
        : q.id === 'E04' ? 'State-seat Census profiles are not imported in this release. Expected honest non-answer; no federal-seat substitution.' : 'Published 2021 Census values; current electorate status only.',
      expected: {
        kind: 'electorates', indicator: q.args.indicator, rows, names: rows.map((r) => r.name), numbers: rows.map((r) => r.value),
        source: '2021 Census (ABS)', unit: units[q.args.indicator], matched: seats.length, available: available.length,
        missing: missing.sort(), ...(available.length ? {} : { unanswerable: 'no_demographic_data' }), answer,
        method: 'Read published manifest and current electorate detail JSON; select 2021 Census numeric values, then exact extrema or named lookup; include every tie.',
        query: { manifest: '/electorates/manifest.json', release_id: manifest.release_id, ...q.args, jurisdiction, chamber, status: 'current' },
      },
    };
  });
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(computeElectorateGold(), null, 2));
