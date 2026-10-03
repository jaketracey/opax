// Ports of the dependency-free web logic. tests/transforms.test.ts evaluates
// the original functions from the same checkout against the same pinned data.
import type { BillIndex, Expenses, Pay, VoteRecord } from './catalog-decoders';

export const payNameKey = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const titleKey = (s: string) =>
  s.replace(/\s+/g, ' ').trim().toLowerCase();
export function billTitleIndex(index: BillIndex) {
  const map = new Map<string, BillIndex['bills'][number]>();
  for (const bill of index.bills) {
    map.set(titleKey(bill.title), bill);
    for (const alias of bill.aliases ?? []) map.set(titleKey(alias), bill);
  }
  return map;
}
export function voteTotals(records: VoteRecord[]) {
  const sum = (field: 'divisions_total' | 'ayes' | 'noes') =>
    records.reduce((a, r) => a + r[field], 0);
  const years = records.flatMap((r) => r.years);
  const ayes = sum('ayes'),
    noes = sum('noes');
  const side = (field: 'for' | 'against') =>
    records
      .flatMap((r) =>
        r[field].map((d) => ({ ...d, jur: d.jur || r.jurisdiction })),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);
  return {
    total: sum('divisions_total'),
    ayes,
    noes,
    ayePct: ayes + noes ? Math.round((ayes / (ayes + noes)) * 100) : null,
    years: years.length ? [Math.min(...years), Math.max(...years)] : [],
    jurisdictions: [...new Set(records.map((r) => r.jurisdiction))],
    for: side('for'),
    against: side('against'),
  };
}
export function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
export function expenseBenchmarks(expenses: Expenses) {
  const latestQuarter = expenses.meta.to;
  const latestYear =
    Number(latestQuarter.slice(0, 4)) ||
    Math.max(...Object.values(expenses.people).map((p) => p.to));
  const fromCutoff = latestYear - 3;
  const cohort = Object.values(expenses.people).filter(
    (p) => p.to === latestYear && p.from <= fromCutoff,
  );
  const categories = new Map<string, number[]>(),
    totals: number[] = [];
  for (const person of cohort) {
    const years = Math.max(person.to - person.from + 1, 1);
    totals.push(person.total / years);
    for (const [category, total] of person.by_category) {
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category)!.push(total / years);
    }
  }
  const byCategory = new Map(
    [...categories].map(([category, values]) => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
      return [
        category,
        {
          median: median(sorted),
          p90: sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)] || 0,
          count: sorted.length,
        },
      ];
    }),
  );
  return {
    latestQuarter,
    latestYear,
    fromCutoff,
    count: cohort.length,
    totalMedian: median(totals),
    byCategory,
  };
}
// portal/src/pay-records.mjs: the authoritative search projection. Rates and
// yearly totals are already calculated by the exporter; never recalculate them.
const whole = (n: number) =>
  n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });
const fy = (y: number) => `${y}-${String(y + 1).slice(2)}`;
export const PAY_SOURCE =
  'Remuneration Tribunal determinations and the Parliamentary Handbook, joined by Opax';
const LIMITS =
  'A salary entitlement set by instrument, not a payslip: electorate allowance, expenses, superannuation and outside income are not included, and committee chair loadings (3% to 16%) are not counted.';
export function payPersonRecord(pay: Pay, id: string) {
  const p = pay.people[id];
  if (!p?.spells.length) return null;
  const base = pay.base[pay.base.length - 1]!,
    asAt = pay.meta.as_of,
    last = p.spells[p.spells.length - 1]!;
  const lead = p.now
    ? `Paid ${whole(p.now.salary)} a year as ${p.now.post}${p.now.assumed ? ' (if named in the Opposition Leader’s notice)' : ''}: base salary ${whole(base.amount)}${p.now.pct ? ` plus a ${p.now.pct}% loading` : ''}, since ${p.now.since}, as at ${asAt}.`
    : `Left parliament${p.to ? ' on ' + p.to : ''} on ${whole(last[4])} a year as ${last[2]}.`;
  const peak = `Highest rate: ${whole(p.peak.salary)} a year as ${p.peak.post} in ${fy(p.peak.year)}.`;
  const total = `Salary entitlements ${fy(p.by_year[0]![0])} to ${fy(p.by_year[p.by_year.length - 1]![0])}: about ${whole(Math.round(p.total / 1000) * 1000)} in total${p.from <= pay.meta.from ? `, counted from ${pay.meta.from} where the series starts` : ''}; not adjusted for inflation.`;
  const years = `By financial year: ${p.by_year.map(([y, v]) => `${fy(y)} ${whole(v)}`).join('; ')}.`;
  let posts = 'Posts held, newest first (rate at the end of each spell):';
  for (const [from, to, post, pct, salary] of [...p.spells].reverse()) {
    const row = ` ${from} to ${to || 'now'}: ${post}, ${pct ? `base plus ${pct}%` : 'base salary'}, ${whole(salary)} a year;`;
    if ((lead + peak + total + years + posts + row + LIMITS).length > 1720)
      break;
    posts += row;
  }
  const from = Number(p.from.slice(0, 4)) || 0,
    to = Number((p.to || asAt).slice(0, 4)) || 0;
  return {
    key: 'pay:' + id,
    kind: 'pay',
    title: `${p.name} — pay for the posts held`,
    href: '/subject/person/' + encodeURIComponent(p.name) + '#person-pay',
    snippet: [lead, peak, total, posts.replace(/;$/, '.'), years, LIMITS].join(
      ' ',
    ),
    extra: {
      slug: 'pay-' + id.toLowerCase(),
      record_id: id,
      speakers: [p.name],
      parties: p.party ? [p.party] : [],
      state: 'federal',
      from,
      to,
      source: PAY_SOURCE,
      url:
        pay.meta.sources.find((src) => src.id === 'mp-determination')?.url ||
        '',
      dateLabel:
        from && to ? (from === to ? String(from) : `${from}–${to}`) : '',
    },
  };
}
export const moneyName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pty|ltd|limited|the|inc|co|holdings)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
