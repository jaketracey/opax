/**
 * "Ask about …" drafts (journeys/ask.md 6). Each goes through `useOpenAsk`,
 * starts a new conversation and is never sent for the reader.
 */
export function scopedQuestion(
  kind: 'person' | 'bill' | 'party' | 'electorate',
  name: string,
  topic = '',
) {
  if (kind === 'person')
    return {
      question: topic.trim()
        ? `What did ${name} say about ${topic.trim()}?`
        : `What has ${name} said in parliament this year?`,
      speaker: name,
      kind: 'speech',
    };
  if (kind === 'bill')
    return { question: `What did parliament say about the ${name}?` };
  if (kind === 'party')
    return {
      question: `What have ${name} members said in parliament this year?`,
    };
  return { question: `What has parliament said about ${name}?` };
}
