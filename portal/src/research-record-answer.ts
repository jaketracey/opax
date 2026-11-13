import type { WritingFact, WritingInput, WrittenSentence } from './research-writing'
import { decodeHTMLStrict } from 'entities'
import { requestedBillTitle, billTitleMatches } from './bill-title'
import { billIntroductionListQuestion, recordCountKind, recordIntentText } from './ask-scope-intent'
import { speechRankingGrain, partyPolicyTopic } from './ask-answer-grain'
import type { QualitativeAnswer } from './research-types'
import { identityPerson, sourceAboutPerson } from './ask-followup'
import { agencyHeadRanking, isAgencyHead, remunerationName } from './ask-remuneration'

/** A selected representative vote carries its complete source title, including procedural clauses. */
export function divisionVoteSource(payload: Pick<QualitativeAnswer, 'sources' | 'citations'>, line: string, from: number, until: number) {
  const text = line.replace(/^[-*]\s*/, '')
  if (!/^On .+, .+ (?:senators|members) voted \d[\d,]* ayes? and \d[\d,]* no(?:es)? on /.test(text)) return
  const punctuation=(value:string)=>value.replace(/\s*—\s*/g,', ')
  return payload.sources.find(s => /\/doc\/division-/.test(s.url) && s.snippet.split('\n').some(part=>punctuation(part)===punctuation(text))
    && Object.entries(payload.citations).some(([id, ranges]) => (id === s.resource || id.startsWith(s.resource + '/')) && ranges.some(([a, b]) => a < until && b > from)))
}

/** Keep the requested bill fact ahead of supporting lifecycle dates, including misspelt introduction verbs. */
export function billQuestionFocus(question: string): 'sponsor' | 'introduced' | 'assent' | 'status' | 'passed' | 'portfolio' {
  if (/\bsponsor\w*|\bwho\b.{0,60}\b(?:intro\w*|mov\w*)\b/i.test(question)) return 'sponsor'
  if (/\bassent\b|\bact (?:no|number)\b|\b(?:become|became) law\b/i.test(question)) return 'assent'
  if (/\bportfolio\b/i.test(question)) return 'portfolio'
  if (/\bstatus\b/i.test(question)) return 'status'
  return /\bpass(?:ed)?\b/i.test(question) ? 'passed' : 'introduced'
}

