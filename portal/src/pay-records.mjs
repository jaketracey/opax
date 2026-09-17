// Pay as a public record: one row per parliamentarian, three rows for the
// scheme itself, written from pay.json (scripts/build_pay.py, docs/DATA-PAY.md).
// Shared by scripts/build_search_catalog.mjs, which puts the rows in the public
// search index, and by src/ask-pay.ts, which hands the closest ones straight to
// the model when a pay question is too loose for the calculated answer (a
// misspelt name, a vague or compound question). One text, one place.

const whole = n => Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const fy = y => `${y}-${String(Number(y) + 1).slice(2)}`;
const year = d => Number(String(d || '').slice(0, 4)) || 0;
const period = (a, b) => a && b ? (a === b ? String(a) : `${a}–${b}`) : '';
export const PAY_SOURCE = 'Remuneration Tribunal determinations and the Parliamentary Handbook, joined by Opax';
const LIMITS = 'A salary entitlement set by instrument, not a payslip: electorate allowance, expenses, superannuation and outside income are not included, and committee chair loadings (3% to 16%) are not counted.';
// The model is handed 1,800 characters of a record (ask-records.ts).
const ROOM = 1720;

const personHref = name => '/subject/person/' + encodeURIComponent(name) + '#person-pay';
const sourceUrl = (pay, id) => pay.meta.sources.find(src => src.id === id)?.url || '';

/** The pay record for one person, or null when the file has no spells for them. */
export function payPersonRecord(pay, id) {
  const p = pay.people[id];
  if (!p?.spells?.length) return null;
  const base = pay.base[pay.base.length - 1], asAt = pay.meta.as_of, last = p.spells[p.spells.length - 1];
  const lead = p.now
    ? `Paid ${whole(p.now.salary)} a year as ${p.now.post}${p.now.assumed ? ' (if named in the Opposition Leader’s notice)' : ''}: base salary ${whole(base.amount)}${p.now.pct ? ` plus a ${p.now.pct}% loading` : ''}, since ${p.now.since}, as at ${asAt}.`
    : `Left parliament${p.to ? ' on ' + p.to : ''} on ${whole(last[4])} a year as ${last[2]}.`;
  const peak = `Highest rate: ${whole(p.peak.salary)} a year as ${p.peak.post} in ${fy(p.peak.year)}.`;
  const total = `Salary entitlements ${fy(p.by_year[0][0])} to ${fy(p.by_year[p.by_year.length - 1][0])}: about ${whole(Math.round(p.total / 1000) * 1000)} in total${p.from <= pay.meta.from ? `, counted from ${pay.meta.from} where the series starts` : ''}; not adjusted for inflation.`;
  const years = `By financial year: ${p.by_year.map(([y, v]) => `${fy(y)} ${whole(v)}`).join('; ')}.`;
  // Newest posts first, as many as fit.
  let posts = 'Posts held, newest first (rate at the end of each spell):';
  for (const [from, to, post, pct, salary] of [...p.spells].reverse()) {
    const row = ` ${from} to ${to || 'now'}: ${post}, ${pct ? `base plus ${pct}%` : 'base salary'}, ${whole(salary)} a year;`;
    if ((lead + peak + total + years + posts + row + LIMITS).length > ROOM) break;
    posts += row;
  }
  const from = year(p.from), to = year(p.to || asAt);
  return {
    key: 'pay:' + id, kind: 'pay', title: `${p.name} — pay for the posts held`, href: personHref(p.name),
    snippet: [lead, peak, total, posts.replace(/;$/, '.'), years, LIMITS].join(' '),
    extra: { slug: 'pay-' + id.toLowerCase(), record_id: id, speakers: [p.name], parties: p.party ? [p.party] : [], state: 'federal',
      from, to, source: PAY_SOURCE, url: sourceUrl(pay, 'mp-determination'), dateLabel: period(from, to) },
  };
}

/** Sitting members by salary, then everyone else by career total: among several
 *  Anthonys, the Prime Minister is the first row a loose match reaches. */
export function payPersonOrder(pay) {
  const sitting = new Set(pay.current.map(row => row.id));
  return [...pay.current.map(row => row.id),
    ...Object.entries(pay.people).filter(([id]) => !sitting.has(id)).sort((a, b) => b[1].total - a[1].total).map(([id]) => id)];
}

/** The scheme itself: the base salary's steps, what each post pays, who is paid most. */
export function payGeneralRecords(pay) {
  const base = pay.base[pay.base.length - 1], asAt = pay.meta.as_of, thisYear = year(asAt);
  const office = id => pay.offices[id];
  const rate = o => o.kind === 'ministerial' ? Math.round(base.amount * (1 + o.pct / 100)) : base.amount + Math.ceil(base.amount * o.pct / 1000) * 10;
  const floor = pay.current.filter(row => row.pct === 0).length;
  const common = { state: 'federal', source: PAY_SOURCE, url: sourceUrl(pay, 'mp-determination') };
  return [
    { key: 'pay:base', kind: 'pay', title: 'Parliamentary base salary — every step since 1999', href: '/ask?q=' + encodeURIComponent('How much do politicians get paid?'),
      snippet: `The base salary of a federal senator or member is ${whole(base.amount)} a year, as at ${asAt}. Steps: ${pay.base.map(step => `${step.from} ${whole(step.amount)}`).join('; ')}. The Remuneration Tribunal made no adjustment for 1 July 2026. A post adds a loading as a percentage of this base. ${LIMITS}`,
      extra: { ...common, slug: 'pay-base-salary', aliases: 'politicians politician MPs senators backbencher salary history pay rise', from: 1999, to: thisYear, dateLabel: period(1999, thisYear) } },
    { key: 'pay:posts', kind: 'pay', title: 'What each parliamentary post pays — loadings on the base salary', href: '/ask?q=' + encodeURIComponent('How much does the Prime Minister earn?'),
      snippet: `As at ${asAt}, on a base salary of ${whole(base.amount)}: ${Object.keys(pay.offices).filter(id => office(id).pct > 0).map(id => `${office(id).label} ${office(id).pct}% (${whole(rate(office(id)))} a year)`).join('; ')}. A Minister is paid the one ministerial rate that applies; other office holders are paid the sum of their offices rounded up to $10; a shadow minister is paid a flat rate only if named in the Opposition Leader’s notice. None of these percentages has changed since 7 December 1999; shadow ministers were first paid from 15 March 2012. ${LIMITS}`.slice(0, 1790),
      extra: { ...common, url: sourceUrl(pay, 'ministerial-report') || common.url, slug: 'pay-posts', aliases: 'prime minister treasurer cabinet minister speaker president opposition leader whip shadow minister salary loading additional salary', from: 1999, to: thisYear, dateLabel: `As at ${asAt}` } },
    { key: 'pay:ranking', kind: 'pay', title: 'Highest paid federal parliamentarians — current ranking', href: '/ask?q=' + encodeURIComponent('Who is the highest paid politician?'),
      snippet: `As at ${asAt}, ranked by salary: ${pay.current.slice(0, 30).map((row, i) => `${i + 1}. ${row.name} (${row.party || 'no party'}), ${row.post}, ${whole(row.salary)}`).join('; ')}. ${floor} of ${pay.current.length} sitting parliamentarians are on the base salary of ${whole(base.amount)} with no loading counted. ${LIMITS}`.slice(0, 1790),
      extra: { ...common, slug: 'pay-ranking', aliases: 'highest paid best paid top earners politicians MPs senators Labor Liberal Nationals Greens', from: thisYear, to: thisYear, dateLabel: `As at ${asAt}` } },
  ];
}
