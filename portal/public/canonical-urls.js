/** Shared URL spelling for browser renderers, exports and social publishers. */
import { PERSON_PATHS } from './person-paths.js?v=83822a4846';
// The Worker reads PERSON_PATHS through this module too, so its bundle holds one copy of the
// table: importing person-paths bare from src and stamped from here made two modules of it.
export { PERSON_PATHS };
export const personNameKey = name => String(name ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
export function entitySlug(name) {
  return String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// Never invent a profile from a display name. Unknown identities open the directory.
export const personUrl = name => PERSON_PATHS.exact[name] || PERSON_PATHS.folded[personNameKey(name)] || '/subject/person';
/** Every name a renamed party was recorded under, to its current name: one page, one address.
 *  The same parties and names as labels.js PARTY_RENAMES (checked by tests/party-rename.test.mjs);
 *  kept here so this module does not load the label tables. Old addresses still answer: the
 *  Worker sends them to the current one with a 301. */
export const PARTY_URL_RENAMES = {
  'liberal democratic party': 'Libertarian Party', 'liberal democrats': 'Libertarian Party',
  'libertarian party (formerly liberal democrats)': 'Libertarian Party', 'libertarian (formerly liberal democrats)': 'Libertarian Party',
};
export const partyUrl = name => `/subject/party/${entitySlug(PARTY_URL_RENAMES[personNameKey(name)] || name)}`;
export const subjectUrl = (kind, name) => kind === 'person' ? personUrl(name)
  : kind === 'party' ? partyUrl(name) : `/subject/${kind}/${encodeURIComponent(name)}`;
