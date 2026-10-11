// Shared by the batch client and its admin write route. No model output is trusted.
import { readClassifications } from './classify.ts'
import { isHistoricSpeech } from './historic.ts'
import type { KbResource } from './kb.ts'
import { buildSystemPrompt, buildUserPrompt, type PromptRecord, type Task } from './prompts.ts'
import { clip, pickText, wordCount } from './text.ts'
import { cleanupSummary, hasNewPersonalName, NAMES_PROBLEM, validateSummary, validateTopics } from './validate.ts'

export const BATCH_MODEL = 'claude-haiku-5-5'
export const BATCH_INSTRUCTIONS = `BATCH VALIDATION REMINDERS
Begin the brief with an action verb and paraphrase the proceeding, including its opening; never copy the first 60 characters of the source. Use 8-80 words and 40-600 characters. Metadata is not evidence: dates, bill numbers and speaker identities must come from the text itself. Preserve the text's exact numeric notation, including spaces within numbers; do not consolidate separated digits or expand abbreviated financial years. Prefer omitting a nonessential figure to changing its notation. Avoid a comma immediately after a numeral. Describe private people by role. Return only the requested JSON keys.`

export function batchRecord(resource: KbResource, rid: string): PromptRecord {
  const text = pickText(resource.data?.texts)
  const tag = (key: string) => readClassifications(resource).find(c => c.labelset === key && !c.cancelled_by_user)?.label ?? null
  return { rid, slug: resource.slug ?? null, title: resource.title ?? '', kind: tag('kind') ?? 'speech', state: tag('state'), party: tag('party'), words: wordCount(text), text: clip(text), historic: isHistoricSpeech(resource), nameText: text }
}

export function batchMessages(record: PromptRecord, tasks: Task[], complaints: string[] = [], offendingTerms: string[] = []) {
  // The validation record retains metadata; the model needs only the unit's evidence.
  return { system: buildSystemPrompt(tasks, true) + '\n\n' + BATCH_INSTRUCTIONS,
    user: buildUserPrompt({ ...record, title: '', slug: null }, complaints, offendingTerms) }
}

export function validateBatchResult(record: PromptRecord, tasks: Task[], output: unknown) {
  const value = output as { summary?: unknown; topics?: unknown } | null
  const summary = typeof value?.summary === 'string' ? cleanupSummary(value.summary, record.text) : value?.summary
  const topic = validateTopics(value?.topics)
  const problems: string[] = []
  if (tasks.includes('summary')) {
    problems.push(...validateSummary(summary, { ...record, historic: true }))
    // Explicitly invoke the same novelty guard on full unit text, also used at write time.
    if (typeof summary === 'string' && hasNewPersonalName(summary, record.nameText ?? record.text) && !problems.includes(NAMES_PROBLEM)) problems.push(NAMES_PROBLEM)
  }
  if (tasks.includes('topics')) problems.push(...topic.problems)
  return { summary, topics: topic.topics, problems, valid: problems.length === 0 }
}

export async function hashValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value) ?? 'null')
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}
export const sourceHash = (record: PromptRecord) => hashValue(record)
