/** The role of whoever holds a turn of a hearing transcript: the commissioner, counsel assisting, a witness or
 * a lawyer appearing at the hearing; or, for a "Q." that prints no speaker, that it is a question, with no asker. Built only on
 * the turns pageTurns (transcript-text.ts) reads from a page. A role is given only when the page itself makes it
 * certain; anything else has none and is quoted as "the transcript records". Only the role leaves this file: a
 * heading's text, and so anyone's name, never does.
 *
 * What no parser can see: the publisher's own slips, where a transcript prints one speaker's words under another's
 * heading (an answer under the examiner's label). The role is wrong there. Two turns running under one heading are
 * the one form of it a page shows, and both are left without a role. */
import type { RecordRow } from './published-records'
import type { PageTurn } from './transcript-text'
import MISMARKED from './transcript-mismarked-pages.json'

/** Everyone the cover lists as appearing "for" someone, counsel or solicitor, for a party or for one witness. The
 * cover does not always say which, so the label is one that is true of all of them. One line to change. */
export const APPEARING = 'lawyer appearing at the hearing'
export const SPEAKER_ROLES = ['commissioner', 'counsel assisting', 'witness', APPEARING, 'question'] as const
export type SpeakerRole = typeof SPEAKER_ROLES[number]
export type ParsedPage = { text: string, turns: PageTurn[], pdfPage?: number }
/** The role of one of a page's turns, or undefined. */
export type RoleFor = (page: ParsedPage, turn: PageTurn) => SpeakerRole | undefined

const POSTNOMINAL = new Set(['SC', 'KC', 'QC', 'AM', 'AO', 'AC', 'OAM', 'PSM', 'APM'])
const TITLES = new Set(['THE', 'HON', 'HONOURABLE', 'MR', 'MS', 'MRS', 'MISS', 'MX', 'DR', 'PROF', 'PROFESSOR', 'UNCLE', 'AUNTY', 'SENATOR', 'COMMISSIONER', 'JUSTICE'])
const nameWords = (heading: string) => heading.toUpperCase().replace(/[.,]/g, '').split(/\s+/).filter(w => w && !POSTNOMINAL.has(w) && !TITLES.has(w))
const ROLE_WORD = /(?<![a-z])(counsel assisting|counsel for|for|commissioner)(?![a-z])/i
const OPENS_ENTRY = /^(?:MR|MS|MRS|MISS|DR|PROF|PROFESSOR|THE HON)\b/i
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A heading that is a role and nothing else. "COMMISSIONER <NAME>" is not: a witness can hold that title. */
function roleWord(heading: string): SpeakerRole | undefined {
  const h = heading.trim().toUpperCase()
  return /^(?:THE )?COMMISSIONER$/.test(h) ? 'commissioner' : /^(?:THE )?WITNESS$/.test(h) ? 'witness' : /^COUNSEL ASSISTING$/.test(h) ? 'counsel assisting' : undefined
}

/** The roles one transcript's cover page gives, by the whole heading. The cover lists who appears, one entry to a
 * line ("MS X SC, for the Commonwealth") or wrapped over several ("A SC WITH B AND / C, COUNSEL ASSISTING"). A
 * heading takes a role only when every word of its name is in one entry, that entry closes with a role, and no
 * other entry gives the same name a different role. A name after "for" is a party someone appears for, never a
 * speaker's role. A surname that a "<" line of the transcript also prints (other than "EXAMINATION BY ...") may be
 * a witness of the same name, so it takes no role from the cover. */
