// Port of portal/public/donor-entity.js isOrganisationDonor, with the same
// word list and acronym rule. As on the web, it is a data-quality check and
// never a publication gate: every donor is named as its graph names it (Jake,
// 12 Oct). The app uses it only where a name alone must stand for an
// organisation, such as a Wikipedia search from a donor's record.
//
// Organisation evidence is a legal-form or organisation word as a whole token
// in the label or an alias, a trailing "Co", or a label that is one acronym of
// 3-7 capitals. An alias is never an acronym (it can be a person's initials),
// and ABN, ACN, ARBN and TFN are registration words, not names.

const ORGANISATION_WORDS = [
  'pty',
  'ltd',
  'limited',
  'proprietary',
  'inc',
  'incorporated',
  'corporation',
  'corp',
  'company',
  'co-operative',
  'cooperative',
  'co-op',
  'association',
  'union',
  'unions',
  'federation',
  'council',
  'trust',
  'foundation',
  'institute',
  'society',
  'club',
  'clubs',
  'party',
  'committee',
  'fund',
  'holdings',
  'group',
  'partners',
  'llp',
  'bank',
  'authority',
  'chamber',
  'alliance',
  'network',
  'services',
  'enterprises',
  'industries',
  'lawyers',
  'university',
  'college',
  'guild',
  'trades\\s+hall',
];
const ORGANISATION_WORD = new RegExp(
  `(?:^|[^a-z0-9])(?:${ORGANISATION_WORDS.join('|')})(?=$|[^a-z0-9])`,
  'i',
);
// "& Co" or "Pastoral Co" as the last word; "Co" elsewhere is too often part of a name.
const TRAILING_CO = /(?:^|[^a-z0-9])co\.?\s*$/i;
// A label that is one all-capitals token of 3-7 letters, such as "CFMEU".
const ACRONYM = /^[A-Z]{3,7}$/;
const REGISTRATION_WORDS = new Set(['ABN', 'ACN', 'ARBN', 'TFN']);

export interface DonorEntityNode {
  label?: unknown;
  aliases?: unknown;
  industry?: unknown;
}

export function isOrganisationDonor(
  node: DonorEntityNode | null | undefined,
): boolean {
  if (!node || typeof node.label !== 'string' || !node.label.trim())
    return false;
  const names = [
    node.label,
    ...(Array.isArray(node.aliases) ? (node.aliases as unknown[]) : []),
  ].filter((n): n is string => typeof n === 'string');
  if (names.some((n) => ORGANISATION_WORD.test(n) || TRAILING_CO.test(n)))
    return true;
  // The label only: an alias acronym can be a person's initials.
  const label = node.label.trim();
  return ACRONYM.test(label) && !REGISTRATION_WORDS.has(label);
}
