/** Conservative roster matching. Confidence is a ranking score, not a probability. */
interface RosterName { name: string; pid?: string; speeches?: number | null; aliases?: string[] }
interface Name { words: string[]; suffix: string | null; key: string }
export interface NameCandidate<T> { person: T; confidence: number }
export interface NameResolution<T> {
  status: 'matched' | 'ambiguous' | 'no_match'
  candidates: NameCandidate<T>[]
}

const TITLES = new Set(['the', 'right', 'rt', 'hon', 'honourable', 'honorable', 'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'sir', 'dame', 'senator', 'sen', 'rev', 'reverend'])
const POSTNOMINALS = new Set(['mp', 'mla', 'mlc', 'mha', 'mhr', 'qc', 'kc', 'ac', 'ao', 'am', 'oam'])
const SUFFIXES: Record<string, string> = { jr: 'jr', jnr: 'jr', junior: 'jr', sr: 'sr', snr: 'sr', senior: 'sr' }
// Only given names use these aliases. Shared nicknames can belong to more than
// one group, without making the groups' formal names equivalent to each other.
const NICKNAMES = [
  ['robert', 'bob', 'bobby', 'rob', 'robbie'], ['william', 'bill', 'billy', 'will', 'willie', 'liam'],
  ['anthony', 'tony'], ['michael', 'mike', 'mick'], ['richard', 'rick', 'ricky', 'dick'],
  ['elizabeth', 'liz', 'lizzie', 'beth', 'betty', 'libby'], ['margaret', 'maggie', 'meg', 'peggy'],
  ['james', 'jim', 'jimmy', 'jamie'], ['thomas', 'tom', 'tommy'], ['joseph', 'joe', 'joey'],
  ['daniel', 'dan', 'danny'], ['david', 'dave'], ['edward', 'ed', 'ted', 'teddy'],
  ['frederick', 'fred', 'freddy'], ['andrew', 'andy', 'drew'], ['matthew', 'matt'],
  ['christopher', 'chris'], ['christine', 'chris'], ['alexander', 'alex'], ['alexandra', 'alex'],
  ['deborah', 'deb', 'debbie'], ['debra', 'deb', 'debbie'], ['nicholas', 'nick'],
  ['stephen', 'steve'], ['steven', 'steve'], ['peter', 'pete'], ['benjamin', 'ben'],
  ['patricia', 'pat', 'trish', 'tricia'], ['patrick', 'pat', 'paddy'], ['jennifer', 'jen', 'jenny'],
  ['susan', 'sue', 'susie'], ['jacqueline', 'jacqui', 'jackie'], ['timothy', 'tim'],
  ['catherine', 'cath', 'cathy', 'kate'], ['katherine', 'kate', 'kathy', 'katie'],
  ['samuel', 'sam'], ['samantha', 'sam'], ['philip', 'phil'], ['phillip', 'phil'],
]

function parseName(value: string): Name {
  const words = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['‘’ʼ`]/g, '').replace(/\s*[-\u2010-\u2013]\s*/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  while (TITLES.has(words[0])) words.shift()
  let suffix: string | null = null
  while (words.length) {
    const last = words.at(-1)!
    if (POSTNOMINALS.has(last)) words.pop()
    else if (Object.hasOwn(SUFFIXES, last)) { suffix = SUFFIXES[last]; words.pop() }
    else break
  }
  return { words, suffix, key: `${words.join(' ')}|${suffix ?? ''}` }
}

/** Adjacent transpositions count as one edit, as do insertions and deletions. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
    }
  }
  return rows[a.length][b.length]
}

function wordMatch(a: string, b: string, given: boolean): { edits: number; penalty: number } | null {
  if (a === b) return { edits: 0, penalty: 0 }
  if (given && NICKNAMES.some(group => group.includes(a) && group.includes(b))) return { edits: 0, penalty: 20 }
  const short = Math.min(a.length, b.length), long = Math.max(a.length, b.length)
  const allowed = short >= 5 ? 2 : short >= 3 && long >= 4 ? 1 : 0
  if (!allowed || long - short > allowed) return null
  const edits = editDistance(a, b)
  return edits <= allowed && edits / long <= 0.34 ? { edits, penalty: edits * 50 } : null
}

// Rotations support both surname-first exports and surname-first user input,
// including compound surnames. They do not freely permute middle names.
function orders(words: string[]): string[][] {
  return words.map((_, i) => [...words.slice(i), ...words.slice(0, i)])
}

function scoreName(query: Name, name: Name): number {
  if (!query.words.length || !name.words.length || query.suffix && name.suffix && query.suffix !== name.suffix) return 0
  const suffixPenalty = query.suffix === name.suffix ? 0 : 10
  if (query.words.length === 1) {
    // One word supplies no independent anchor for a typo or nickname. Use whole
    // words only. A lone given name must not pick a surname-first export.
    return name.words.includes(query.words[0]) ? 950 - suffixPenalty : 0
  }
  if (name.words.length < query.words.length) return 0
  let best = 0
  for (const [qi, q] of orders(query.words).entries()) {
    for (const [ni, n] of orders(name.words).entries()) {
      const first = wordMatch(q[0], n[0], true), last = wordMatch(q.at(-1)!, n.at(-1)!, false)
      // A full name must have an exact or known-nickname anchor, and at most
      // two edits overall. A matching first name alone cannot rescue a surname.
      if (!first || !last || first.edits && last.edits || first.edits + last.edits > 2) continue
      let position = 1
      const middleMatches = q.slice(1, -1).every(word => {
        const next = n.indexOf(word, position)
        if (next < 0 || next >= n.length - 1) return false
        position = next + 1
        return true
      })
      if (!middleMatches) continue
      const score = 1000 - first.penalty - last.penalty - suffixPenalty - (qi || ni ? 10 : 0) - (n.length - q.length) * 5
      best = Math.max(best, score)
    }
  }
  return best >= 850 ? best : 0
}

/** Group known roster aliases before deciding whether two real people tie. */
export function resolvePersonName<T extends RosterName>(value: string, people: readonly T[]): NameResolution<T> {
  const query = parseName(value)
  if (!query.words.length || value.length > 160 || query.words.length > 10) return { status: 'no_match', candidates: [] }
  const identities = new Map<string, { person: T; name: Name }[]>()
  for (const person of people) {
    const name = parseName(person.name), key = person.pid ? `pid:${person.pid}` : `name:${name.key}`
    const aliases = identities.get(key) ?? []
    aliases.push({ person, name }, ...(person.aliases ?? []).map(alias => ({ person, name: parseName(alias) })))
    identities.set(key, aliases)
  }
  const ranked: { person: T; score: number; full: boolean }[] = []
  for (const aliases of identities.values()) {
    const suffixes = aliases.map(alias => alias.name.suffix).filter(Boolean)
    if (query.suffix && suffixes.length && !suffixes.includes(query.suffix)) continue
    let best: { person: T; score: number; full: boolean } | undefined
    for (const { person, name } of aliases) {
      const score = scoreName(query, name)
      // Speech counts only choose an indexed spelling within one identity.
      // They must never break a tie between different parliamentarians.
      if (score && (!best || score > best.score || score === best.score && (person.speeches ?? 0) > (best.person.speeches ?? 0))) best = { person, score, full: name.words.length > 1 }
    }
    if (best) ranked.push(best)
  }
  // A surname-only transcript label cannot out-rank identified people with
  // that surname, nor create a second person beside a matching full name.
  const candidates = (ranked.some(row => row.full) ? ranked.filter(row => row.full) : ranked)
    .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))
    .map(({ person, score }) => ({ person, confidence: score / 1000 }))
  return { status: !candidates.length ? 'no_match' : candidates[0].confidence === candidates[1]?.confidence ? 'ambiguous' : 'matched', candidates }
}
