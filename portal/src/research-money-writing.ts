/** Money summaries preserve the recorded total, counterparties and reporting basis. */
import type { WritingFact, WritingInput, WrittenSentence } from './research-writing'
import { mergeRegisterItems } from './tools/interests'

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const named = (question: string, name: string) => (' ' + key(question) + ' ').includes(' ' + key(name) + ' ')
const dollars = (amount: number) => '$' + amount.toLocaleString('en-AU')
const donorTotal = (f: WritingFact) => /^(.+?): (\$[\d,.]+) in federal disclosed receipts to (.+?) across ([\d,]+) receipts? in financial years (.+?) \(/.exec(f.text)
const donorName = (f: WritingFact) => f.source.receipt?.source ?? donorTotal(f)?.[1]

/** Label both ends of an explicit award relation for the independent claim reader. */
export function moneyEvidenceRows(text: string, url = ''): string[] {
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
  return []
}

/** Extra exploratory calls must not turn a named donor question into a list of other donors. */
export function moneyWritingInput(input: WritingInput): WritingInput {
  const donors = input.facts.flatMap(f => donorName(f) ? [donorName(f)!] : [])
  const wanted = donors.filter(name => named(input.question, name))
  const jurisdiction = /\bqueensland government\b/i.test(input.question) ? 'qld' : /\b(?:federal|commonwealth) grants?\b/i.test(input.question) ? 'federal' : undefined
  return { ...input, facts: input.facts.filter(f => {
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
    if (items.length < m[5].split('; ').length) return [line(`${m[1]} declared ${m[4]}: ${items.map(item => item.description).join('; ')} (${m[2]} register of interests${m[3] ?? ''}).`, f)]
  }
  const donors = facts.flatMap(f => { const m = donorTotal(f); return m ? [{ f, m }] : [] })
    .filter(({ m }) => named(input.question, m[1]))
  if (donors.length && /\b(?:how much|total|donat|gave|receipts)\w*/i.test(input.question)) {
    return donors.map(({ f, m }) => line(`${m[1]} provided ${m[2]} in federal disclosed receipts to ${m[3]} in financial years ${m[5]}.`, f))
  }
  const partyTotals = facts.flatMap(f => {
    const m = /^(.+?)(?: received |: )(\$[\d,.]+) in federal disclosed receipts across ([\d,]+) receipts? in financial years (.+?) \(/.exec(f.text)
    return m && named(input.question, m[1]) ? [{ f, m }] : []
  }).filter(({ f, m }, i, all) => all.findIndex(other => other.f.source.resource === f.source.resource && other.m.slice(1).join('|') === m.slice(1).join('|')) === i)
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
  if (campaigns.length && /\b(?:campaign|campsign|advert|cost)\w*/i.test(input.question)) return campaigns.map((f, i) => line((i ? '- ' : '') + f.text, f))
  const catalogCampaigns = facts.flatMap(f => {
    const m = /^Register: (.+?) — (.+?) — (\$[\d,.]+) AUD\. (\d{4}-\d{2})\. \(([^)]+)\)\. Campaign advertising expenditure/.exec(f.text)
    return m ? [{ f, m }] : []
  })
  if (catalogCampaigns.length) return catalogCampaigns.map(({ f, m }, i) => line(`${i ? '- ' : ''}${m[1]} for ${m[2]} recorded ${m[3]} for campaign advertising in financial year ${m[4]} (${m[5]}).`, f))
  return null
}
