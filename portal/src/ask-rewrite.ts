/**
 * A follow-up in a conversation, rewritten as one standalone question so the
 * record can be searched on it (see standaloneQuestion in index.ts).
 *
 * The rewrite must never invent a question the reader did not ask. On 8 Oct
 * 2026 a reader typed "High" after an answer about David Pocock and housing;
 * the model, told to name the conversation's subject, handed back the
 * previous question word for word, and a paid answer to it came back under
 * "Understood as". So a message that carries nothing to search on is not
 * rewritten at all: it is answered, free, with a request for a full question
 * (and the model's best guess at one, when it has a different one to offer).
 */

export type ConversationTurn = { author?: string; text?: string }
/** null: search the words as typed. A string: the standalone question. */
export type FollowUpRewrite = string | null | { unclear: true; suggestion?: string }

export const REWRITE_SYSTEM = 'You rewrite follow-up messages as standalone questions. You output only the rewritten question and nothing else.'

/** Messages that are acknowledgement or noise, never a question: no model call. */
const FILLER = new Set(('ok okay k kk yes yeah yep yup ya yah no nope nah sure thanks thank you ty thx cheers ' +
  'hmm hm um umm uh er erm lol haha cool nice great good right fine wow huh oh ah interesting alright ' +
  'what so and but well test testing hi hello hey').split(' '))
const STRETCHED = /^(?:o+k+a*y*|h+m+|u+h+|u+m+|l+o+l+|a+h+|o+h+|h+a+(?:h+a+)*)$/
/** Asking for the same thing again is a real follow-up, even when it rewrites to the last question. */
const AGAIN = /\b(?:again|retry|redo|repeat|refresh|rerun|regenerate)\b/i
/** Words that change nothing about what a question is after. */
const STOP = new Set(('a an the of to in on for about and or is are was were be been has have had do does did ' +
  'what which who whom whose when where why how this that these those it its their his her they them he she ' +
  'please tell me us say said').split(' '))

const words = (text: string): string[] => text.toLowerCase().normalize('NFKD').match(/[\p{L}\p{N}]+/gu) ?? []

/** True when the message has no word that could carry a question ("ok", "?", "thanks"). */
export function contentFree(question: string): boolean {
  return words(question).every((w) => FILLER.has(w) || STRETCHED.test(w))
}

/** Two questions that ask the same thing, whatever their punctuation, case or filler words. */
export function sameQuestion(a: string, b: string): boolean {
  const flat = (t: string) => words(t).join(' ')
  if (!flat(a) || !flat(b)) return false
  if (flat(a) === flat(b)) return true
  const content = (t: string) => [...new Set(words(t).filter((w) => !STOP.has(w)))].sort().join(' ')
  return !!content(a) && content(a) === content(b)
}

/** The reader's last question before this message, as the conversation carried it. */
export function previousQuestion(turns: ConversationTurn[]): string {
  const last = [...turns].reverse().find((t) => t.author !== 'answer' && typeof t.text === 'string' && t.text.trim())
  return last ? String(last.text).replace(/\s+/g, ' ').trim() : ''
}

export function rewritePrompt(transcript: string): string {
  return (
    `Conversation so far:\n${transcript}\n\n` +
    'Rewrite the reader\'s latest message, given below, as ONE standalone question about the Australian public record that names its subject explicitly - the person, organisation, program, place or topic the conversation is about - so the record can be searched on it alone. ' +
    'Keep the reader\'s intent, and keep any names, dates, places, figures and other specifics they gave. Keep their own wording wherever it already stands alone; add nothing the conversation does not contain; do not answer, judge, soften or comment. ' +
    'A message about the conversation itself (who or what are we talking about, look again) becomes a question about the conversation\'s subject. ' +
    'A message asking for more (is that all, anything else, what else, more, go on) becomes a question asking what ELSE the subject said or did on the topic, beyond the points the last answer already gave, naming those points briefly so they are not repeated. ' +
    'If the message already names its subject and stands on its own, return it exactly as written. ' +
    'If the message does not say what the reader wants to know - a lone word that is not a name, place, party, year or topic, an acknowledgement, or a fragment whose meaning you would have to guess - do NOT repeat an earlier question in its place: return UNCLEAR, optionally followed by a colon and the one full question you think they most likely meant, if it is a different question from any already asked. ' +
    'Return only the question (or UNCLEAR), on one line, with no quotation marks or preamble.\n\n' +
    'Examples, where the conversation so far was about Barnaby Joyce and grants:\n' +
    '"no he has been in tons of grants, look more" -> What grants has Barnaby Joyce been involved in?\n' +
    '"who are we talking about?" -> Who is Barnaby Joyce?\n' +
    '"is that all?" (after an answer listing drought grants and a dam grant) -> What else has Barnaby Joyce been involved in with grants, beyond the drought grants and the dam grant already given?\n' +
    '"and in 2019?" -> What grants was Barnaby Joyce involved in during 2019?\n' +
    '"and Labor?" -> What grants have Labor members been involved in?\n' +
    '"high" -> UNCLEAR\n' +
    '"blue" -> UNCLEAR\n' +
    '"What did Pauline Hanson say about housing affordability?" -> What did Pauline Hanson say about housing affordability?\n\n' +
    'Latest reader message: {question}'
  ).replace(/[{}]/g, (brace) => brace === '{' ? '{{' : '}}').replace('{{question}}', '{question}')
}

