/** Federal parliamentarians' salary entitlements from public/pay.json (Remuneration Tribunal rates joined to
 * Handbook posts), and the Tribunal's rates for departmental secretaries and statutory offices from
 * public/pay-offices.json. Other public servants' pay is not held: the tool says where it is published. */
import { datedPay } from '../pay-history'
import type { PayData as HistoricalPayData } from '../ask-pay'
import { personUrl } from '../../public/party-page.js'
import { officesNamed, generalOfficeQuestion, type OfficeData, type OfficeRow } from '../ask-pay-offices'
import { payOfficeRecord, rankedOffices, officeSource } from '../pay-records.mjs'
import { aud, clip, fold, readableRange, siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolDefinition, type ToolEnv } from './types'

interface Office { label: string; kind: string; pct: number }
interface Current { name: string; party?: string; chamber: string; post: string; pct: number; salary: number; assumed?: boolean }
interface Person { name: string; party?: string; chamber?: string; from?: string; to?: string | null; sitting?: boolean; peak?: { post: string; salary: number; year: number }; total?: number }
interface PayData { meta: { as_of: string; sources?: { id: string; url: string }[] }; base: { amount: number }[]; offices: Record<string, Office>; current: Current[]; names: Record<string, string>; people: Record<string, Person> }

export const PAY_LIMITS = 'Salary entitlements set by the Remuneration Tribunal, not payslips: electorate allowance, expenses, superannuation and outside income are not included. Federal parliament only.'
// Offices a public servant or statutory officer holds. "Parliamentary Secretary" is an MP post and stays in scope.
const PUBLIC_SERVICE = /\b(?:secretar(?:y|ies)|departments?|departmental|agency|agencies|public serv\w*|commissioners?|chief executives?|ceos?|heads? of|director[- ]general|judges?|governors?|ambassadors?|statutory|executives?|officials?|bureaucrats?|ombudsman|statistician|auditor[- ]general|solicitor[- ]general|chief of the defence force)\b/i
const pctText = (pct: number) => pct ? `base salary plus ${pct}%` : 'base salary'
const rate = (base: number, o: Office) => o.kind === 'ministerial' ? Math.round(base * (1 + o.pct / 100)) : base + Math.ceil(base * o.pct / 1000) * 10

/** Rates the Remuneration Tribunal sets for the offices named, or the agency-head ranking; null when none match. */
async function officeRates(env: ToolEnv, text: string, limit: number) {
  const data = await readToolAsset(env, '/pay-offices.json') as OfficeData | null
  if (!Array.isArray(data?.offices)) return null
  let rows = officesNamed(text, data).rows
  if (!rows.length && (generalOfficeQuestion(text) || /\bheads?\b|\bsecretar/i.test(text)))
    rows = rankedOffices(data, (row: OfficeRow) => row.kind !== 'peo_band' && (/secretar/i.test(text) && !/agenc|public serv/i.test(text) ? row.kind === 'secretary' : row.head)).slice(0, limit)
  if (!rows.length) return null
  const asAt = data.meta.as_of
  return {
    rows: rows.map(row => ({ office: row.office, body: row.body, kind: row.kind, total_remuneration: row.amount, min: row.min, max: row.max, classification: row.classification,
      clause: row.clause, frl_id: officeSource(data, row)?.frl_id ?? null, holder: row.holder ? { name: row.holder.name, clause: row.holder.clause } : null })),
    citations: rows.map(row => ({ kind: 'record' as const, url: officeSource(data, row)?.url ?? 'https://www.legislation.gov.au/', value: row.amount ?? row.max ?? row.min ?? undefined, text: payOfficeRecord(data, row).snippet })),
    coverage: { since: asAt, until: asAt, as_of: asAt, matched: true },
    notes: ['Total remuneration set by the Remuneration Tribunal, including the employer superannuation contribution and benefits. A range is a secretary\'s level (pay point set by the Secretary of PM&C) or a Principal Executive Office band (set by the employing body). Actual pay is reported in each body\'s annual report.', `Coverage: rates as at ${asAt}.`],
  }
}

