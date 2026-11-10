/** A person supplied in question grammar, before roster matching. Party comparisons are collective subjects. */
export function requestedPersonSlot(question: string): string | null {
  const patterns = [
    /\b(?:did|does|has|have|will|how['’]d|what['’]d)\s+(.+?)\s+(?:vot\w*|say|said|speak\w*|spoken|declare\w*|represent)\b/i,
    /^\s*(.+?)\s+declare[ds]?\s+(?:real estate|interests?|gifts?|shareholdings)\b/i,
    /^\s*(.+?)(?:['’]s)?\s+(?:shareholdings|directorships|register of interests)\s*[?!]*$/i,
    /\b(?:speeches|remarks|statements|votes)\s+(?:by|from|of)\s+(.+?)(?=\s+(?:about|on|in|since|until)\b|[?!]|$)/i,
  ]
  for (const pattern of patterns) {
    const value = pattern.exec(question)?.[1]?.replace(/^(?:senator|MP|Mr|Mrs|Ms|Dr)\s+/i, '').trim()
    if (value && value.split(/\s+/).length <= 5 && /^[\p{L}'’ -]+$/u.test(value) && !/\b(?:and|or|party|parties|Labor|Liberal|Nationals|Greens|parliament|senate|house|members|records|government|opposition)\b/i.test(value)) return value
  }
  return null
}
