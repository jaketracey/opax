import { generateText, streamText, type TextStreamPart, type ToolSet } from 'ai'

/** Keep the same SDK orchestration, admission and accounting on JSON and SSE requests. */
export async function generateResearchText(options: Parameters<typeof generateText>[0], observe?: (chunk: TextStreamPart<ToolSet>) => Promise<void>) {
  if (!observe) return generateText(options)
  const result = streamText(options)
  // Reading fullStream propagates provider failures instead of treating a truncated JSON object as a reply.
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'error') throw chunk.error
    await observe(chunk)
  }
  return { text: await result.text, usage: await result.usage, providerMetadata: await result.providerMetadata }
}

/** Only complete top-level array entries are readable. A text property alone is insufficient: its fact ids and
 * coverage flag may follow it. Escapes, braces in strings and token splits never manufacture a complete entry. */
export function completedAnswerEntries(raw: string, key: 'points' | 'sentences'): unknown[] {
  if (raw.length > 100_000) return []
  let quoted = false, escaped = false, depth = 0, array = -1, start = -1, entry = -1
  const out: unknown[] = []
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') {
        quoted = false
        if (depth === 1 && array < 0 && raw.slice(start, i + 1) === JSON.stringify(key)) {
          const match = /^\s*:\s*\[/.exec(raw.slice(i + 1))
          if (match) { array = i + 1 + match[0].length; i = array - 1; depth = 2 }
        }
      }
      continue
    }
    if (c === '"') { quoted = true; start = i; continue }
    if (c === '{' || c === '[') { if (array >= 0 && depth === 2) entry = i; depth++; continue }
    if (c === '}' || c === ']') {
      depth--
      if (array >= 0 && depth === 2 && entry >= array) {
        try { out.push(JSON.parse(raw.slice(entry, i + 1))) } catch { return [] }
      }
      if (array >= 0 && depth < 2) return out
    }
  }
  return out
}