async function notHeld(env: ToolEnv) {
  const citations = [{ kind: 'record' as const, url: 'https://www.remtribunal.gov.au/',
    text: 'OPAX does not hold the pay of departmental secretaries, agency heads or other public servants. The Remuneration Tribunal sets departmental secretaries’ and principal executive office holders’ remuneration, and each department or agency reports what its secretary or head was actually paid in the executive (key management personnel) remuneration tables of its annual report.' }]
  // The determinations themselves are listed in the instrument register OPAX holds (titles, not amounts).
  for (const q of ['remuneration tribunal departmental secretaries', 'remuneration tribunal principal executive offices']) {
    try {
      const page = await tableRows(env, 'instruments', { q, sort: 'registered:desc', pageSize: '1' })
      const row = page.rows[0]
      if (row && typeof row.id === 'string' && /^F\d{4}L\d{5}$/.test(row.id)) citations.push({ kind: 'record', url: siteUrl(env, '/instrument/' + row.id), text: `Instrument ${row.id}: ${clip(row.title, 160)} (registered ${row.registered}). OPAX lists this instrument but not the amounts it sets.` })
    } catch { /* The plain statement stands without the instrument links. */ }
  }
  return citations
}

export const tool: ToolDefinition = {
  name: 'parliamentary_pay',
  description: 'Dated salaries of federal MPs, senators and ministers (since 7 December 1999); pass as_of (year/date) or since/until for historical questions: a person\'s salary and post, what an office (Prime Minister, Treasurer, Speaker...) pays, or the highest-paid parliamentarians. Also current Tribunal rates (total remuneration, FRL clause) for departmental secretaries, agency heads and statutory offices: pass office, e.g. "Secretary of the Department of Finance" or "agency heads". Reported actual pay: annual_reports.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'A federal parliamentarian\'s name.' },
    people: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string' }, description: 'Named people in a comparison; include every requested person.' },
    office: { type: 'string', minLength: 2, maxLength: 160, description: 'An office or post, e.g. "Prime Minister", "Cabinet Minister", "Secretary of the Department of Defence".' },
    as_of: { type: 'string', pattern: '^\\d{4}(-\\d{2}-\\d{2})?$', description: 'Calendar year or ISO date. Pass the requested year to select its dated figures.' },
    since: { type: 'string', format: 'date' }, until: { type: 'string', format: 'date' },
    jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'] },
    party: { type: 'string' }, chamber: { type: 'string' }, order: { type: 'string', enum: ['asc', 'desc'] },
    limit: { type: 'integer', minimum: 1, maximum: 15, description: 'Rows for a ranking or an office\'s holders (default 5).' },
  }, examples: [{ person: 'Penny Wong' }, { office: 'Treasurer' }, { limit: 10 }, { office: 'Secretary of the Department of Foreign Affairs and Trade' }] },
  stepLabel: args => ({ label: 'Checking parliamentary pay', arg: clip(args.person ?? args.office ?? 'highest paid', 40) }),
  async handler(env, args) {
    const pay = await readToolAsset(env, '/pay.json') as PayData | null
    if (!pay?.current || !pay.base?.length) return { rows: [], citations: [], notes: [], error: 'Parliamentary pay records are unavailable.' }
    // A public office's current rate is not a dated MP spell: an order or limit must not send it there.
    const asked = typeof args.office === 'string' ? args.office : typeof args.person === 'string' && !pay.names[fold(args.person)] ? args.person : ''
    if (asked && PUBLIC_SERVICE.test(asked) && !/\bparliamentary secretar/i.test(asked) && !args.people && !args.as_of && !args.since && !args.until && (!args.jurisdiction || args.jurisdiction === 'federal')) {
      const rates = await officeRates(env, asked, Number(args.limit) || 5).catch(() => null)
      if (rates) return rates
    }
    if (args.people || args.party || args.chamber || args.order || args.as_of || args.since || args.until || args.jurisdiction && args.jurisdiction !== 'federal') return datedPay(pay as unknown as HistoricalPayData, args)
    const base = pay.base[pay.base.length - 1].amount, asAt = pay.meta.as_of, limit = Number(args.limit) || 5
    const href = (name: string) => siteUrl(env, `${personUrl(name)}#person-pay`)
    const determination = pay.meta.sources?.find(s => s.id === 'mp-determination')?.url ?? 'https://www.remtribunal.gov.au/'
    const row = (c: Current) => ({ kind: 'record' as const, url: href(c.name), value: c.salary,
      text: `${c.name}${c.party ? ` (${c.party})` : ''}: ${aud(c.salary)} a year as ${c.post} (${pctText(c.pct)}${c.assumed ? ', if named in the Opposition Leader’s notice' : ''}), as at ${asAt}` })
    const person = typeof args.person === 'string' ? args.person : '', office = typeof args.office === 'string' ? args.office : ''
    const citations: { kind: 'record'; url: string; value?: number; text: string }[] = []
    const rows: unknown[] = []
    if (PUBLIC_SERVICE.test(office) && !/\bparliamentary secretar/i.test(office) || PUBLIC_SERVICE.test(person) && !pay.names[fold(person)]) {
      const rates = await officeRates(env, office || person, limit).catch(() => null)
      if (rates) return rates
      citations.push(...await notHeld(env))
      return { rows: [{ held: false, office: clip(office || person, 160) }], citations, notes: [] }
    }
    if (person) {
      const words = fold(person).split(' ')
      const pid = pay.names[fold(person)] ?? Object.entries(pay.names).find(([name]) => words.every(w => name.split(' ').includes(w)))?.[1]
      const p = pid ? pay.people[pid] : undefined
      if (!p) return { rows: [], citations: [], notes: [`No federal parliamentarian named "${clip(person, 60)}" is in the pay record (federal parliament since 1999).`, PAY_LIMITS] }
      const now = pay.current.find(c => fold(c.name) === fold(p.name))
      if (now) citations.push(row(now))
      else if (p.peak) citations.push({ kind: 'record', url: href(p.name), value: p.peak.salary, text: `${p.name}${p.party ? ` (${p.party})` : ''}: not a sitting parliamentarian as at ${asAt}; ${readableRange(p.from, p.to) ? `served ${readableRange(p.from, p.to)}; ` : ''}highest salary ${aud(p.peak.salary)} a year as ${p.peak.post} (${p.peak.year})` })
      rows.push({ name: p.name, party: p.party ?? null, sitting: !!now, post: now?.post ?? null, salary: now?.salary ?? null, peak: p.peak ?? null })
    } else if (office) {
      const words = fold(office).split(' ').filter(w => !['the', 'of', 'a', 'an', 'for', 'and', 'in'].includes(w))
      const offices = Object.values(pay.offices).filter(o => words.every(w => fold(o.label).includes(w)))
      for (const o of offices.slice(0, 4)) {
        citations.push({ kind: 'record', url: determination, value: rate(base, o), text: `${o.label}: ${aud(rate(base, o))} a year (${pctText(o.pct)}; base salary ${aud(base)}), as at ${asAt}` })
        rows.push({ office: o.label, pct: o.pct, salary: rate(base, o) })
      }
      const holders = pay.current.filter(c => words.every(w => fold(c.post).includes(w))).slice(0, limit)
      for (const c of holders) { citations.push(row(c)); rows.push({ name: c.name, post: c.post, salary: c.salary }) }
      if (!citations.length) {
        const rates = await officeRates(env, office, limit).catch(() => null)
        if (rates) return rates
        return { rows: [], citations: [], notes: [`No parliamentary office matches "${clip(office, 60)}".`, PAY_LIMITS] }
      }
    } else {
      citations.push({ kind: 'record', url: determination, value: base, text: `Federal parliamentary base salary: ${aud(base)} a year, as at ${asAt}` })
      for (const c of pay.current.slice(0, limit)) { citations.push(row(c)); rows.push({ name: c.name, post: c.post, salary: c.salary }) }
    }
    return { rows, citations, coverage: { since: asAt, until: asAt, as_of: asAt, matched: true }, notes: [PAY_LIMITS, `Coverage: salary rates as at ${asAt}.`] }
  },
}
