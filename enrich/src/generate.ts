// One record, up to three model attempts: primary, primary again with the
// validator's complaints, then the escalation model with the same complaints.
// Nothing here touches the knowledge box; it turns text into validated values.

import { neuronsFor } from './budget.ts'
import { extractJsonObject, readModelReply } from './extract.ts'
import { buildMessages, type PromptRecord, type Task } from './prompts.ts'
import { normaliseTypography, validateSummary, validateTopics } from './validate.ts'
import type { AiLike } from './env.ts'

export const MAX_ATTEMPTS = 3

export interface GenerationSpend {
  model: string
  neurons: number
  promptTokens: number
  completionTokens: number
}

export interface TaskResult {
  /** Accepted value: the brief text, or the topic slugs. */
  value?: string | string[]
  /** How many model outputs were rejected for this task. */
  rejected: number
  /** Model that produced the accepted value, or the last one tried. */
  model: string
  neurons: number
  /** Validator complaints from the last failed attempt (for quarantine diagnostics). */
  complaints: string[]
}

export interface Generation {
  results: Record<Task, TaskResult | undefined>
  /** Set when the run was cut short (budget, tick deadline, model unavailable) before every task was settled. */
  incomplete: boolean
  /** Set when a model call failed for reasons that are not the record's fault; solved tasks are still returned. */
  unavailable?: ModelUnavailable
}

/** The model call failed for reasons that are not the record's fault (capacity, timeout, quota). */
export class ModelUnavailable extends Error {
  readonly quota: boolean
  constructor(message: string, quota: boolean) {
    super(message)
    this.name = 'ModelUnavailable'
    this.quota = quota
  }
}

/** Workers AI: "you have used up your daily free allocation of 10,000 neurons" (error 4006). */
export const isQuotaError = (message: string): boolean => /daily free allocation|4006|exceeded.*(?:quota|allocation)/i.test(message)

/**
 * The request body for a model. qwen3 reasons by default and can spend all of
 * max_tokens inside `reasoning` (probed 2026-09-28), so thinking is switched
 * off; gpt-oss is held to low reasoning effort. Other models get the plain body.
 */
export function requestBody(model: string, messages: Array<{ role: string; content: string }>, maxTokens: number): Record<string, unknown> {
  const body: Record<string, unknown> = { messages, max_tokens: maxTokens, temperature: 0.2 }
  if (/qwen3/i.test(model)) body.chat_template_kwargs = { enable_thinking: false }
  else if (/gpt-oss/i.test(model)) body.reasoning_effort = 'low'
  return body
}

export interface GenerateOptions {
  ai: AiLike
  record: PromptRecord
  tasks: readonly Task[]
  primaryModel: string
  escalationModel: string
  maxTokens: number
  /** Called after every model call, so spend is booked even if a later step fails. */
  onSpend: (spend: GenerationSpend) => Promise<void>
  /** Called for every task whose output the validator rejected (attempt is 1-based). */
  onReject?: (info: { task: Task; model: string; attempt: number; reasons: string[]; sample: string }) => Promise<void>
  /** Polled before each attempt: false stops the run (daily budget, tick deadline). */
  mayContinue: () => boolean
}

export async function generate(opts: GenerateOptions): Promise<Generation> {
  const { record, tasks } = opts
  const models = [opts.primaryModel, opts.primaryModel, opts.escalationModel]
  const results: Record<Task, TaskResult | undefined> = { summary: undefined, topics: undefined }
  for (const t of tasks) results[t] = { rejected: 0, model: opts.primaryModel, neurons: 0, complaints: [] }

  let complaints: string[] = []
  let outstanding: Task[] = [...tasks]

  for (let attempt = 0; attempt < MAX_ATTEMPTS && outstanding.length > 0; attempt += 1) {
    if (!opts.mayContinue()) return { results, incomplete: true }
    const model = models[attempt]
    const messages = buildMessages(record, outstanding, complaints)
    const body = requestBody(model, messages, opts.maxTokens)

    let response: unknown
    try {
      response = await opts.ai.run(model, body)
    } catch (err) {
      const message = String((err as Error)?.message ?? err)
      return { results, incomplete: true, unavailable: new ModelUnavailable(`${model}: ${message}`.slice(0, 400), isQuotaError(message)) }
    }

    const reply = readModelReply(response)
    const promptChars = messages.reduce((n, m) => n + m.content.length, 0)
    const cost = neuronsFor(model, reply.usage, promptChars, reply.text.length)
    await opts.onSpend({ model, neurons: cost.neurons, promptTokens: reply.usage.promptTokens ?? 0, completionTokens: reply.usage.completionTokens ?? 0 })

    // The call is shared by the tasks still outstanding.
    const share = cost.neurons / outstanding.length
    for (const t of outstanding) {
      const r = results[t]!
      r.neurons += share
      r.model = model
    }

    const parsed = extractJsonObject(reply.text, outstanding)
    const found: Partial<Record<Task, string | string[]>> = {}
    const next: string[] = []
    const failed: Task[] = []

    if (!parsed) {
      next.push(
        reply.finishReason === 'length'
          ? 'The reply was cut off before the JSON object finished; keep it short and return the complete object.'
          : 'The reply was not a single JSON object; return only the JSON object described.',
      )
      failed.push(...outstanding)
    } else {
      for (const t of outstanding) {
        if (t === 'summary') {
          const raw = parsed.summary
          const cleaned = typeof raw === 'string' ? normaliseTypography(raw).split(/\s+/).filter(Boolean).join(' ') : raw
          const problems = validateSummary(cleaned, { title: record.title, text: record.text })
          if (problems.length === 0) found.summary = cleaned as string
          else {
            failed.push('summary')
            next.push(...problems.map((p) => `summary: ${p}`))
          }
        } else {
          const verdict = validateTopics(parsed.topics)
          if (verdict.problems.length === 0) found.topics = verdict.topics
          else {
            failed.push('topics')
            next.push(...verdict.problems.map((p) => `topics: ${p}`))
          }
        }
      }
    }

    for (const t of outstanding) {
      const r = results[t]!
      if (t in found) r.value = found[t]
      else {
        r.rejected += 1
        r.complaints = next
        await opts.onReject?.({ task: t, model, attempt: attempt + 1, reasons: next.filter((c) => !c.includes(':') || c.startsWith(`${t}:`)), sample: reply.text })
      }
    }
    outstanding = failed
    complaints = next
  }
  return { results, incomplete: false }
}
