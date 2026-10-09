/** Shared URL spelling for browser renderers, exports and social publishers. */
import { PERSON_PATHS } from './person-paths.js?v=9b9d79f092';
export const personNameKey = name => String(name ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
export function entitySlug(name) {
  return String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// Never invent a profile from a display name. Unknown identities open the directory.
export const personUrl = name => PERSON_PATHS.exact[name] || PERSON_PATHS.folded[personNameKey(name)] || '/subject/person';
export const partyUrl = name => `/subject/party/${entitySlug(name)}`;
export const subjectUrl = (kind, name) => kind === 'person' ? personUrl(name)
  : kind === 'party' ? partyUrl(name) : `/subject/${kind}/${encodeURIComponent(name)}`;
