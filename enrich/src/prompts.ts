// Every prompt the Worker sends, in one place.
//
// The wording is a port of the two Codex runners' prompts:
//   summary: summary_prompt()  in scripts/codex_enrichment_loop.py
//   topics:  label_prompt()    in scripts/codex_enrichment_loop.py (taxonomy from scripts/arag_enrich.py)
// The Codex versions batch many records into one JSON object keyed by rid. Here a
// call carries ONE record and returns {"summary": ..., "topics": [...]}, or just
// the one key when only one task is outstanding for that record.

import { TOPICS } from './topics.ts'

export type Task = 'summary' | 'topics'

export interface PromptRecord {
  kind: string
  title: string
  state?: string | null
  party?: string | null
  words: number
  /** Already clipped (text.clip). */
  text: string
}

export const SYSTEM_PROMPT =
  'You write neutral, factual briefs and topic labels for OPAX, an Australian parliamentary accountability site. ' +
  'You answer with a single JSON object and nothing else: no prose before or after it, no code fences. ' +
  'Do not call tools or external APIs.'

// Ported word for word from summary_prompt(), with "every rid below ... Each value" made singular.
const SUMMARY_INSTRUCTIONS =
  "Write a brief of the Australian public record below for OPAX. The record identifies its kind; it may be a parliamentary speech or an official government transcript or release.\n" +
  "The brief must be one compact sentence, normally 25 to 75 words (a short question or procedural record may use 8 to 24 words), neutrally stating what was argued, announced, asked, answered, moved, or reported. " +
  "Use only this record's supplied text. Do not name or infer the speaker from the title: start directly with an action such as 'Asked', 'Argued', 'Announced', 'Moved', 'Reported', or 'Paid tribute'. " +
  "When several speakers appear, describe the proceeding neutrally; for questions and answers use 'Asked whether ...; the minister said ...'. " +
  "Write years in full: do not shorten 2026 to 2027 into 2026-27. " +
  "Preserve the source's tense and status exactly, especially 'will announce' versus 'announced'. " +
  "Preserve at most three useful concrete positions, figures, bill names, people, organisations, programs, or places. " +
  "Use neutral verbs and include only directly supported claims. Every figure in the brief must appear in the supplied text. " +
  "Never start with 'In this speech', 'This speech', 'This release', or 'The speaker says'. " +
  "Summarise rather than quote, use plain ASCII punctuation (straight quotes and hyphens only), and stay below 600 characters."

// Ported word for word from label_prompt(), with "every rid" made singular.
const TOPIC_INSTRUCTIONS =
  "Classify the Australian parliamentary speech below for OPAX. " +
  "Choose zero to three topic slugs from the taxonomy, based on the actual speech text rather than its title. " +
  "A topic must be a substantive subject of the speech: do not label incidental mentions, quoted remarks, passing examples, parliamentary insults or personal attacks. " +
  "General economic projections do not qualify as tax-budget unless the speech substantively discusses taxation, a budget, deficits or fiscal policy. " +
  "General employment figures do not qualify as unions-workplace unless the speech substantively discusses industrial relations, unions, wages, safety or employment conditions. " +
  "Be conservative and use [] for procedural, tribute, condolence, thin text, or any uncertain match."

export const taxonomyBlock = (): string => TOPICS.map(([slug, description]) => `- ${slug}: ${description}`).join('\n')

const recordJson = (record: PromptRecord): string =>
  JSON.stringify(
    { kind: record.kind, title: record.title, state: record.state ?? null, party: record.party ?? null, words: record.words, text: record.text },
    null,
    0,
  )

/** The user message for the tasks still outstanding on one record. */
export function buildUserPrompt(record: PromptRecord, tasks: readonly Task[], complaints: readonly string[] = []): string {
  const wantSummary = tasks.includes('summary')
  const wantTopics = tasks.includes('topics')
  const shape = wantSummary && wantTopics ? '{"summary": "<the brief>", "topics": ["<slug>", ...]}' : wantSummary ? '{"summary": "<the brief>"}' : '{"topics": ["<slug>", ...]}'
  const parts: string[] = []
  if (wantSummary) parts.push(`${wantTopics ? 'TASK 1 - "summary". ' : ''}${SUMMARY_INSTRUCTIONS}`)
  if (wantTopics) parts.push(`${wantSummary ? 'TASK 2 - "topics". ' : ''}${TOPIC_INSTRUCTIONS}`)
  parts.push(`Return only this JSON object, with no other text: ${shape}`)
  if (wantTopics) parts.push(`TAXONOMY\n${taxonomyBlock()}`)
  parts.push(`RECORD\n${recordJson(record)}`)
  let prompt = parts.join('\n\n')
  if (complaints.length) {
    // codex_enrichment_loop.main(): the validator's complaints go back with the retry.
    prompt +=
      '\n\nThe previous attempt failed these checks. Rewrite every value and return the complete object:\n- ' +
      complaints.slice(0, 20).join('\n- ')
  }
  return prompt
}

export function buildMessages(record: PromptRecord, tasks: readonly Task[], complaints: readonly string[] = []) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(record, tasks, complaints) },
  ]
}
