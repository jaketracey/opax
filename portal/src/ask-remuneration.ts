/** Annual-report intent and display rules shared by retrieval and writing. */
export function agencyHeadRanking(question: string): boolean {
  // Reader text: reject oversized input before regex work. No lazy captures or optional tails.
  if (question.length > 4000) return false
  return /\b(?:highest|largest|biggest|top|most)\b/i.test(question) &&
    /\b(?:paid|pay|remuneration|salary)\b/i.test(question) &&
    /\b(?:agency heads?|departmental secretar(?:y|ies)|department secretar(?:y|ies)|public servants?)\b/i.test(question) &&
    !/\bnamed\b/i.test(question)
}

/** A head title, rather than a substring in a deputy's or functional officer's title. */
export function isAgencyHead(position: unknown): boolean {
  const title = String(position ?? '').slice(0, 400).toLowerCase().trim()
    .replace(/^(?:acting|interim|a\/g|former)\s+/, '').replace(/[–—-]/g, ' ')
  if (/\b(?:deputy|assistant|associate|second|chief financial|chief operating|chief investment|company secretary)\b/.test(title)) return false
  return /^(?:(?:group\s+)?(?:ceo|chief executive(?: officer)?|managing director)|md and ceo|secretary|director general|commissioner|chief commissioner|electoral commissioner|esafety commissioner|australian public service commissioner|australian statistician|auditor general|commonwealth ombudsman|inspector general)\b/.test(title)
}

/** Preserve initials we cannot expand; move an explicitly capitalised surname into reading order. */
export function remunerationName(value: unknown): string {
  const words = String(value ?? '').slice(0, 160).trim().split(/\s+/)
  while (['mr','mrs','ms','dr','prof','professor','sir','dame'].includes((words[0] ?? '').toLowerCase().replace(/\.$/, ''))) words.shift()
  let surname = 0
  while (surname < words.length && /^[\p{Lu}][\p{Lu}'’-]+$/u.test(words[surname])) surname++
  if (surname > 0 && surname < words.length && /\p{Ll}/u.test(words[surname])) {
    const given = words.slice(surname).filter(word => !/^[\p{Lu}]\.?$/u.test(word))
    return [...given, ...words.slice(0, surname).map(word => word.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase()))].join(' ')
  }
  return words.map(word => /^[\p{Lu}][\p{Lu}'’-]+$/u.test(word) ? word.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase()) : word).join(' ')
}
