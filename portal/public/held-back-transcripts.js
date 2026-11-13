/** Counts are keyed by the roster's verified person ID, never by a name. Both notes sit with the
 *  person's speeches, the section they qualify, never in the page head. */
export function heldBackTranscriptsHTML(personId, counts) {
  const count = personId == null ? 0 : counts?.[String(personId)];
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  const one = count === 1;
  const text = `${count.toLocaleString('en-AU')} earlier transcript${one ? '' : 's'} also record${one ? 's' : ''} this member, alongside other speakers. ${one ? 'It joins' : 'They join'} these speeches once each speaker’s words are separated.`;
  return `<p class="person-held-back fineprint"><a href="/methods#speaker-attribution">${text}</a></p>`;
}

export function chairRoleTranscriptsHTML(personId, counts) {
  const count = personId == null ? 0 : counts?.[String(personId)];
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  const one = count === 1;
  const text = `${count.toLocaleString('en-AU')} transcript${one ? '' : 's'} record${one ? 's' : ''} this member presiding in the chair. ${one ? 'It is' : 'They are'} kept apart from their own speeches.`;
  return `<p class="person-chair-role fineprint"><a href="/methods#speaker-attribution">${text}</a></p>`;
}
