// A search card whose record matched only on its speaker label has no passage
// (src/search-passages.ts). This fills it from the record's own text: the first
// of the speaker's words, read once per record and then kept.
//
// What it costs is bounded here, and the Worker supplies the parts that touch
// anything (src/index.ts fillSearchPassages): at most FILL_MAX cards a page,
// a cached passage costs no read, reads are taken from a daily allowance
// before they are made, a few run at a time, and none may hold the page.
import { firstSpeechTurn } from './position-evidence'
import { normalizePassage, passageWindow } from './passage-text'
import { HEARING_HEADER, SPEAKER_LABEL_LEAD, isSpeakerLabel } from './search-passages'

/** The most cards one page fills, and so the most record reads one page can make. */
export const FILL_MAX = 20
export const FILL_CONCURRENCY = 5
/** One read may take this long. */
export const FILL_READ_MS = 2500
/** The whole fill, from its first cache lookup to its last read, may take this long. Past it, a card keeps its fallback line. */
export const FILL_TOTAL_MS = 4000

// A label at the start of a line: where the next person's turn begins.
const NEXT_LABEL = new RegExp('\\n[ \\t]*' + SPEAKER_LABEL_LEAD.source.slice(1))
const fold = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * The speaker's own first words in a record's text, or nothing.
 *  - The header a committee transcript puts above a turn, and a short heading
 *    line, are dropped.
 *  - The record must then open with a label that names `speaker` (the whole
 *    name, or the surname the transcript prints). A record that opens with
 *    someone else's label, or with words nobody is named for before a label,
 *    is not this speaker's to quote. A record with no label anywhere is the
 *    speaker's own text.
 *  - The turn ends at the next label at the start of a line ("CHAIR:",
 *    "The DEPUTY PRESIDENT:", "Mr X:"), so a reply is never included.
 */
export function ownWords(text: string, speaker: string | null | undefined, limit = 600): string {
  const surname = fold(String(speaker ?? '')).split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean).pop()
  if (!surname) return ''
  let rest = String(text || '').replace(/\r\n?/g, '\n').trim()
  for (let i = 0; i < 4; i++) {
    const before = rest
    rest = rest.replace(HEARING_HEADER, '')
    const heading = /^([^\n]{1,120})\n\s*\n/.exec(rest)
    if (heading && !/[.!?:]\s*$/.test(heading[1]) && heading[1].trim().split(/\s+/).length <= 12) rest = rest.slice(heading[0].length)
    rest = rest.trimStart()
    if (rest === before) break
  }
  const label = SPEAKER_LABEL_LEAD.exec(rest)
  if (label) {
    // Who the label names, without the electorate or office in its parentheticals.
    const named = fold(label[0].replace(/\([^)]*\)/g, ' ')).split(/[^\p{L}\p{N}'’-]+/u)
    if (!named.includes(surname)) return ''
    rest = rest.slice(label[0].length)
    // The speaker's label with nothing under it but the next person's.
    if (SPEAKER_LABEL_LEAD.test(rest)) return ''
  } else if (NEXT_LABEL.test('\n' + rest)) return ''
  const next = NEXT_LABEL.exec(rest)
  if (next) rest = rest.slice(0, next.index)
  const turn = normalizePassage(firstSpeechTurn(rest))
  if (!turn || isSpeakerLabel(turn)) return ''
  const passage = passageWindow(turn, limit, 0)
  return /[\p{L}\p{N}]/u.test(passage) ? passage : ''
}

/** The source text of a record as the knowledge box returns it: its body fields in order, never a generated summary. */
export function recordBody(record: unknown): string {
  const texts = ((record as { data?: { texts?: Record<string, { value?: { body?: string } }> } } | null)?.data?.texts) ?? {}
  const standard = Object.keys(texts).filter((k) => /^body(?:-\d+)?$/.test(k))
  const keys = standard.length ? standard : Object.keys(texts).filter((k) => /^t-body(?:-\d+)?$/.test(k))
  return keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((k) => texts[k]?.value?.body ?? '').join('')
}

export type FillRow = { kind?: string | null; slug?: string | null; state?: string | null; snippet?: string | null; speaker?: string | null; speaker_type?: string | null }

export type FillParts = {
  /** The kept passage for a record: a string (empty when its text had no words to show), or undefined when not kept. */
  cached(slug: string): Promise<string | undefined>
  keep(slug: string, passage: string): void
  /** The record's source text. One knowledge-box read. */
  read(slug: string, signal: AbortSignal): Promise<string>
  /** Take up to n reads from today's allowance; the number granted. Absent: this request may not read at all. */
  reserve?: (n: number) => Promise<number>
  signal?: AbortSignal
}

/**
 * A speech card with no passage, by one named speaker. A record of several
 * speakers has no one person's words to show, and South Australian Hansard is
 * left alone: its excerpts follow their own limits.
 */
const wantsFill = (row: FillRow) => row.kind === 'speech' && /^speech-\d+$/.test(row.slug ?? '') && !String(row.snippet ?? '').trim()
  && row.state !== 'sa' && row.speaker_type !== 'multi_speaker' && !!String(row.speaker ?? '').trim()

/**
 * Fill the label-only cards among `rows`, in place. Never throws: a card that
 * cannot be filled keeps its empty snippet and the page says where its words
 * are. The clock starts before anything is asked of the cache or the
 * allowance, so no part of the fill can hold the page past FILL_TOTAL_MS.
 * Returns what it did, for the log line and the tests.
 */
export async function fillPassages(rows: FillRow[], parts: FillParts): Promise<{ wanted: number; cached: number; reads: number; filled: number }> {
  const wanted = rows.filter(wantsFill).slice(0, FILL_MAX)
  const done = { wanted: wanted.length, cached: 0, reads: 0, filled: 0 }
  if (!wanted.length) return done
  const deadline = AbortSignal.timeout(FILL_TOTAL_MS)
  const late = new Promise<null>((resolve) => deadline.addEventListener('abort', () => resolve(null), { once: true }))
  /** The work, or null once the clock has run out. The work is abandoned, not awaited. */
  const intime = <T>(work: Promise<T>): Promise<T | null> => Promise.race([work.catch(() => null), late])
  const kept = await intime(Promise.all(wanted.map((row) => parts.cached(row.slug!).catch(() => undefined))))
  if (!kept) return done
  const missing: FillRow[] = []
  wanted.forEach((row, i) => {
    const passage = kept[i]
    if (passage === undefined) { missing.push(row); return }
    done.cached++
    if (passage) { row.snippet = passage; done.filled++ }
  })
  if (!missing.length || !parts.reserve || deadline.aborted) return done
  // No answer from the allowance in time is no reads granted.
  const granted = Math.max(0, Math.min(missing.length, Math.floor((await intime(parts.reserve(missing.length))) ?? 0) || 0))
  if (!granted || deadline.aborted) return done
  const queue = missing.slice(0, granted)
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (deadline.aborted || parts.signal?.aborted) return
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(FILL_READ_MS), ...(parts.signal ? [parts.signal] : [])])
      done.reads++
      try {
        const passage = ownWords(await parts.read(row.slug!, signal), row.speaker)
        signal.throwIfAborted()
        parts.keep(row.slug!, passage)
        if (passage) { row.snippet = passage; done.filled++ }
      } catch { /* the card keeps its fallback line; nothing is kept, so a later page tries again */ }
    }
  }
  await intime(Promise.all(Array.from({ length: Math.min(FILL_CONCURRENCY, queue.length) }, worker)))
  return done
}
