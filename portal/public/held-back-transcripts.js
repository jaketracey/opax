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

/** A list-only profile (roster_only: a member on a parliament's official list whose time in that chamber
 *  OPAX holds no Hansard for) says so where the speeches would be, instead of showing nothing or a zero. */
export const NO_HANSARD_HELD = 'No Hansard held for this period.';
export function noHansardHeldHTML(person) {
  if (!person?.roster_only) return '';
  return `<p class="person-no-hansard fineprint">${NO_HANSARD_HELD} This profile comes from the parliament’s member list; no speeches in the record are attributed to them.</p>`;
}
