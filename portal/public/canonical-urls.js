/** Shared URL spelling for browser renderers, exports and social publishers. */
export function entitySlug(name) {
  return String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const personUrl = name => `/subject/person/${entitySlug(name)}`;
export const partyUrl = name => `/subject/party/${entitySlug(name)}`;
export const subjectUrl = (kind, name) => kind === 'person' ? personUrl(name)
  : kind === 'party' ? partyUrl(name) : `/subject/${kind}/${encodeURIComponent(name)}`;
