/** A research or final-answer turn that came back as plain prose instead of a tool call. The SDK reports it as a tool
 * choice violation ("malformed_args"); the prose is often a complete answer, and Ask uses it rather than show nothing. */

/** The text parts of a model turn's content, joined. Reasoning and tool parts are not answer text. */
export function modelProse(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.filter(part => !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string')
    .map(part => (part as { text: string }).text).join('').trim()
}

// Tool calls written out as text (DeepSeek's DSML markers, XML-style tags, a JSON call) are not an answer, nor is an
// answer object written as reply text (its points are read and checked as the answer instead).
const TOOL_MARKUP = /<\/?(?:tool_calls?|function_calls?|invoke|parameter|tool)\b|<｜|<\|(?:tool|im_|start|end)|\bfunction_call\b|"(?:name|arguments|tool_calls?|tool|parameters|points|facts|claim)"\s*:|```/i
// A plan for the next step ("Let me search the record first.") is not an answer either.
const PLAN = /^(?:i(?:'ll|’ll| will| shall| need to| should| must| am going to|'m going to|’m going to| am (?:searching|looking|checking)|'m (?:searching|looking|checking)|’m (?:searching|looking|checking))\b|let me\b|let['’]s\b|first,? (?:i|let)\b|to answer (?:this|that|the question),? i\b|searching\b|looking (?:up|into)\b|now,? i\b|next,? i\b|okay\b|ok[,.]|sure\b|alright\b)/i
// Nor a refusal or a line that only says the record could not answer.
const REFUSAL = /^(?:i(?:['’]m| am)? ?(?:sorry|unable|not able)|i (?:can(?:no|['’])t|cannot|do not|don['’]t) (?:answer|help|provide|find|access|have)|as an ai\b|sorry\b)/i
const LIMITATION = /\b(?:no (?:public |matching )?records?|(?:could|can) ?not (?:find|answer|establish|identify)|does not (?:establish|show|identify|hold)|do not (?:establish|show|identify|hold)|no (?:answer|information|passages?)|unable to|not enough (?:evidence|information))\b/i
const MAX_CHARS = 8000

/** The prose as an answer, or null when it is not one: tool markup, a plan, a refusal, a limitation alone, or too short
 * to say anything. Hidden reasoning tags are dropped; a very long reply is cut at a sentence end. */
export function usableProse(raw: string): string | null {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim()
  if (!text || TOOL_MARKUP.test(text) || /^[[{]/.test(text)) return null
  if (PLAN.test(text) || REFUSAL.test(text)) return null
  if (text.length > MAX_CHARS) {
    const cut = text.slice(0, MAX_CHARS), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
    text = (end > MAX_CHARS / 2 ? cut.slice(0, end + 1) : cut).trim()
  }
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? []
  if (words.length < 8 || text.length < 40 || !/[.!?]["”’)\]]*(?:\s|$)/.test(text)) return null
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^[-*•#\s]+/, '').trim()).filter(s => /[\p{L}\p{N}]/u.test(s))
  if (sentences.every(s => LIMITATION.test(s))) return null
  return text
}
