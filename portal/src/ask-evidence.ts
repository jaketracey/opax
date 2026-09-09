/** Progress citation formats stay at the API boundary; readers use source ranges. */
export type AugmentedContext = {
  paragraphs?: Record<string, { id?: string; text?: string; parent?: string }>
  fields?: Record<string, { id?: string; text?: string; parent?: string }>
}

export const ASK_PIPELINE_VERSION = '2026-09-09-footnotes-context-recovery-v7'

export const FOOTNOTE_INSTRUCTIONS = 'Cite factual claims with Markdown footnotes, for example [^1]. After the answer, define EVERY reference on its own line using an exact block identifier from the provided context, for example [^1]: block-AA. Do not use that example identifier unless it is present in the context. Never invent an identifier or use paragraph order as a citation. '

/** A bounded compatibility fallback for models that omit the beta mapping. */
export function legacyCitationsAsk(body: Record<string, unknown>): Record<string, unknown> {
  const prompt = body.prompt as { system?: string; user?: string } | undefined
  return { ...body, citations: 'default', ...(prompt ? {
    prompt: { ...prompt, user: prompt.user?.replace(FOOTNOTE_INSTRUCTIONS, 'Cite claims from the provided source evidence. ') },
  } : {}) }
}

/** Retry generation, never relabel an unverified quotation as a paraphrase. */
export function quoteRecoveryAsk(body: Record<string, unknown>): Record<string, unknown> {
  const prompt = body.prompt as { system?: string; user?: string } | undefined
  return { ...body, prompt: { ...prompt,
    system: (prompt?.system ?? '') + ' For this recovery, paraphrase the source evidence with citations. Do not use direct quotations.',
    user: (prompt?.user ?? '{context}\n{question}') +
    '\nRecovery instructions: Write a fresh, concise answer in your own words, with citations. ' +
    'Do not use direct quotations or quotation marks in this answer. Do not reproduce a speech opening or procedural motion. ' +
    'Summarise only the passages that address the question, in up to three short paragraphs. ' +
    'Keep allegations attributed as claims and preserve uncertainty about speakers, dates and coverage. ' +
    'If the passages support only part of the question, answer that part and briefly say what remains unclear.' } }
}

// Question scaffolding must not outweigh its subject when choosing an excerpt.
const EXCERPT_STOP = new Set(('a an and are as at be been being by can could did do does for from had has have how i in into is it its may might more most of on or our over said say says should show some tell than that the their them there these they this those through to us was were what when where which who why will with would you your about actually australian australia parliament parliamentary mp mps senator senators described describe discussion discussed discuss years year time record records').split(' '))

