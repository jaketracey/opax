// The opening line of a streamed research answer: one framing sentence shown once the first lookups are chosen,
// while research reads the records. It says what OPAX is looking up and nothing about what the records hold.
//
// It is written from the question and the fixed labels of the round-1 lookups only (never a retrieved passage, a
// tool result or a tool argument), so it has no record to state a fact from. It runs beside research and is never
// awaited by it: a slow, failed or late call is dropped and the answer streams as it does without the line.
//
// Once shown, the line is the first paragraph of the answer (the deltas a client joins equal done.answer). The
// answer checks never read it: checkedAnswerPayload lifts it off, checks the answer, and puts it back.
import { generateText, type LanguageModel } from 'ai'
import { reserveQuestionTurn } from './ask-budgets'
import { researchTurnReservationUsd, type ResearchDailyBudget } from './research-budget'

/** The D1 label of this call's cost (ask_call_costs.label) and its key in the done payload's research block. */
export const OPENING_LINE_LABEL = 'opening_line'
/** The call is dropped at this wall time; first answer text is never held for it. */
export const OPENING_LINE_MS = 2_500
export const OPENING_LINE_OUTPUT_TOKENS = 48
/** Between the line and the answer: the line is its own paragraph. */
export const OPENING_LINE_BREAK = '\n\n'

/** ASK_OPENING_LINE: only "on" enables the line. Unset, "off" or anything else serves the stream as before it existed. */
export const openingLineEnabled = (value: unknown): boolean => typeof value === 'string' && value.trim().toLowerCase() === 'on'

export const OPENING_LINE_INSTRUCTIONS = 'A reader has asked OPAX a question about Australian public life, and OPAX has just started reading its records. Write the one line the reader sees while that reading happens: it says what OPAX is looking up. '
  + 'You are given the question and "reading", the kinds of record lookup now running. No record has been read yet, so the line reports the lookup and holds no information about its subject. '
  + 'Begin with "Looking at", "Checking" or "Searching". Then name the subject of the question as a short noun phrase in the question\'s own words (the person, party, bill, program, body or topic; a person by the name the question uses), and the kind of record being read, in plain words drawn from "reading" (their speeches, the recorded division, royal commission reports) or simply "the public record". A label that names an action and no record kind ("Finding records", "Counting by speaker", "Resolving a name") is covered by "the public record". '
  + 'Keep to the lookup: the line carries the subject\'s name and the record kind only. Every figure, date, year, outcome, cause, finding, description and judgement is left for the answer that follows, including any the question itself asserts. '
  + 'One sentence of 8 to 20 words in plain Australian English, ending with a full stop. Reply with the line alone.'

/** The model's whole input: the question and the fixed step labels of the round-1 lookups. */
export const openingLinePrompt = (question: string, reading: string[]): string => JSON.stringify({ question, reading })

export interface OpeningLineCall { ms: number; cost_usd: number | null; shown: boolean }
export interface OpeningLineHook {
  /** Shows the line unless answer text is already out or the stream has ended. True when it was shown. */
  release: (line: string) => Promise<boolean>
  /** Called once per model call made, with its latency and cost. */
  spent: (call: OpeningLineCall) => void
  /** No line may be shown from here on: answer text has started or the stream has ended. Stops a call in flight. */
  close: () => void
  /** The line shown to the reader, or '' when none was. */
  readonly text: string
  readonly call: OpeningLineCall | undefined
  readonly signal: AbortSignal
}

/** One per streamed response. `send` writes the line to the stream; `record` keeps the call's cost. */
export function openingLineHook(send: (text: string) => Promise<void>, record?: (call: OpeningLineCall) => void): OpeningLineHook {
  let text = '', closed = false, call: OpeningLineCall | undefined
  const controller = new AbortController()
  return {
    async release(line) {
      if (closed || text || !line) return false
      text = line
      await send(line + OPENING_LINE_BREAK)
      return true
    },
    spent(made) { call = made; record?.(made) },
    close() { if (!closed) { closed = true; controller.abort() } },
    get text() { return text },
    get call() { return call },
    get signal() { return controller.signal },
  }
}

export interface OpeningLineRequest {
  model: LanguageModel
  question: string
  /** Fixed step labels of the round-1 lookups ("Reading their speeches"); no arguments and no results. */
  reading: string[]
  hook: OpeningLineHook
  stats: { reservedCostUsd?: number }
  dailyBudget: ResearchDailyBudget
  inputPrice: number; outputPrice: number
  /** The research request's own signal. */
  signal?: AbortSignal
  wallMs?: number
}

