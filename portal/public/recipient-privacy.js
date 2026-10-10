// Mirrors features/money-public/privacy.ts: type evidence precedes names.
const organisations = new Set(['company', 'association', 'trust', 'partnership', 'co-operative', 'council', 'government', 'university', 'health service', 'super fund', 'union', 'organisation']);
const abrOrganisations = new Set(['PRV', 'PUB', 'OIE', 'DIP', 'FIP', 'PTR', 'TRT', 'UIT', 'DST', 'SUP', 'SGE', 'LGE', 'CGE', 'COO', 'NFP']);
const legalName = /\b(?:pty|limited|ltd|incorporated|inc|corporation|co-operative)\b/i;
const institution = /^(?:the )?(?:department|ministry|university|institute|council|association)\s+(?:of|for)\b|\b(?:regional|city|shire|district|town)\s+council\b|\b(?:guild|bank|church|college|school|society|museum|union)\s+of\b/i;
const foldKind = value => String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim();

export function isOrganisationRecipient(recipient) {
  if (!recipient || [recipient.id, recipient.rid, recipient.recipientId].some(id => String(id || '').startsWith('person:'))) return false;
  const kinds = [recipient.k, recipient.kind, recipient.entityKind, recipient.entity_kind, recipient.recipientKind].map(foldKind);
  const types = [recipient.abr?.etype, recipient.abr?.type, recipient.abnType, recipient.abn_type, recipient.recipientABNType].map(value => String(value || '').trim().toUpperCase());
  if (kinds.some(k => /^(individual|person|people|sole trader|sole proprietor)$/.test(k)) || types.some(type => /^(IND)$|\b(?:INDIVIDUAL|SOLE[ -]TRADER|SOLE[ -]PROPRIETOR)\b/.test(type))) return false;
  if (types.some(type => abrOrganisations.has(type)) || kinds.some(k => organisations.has(k))) return true;
  const name = String(recipient.n ?? recipient.rn ?? recipient.recipient ?? recipient.label ?? '');
  if (/^(?:mr|mrs|ms|miss|dr|prof)\.?\s|\b(?:t\/?a|trading as|sole trader)\b/i.test(name)) return false;
  return legalName.test(name) || institution.test(name);
}