function coverRoles(pages: RecordRow[]): (heading: string) => SpeakerRole | undefined {
  const cover = String(pages[0]?.text ?? '').split('\n').map(line => line.trim()).filter(Boolean)
  const noted = new Set<string>()
  for (const p of pages) if (typeof p.text === 'string') for (const line of p.text.match(/^[ \t]*<[^\n]*$/gm) ?? [])
    if (!/EXAMINATION/i.test(line)) for (const w of nameWords(line.replace(/[<\[\]:]/g, ' '))) noted.add(w)
  const role = (word: string): SpeakerRole => /assisting/i.test(word) ? 'counsel assisting' : /commissioner/i.test(word) ? 'commissioner' : APPEARING
  const cache = new Map<string, SpeakerRole | undefined>()
  const find = (heading: string): SpeakerRole | undefined => {
    const words = nameWords(heading), surname = words.at(-1) ?? ''
    if (surname.length < 3 || noted.has(surname)) return undefined
    const word = new RegExp(`(?<![\\p{L}'’-])${escaped(surname)}(?![\\p{L}'’-])`, 'iu'), found = new Set<SpeakerRole>()
    for (const [n, line] of cover.entries()) {
      const m = word.exec(line)
      if (!m || /\bfor\b/i.test(line.slice(0, m.index))) continue
      // The rest of the heading's name (a given name, an initial) is in the same entry.
      const entry = nameWords(line)
      if (!words.slice(0, -1).every(w => entry.includes(w) || (w.length === 1 && entry.some(e => e.startsWith(w))))) continue
      // The entry runs on to the next line only when this line ends in a comma, "and" or "with", when the role
      // word opens the next line, or when the role word is split over the break ("..., COUNSEL / ASSISTING"). A
      // name above another person's line takes no role from it. "X, SOLICITOR FOR ..." is an appearance like
      // counsel's: a lawyer appearing at the hearing.
      let tail = line.slice(m.index + m[0].length), last = tail
      const previous = cover.slice(0, n).reverse().map(l => [...l.matchAll(new RegExp(ROLE_WORD, 'gi'))].at(-1)?.[1]).find(Boolean)
      const wrapped = !(previous && /for$/i.test(previous)) || OPENS_ENTRY.test(line)
      for (const next of [...cover.slice(n + 1, n + 4), '']) {
        const closes = ROLE_WORD.exec(tail)
        if (closes) { if (!/[0-9:]/.test(tail.slice(0, closes.index))) found.add(role(closes[1])); break }
        if (!next || !wrapped || /[0-9:]/.test(tail)) break
        const joined = `${tail} ${next}`, ahead = ROLE_WORD.exec(joined)
        const lastWord = tail.trimEnd().lastIndexOf(' ') + 1
        const runsOn = /(?:,|\b(?:and|with))\s*$/i.test(last), opens = new RegExp(`^\\W*${ROLE_WORD.source}`, 'i').test(next)
        const split = !!ahead && ahead.index >= lastWord && ahead.index < tail.trimEnd().length
        if (!runsOn && !opens && !split) break
        tail = joined; last = next
      }
    }
    return found.size === 1 ? [...found][0] : undefined
  }
  return heading => { if (!cache.has(heading)) cache.set(heading, find(heading)); return cache.get(heading) }
}

/** One switch: whether a "Q." or an "A." has a role at all. Where the publisher printed a wrong or missing mark in the
 * middle of a line, no parser can see it and the role is wrong; false gives every mark turn "the transcript records". */
const MARK_ROLES = true

/** The roles of one transcript's turns. Nothing is carried from one turn to another.
 *  - A heading turn: the heading is a role word, or the cover gives the whole heading a role. Never from a heading
 *    that holds a digit or a quote mark, or that is not in capitals unless it is a bare role word ("Commissioner"):
 *    "Dr Surname: at the time you were ..." is counsel addressing a witness. Two turns running under the same
 *    heading are left without a role: one of them may be the publisher's slip.
 *  - "HEADING: Q." is that heading's question, with its role; with no role for the heading, a question.
 *  - A bare "Q." is a question. Who asked it is not printed, and the last headed "Q." is not carried to it.
 *  - Two bare marks of the same letter running ("A." straight after "A.") are the publisher's slip that a page
 *    shows: one of them is the other speaker's turn, so neither has a role.
 *  - An "A." is a witness's answer: a witness, never which one. Only in a transcript printed as questions and
 *    answers (three or more of each; the other two commissions' transcripts have none): elsewhere a line that
 *    opens "A." is a list item, not an answer.
 *  - Text at the top of a page (it runs on from the page before) and text after a "<" line have no role. */