const day = (date: string) => new Date(date + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const sentence = (text: string) => /[.!?]$/.test(text) ? text : text + '.'
const list = (items: string[]) => items.length < 2 ? items[0] ?? '' : items.slice(0, -1).join(', ') + ' and ' + items.at(-1)
const line = (text: string, facts: WritingFact[]): WrittenSentence => ({ text: sentence(text), facts: [...new Set(facts.map(f => f.id))] })
const countWords = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
export const recordCount = (count: number) => countWords[count] ?? count.toLocaleString('en-AU')

function divisionFinding(text: string) {
  const m = /^Division (passed|defeated|outcome not recorded)(?:, (\d+) ayes to (\d+) noes)?: (.+) \(([^()]+), (\d{4}-\d{2}-\d{2})\)\./.exec(text)
  if (!m) return null
  const context = `in the ${m[5]} on ${day(m[6])}`
  const dissent = text.split('Against their published party majority: ')[1]
  const rebels = dissent ? [...dissent.matchAll(/(?:^|; )(.+?) \(([^)]+)\) voted (aye|no), party majority (aye|no)/g)] : []
  const partial = /The member list is partial or unavailable\./.test(text)
  const crossing = rebels.length ? [`${list(rebels.map(r => `${r[1]} (${r[2]}, ${r[3]})`))} voted against their published party majority ${context}`,
    ...(partial ? ['The member list is partial or unavailable, so other dissenters may be missing'] : [])]
    : /No votes against an eligible party majority were recorded\./.test(text) ? [`No members were recorded voting against an eligible party majority ${context}`]
    : /No votes against an eligible party majority were identified among the available party-labelled votes\./.test(text) ? [`No members were identified voting against an eligible party majority among the available party-labelled votes ${context}`,
      ...(partial ? ['The member list is partial or unavailable, so this does not establish that nobody crossed the floor'] : [])] : []
  const parties = [...text.matchAll(/\. ([^.]+?) voted (aye|no)( by majority)? \((\d+) ayes, (\d+) noes\)/g)]
  const members = [...text.matchAll(/\. ([^.]+?) \(([^)]+)\) voted (aye|no|paired|absent)\./g)]
  return { title: m[4], context, parties, members, date: m[6], outcome: m[1] !== 'outcome not recorded' && m[2] && m[3] ? `The motion was ${m[1]} ${context}, with ${m[2]} ayes and ${m[3]} noes` : null, crossing }
}
const partyFinding = (finding: NonNullable<ReturnType<typeof divisionFinding>>, party: RegExpMatchArray) => `${party[1]} voted ${party[2]}${party[3] ?? ''} on ${finding.title} ${finding.context}, with ${party[4]} ayes and ${party[5]} noes`
const memberFinding = (finding: NonNullable<ReturnType<typeof divisionFinding>>, member: RegExpMatchArray) => `${member[1]} (${member[2]}) voted ${member[3]} on ${finding.title} ${finding.context}`
const statusFinding = (m: RegExpExecArray) => `The ${m[1]} ${m[2] === 'passed' ? 'passed' : m[2] === 'lapsed' ? 'did not pass; it lapsed' : 'has recorded status ' + m[2]} as at ${m[3]}`
const statusPattern = /^The (.+) has recorded status (.+?) as at (.+)\.$/

/** Project the division tool's labelled fields to prose before claim binding.
 * Each sentence is derived solely from the citation, independently of the question.
 * Keep the original citation beside it, including historical-party and coverage notes. */
export function recordEvidenceText(text: string, url: string): string {
  const decoded = decodeHTMLStrict(text)
  const division = /\/doc\/division-/.test(url) ? divisionFinding(decoded) : null
  const status = /\/bill\//.test(url) ? statusPattern.exec(decoded.split('\n')[0]) : null
  const projected = division ? [division.outcome, ...division.crossing, ...division.parties.map(p => partyFinding(division, p)), ...division.members.map(m => memberFinding(division, m))].filter((text): text is string => !!text).map(sentence) : status ? [sentence(statusFinding(status))] : []
  return [decoded, ...projected.filter(text => !decoded.split('\n').includes(text))].join('\n')
}

