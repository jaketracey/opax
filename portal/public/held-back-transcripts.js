/** Counts are keyed by the roster's verified person ID, never by a name. */
export function heldBackTranscriptsHTML(personId, counts) {
  const count = personId == null ? 0 : counts?.[String(personId)];
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  const text = `${count.toLocaleString('en-AU')} earlier transcript${count === 1 ? '' : 's'} include${count === 1 ? 's' : ''} this member alongside others and ${count === 1 ? "isn't" : "aren't"} counted yet.`;
  return `<p class="person-held-back fineprint"><a href="/methods#speaker-attribution">${text}</a></p>`;
}
