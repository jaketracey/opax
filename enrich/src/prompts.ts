// Every prompt the Worker sends, in one place.
//
// The wording is the bake-off's system prompt (2026-09-28, scratchpad/bakeoff/bake.py
// build_system), itself a port of the two Codex runners' prompts:
//   summary: summary_prompt()  in scripts/codex_enrichment_loop.py
//   topics:  label_prompt()    in scripts/codex_enrichment_loop.py (taxonomy from scripts/arag_enrich.py)
// One call carries ONE record and returns {"summary": ..., "topics": [...]}; when only one
// task is outstanding (a retry after the other passed) the prompt asks for just that key.
// With both tasks the system prompt is byte-identical to the bake-off's (test/fixtures).

import { TOPICS } from './topics.ts'

export type Task = 'summary' | 'topics'

export interface PromptRecord {
  rid: string
  slug?: string | null
  kind: string
  title: string
  state?: string | null
  party?: string | null
  words: number
  /** Already clipped (text.clip). */
  text: string
}

const INTRO =
  'You enrich Australian public records for OPAX. The record you are given identifies its kind; it may be a parliamentary speech or an official government transcript or release.'

const SUMMARY_SECTION = `SUMMARY
Write a brief as one compact sentence, normally 25 to 75 words (a short question or procedural record may use 8 to 24 words), neutrally stating what was argued, announced, asked, answered, moved, or reported. Use only the supplied text and never carry a speaker, claim, or figure in from elsewhere. Do not name or infer the speaker from the title: start directly with an action such as 'Asked', 'Argued', 'Announced', 'Moved', 'Reported', or 'Paid tribute'. When several speakers appear, describe the proceeding neutrally; for questions and answers use 'Asked whether ...; the minister said ...'. Write years in full: do not shorten 2026 to 2027 into 2026-27. Preserve the source's tense and status exactly, especially 'will announce' versus 'announced'. Preserve at most three useful concrete positions, figures, bill names, people, organisations, programs, or places. Use neutral verbs and include only directly supported claims. Never start with 'In this speech', 'This speech', 'This release', or 'The speaker says'. Summarise rather than quote, use plain ASCII punctuation, and stay below 600 characters.`

const TOPICS_SECTION = `TOPICS
Choose zero to three topic slugs from the taxonomy below, based on the actual speech text rather than its title. A topic must be a substantive subject of the speech: do not label incidental mentions, quoted remarks, passing examples, parliamentary insults or personal attacks. General economic projections do not qualify as tax-budget unless the speech substantively discusses taxation, a budget, deficits or fiscal policy. General employment figures do not qualify as unions-workplace unless the speech substantively discusses industrial relations, unions, wages, safety or employment conditions. Be conservative and use [] for procedural, tribute, condolence, thin text, or any uncertain match.`

export const taxonomyBlock = (): string => TOPICS.map(([slug, description]) => `- ${slug}: ${description}`).join('\n')

const keysLine = (tasks: readonly Task[]): string =>
  tasks.length === 2 ? 'Return one JSON object with exactly two keys: "summary" and "topics".' : `Return one JSON object with exactly one key: "${tasks[0]}".`

const shapeLine = (tasks: readonly Task[]): string =>
  tasks.length === 2 ? '{"summary": "<one sentence>", "topics": ["<slug>", ...]}' : tasks[0] === 'summary' ? '{"summary": "<one sentence>"}' : '{"topics": ["<slug>", ...]}'

/** The system message for the tasks outstanding on a record (bake-off build_system when both). */
export function buildSystemPrompt(tasks: readonly Task[]): string {
  const wantSummary = tasks.includes('summary')
  const wantTopics = tasks.includes('topics')
  const ordered: Task[] = [...(wantSummary ? (['summary'] as const) : []), ...(wantTopics ? (['topics'] as const) : [])]
  const sections: string[] = []
  if (wantSummary) sections.push(SUMMARY_SECTION)
  if (wantTopics) sections.push(TOPICS_SECTION, `TAXONOMY\n${taxonomyBlock()}`)
  sections.push(
    `OUTPUT\nReturn only the JSON object, with no markdown fences and no commentary, in exactly this shape:\n${shapeLine(ordered)}\nDo not call tools or external APIs.`,
  )
  return `${INTRO} ${keysLine(ordered)}\n\n${sections.join('\n\n')}`
}

/** bake.build_user: "RECORD\n" plus the record as compact JSON. */
export function buildRecordMessage(record: PromptRecord): string {
  return `RECORD\n${JSON.stringify({
    rid: record.rid,
    slug: record.slug ?? null,
    title: record.title,
    kind: record.kind,
    state: record.state ?? null,
    party: record.party ?? null,
    words: record.words,
    text: record.text,
  })}`
}

/** The user message: the record, plus (on a retry) the validator's complaints. */
export function buildUserPrompt(record: PromptRecord, complaints: readonly string[] = []): string {
  let prompt = buildRecordMessage(record)
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
    { role: 'system', content: buildSystemPrompt(tasks) },
    { role: 'user', content: buildUserPrompt(record, complaints) },
  ]
}
