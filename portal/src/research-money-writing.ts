/** Money summaries preserve the recorded total, counterparties and reporting basis. */
import type { WritingFact, WritingInput, WrittenSentence } from './research-writing'
import { mergeRegisterItems } from './tools/interests'

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const named = (question: string, name: string) => (' ' + key(question) + ' ').includes(' ' + key(name) + ' ')
const dollars = (amount: number) => '$' + amount.toLocaleString('en-AU')
const donorTotal = (f: WritingFact) => /^(.+?): (\$[\d,.]+) in federal disclosed receipts to (.+?) across ([\d,]+) receipts? in financial years (.+?) \(/.exec(f.text)
const donorName = (f: WritingFact) => f.source.receipt?.source ?? donorTotal(f)?.[1]

/** Answer the requested field of a selected receipt aggregate, never the previous turn's metric. */
export function receiptWritingLines(input: WritingInput, available = input.facts): WrittenSentence[] | null {
  if (/\b(?:why|votes?|voted|positions?|policy|policies)\b/i.test(input.question)) return null
  const rows = available.flatMap(f => { const m = donorTotal(f); return m ? [{ f, m }] : [] })
  const donors = [...new Set(rows.map(({ m }) => m[1]))]
  let selected = rows.filter(({ m }) => named(input.question, m[1]) || donors.length === 1 &&
    /\b(?:receipts?|internal party transfers)\b/i.test(input.question) && input.question.includes(m[2]))
  if (!selected.length) return null
  const parties = selected.filter(({ m }) => m[3] !== 'all recipient parties' && named(input.question, m[3]))
  if (parties.length) selected = parties
  else if (selected.some(({ m }) => m[3] === 'all recipient parties')) selected = selected.filter(({ m }) => m[3] === 'all recipient parties')
  const ranged = selected.filter(({ m }) => / to /i.test(m[5]))
  if (ranged.length && !/\b(?:each year|by year|annual|trend|over time)\b/i.test(input.question)) selected = ranged
  selected = selected.filter(({ m }, i, all) => all.findIndex(other => other.m.slice(1).join('|') === m.slice(1).join('|')) === i)
  const line = (text: string, facts: number[]): WrittenSentence => ({ text, facts })
  if (/\binternal party transfers\b/i.test(input.question)) {
    const basis = input.facts.find(f => /Donor aggregates and flows exclude internal party transfers and public funding\./.test(f.text))
    if (!basis) return null
    const { f, m } = selected[0]
    return [line(`No, internal party transfers and public funding are excluded from the ${m[2]} in federal disclosed receipts from ${m[1]}.`, [f.id, basis.id])]
  }
  if (/\b(?:how many|number of|count of)\b/i.test(input.question) && /\breceipts?\b/i.test(input.question)) {
    return selected.map(({ f, m }) => line(`${m[4]} disclosed receipt${m[4] === '1' ? '' : 's'} from ${m[1]} ${m[4] === '1' ? 'was' : 'were'} recorded to ${m[3]} in financial years ${m[5]}.`, [f.id]))
  }
  if (/\b(?:what|which) financial years?\b|\b(?:years?|period)\b.*\bcover\w*\b/i.test(input.question)) {
    if (selected.length === 1) { const { f, m } = selected[0]; return [line(`The ${m[1]} receipt total covers financial years ${m[5]}.`, [f.id])] }
    const years = [...new Set(selected.map(({ m }) => m[5]))].sort()
    return [line(`The ${selected[0].m[1]} receipts are recorded in financial years ${years.slice(0, -1).join(', ')} and ${years.at(-1)}.`, selected.map(({ f }) => f.id))]
  }
  if (/\b(?:how much|total|donat\w*|gave)\b/i.test(input.question) && !/\b(?:who|which|what parties|whether)\b/i.test(input.question)) {
    return selected.map(({ f, m }) => line(`${m[1]} provided ${m[2]} in federal disclosed receipts to ${m[3]} in financial years ${m[5]}.`, [f.id]))
  }
  return null
}

/** Label both ends of an explicit award relation for the independent claim reader. */
export function moneyEvidenceRows(text: string, url = ''): string[] {
  const industry = /^(.+?) (?:led the classified industry ranking|recorded the next ranked industry total), with (\$[\d,.]+) in federal disclosed receipts.*? in (financial years? .+?) \((1 July \d{4} to 30 June \d{4})\), across ([\d,]+) receipts? in the published donor selection\.$/.exec(text)
  if (industry) return [`${industry[1]}: ${industry[2]} in federal disclosed receipts across ${industry[5]} receipts in ${industry[3]} (${industry[4]}).`]
  const total = /^(.+?) received (\$[\d,.]+) in published (Queensland Government grant and assistance expenditure|federal grant award values), (.+?) \(([\d,]+) (?:expenditure rows?|award records?);/.exec(text)
  if (total) return [`${total[1]}: ${total[2]} in ${total[3]} across ${total[5]} records in ${total[4].replace(/^all published years, /, '')}.`]
  const profile = /^Grant: (.+?) [—–] (\$[\d,.]+ across [\d,]+ grant records)\./.exec(text)
  if (profile) {
    const jur = /\/money\/grants\/(federal|qld)\/recipient\//.exec(url)?.[1]
    return [`${profile[1]}: ${profile[2]}${jur ? ` (${jur === 'qld' ? 'Queensland Government grant and assistance expenditure' : 'federal grants'})` : ''}.`]
  }
  const grant = /^Grant: (.+?) [—–] (.+?) [—–] (\$[\d,.]+)\. ([\s\S]*)$/.exec(text)
  if (grant) return [`${grant[1]}: ${grant[3]} grant to ${grant[2]}. ${grant[4]}`, `${grant[2]}: ${grant[3]} grant for ${grant[1]}. ${grant[4]}`]
  const award = /^(.+?) was awarded (\$[\d,.]+) for (.+?)( from .+?)?( in financial year \d{4}-\d{2})? (\((?:Queensland Government expenditure line|federal grant award)\)\.)$/.exec(text)
  if (award) return [`${award[1]}: ${award[2]} grant for ${award[3]}${award[4] ?? ''}${award[5] ?? ''} ${award[6]}`, `${award[3]}: ${award[2]} grant to ${award[1]}${award[4] ?? ''}${award[5] ?? ''} ${award[6]}`]
  const contract = /^(.+?) awarded (.+?) (\$[\d,.]+ across [\d,]+ Commonwealth contracts[\s\S]*)$/.exec(text)
  if (contract) return [`${contract[2]}: ${contract[3]} awarded by ${contract[1]}.`]
  const supplier = /^Supplier: (.+?) — (\$[\d,.]+ in recorded contract awards across [\d,]+ contracts and [\d,]+ agencies)\./.exec(text)
  if (supplier) return [`${supplier[1]}: ${supplier[2]}.`]
  const campaign = /^Register: (.+?) — (.+?) — (\$[\d,.]+) AUD\. (\d{4}-\d{2})\. \(([^)]+)\)\. Campaign advertising expenditure/.exec(text)
  if (campaign) return [`${campaign[1]}: ${campaign[3]} in campaign advertising for ${campaign[2]} in financial year ${campaign[4]} (${campaign[5]}).`, `${campaign[2]}: ${campaign[3]} in campaign advertising for ${campaign[1]} in financial year ${campaign[4]} (${campaign[5]}).`]
  const publishedCampaign = /^(.+?) for (.+?) recorded (\$[\d,.]+) for (.+) in (financial year \d{4}-\d{2} \(.+\))\.$/.exec(text)
  if (publishedCampaign) return [`${publishedCampaign[1]}: ${publishedCampaign[3]} for ${publishedCampaign[4]} for ${publishedCampaign[2]} in ${publishedCampaign[5]}.`, `${publishedCampaign[2]}: ${publishedCampaign[3]} for ${publishedCampaign[4]} for ${publishedCampaign[1]} in ${publishedCampaign[5]}.`]
  return []
}

/** Extra exploratory calls must not turn a named donor question into a list of other donors. */
export function moneyWritingInput(input: WritingInput): WritingInput {
  const donors = input.facts.flatMap(f => donorName(f) ? [donorName(f)!] : [])
  const wanted = donors.filter(name => named(input.question, name))
  const jurisdiction = /\bqueensland government\b/i.test(input.question) ? 'qld' : /\b(?:federal|commonwealth) grants?\b/i.test(input.question) ? 'federal' : undefined
  const agencyRanking = /\b(?:which|what) (?:department|agency)\b/i.test(input.question) && input.facts.some(f => /awarded .+? \$[\d,.]+ across [\d,]+ Commonwealth contracts,/.test(f.text))
  return { ...input, facts: input.facts.filter(f => {
    if (agencyRanking && /^Supplier:/.test(f.text)) return false
    const donor = donorName(f)
    if (wanted.length && donor && !wanted.includes(donor)) return false
    const grantJurisdiction = /\/money\/grants\/(federal|qld)\/recipient\//.exec(f.source.url)?.[1]
    return !(jurisdiction && grantJurisdiction && grantJurisdiction !== jurisdiction)
  }) }
}

/** These formats are published tool citations, never question-specific answers or inferred sums. */
export function moneyWritingLines(input: WritingInput, available: WritingFact[]): WrittenSentence[] | null {
  const facts = moneyWritingInput({ ...input, facts: available }).facts
  const line = (text: string, fact: WritingFact): WrittenSentence => ({ text, facts: [fact.id] })
  const interests = facts.flatMap(f => {
    const m = /^(.+?)'s (Queensland|federal) register of interests( as at \d{4}-\d{2}-\d{2})? records [\d,]+ (shareholdings|directorships|trusts) entries: (.+)\.$/.exec(f.text)
    return m ? [{ f, m }] : []
  })
  if (interests.length === 1) {
    const { f, m } = interests[0], items = mergeRegisterItems(m[5].split('; ').map(description => ({ description })))
    return [line(`${m[1]} declared ${m[4]} in ${items.map(item => item.description).join('; ')} (${m[2]} register of interests${m[3] ?? ''}).`, f)]
  }
  const declared = facts.filter(f => /^.+ declared (?:shareholdings|directorships|trusts): .+ \((?:Queensland|federal) register of interests/.test(f.text))
  if (declared.length === 1) return [line(declared[0].text.replace(/(declared (?:shareholdings|directorships|trusts)): /, '$1 in '), declared[0])]
  const receipts = receiptWritingLines(input, facts)
  if (receipts) return receipts
  const partyTotals = facts.flatMap(f => {
    const m = /^(.+?)(?: received |: )(\$[\d,.]+) in federal disclosed receipts across ([\d,]+) receipts? in financial years (.+?) \(/.exec(f.text)
    return m && named(input.question, m[1]) ? [{ f, m }] : []
  }).filter(({ m }, i, all) => all.findIndex(other => other.m.slice(1).join('|') === m.slice(1).join('|')) === i)
  if (partyTotals.length > 1 && /\bcompar\w*\b/i.test(input.question) && new Set(partyTotals.map(r => r.m[4])).size === 1) {
    return partyTotals.map(({ f, m }) => line(`${m[1]} received ${m[2]} in federal disclosed receipts across ${m[3]} receipts in financial year ${m[4]}.`, f))
  }
  if (partyTotals.length === 1 && /\b(?:how much|total|money|receipts)\b/i.test(input.question) && !/\b(?:each year|by year|trend|over time|most|top|largest|biggest)\b/i.test(input.question)) {
    const { f, m } = partyTotals[0]
    const sources = facts.filter(f => f.source.receipt && !f.source.receipt.aggregate && key(f.source.receipt.party) === key(m[1]))
      .sort((a, b) => b.source.receipt!.amount - a.source.receipt!.amount).slice(0, 3)
    return [line(`${m[1]} received ${m[2]} in federal disclosed receipts across ${m[3]} receipts in financial year ${m[4]}.`, f),
      ...sources.map(f => line(`- ${f.source.receipt!.source} provided ${dollars(f.source.receipt!.amount)} in disclosed receipts.`, f))]
  }
  const grantTotals = facts.flatMap(f => {
    const m = /^(.+?) received (\$[\d,.]+) in published (Queensland Government grant and assistance expenditure|federal grant award values), (.+?) \(([\d,]+) (?:expenditure rows?|award records?);/.exec(f.text)
    return m ? [{ f, m }] : []
  })
  if (grantTotals.length === 1 && /\b(?:grants?|received|total)\b/i.test(input.question)) {
    const { f, m } = grantTotals[0], qld = m[3].startsWith('Queensland')
    const awards = facts.filter(other => other.text.startsWith(m[1] + ' was awarded ')).slice(0, 3)
    return [line(`${m[1]} received ${m[2]} across ${m[5]} ${qld ? 'Queensland Government grant and assistance expenditure lines' : 'federal grant awards'}, covering ${m[4].replace(/^all published years, /, '')}.`, f),
      ...awards.map(award => line('- ' + award.text.replace(m[1] + ' was awarded ', '').replace(/^(.+?) for (.+?) from (.+?) in financial year (\d{4}-\d{2}) \(.+\)\.$/, '$2: $1 from $3 in financial year $4.'), award))]
  }
  // Discovery can still return a recipient profile when its detailed data is unavailable.
  const profiles = facts.flatMap(f => {
    const m = /^Grant: (.+?) [—–] (\$[\d,.]+) across ([\d,]+) grant records\./.exec(f.text)
    const jur = /\/money\/grants\/(federal|qld)\/recipient\//.exec(f.source.url)?.[1]
    return m && jur ? [{ f, m, jur }] : []
  })
  if (profiles.length === 1) {
    const { f, m, jur } = profiles[0]
    const awards = facts.flatMap(f => { const award = /^Grant: (.+?) [—–] (.+?) [—–] (\$[\d,.]+)\. ([^.]+)\./.exec(f.text); return award && key(award[2]) === key(m[1]) ? [{ f, award }] : [] })
    return [line(`${m[1]} received ${m[2]} across ${m[3]} recorded ${jur === 'qld' ? 'Queensland Government grant and assistance expenditure lines' : 'federal grants'}.`, f),
      ...awards.slice(0, 3).map(({ f, award }) => line(`- ${award[1]}: ${award[3]} from ${award[4]}.`, f))]
  }
  const grants = facts.flatMap(f => { const m = /^Grant: (.+?) [—–] (.+?) [—–] (\$[\d,.]+)\. ([^.]+)\./.exec(f.text); return m ? [{ f, m }] : [] })
  if (grants.length) return grants.slice(0, 3).map(({ f, m }, i) => line(`${i ? '- ' : ''}${m[2]} was awarded ${m[3]} for ${m[1]} from ${m[4]}.`, f))
  const agencies = facts.filter(f => /awarded .+? \$[\d,.]+ across [\d,]+ Commonwealth contracts,/.test(f.text))
  if (agencies.length && /\b(?:which|what) (?:department|agency)\b/i.test(input.question)) {
    const byCount = /\b(?:number|count)\b/i.test(input.question)
    const leaders = agencies.filter(f => f.text.includes(byCount ? 'highest contract count' : 'largest total contract value'))
    const countLeaders = byCount ? [] : agencies.filter(f => f.text.includes('highest contract count') && !leaders.includes(f))
    if (leaders.length) return [...leaders.map((f, i) => line((i ? '- ' : '') + f.text, f)), ...countLeaders.map(f => line('- By number of contracts, ' + f.text.replace(', the joint highest contract count for this supplier', ''), f))]
  }
  if (!/\b(?:which|what) (?:department|agency)\b/i.test(input.question)) {
    const suppliers = facts.flatMap(f => { const m = /^Supplier: (.+?) — (\$[\d,.]+) in recorded contract awards across ([\d,]+) contracts and ([\d,]+) agencies\./.exec(f.text); return m ? [{ f, m }] : [] })
    if (suppliers.length === 1) { const { f, m } = suppliers[0]; return [line(`${m[1]} recorded ${m[2]} in contract awards across ${m[3]} contracts with ${m[4]} agencies.`, f)] }
  }
  const campaigns = facts.filter(f => /recorded \$[\d,.]+ for .+ in financial year \d{4}-\d{2} \(/.test(f.text) && /campaign|advert|recruitment/i.test(f.text))
  if (campaigns.length && /\b(?:campaign|campsign|advert|cost)\w*/i.test(input.question)) {
    const groups = new Map<string, { owner: string; amount: string; period: string; categories: string[]; facts: WritingFact[] }>()
    for (const f of campaigns) {
      const m = /^(.+?) recorded (\$[\d,.]+) for (.+) in (financial year \d{4}-\d{2} \(.+\))\.$/.exec(f.text)
      if (!m) return campaigns.map((f, i) => line((i ? '- ' : '') + f.text, f))
      const id = [m[1], m[2], m[4]].join('|'), group = groups.get(id) ?? { owner: m[1], amount: m[2], period: m[4], categories: [], facts: [] }
      group.categories.push(m[3]); group.facts.push(f); groups.set(id, group)
    }
    return [...groups.values()].map(g => ({ text: `${g.owner} recorded ${g.amount} ${g.categories.length > 1 ? 'each ' : ''}for ${g.categories.join('; ')} in ${g.period}.`, facts: g.facts.map(f => f.id) }))
  }
  const catalogCampaigns = facts.flatMap(f => {
    const m = /^Register: (.+?) — (.+?) — (\$[\d,.]+) AUD\. (\d{4}-\d{2})\. \(([^)]+)\)\. Campaign advertising expenditure/.exec(f.text)
    return m ? [{ f, m }] : []
  })
  if (catalogCampaigns.length) return catalogCampaigns.map(({ f, m }, i) => line(`${i ? '- ' : ''}${m[1]} for ${m[2]} recorded ${m[3]} for campaign advertising in financial year ${m[4]} (${m[5]}).`, f))
  return null
}

/** These typed selections already form complete sentences; another writing turn can lose a comparison arm or ranking. */
export function completeMoneySelection(input: WritingInput): boolean {
  return !!moneyWritingLines(input, input.facts.filter(f => !f.coverage && !f.metadata)) &&
    (/\bcompar\w*\b/i.test(input.question) && input.facts.filter(f => /in federal disclosed receipts across/.test(f.text)).length > 1 ||
      /\b(?:which|what) (?:department|agency)\b/i.test(input.question) ||
      input.facts.some(f => /declared (?:shareholdings|directorships|trusts):|register of interests.* records|recorded \$[\d,.]+ for .+ in financial year/.test(f.text)))
}
