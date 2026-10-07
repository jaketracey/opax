// Decision 3 / App Review 5.1.1. An ABN alone never proves an organisation:
// sole traders have ABNs. Source entity types override name heuristics.
export const unnamedRecipient = 'Individual recipient (not named in the app)';
export const unnamedSupplier = 'Individual supplier (not named in the app)';
const organisations = new Set([
  'company',
  'association',
  'trust',
  'partnership',
  'co-operative',
  'council',
  'government',
  'university',
  'health service',
  'super fund',
  'union',
  'organisation',
]);
const abrOrganisations = new Set([
  'PRV',
  'PUB',
  'OIE',
  'DIP',
  'FIP',
  'PTR',
  'TRT',
  'UIT',
  'DST',
  'SUP',
  'SGE',
  'LGE',
  'CGE',
  'COO',
  'NFP',
]);
const legalName =
  /\b(?:pty|limited|ltd|incorporated|inc|corporation|co-operative)\b/i;
const institution =
  /^(?:the )?(?:department|ministry|university|institute|council|association)\s+(?:of|for)\b|\b(?:regional|city|shire|district|town)\s+council\b|\b(?:guild|bank|church|college|school|society|museum|union)\s+of\b/i;
export function isOrganisation(
  name: string,
  kind?: string,
  abnType?: string,
  id?: string,
) {
  const k = kind?.trim().toLowerCase(),
    type = abnType?.trim().toUpperCase();
  if (
    id?.startsWith('person:') ||
    /^(individual|person|sole trader|sole proprietor)$/.test(k ?? '') ||
    /^(IND)$|\b(?:INDIVIDUAL|SOLE[ -]TRADER|SOLE[ -]PROPRIETOR)\b/.test(
      type ?? '',
    )
  )
    return false;
  if (type && abrOrganisations.has(type)) return true;
  if (k && organisations.has(k)) return true;
  // Unknown, other and undisclosed types never become proof by themselves.
  // Honour person-style names and trustee/sole-trader trading names first.
  if (
    /^(?:mr|mrs|ms|miss|dr|prof)\.?\s|\b(?:t\/?a|trading as|sole trader)\b/i.test(
      name,
    )
  )
    return false;
  return legalName.test(name) || institution.test(name);
}
export function publicRecipient(
  name: string,
  kind?: string,
  abnType?: string,
  id?: string,
) {
  const organisation = isOrganisation(name, kind, abnType, id);
  return { name: organisation ? name : unnamedRecipient, organisation };
}
