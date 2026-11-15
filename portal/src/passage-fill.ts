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
import { isSpeakerLabel } from './search-passages'

/** The most cards one page fills, and so the most record reads one page can make. */
export const FILL_MAX = 20
export const FILL_CONCURRENCY = 5
/** One read may take this long; the whole fill this long. Past either, the card keeps its fallback line. */
export const FILL_READ_MS = 2500
export const FILL_TOTAL_MS = 4000

const LABEL = /^(?:(?:the\s+)?hon\.?|mr|mrs|ms|miss|dr|prof\.?|professor|senator|madam|rev\.?|(?:the\s+)?(?:acting\s+|deputy\s+)?chair)(?=[\s:(])((?:\s+[A-Z][A-Za-z'’.\-]*){0,5}\s*(?:\([^)]{0,80}\)\s*)?):\s*/i

/**
 * The speaker's own first words in a record's text: without the header the
 * transcript puts above a turn ("[Committee … PORTFOLIO Agency]", or a short
 * heading line), without the label that names the speaker, and only the
 * record's first turn. Empty when nothing with words in it is left.
 */
export function ownWords(text: string, limit = 600): string {
  let rest = String(text || '').replace(/\r\n?/g, '\n').trim()
  for (let i = 0; i < 4; i++) {
    const before = rest
    // A bracketed header, then a heading line of a few words with no sentence in it.
    rest = rest.replace(/^\[[^\]]{0,600}\]\s*/, '')
    const heading = /^([^\n]{1,120})\n\s*\n/.exec(rest)
    if (heading && !/[.!?:]\s*$/.test(heading[1]) && heading[1].trim().split(/\s+/).length <= 12) rest = rest.slice(heading[0].length)
    const label = LABEL.exec(rest)
    // The name part is case-sensitive (a name, not a sentence), as in isSpeakerLabel.
    if (label && /^(?:\s+[A-Z][A-Za-z'’.\-]*){0,5}\s*(?:\([^)]{0,80}\)\s*)?$/.test(label[1])) rest = rest.slice(label[0].length)
    rest = rest.trimStart()
    if (rest === before) break
  }
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

export type FillRow = { kind?: string | null; slug?: string | null; state?: string | null; snippet?: string | null }

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

/** A speech card with no passage. South Australian Hansard is left alone: its excerpts follow their own limits. */
const wantsFill = (row: FillRow) => row.kind === 'speech' && /^speech-\d+$/.test(row.slug ?? '') && !String(row.snippet ?? '').trim() && row.state !== 'sa'

/**
 * Fill the label-only cards among `rows`, in place. Never throws: a card that
 * cannot be filled keeps its empty snippet and the page says where its words
 * are. Returns what it did, for the log line and the tests.
 */
export async function fillPassages(rows: FillRow[], parts: FillParts): Promise<{ wanted: number; cached: number; reads: number; filled: number }> {
  const wanted = rows.filter(wantsFill).slice(0, FILL_MAX)
  const done = { wanted: wanted.length, cached: 0, reads: 0, filled: 0 }
  if (!wanted.length) return done
  const kept = await Promise.all(wanted.map((row) => parts.cached(row.slug!).catch(() => undefined)))
  const missing: FillRow[] = []
  wanted.forEach((row, i) => {
    const passage = kept[i]
    if (passage === undefined) { missing.push(row); return }
    done.cached++
    if (passage) { row.snippet = passage; done.filled++ }
  })
  if (!missing.length || !parts.reserve) return done
  const granted = Math.max(0, Math.min(missing.length, Math.floor(await parts.reserve(missing.length).catch(() => 0)) || 0))
  if (!granted) return done
  const queue = missing.slice(0, granted)
  const deadline = AbortSignal.timeout(FILL_TOTAL_MS)
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (deadline.aborted || parts.signal?.aborted) return
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(FILL_READ_MS), ...(parts.signal ? [parts.signal] : [])])
      done.reads++
      try {
        const passage = ownWords(await parts.read(row.slug!, signal))
        signal.throwIfAborted()
        parts.keep(row.slug!, passage)
        if (passage) { row.snippet = passage; done.filled++ }
      } catch { /* the card keeps its fallback line; nothing is kept, so a later page tries again */ }
    }
  }
  // A read that outlives the deadline is abandoned, not awaited: the page goes out on time.
  await Promise.race([
    Promise.all(Array.from({ length: Math.min(FILL_CONCURRENCY, queue.length) }, worker)),
    new Promise<void>((resolve) => deadline.addEventListener('abort', () => resolve(), { once: true })),
  ])
  return done
}