/** Asks for the line and shows it if it is in time. Resolves when the call has ended; never rejects. */
export async function requestOpeningLine(request: OpeningLineRequest): Promise<void> {
  const { hook } = request
  if (hook.signal.aborted || hook.text || request.signal?.aborted) return
  const prompt = openingLinePrompt(request.question, request.reading)
  const inputTokens = Math.ceil((prompt.length + OPENING_LINE_INSTRUCTIONS.length) / 3) + 64
  let reservation
  try { reservation = await reserveQuestionTurn(request.stats, researchTurnReservationUsd(inputTokens, OPENING_LINE_OUTPUT_TOKENS, request.inputPrice, request.outputPrice), request.dailyBudget) } catch { return }
  if (!reservation) return
  const controller = new AbortController(), abort = () => controller.abort()
  hook.signal.addEventListener('abort', abort, { once: true }); request.signal?.addEventListener('abort', abort, { once: true })
  if (hook.signal.aborted || request.signal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new DOMException('Opening line wall cap', 'TimeoutError')), request.wallMs ?? OPENING_LINE_MS)
  const started = Date.now()
  let receipt: number | undefined, cost: number | null = null, shown = false
  try {
    const result = await generateText({ model: request.model, instructions: OPENING_LINE_INSTRUCTIONS, prompt, maxRetries: 0, abortSignal: controller.signal, maxOutputTokens: OPENING_LINE_OUTPUT_TOKENS })
    const billed = (result.providerMetadata?.openrouter as { usage?: { cost?: unknown } } | undefined)?.usage?.cost
    if (typeof billed === 'number' && Number.isFinite(billed) && billed >= 0) receipt = billed
    cost = receipt ?? ((result.usage.inputTokens ?? inputTokens) * request.inputPrice + (result.usage.outputTokens ?? OPENING_LINE_OUTPUT_TOKENS) * request.outputPrice) / 1e6
    // A line cut off at the output ceiling is not a sentence; a complete one is shown exactly as written.
    const line = result.finishReason === 'stop' ? result.text.trim() : ''
    if (line && !controller.signal.aborted) shown = await hook.release(line)
  } catch { /* a provider error, a timeout or a closed stream: no line, and the answer streams as it does without one */ }
  finally {
    clearTimeout(timer)
    hook.signal.removeEventListener('abort', abort); request.signal?.removeEventListener('abort', abort)
    // Only a provider receipt permits a refund; a call with unknown cost keeps its ceiling charged.
    await reservation.settle(receipt).catch(() => {})
    try { hook.spent({ ms: Date.now() - started, cost_usd: cost, shown }) } catch { /* telemetry only */ }
  }
}

type Payload = Record<string, unknown>
const ranges = (citations: unknown, by: number): Record<string, [number, number][]> => Object.fromEntries(Object.entries(citations && typeof citations === 'object' && !Array.isArray(citations) ? citations as Record<string, unknown> : {})
  .map(([id, list]) => [id, Array.isArray(list) ? list.map(range => Array.isArray(range) ? [Number(range[0]) + by, Number(range[1]) + by] as [number, number] : range as [number, number]) : list as [number, number][]]))

/** The answer with the shown line as its first paragraph. Citation ranges (code points) move with the text. */
export function withOpeningLine<T extends Payload>(payload: T, line: string, call?: OpeningLineCall): T {
  if (!line || typeof payload.answer !== 'string') return payload
  const lead = line + OPENING_LINE_BREAK
  const research = payload.research && typeof payload.research === 'object' && call ? { research: { ...payload.research as object, [OPENING_LINE_LABEL]: { ms: call.ms, cost_usd: call.cost_usd } } } : {}
  return { ...payload, answer: lead + payload.answer, ...(payload.citations === undefined ? {} : { citations: ranges(payload.citations, Array.from(lead).length) }), opening_line: line, ...research }
}

/** The shown line of a payload built by withOpeningLine, or '' for any other payload. */
export const openingLineOf = (payload: Payload): string => typeof payload.opening_line === 'string' && payload.opening_line && typeof payload.answer === 'string' && payload.answer.startsWith(payload.opening_line + OPENING_LINE_BREAK) ? payload.opening_line : ''

/** The answer as it was before withOpeningLine, for the answer checks. */
export function withoutOpeningLine<T extends Payload>(payload: T): T {
  const line = openingLineOf(payload)
  if (!line) return payload
  const lead = line + OPENING_LINE_BREAK, { opening_line: _line, ...rest } = payload
  return { ...rest, answer: (payload.answer as string).slice(lead.length), ...(payload.citations === undefined ? {} : { citations: ranges(payload.citations, -Array.from(lead).length) }) } as unknown as T
}
