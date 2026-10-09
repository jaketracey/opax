/* Shared by crawl exclusions and related-record UI. Industry is never entity type. */
const fold = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
const INDIVIDUAL = /^(?:individuals?\b|person\b|natural person\b|sole trad(?:er|ing)\b|sole proprietor\b)/;
const ORGANISATION = /^(?:organi[sz]ation\b|company\b|corporation\b|association\b|union\b|trust\b|council\b|government\b|charity\b|partnership\b|incorporated\b)/;
const LEGAL_FORM = /\b(?:pty\.?\s+ltd\.?|proprietary limited|ltd\.?|limited|inc\.?|incorporated|association|union|trust|council|corporation|plc|llc)\s*$/i;
export function isOrganisationDonor(record = {}) {
  const types = [record.donor_type,record.entity_type,record.entity_kind,record.type,record.kind].map(fold).filter(Boolean);
  // A sole trader can hold an ABN. Explicit individual status always wins.
  if (types.some(t=>INDIVIDUAL.test(t))) return false;
  if (types.some(t=>ORGANISATION.test(t))) return true;
  if (/^\d{11}$/.test(String(record.abn || '').replace(/\s/g,'')) || /^\d{9}$/.test(String(record.acn || '').replace(/\s/g,''))) return true;
  return LEGAL_FORM.test(String(record.label || record.name || record.organisation || '').trim());
}
