// Same evidence ordering as the money-public recipient policy and the grants
// web classifier: individual kind/ABR type overrides legal-form name evidence.
const organisations = new Set(['company','association','trust','partnership','co-operative','council','government','university','health service','super fund','union','organisation']);
const abrOrganisations = new Set(['PRV','PUB','OIE','DIP','FIP','PTR','TRT','UIT','DST','SUP','SGE','LGE','CGE','COO','NFP','DTT','FUT','DIT','UIE','TGE','SGA','SMF','HYT','FPT','SCO','LGA','CGA','COP','LPT','PTT','PQT','FXT','CCN','STR','SCB','CCO','SSS','SGC','SCN','CUT']);
export function isOrganisationRecipient(recipient) {
  if (!recipient || [recipient.id,recipient.rid,recipient.recipientId,recipient.supplier_id].some(id => String(id || '').startsWith('person:'))) return false;
  const kinds = [recipient.k,recipient.kind,recipient.entityKind,recipient.entity_kind,recipient.recipientKind,recipient.recipient_kind,recipient.supplierKind,recipient.supplier_kind,recipient.identity?.kind].map(v => String(v || '').toLowerCase().replace(/_+/g,' ').trim());
  const types = [recipient.abr?.etype,recipient.abr?.type,recipient.abnType,recipient.abn_type,recipient.recipientABNType,recipient.supplierABNType,recipient.supplier_abn_type,recipient.identity?.type].map(v => String(v || '').trim().toUpperCase());
  if (kinds.some(v => /^(individual|person|people|sole[ -]trader|sole[ -]proprietor|undisclosed)$/.test(v)) || types.some(v => /^(IND)$|\b(?:INDIVIDUAL|SOLE[ -]TRADER|SOLE[ -]PROPRIETOR)\b/.test(v))) return false;
  if (kinds.some(v => organisations.has(v)) || types.some(v => abrOrganisations.has(v))) return true;
  const label = String(recipient.n ?? recipient.rn ?? recipient.recipient ?? recipient.name ?? recipient.label ?? '');
  if (/^(?:mr|mrs|ms|miss|dr|prof)\.?\s|\b(?:t\/?a|trading as|sole trader)\b/i.test(label)) return false;
  return /\b(?:pty|limited|ltd|incorporated|inc|corporation|co-operative)\b/i.test(label)
    || /^(?:the )?(?:department|ministry|university|institute|council|association)\s+(?:of|for)\b|\b(?:regional|city|shire|district|town)\s+council\b|\b(?:guild|bank|church|college|school|society|museum|union)\s+of\b/i.test(label);
}
