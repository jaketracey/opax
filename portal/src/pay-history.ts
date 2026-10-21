/** Dated salary calculations over the existing base steps and office spells. No new data/schema. */
import type { PayData } from './ask-pay'
import type { StructuredToolResult } from './tools/types'
const aud = (n: number) => '$' + n.toLocaleString('en-AU')
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
// Match the export builder's round-to-even rule at exact half dollars.
const rounded = (n: number) => n % 1 === 0.5 ? Math.round(n / 2) * 2 : Math.round(n)
const previous = (s: string) => new Date(Date.parse(s) - 86400000).toISOString().slice(0, 10)
export function datedPay(pay: PayData, args: Record<string, unknown>): StructuredToolResult {
  const asOf = String(args.as_of ?? ''), year = /^\d{4}$/.test(asOf)
  const since = String(args.since ?? (year ? asOf + '-01-01' : asOf || pay.meta.as_of))
  const until = String(args.until ?? (year ? asOf + '-12-31' : asOf || pay.meta.as_of))
  const coverage = { since, until, available_since: pay.meta.from, available_until: pay.meta.as_of, as_of: pay.meta.as_of, requested_since: since, requested_until: until }
  const notes = ['Coverage: Federal parliamentary salary records start on 7 December 1999 and run to ' + pay.meta.as_of + '. Salary entitlements, not payslips; excludes electorate allowances, expenses, superannuation and outside income. Committee chair loadings are not counted. Party and chamber labels are the stored roster labels; historical affiliations and chamber changes are not dated in this export.']
  const limits = (text: string): StructuredToolResult => ({ rows: [], coverage: { ...coverage, matched: false }, citations: [{ kind: 'record', url: 'https://opax.com.au/methods', text }], notes })
  if (!validDate(since) || !validDate(until) || since > until) return limits('Please give a valid date or date range for the salary calculation.')
  if (since < pay.meta.from || until > pay.meta.as_of) return limits(`OPAX's pay records cover ${pay.meta.from} to ${pay.meta.as_of}; the requested period ${since} to ${until} is not fully covered. No current salary has been substituted.`)
  if (args.jurisdiction && args.jurisdiction !== 'federal') return limits('OPAX holds federal parliamentary salary records only; these cannot answer a state parliament salary question.')
  if (since < pay.meta.as_of && (args.party || args.chamber)) return limits(`OPAX's pay records cover ${since} to ${until}, but this export does not date party or chamber changes. A historical party or chamber ranking cannot be established from its current roster labels.`)
  // Cut at every salary or office change: a whole-year question must not quietly become 31 December.
  const cuts = new Set([since])
  for (const b of pay.base) if (b.from > since && b.from <= until) cuts.add(b.from)
  for (const p of Object.values(pay.people)) for (const spell of p.spells) for (const d of [spell[0], spell[1]]) if (d && d > since && d <= until) cuts.add(d)
  const dates = [...cuts].sort()
  const rows: { name: string; post: string; pct: number; salary: number; since: string; until: string; base: number; assumed: boolean; source: string; uncertain?: boolean }[] = []
  const requested = Array.isArray(args.people) ? args.people.map(String) : args.person ? [String(args.person)] : []
  const groups = requested.map(name => Object.values(pay.people).filter(p => fold(name).split(' ').every(w => fold(p.name).split(' ').includes(w))))
  const matches = groups.flat()
  if (groups.some(g => g.length !== 1)) return limits('Please give the full name of one federal parliamentarian; the supplied name does not identify a unique pay record.')
  const limit = Math.min(15, Math.max(1, Number(args.limit) || Math.max(1, requested.length)))
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i], end = i + 1 < dates.length ? previous(dates[i + 1]) : until
    const base = pay.base.filter(b => b.from <= date).at(-1)!
    const pool = (requested.length ? matches : Object.values(pay.people)).flatMap(p => {
      const spell = p.spells.find(s => s[0] <= date && (!s[1] || s[1] > date))
      if (!spell || args.party && p.party !== args.party || args.chamber && p.chamber !== args.chamber) return []
      const [, , post, pct, , assumed] = spell
      if (args.office && !fold(post).includes(fold(String(args.office)))) return []
      const ending = spell[1] ? previous(spell[1]) : pay.meta.as_of
      const endBase = pay.base.filter(b => b.from <= ending).at(-1)!.amount
      const officeRate = (amount: number) => amount + Math.ceil(Math.round(amount * pct / 100 * 1e6) / 1e6 / 10) * 10
      // The export stores each spell's entitlement at its end. Use that rate
      // and the registry's ministerial percentages to identify its rounding
      // class. Shadow and summed parliamentary offices use the office rule.
      const ministerial = !assumed && Object.values(pay.offices).some(o => o.kind === 'ministerial' && o.pct === pct) && rounded(endBase * (1 + pct / 100)) === spell[4]
      const exact = rounded(base.amount * (1 + pct / 100)), office = officeRate(base.amount)
      const officeClass = assumed || Object.values(pay.offices).some(o => o.kind !== 'ministerial' && o.pct === pct)
      const uncertain = ministerial && officeClass && officeRate(endBase) === spell[4] && exact !== office
      const salary = uncertain ? (args.order === 'asc' ? Math.min(exact, office) : Math.max(exact, office)) : ministerial ? exact : office
      return [{ name: p.name, post, pct, salary, ...(uncertain ? { uncertain: true } : {}), since: date, until: end, base: base.amount, assumed: !!assumed, source: base.url ?? 'https://handbook.aph.gov.au/' }]
    }).sort((a, b) => (args.order === 'asc' ? a.salary - b.salary : b.salary - a.salary) || a.name.localeCompare(b.name)).slice(0, limit)
    if (pool.some(row => row.uncertain)) return limits('The export does not distinguish the remuneration classification for a selected salary spell at this date. I cannot establish its exact rounding without that classification; no rate has been guessed.')
    for (const row of pool) {
      const last = [...rows].reverse().find(r => r.name === row.name)
      if (last && last.post === row.post && last.salary === row.salary && previous(row.since) === last.until) last.until = row.until
      else rows.push(row)
    }
  }
  if (!rows.length) return limits(`No matching federal parliamentary salary spell was found for ${since} to ${until}.`)
  if (rows.length > 40) return limits(`The period ${since} to ${until} contains too many salary changes for one answer. Please narrow the date range or name one person.`)
  return { rows, coverage: { ...coverage, matched: true }, citations: rows.map(r => ({ kind: 'record', url: r.source, value: r.salary,
    text: `${r.name}: ${aud(r.salary)} a year as ${r.post}, ${r.since} to ${r.until}; base ${aud(r.base)} plus ${r.pct}%${r.assumed ? ', if named in the Opposition Leader’s notice' : ''}.` })), notes }
}
