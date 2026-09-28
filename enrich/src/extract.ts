// Reading a Workers AI chat response, and the JSON object inside it.
//
// Observed 2026-09-28 (probing @cf/qwen/qwen3-30b-a3b-fp8 and @cf/openai/gpt-oss-120b):
//  - both answer in chat-completion shape: choices[0].message.{content, reasoning, reasoning_content};
//  - qwen3 reasons by default and can spend the whole max_tokens inside `reasoning` (content: null,
//    finish_reason: "length"); with thinking off it puts its ANSWER in `reasoning`/`reasoning_content`
//    and leaves `content` null; so the reader falls back to the reasoning fields;
//  - `usage.neurons` is reported by the platform on every response;
//  - other models may return {response: "..."} (legacy) or a Responses-API {output: [...]}.
// Models also wrap JSON in prose or ```json fences, and may emit <think>...</think> blocks.

export interface ModelUsage {
  promptTokens: number | null
  completionTokens: number | null
  /** The platform's own figure, when it reports one. */
  neurons: number | null
}

export interface ModelReply {
  /** The best text to look for JSON in ('' when the model produced nothing). */
  text: string
  /** True when `text` came from a reasoning field because the content was empty. */
  fromReasoning: boolean
  finishReason: string | null
  usage: ModelUsage
}

const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function partsToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'string' ? p : typeof (p as { text?: unknown })?.text === 'string' ? (p as { text: string }).text : ''))
      .join('')
  }
  return ''
}

export function readUsage(response: unknown): ModelUsage {
  const usage = ((response as { usage?: Record<string, unknown> } | null)?.usage ?? {}) as Record<string, unknown>
  return {
    promptTokens: asNumber(usage.prompt_tokens) ?? asNumber(usage.input_tokens),
    completionTokens: asNumber(usage.completion_tokens) ?? asNumber(usage.output_tokens),
    neurons: asNumber(usage.neurons),
  }
}

export function readModelReply(response: unknown): ModelReply {
  const r = (response ?? {}) as Record<string, any>
  const usage = readUsage(r)
  const choice = Array.isArray(r.choices) ? r.choices[0] : undefined
  const message = choice?.message ?? {}
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null

  // 1. Chat-completion content.
  let text = partsToText(message.content)
  if (text.trim()) return { text, fromReasoning: false, finishReason, usage }

  // 2. Legacy / raw shapes.
  if (typeof r.response === 'string' && r.response.trim()) return { text: r.response, fromReasoning: false, finishReason, usage }
  if (r.response && typeof r.response === 'object') return { text: JSON.stringify(r.response), fromReasoning: false, finishReason, usage }
  if (typeof r.result?.response === 'string' && r.result.response.trim()) return { text: r.result.response, fromReasoning: false, finishReason, usage }
  if (typeof r.output_text === 'string' && r.output_text.trim()) return { text: r.output_text, fromReasoning: false, finishReason, usage }

  // 3. Responses-API output items: take message text first, reasoning last.
  if (Array.isArray(r.output)) {
    const messageText = r.output
      .filter((item: any) => item?.type === 'message')
      .map((item: any) => partsToText(item.content))
      .join('')
    if (messageText.trim()) return { text: messageText, fromReasoning: false, finishReason, usage }
    const reasoningText = r.output
      .filter((item: any) => item?.type === 'reasoning')
      .map((item: any) => partsToText(item.content) || partsToText(item.summary))
      .join('\n')
    if (reasoningText.trim()) return { text: reasoningText, fromReasoning: true, finishReason, usage }
  }

  // 4. The reasoning fields: qwen3 with thinking off puts its answer here.
  text = partsToText(message.reasoning_content) || partsToText(message.reasoning)
  return { text, fromReasoning: text.trim().length > 0, finishReason, usage }
}

/** Every balanced top-level {...} span in `s`, string- and escape-aware. */
export function balancedObjects(s: string): string[] {
  const spans: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      // A quote only opens a string once we are inside an object; stray quotes in prose are ignored.
      if (depth > 0) inString = true
    } else if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        spans.push(s.slice(start, i + 1))
        start = -1
      }
    }
  }
  return spans
}

const tryParse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Pull the answer object out of model text. Order of preference: the whole text,
 * ```json fenced blocks, then balanced {...} spans, LAST first (a model that
 * thinks aloud states its final answer at the end). An object carrying one of
 * `wantKeys` beats one that does not. Returns null when nothing parses.
 */
export function extractJsonObject(raw: string, wantKeys: readonly string[] = ['summary', 'topics']): Record<string, unknown> | null {
  if (!raw) return null
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/<\/?think>/gi, ' ').trim()
  if (!text) return null

  const candidates: string[] = [text]
  for (const m of text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) candidates.push(m[1].trim())
  candidates.push(...balancedObjects(text).reverse())

  let fallback: Record<string, unknown> | null = null
  for (const candidate of candidates) {
    const parsed = tryParse(candidate)
    if (!isPlainObject(parsed)) continue
    if (wantKeys.some((k) => k in parsed)) return parsed
    // A wrapper such as {"result": {"summary": ...}}.
    const inner = Object.values(parsed).find((v) => isPlainObject(v) && wantKeys.some((k) => k in v))
    if (inner) return inner as Record<string, unknown>
    fallback ??= parsed
  }
  return fallback
}