/** A contiguous, word-bounded original-text window near the question's terms. */
export function evidenceExcerpt(value: string, question: string, limit = 440): { text: string; relevance: number } {
  const text = value.replace(/\n+DOCUMENT CLASSIFICATION LABELS:[\s\S]*$/, '').replace(/\s+/g, ' ').trim()
  const terms = new Set((question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(t => t.length > 2 && !EXCERPT_STOP.has(t)))
  const matches = [...text.matchAll(/[\p{L}\p{N}]+/gu)].filter(m => terms.has(m[0].toLowerCase()))
  let start = 0
  let relevance = 0
  let left = 0
  let right = 0
  const counts = new Map<string, number>()
  for (const match of matches) {
    const at = match.index!
    // Prefer a sentence boundary, but never spend most of the window on a preamble.
    const floor = Math.max(0, at - 100)
    const prefix = text.slice(floor, at)
    const boundary = [...prefix.matchAll(/[.!?][”"']?\s+/g)].at(-1)
    let candidate = boundary ? floor + boundary.index! + boundary[0].length : floor
    if (candidate > 0 && !/\s/.test(text[candidate - 1])) candidate = text.indexOf(' ', candidate) + 1
    // The windows move forwards: count each hit once, even for long debates.
    while (right < matches.length && matches[right].index! + matches[right][0].length <= candidate + limit) {
      const term = matches[right++][0].toLowerCase()
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
    while (left < right && matches[left].index! < candidate) {
      const term = matches[left++][0].toLowerCase()
      const count = (counts.get(term) ?? 0) - 1
      if (count) counts.set(term, count)
      else counts.delete(term)
    }
    const hits = counts.size
    if (hits > relevance) { relevance = hits; start = candidate }
  }
  let end = Math.min(text.length, start + limit)
  if (end < text.length) {
    const boundary = text.lastIndexOf(' ', end)
    if (boundary > start) end = boundary
  }
  return { text: (start ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : ''), relevance }
}

/** Only original corpus fields may support a claim, never generated enrichment. */
export function originalContext(id: string): boolean {
  if (/^USER_CONTEXT_\d+$/.test(id)) return true // Must also be in the server-provided knownContexts set.
  const parts = id.split('/')
  return parts.length >= 3 && !parts[0].startsWith('da-') && !parts[2].startsWith('da-')
}

export function normaliseFootnotes(
  raw: string,
  mapping: Record<string, string>,
  knownContexts: Set<string>,
): { answer: string; citations: Record<string, number[][]> } {
  const definitions = new Map<string, string[]>()
  // Footnote definitions are data, not model-authored links to be followed.
  const prose = raw.replace(/^[ \t]*\[\^?([^\]\r\n]+)\]:[ \t]*([^\r\n]*)(?:\r?\n|$)/gm, (_, ref: string, value: string) => {
    const blocks = value.match(/block-[A-Za-z0-9_-]+/g) ?? []
    if (!blocks.length) return _
    definitions.set(ref, blocks)
    return ''
  }).trim()
  const citations: Record<string, number[][]> = {}
  let answer = ''
  let cursor = 0
  let length = 0
  for (const match of prose.matchAll(/\[\^?([^\]\r\n]+)\]/g)) {
    if (!definitions.has(match[1]) && !Object.hasOwn(mapping, match[1]) && !match[0].startsWith('[^')) continue
    const fragment = prose.slice(cursor, match.index)
    answer = (answer + fragment).trimEnd()
    length = Array.from(answer).length
    const blocks = definitions.get(match[1]) ?? [match[1]]
    let end = length
    const points = Array.from(answer)
    while (end > 0 && /\s/.test(points[end - 1])) end--
    for (const block of blocks) {
      const id = Object.hasOwn(mapping, block) ? mapping[block] : undefined
      if (!id || !knownContexts.has(id) || !originalContext(id) || end === 0) continue
      const ranges = citations[id] ??= []
      if (!ranges.some((range) => range[1] === end)) ranges.push([end - 1, end])
    }
    cursor = match.index + match[0].length
  }
  answer += prose.slice(cursor)
  return { answer: answer.trimEnd(), citations }
}

/** Hide provider footnote syntax while streaming, including split tokens/definitions. */
export class FootnoteStream {
  private pending = ''
  private lineStart = true
  private definition = false

  push(text: string, final = false): string {
    this.pending += text
    let out = ''
    while (this.pending) {
      if (this.definition) {
        const newline = this.pending.indexOf('\n')
        if (newline < 0) { this.pending = ''; break }
        this.pending = this.pending.slice(newline + 1)
        this.definition = false
        this.lineStart = true
        continue
      }
      if (this.pending[0] === '[') {
        if (this.pending.length === 1 && !final) break
        if (/^\[\^?(?:[0-9]|b)/.test(this.pending) || this.pending[1] === '^') {
          const end = this.pending.indexOf(']')
          if (end < 0) {
            const candidate = /^\[\^?(?:[0-9]+|b(?:l(?:o(?:c(?:k(?:-[A-Za-z0-9_-]*)?)?)?)?)?)$/.test(this.pending) || /^\[\^[A-Za-z0-9_-]*$/.test(this.pending)
            if (candidate && !final && this.pending.length < 256) break
            if (candidate) { this.pending = ''; break }
            out += '['
            this.pending = this.pending.slice(1)
            this.lineStart = false
            continue
          }
          if (!/^\[\^?(?:[0-9]+|block-[A-Za-z0-9_-]+)\]$/.test(this.pending.slice(0, end + 1))) {
            out += '['
            this.pending = this.pending.slice(1)
            this.lineStart = false
            continue
          }
          if (this.lineStart && end + 1 === this.pending.length && !final) break
          this.definition = this.lineStart && this.pending[end + 1] === ':'
          this.pending = this.pending.slice(end + (this.definition ? 2 : 1))
          continue
        }
      }
      const char = this.pending[0]
      out += char
      this.pending = this.pending.slice(1)
      if (char === '\n') this.lineStart = true
      else if (!/[ \t\r]/.test(char)) this.lineStart = false
    }
    return out
  }
}

/** Literal quotation check, not a factual entailment score. */
export function unsupportedQuotes(answer: string, evidence: string[]): string[] {
  const fold = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const texts = evidence.map(fold)
  const quotes = [...answer.matchAll(/["“]([^"”\n]*)["”]/g)].map(m => m[1])
    .filter(q => q.length >= 30 && q.trim().split(/\s+/).length >= 6)
  return quotes.filter(quote => {
    const parts = quote.split(/\.{3}|…/).map(fold).filter(Boolean)
    return !texts.some(text => {
      let offset = 0
      return parts.every(part => {
        const at = text.indexOf(part, offset)
        if (at < 0) return false
        offset = at + part.length
        return true
      })
    })
  })
}