/** Render only facts that directly answer a record question. Counts and dates remain support for names. */
export function recordAnswerLines(input: WritingInput): WrittenSentence[] | null {
  input = { ...input, question: recordIntentText(input.question) }
  const facts = input.facts.filter(f => !f.coverage && !f.metadata)
  const identity = identityPerson(input.question)
  const remuneration = facts.filter(f => f.source.remuneration && (!identity || sourceAboutPerson(f.source, identity,true)))
    .filter((f,i,all) => all.findIndex(other => other.source.remuneration!.record_id === f.source.remuneration!.record_id) === i)
  if (remuneration.length) {
    const byYear = (a: WritingFact,b: WritingFact) => b.source.remuneration!.year.localeCompare(a.source.remuneration!.year) || (b.source.remuneration!.total??-1)-(a.source.remuneration!.total??-1)
    if (identity) {
      const grouped = new Map<string, WritingFact[]>()
      for (const f of [...remuneration].sort(byYear)) {
        const r=f.source.remuneration!, key=[r.body,r.position.toLowerCase().replace(/&/g,'and')].join('|')
        grouped.set(key,[...(grouped.get(key)??[]),f])
      }
      return [...grouped.values()].map(group => {
        const r=group[0].source.remuneration!, years=[...new Set(group.map(f=>f.source.remuneration!.year))]
        return line(`${remunerationName(r.name)} is listed as ${r.position} at ${r.body} in the ${list(years)} annual ${years.length===1?'report':'reports'}`,group)
      })
    }
    if (agencyHeadRanking(input.question) && !input.constraints?.people?.length) {
      const heads=remuneration.filter(f=>isAgencyHead(f.source.remuneration!.position)&&f.source.remuneration!.total!=null)
      const year=input.constraints?.remunerationYear ?? heads.find(f=>f.source.remuneration!.ranking_year)?.source.remuneration!.ranking_year ?? [...heads].sort(byYear)[0]?.source.remuneration!.year
      const ranked=heads.filter(f=>f.source.remuneration!.year===year&&!f.source.remuneration!.historical).sort((a,b)=>b.source.remuneration!.total!-a.source.remuneration!.total!).slice(0,3)
      if (ranked.length) {
        const result=ranked.map((f,i)=>{
          const r=f.source.remuneration!, amount='$'+r.total!.toLocaleString('en-AU')
          return line(i===0 ? `${remunerationName(r.name)} (${r.position}), ${r.body}, had the highest reported total remuneration among agency heads in the published ${year} records${r.latest_complete ? ' (the latest largely tabled reporting year in this snapshot)' : ''}: ${amount}` : `${remunerationName(r.name)} (${r.position}), ${r.body}, ranked ${i===1?'second':'third'} with reported total remuneration of ${amount} for ${year}`,[f])
        })
        const older=heads.find(f=>f.source.remuneration!.historical&&f.source.remuneration!.year<year!&&f.source.remuneration!.total!>ranked[0].source.remuneration!.total!*1.25)
        if(older){
          const r=older.source.remuneration!, c=r.components??{}, parts=[['base salary','base_salary'],['bonuses','bonuses'],['other benefits','other_benefits'],['superannuation','superannuation'],['long service leave','long_service_leave'],['other long-term benefits','other_long_term'],['termination','termination']]
            .filter(([,key])=>typeof c[key]==='number'&&(c[key]!==0||key==='termination')).map(([label,key])=>`${label} $${c[key]!.toLocaleString('en-AU')}`)
          result.push(line(`${remunerationName(r.name)} (${r.position}), ${r.body}, separately had a larger reported total remuneration of $${r.total!.toLocaleString('en-AU')} in the older ${r.year} row${parts.length?' ('+parts.join(', ')+')':''}${r.checks?.some(c=>c.includes('do not add up'))?'; the published components do not add up to that total':''}`,[older]))
        }
        return result
      }
    }
    const personal = new Set(remuneration.map(f=>f.source.remuneration!.name.toLowerCase())).size===1
    const ranked = /\b(?:highest|largest|biggest|top|most paid|paid most)\b/i.test(input.question)
    const selected = personal ? [...remuneration].sort(byYear) : ranked ? [...remuneration].sort((a,b)=>(b.source.remuneration!.total??-1)-(a.source.remuneration!.total??-1)) : remuneration
    return selected.map(f => {
      const r=f.source.remuneration!
      return line(`${remunerationName(r.name)} (${r.position}), ${r.body}, had reported total remuneration of ${r.total==null?'an unpublished amount':'$'+r.total.toLocaleString('en-AU')} for ${r.year}`,[f])
    })
  }
  const grain = input.constraints?.speechRankingGrain ?? speechRankingGrain(input.question)
  if (grain) {
    const prefix = grain === 'speaker' ? 'person:' : 'party:'
    const rows = facts.flatMap(f => {
      const m = f.source.kind === 'count' && /^(.+?): ([\d,]+) ((?:chamber speeches|speeches and committee turns|committee-hearing turns)\b.*)/.exec(f.text)
      return m && f.source.entities?.includes(prefix + m[1]) ? [{f,name:m[1],count:Number(m[2].replaceAll(',','')),basis:m[3]}] : []
    }).filter((r,i,all)=>all.findIndex(other=>other.name===r.name&&other.basis===r.basis)===i)
      .sort((a,b)=>(input.constraints?.superlative==='lowest'?1:-1)*(a.count-b.count)||a.name.localeCompare(b.name))
    if (rows.length) {
      const selected = rows.slice(0,8)
      const lines = selected.map((r,i) => {
        const member = grain === 'speaker' ? r.f.source.member : undefined
        const name = member ? `${member.name} (${member.parliaments.join('; ')})` : r.name
        // Only omit a repeated period when it is the same as the lead row's period.
        const period = / (?:from \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?|to \d{4}-\d{2}-\d{2})$/.exec(r.basis)?.[0]
        const basis = i && period && selected[0].basis.endsWith(period) ? r.basis.slice(0,-period.length) : r.basis
        return line(`${name} ${i===0?'led the recorded '+(grain==='speaker'?'member':'party')+' ranking, with':'recorded'} ${r.count.toLocaleString('en-AU')} ${basis.replace(/\b\d{4}-\d{2}-\d{2}\b/g, day)}`,[r.f])
      })
      const parliaments = new Set(selected.flatMap(r => r.f.source.member?.parliaments ?? []))
      if (grain === 'speaker' && parliaments.size > 1) lines.splice(1,0,line('This ranking spans more than one parliament',selected.map(r=>r.f)))
      return lines
    }
  }
  if (input.constraints?.industryRanking || /\b(?:which|what) industries\b/i.test(input.question)) {
    const industries = facts.filter(f => /\b(?:led the classified industry ranking|recorded the next ranked industry total)\b/.test(f.text))
    if (industries.length) return industries.map((f,i) => {
      const row = /^(.+?) (?:led the classified industry ranking|recorded the next ranked industry total), with (\$[\d,.]+) in federal disclosed (?:receipts|donations)(.*?) in financial years? (.+?) \((1 July \d{4} to 30 June \d{4})\), across ([\d,]+) receipts? in the published donor selection\.$/.exec(f.text)
      if (!row) return line(f.text,[f])
      return line(i ? `${row[1]} ${i===1?'was next, with':'recorded'} ${row[2]} across ${row[6]} receipt${row[6]==='1'?'':'s'}` : f.text,[f])
    })
  }
  // A policy aggregate leads with its whole selection, then its bill/motion split and representative votes.
  const policy = facts.filter(f => /^(?:Across \d[\d,]* matching |No matching divisions on )/.test(f.text) && /\/divisions\/index\.json$/.test(f.source.url)
    || /^On .+, .+ (?:senators|members) voted \d[\d,]* ayes? and \d[\d,]* no(?:es)? on /.test(f.text) && /\/doc\/division-/.test(f.source.url))
  if ((input.constraints?.policyVoteTopic || partyPolicyTopic(input.question)) && policy.some(f => /^(?:Across \d[\d,]* matching divisions? on |No matching divisions on )/.test(f.text))) return policy.map(f => line(f.text, [f]))
  const divisions = facts.flatMap(f => {
    const finding = /\/doc\/division-/.test(f.source.url) ? divisionFinding(f.text) : null
    return finding ? [{ f, finding }] : []
  }).filter((row, i, all) => all.findIndex(other => other.f.source.url === row.f.source.url) === i)
  const crossing = /\b(?:cross\w* (?:the )?floor|floor[- ]cross\w*|against (?:their |the )?party majority|rebels?)\b/i.test(input.question)
  const outcome = /\b(?:result|outcome)\b|\bdid\b.+\bpass\b|\b(?:ayes|noes)\b/i.test(input.question)
  if (divisions.length && /\bvot(?:e|ed|ing)\b/i.test(input.question) && !crossing) {
    const selected = divisions.flatMap(({ f, finding }) => {
      const member = finding.members.find(m => input.constraints?.people?.includes(m[1]) || input.question.toLowerCase().includes(m[1].toLowerCase()) || input.question.toLowerCase().includes(m[1].split(' ').at(-1)!.toLowerCase()))
      if (member) return [{ f, date: finding.date, text: memberFinding(finding, member) }]
      const party = finding.parties.find(p => input.question.toLowerCase().includes(p[1].toLowerCase()))
      return party ? [{ f, date: finding.date, text: partyFinding(finding, party) }] : []
    }).sort((a, b) => b.date.localeCompare(a.date))
    if (selected.length) return selected.map(s => line(s.text, [s.f]))
  }
  if (divisions.length === 1 && (crossing || outcome)) {
    const { f, finding } = divisions[0]
    if (crossing) return finding.crossing.length ? [...(outcome && finding.outcome ? [line(finding.outcome, [f])] : []), ...finding.crossing.map(text => line(text, [f]))] : null
    if (finding.outcome && !/\b(?:how (?:did|does)|who (?:voted|supported|opposed))\b/i.test(input.question)) return [line(finding.outcome, [f])]
  }

  if (billQuestionFocus(input.question) === 'sponsor') {
    const sponsors = facts.filter(f => /\/bill\//.test(f.source.url) && /\b(?:is the recorded sponsor|are the recorded sponsors) of the /i.test(f.text))
      .filter((f, i, all) => all.findIndex(other => other.source.url === f.source.url) === i)
    if (sponsors.length === 1) {
      const sponsor = sponsors[0]
      const introduced = facts.find(f => f.source.url === sponsor.source.url && /^On .+, the .+ was first introduced/.test(f.text))
      return [line(sponsor.text, [sponsor]), ...(introduced ? [line(introduced.text, [introduced])] : [])]
    }
  }

  if (/\bwhen\b/i.test(input.question) && /\b(?:introduc\w*|first (?:come|came) in)\b/i.test(input.question) && billQuestionFocus(input.question) === 'introduced') {
    const title = input.constraints?.exactBillTitle ?? requestedBillTitle(input.question)
    const introductions = facts.filter(f => {
      const match = /\/bill\//.test(f.source.url) && /^On .+, the (.+) was first introduced\b/.exec(f.text)
      return match && (!title || billTitleMatches(match[1], title))
    }).filter((f, i, all) => all.findIndex(other => other.source.url === f.source.url) === i)
    if (introductions.length === 1) return [line(introductions[0].text, [introductions[0]])]
  }

  if (billQuestionFocus(input.question) === 'assent') {
    const title = input.constraints?.exactBillTitle ?? requestedBillTitle(input.question)
    const assent = facts.filter(f => /\/bill\//.test(f.source.url) && /^On .+, the (.+) received royal assent\./.test(f.text))
      .filter(f => !title || billTitleMatches(/^On .+, the (.+) received royal assent\./.exec(f.text)![1], title))
    if (assent.length) return [line(assent[0].text, [assent[0]])]
  }

  if (recordCountKind(input.question) === 'divisions' && !/\b(?:by|each|per) (?:month|year)|trend\b/i.test(input.question)) {
    const title = input.constraints?.exactBillTitle ?? requestedBillTitle(input.question)
    const linked = title && facts.find(f => {
      const m = /^(.+): ([\d,]+) matching recorded divisions\.$/.exec(f.text)
      return m && billTitleMatches(m[1], title)
    })
    if (linked) {
      const m = /^(.+): ([\d,]+) matching recorded divisions\.$/.exec(linked.text)!
      return [line(`The ${m[1]} has ${m[2]} matching recorded divisions`, [linked])]
    }
    const total = facts.find(f => f.source.kind === 'count' && /^\d[\d,]* recorded divisions .+ (?:since|from|on|in|up to) .+/.test(f.text) && !/ in \d{4}-(?:0[1-9]|1[0-2])$/.test(f.text))
    if (total) return [line(total.text, [total])]
  }

  if (/\bbill\b/i.test(input.question) && ['status', 'passed'].includes(billQuestionFocus(input.question))) {
    const title = input.constraints?.exactBillTitle ?? requestedBillTitle(input.question)
    const statuses = facts.flatMap(f => {
      const m = /\/bill\//.test(f.source.url) && statusPattern.exec(f.text)
      return m && (!title || billTitleMatches(m[1], title)) ? [{ f, m }] : []
    }).filter((r, i, all) => all.findIndex(other => other.f.source.url === r.f.source.url) === i)
    if (statuses.length === 1) {
      const { f, m } = statuses[0]
      return [line(statusFinding(m), [f])]
    }
  }

  if (/\bbills?\b/i.test(input.question) && /\b(?:share|percent\w*|proportion|rate)\b/i.test(input.question)) {
    const cohort = facts.find(f => /bill records in the introduction cohort .+; .+ have snapshot status .+\([\d.]+%\)/.test(f.text))
    if (cohort) return [line(cohort.text, [cohort])]
  }

  if (/\b(?:busiest|most|highest|largest)\b/i.test(input.question) && /\byear\b/i.test(input.question) && /\bdivisions?\b/i.test(input.question)) {
    const counts = facts.flatMap(f => {
      const m = /^(\d[\d,]*) recorded divisions (in .+) in (\d{4})\.?$/.exec(f.text)
      return m ? [{ f, count: Number(m[1].replaceAll(',', '')), where: m[2], year: m[3] }] : []
    })
    if (counts.length > 1 && new Set(counts.map(c => c.where)).size === 1) {
      const top = counts.filter(c => c.count === Math.max(...counts.map(c => c.count)))
      return top.map(c => line(`${c.year} was the busiest year ${c.where}, with ${c.count.toLocaleString('en-AU')} recorded divisions`, [c.f]))
    }
  }

  if (recordCountKind(input.question) !== 'bills') return null
  // The legacy count facts and the current prose facts represent the same exact index selection.
  const billCounts = facts.flatMap(f => {
    if (f.source.kind !== 'count') return []
    const legacy = /^(\d[\d,]*) bill records by introduction date (in .+) (on \d{4}-\d{2}-\d{2}|in \d{4}(?:-\d{2})?)[.]?$/.exec(f.text)
    if (legacy) return [{ f, count: Number(legacy[1].replaceAll(',', '')), where: legacy[2], period: legacy[3].replace(/\d{4}-\d{2}-\d{2}/g, day) }]
    const current = /^(No|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|[\d,]+) bills? (?:was|were) introduced (in .+) (on .+|in \d{4}(?:-\d{2})?)[.]$/.exec(f.text)
    return current ? [{ f, count: countWords.includes(current[1]) ? countWords.indexOf(current[1]) : Number(current[1].replaceAll(',', '')), where: current[2], period: current[3] }] : []
  })
  if (billCounts.length === 1) {
    const { f, count, where, period } = billCounts[0]
    const records = facts.flatMap(f => {
      const m = /\/bill\//.test(f.source.url) ? /^(.+): introduced (\d{4}-\d{2}-\d{2})(?: in the (.+))?$/.exec(f.text) : null
      if (!m || period.startsWith('on ') && period !== 'on ' + day(m[2]) || /^in \d{4}(?:-\d{2})?$/.test(period) && !m[2].startsWith(period.slice(3))) return []
      if (where.startsWith('in the ') && where !== 'in the ' + m[3]) return []
      return [{ f, title: m[1] }]
    }).filter((row, i, all) => all.findIndex(other => other.f.source.url === row.f.source.url) === i)
    const lead = `${recordCount(count)} ${count === 1 ? 'bill was' : 'bills were'} introduced ${where} ${period}`
    if (!billIntroductionListQuestion(input.question)) return [line(lead, [f])]
    if (records.length === count && count > 0) return [line(`${lead}: ${records.map(r => r.title).join('; ')}`, [f, ...records.map(r => r.f)])]
    // A positive total alone, or a truncated list, does not answer a request for the names.
    return count === 0 ? [line(lead, [f])] : null
  }
  return null
}