/** Pages where the publisher printed a wrong or missing "Q.", "A." or heading (transcript-mismarked-pages.json:
 * transcript key and PDF page, no names). No turn on a listed page has a role. Adding a page is one line there. */
export const mismarkedPages = (key: string | undefined): Set<number> => new Set((MISMARKED.pages as { transcript: string, pdf_page: number }[]).filter(p => p.transcript === key).map(p => p.pdf_page))

export function transcriptRoles(pages: RecordRow[], key?: string): RoleFor {
  const onCover = coverRoles(pages), mismarked = mismarkedPages(key)
  const lines = (mark: string) => pages.reduce((n, p) => n + (typeof p.text === 'string' ? (p.text.match(new RegExp(`^[ \\t]*(?:[^\\n:]{1,70}:+[ \\t]+)?${mark}[.:](?=\\s|$)`, 'gm')) ?? []).length : 0), 0)
  const examined = lines('Q') >= 3 && lines('A') >= 3
  const headingRole = (heading: string) => {
    if (/[0-9"“”‘]/.test(heading)) return undefined
    const word = roleWord(heading)
    return word ?? (/[a-z]/.test(heading.replace(/\bMc(?=[A-Z])|\b(?:de|di|du|da|del|della|le|la|van|von|der|den|ter|bin|al|el|st)\b/g, '')) ? undefined : onCover(heading))
  }
  return (page, turn) => {
    const i = page.turns.indexOf(turn)
    if (i < 0 || turn.opens === 'page' || turn.opens === 'note') return undefined
    if (page.pdfPage !== undefined && mismarked.has(page.pdfPage)) return undefined
    if (turn.opens === 'heading') {
      const before = page.turns[i - 1], after = page.turns[i + 1]
      if ([before, after].some(t => t?.opens === 'heading' && t.heading === turn.heading)) return undefined
      return turn.heading ? headingRole(turn.heading) : undefined
    }
    const role = turn.heading ? headingRole(turn.heading) : undefined
    if (!examined || !MARK_ROLES) return undefined
    if (!turn.heading && [page.turns[i - 1], page.turns[i + 1]].some(t => t?.opens === 'mark' && !t.heading && t.mark === turn.mark)) return undefined
    if (turn.mark === 'Q') return role && role !== 'witness' ? role : 'question'
    return !role || role === 'witness' ? 'witness' : undefined
  }
}

/** A short answer is no evidence without its question ("Correct."). When the turn is a bare "A." of at most
 * SHORT_ANSWER_WORDS words, shown whole, and the turn straight before it on the same page is a "Q." (bare or under a
 * heading) with words, this is that question: its own words, cut from the front to fit `room` characters so the end
 * the witness answered is kept, and its role. Otherwise undefined. Nothing is carried from another page. */
export const SHORT_ANSWER_WORDS = 6
export function answeredQuestion(page: ParsedPage, turn: PageTurn, roleFor: RoleFor, room: number): { text: string, role?: SpeakerRole } | undefined {
  const i = page.turns.indexOf(turn), before = page.turns[i - 1]
  if (i < 1 || turn.opens !== 'mark' || turn.mark !== 'A' || turn.heading || roleFor(page, turn) !== 'witness') return undefined
  if (page.text.slice(turn.start, turn.end).trim().split(/\s+/).length > SHORT_ANSWER_WORDS) return undefined
  if (before.opens !== 'mark' || before.mark !== 'Q' || before.end <= before.start) return undefined
  const words = page.text.slice(before.start, before.end).trim(), role = roleFor(page, before)
  let text = words
  if (words.length > room) { const cut = words.indexOf(' ', words.length - room + 3); if (cut < 0) return undefined; text = `...${words.slice(cut + 1)}` }
  // A bare "Q." has no asker, so its role ("question") adds nothing here.
  return text.replace(/[.\s]/g, '') ? { text, ...(role && role !== 'question' ? { role } : {}) } : undefined
}
