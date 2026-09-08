/** Progress citation formats stay at the API boundary; readers use source ranges. */
export type AugmentedContext = {
  paragraphs?: Record<string, { id?: string; text?: string; parent?: string }>
  fields?: Record<string, { id?: string; text?: string; parent?: string }>
}

export const ASK_PIPELINE_VERSION = '2026-09-08-footnotes-context-v2'

export const FOOTNOTE_INSTRUCTIONS = 'Cite factual claims with Markdown footnotes, for example [^1]. After the answer, define EVERY reference on its own line using an exact block identifier from the provided context, for example [^1]: block-AA. Do not use that example identifier unless it is present in the context. Never invent an identifier or use paragraph order as a citation. '

/** A bounded compatibility fallback for models that omit the beta mapping. */
export function legacyCitationsAsk(body: Record<string, unknown>): Record<string, unknown> {
  const prompt = body.prompt as { system?: string; user?: string } | undefined
  return { ...body, citations: 'default', ...(prompt ? {
    prompt: { ...prompt, user: prompt.user?.replace(FOOTNOTE_INSTRUCTIONS, 'Cite claims from the provided source evidence. ') },
  } : {}) }
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