/** The model's line, read against the message and the question before it. */
export function readRewrite(raw: string | null | undefined, question: string, previous: string): FollowUpRewrite {
  const unquote = (t: string) => t.replace(/\s+/g, ' ').trim().replace(/^["“'‘]+|["”'’]+$/g, '').trim()
  const text = unquote(raw ?? '')
  const unclear = /^unclear\b[\s:.\-–—]*(.*)$/i.exec(text)
  if (unclear) {
    const guess = unquote(unclear[1])
    const useful = guess.length >= 8 && guess.length <= 400 && !sameQuestion(guess, question) && !(previous && sameQuestion(guess, previous))
    return useful ? { unclear: true, suggestion: guess } : { unclear: true }
  }
  if (!text || text.length > 400 || text.length < 4) return null
  if (text.toLowerCase() === question.toLowerCase()) return null
  // The incident: a message that was not the last question came back as it.
  if (previous && sameQuestion(text, previous) && !sameQuestion(question, previous) && !AGAIN.test(question)) return { unclear: true }
  return text
}

/**
 * The latest message as a standalone question, through `generate` (one small
 * model call given the prompt's user text; null on failure). A message that
 * is already standalone, or a failed call, is null; a message with nothing to
 * search on is { unclear }.
 */
export async function rewriteFollowUp(
  input: { question?: string; context?: ConversationTurn[] },
  generate: (user: string, question: string) => Promise<string | null>,
): Promise<FollowUpRewrite> {
  const question = String(input.question ?? '').replace(/\s+/g, ' ').trim()
  const turns = (input.context ?? [])
    .filter((t) => typeof t?.text === 'string' && t.text.trim().length > 0)
    .slice(-8)
  if (!question || question.length > 2000 || !turns.some((t) => t.author !== 'answer')) return null
  if (contentFree(question)) return { unclear: true }
  const transcript = turns
    .map((t) => `${t.author === 'answer' ? 'Answer' : 'Reader'}: ${String(t.text).replace(/\s+/g, ' ').trim().slice(0, 1500)}`)
    .join('\n')
  let raw: string | null
  try { raw = await generate(rewritePrompt(transcript), question) } catch { return null }
  return readRewrite(raw, question, previousQuestion(turns))
}

/**
 * The free answer to a message with nothing to search on. `answer` reads on
 * its own (older apps show it as an answer); newer clients show
 * `answer_status: 'needs_question'` as a prompt, with `suggested_question` as
 * a tappable rewrite when there is one.
 */
export function clarifyPayload(question: string, suggestion?: string) {
  const said = String(question ?? '').replace(/\s+/g, ' ').trim()
  const opening = /[\p{L}\p{N}]/u.test(said) && said.length <= 60
    ? `“${said}” doesn’t say enough to search the record on.`
    : 'That doesn’t say enough to search the record on.'
  return {
    answer: suggestion ? `${opening} Did you mean: ${suggestion}` : `${opening} Ask a full question, naming the person, party or topic you mean.`,
    citations: {} as Record<string, never>,
    sources: [] as never[],
    answer_status: 'needs_question' as const,
    ...(suggestion ? { suggested_question: suggestion } : {}),
  }
}
