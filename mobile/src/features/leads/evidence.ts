import type { LeadEvidence } from '../../design/lead';

/** "Westpac Banking Corporation to Australian Labor Party": no party code. */
const withoutCode = (name: string) => name.replace(/\s*\([A-Z]{2,6}\)\s*$/, '');

/** An example record as a money row's parts, or null when its label wasn't read. */
export function evidenceRow(item: LeadEvidence) {
  if (!item.from || !item.to || !item.amount) return null;
  const amount = Number(item.amount.replace(/[$,]/g, ''));
  if (!Number.isFinite(amount)) return null;
  const name = `${withoutCode(item.from)} to ${withoutCode(item.to)}`;
  const detail = (item.detail ?? '')
    .replace(/^Contract value\b/, 'Contract')
    .replace(/\bstarts /, 'from ')
    .replace(/\bFY /, '');
  return { name, detail, amount };
}

/** A readable record with the original checked by leadEvidenceFor's source guard. */
export function evidenceRecord(item: LeadEvidence) {
  const row = evidenceRow(item);
  return row && item.url
    ? {
        ...row,
        original: {
          label: [item.register, item.record].filter(Boolean).join(' · '),
          url: item.url,
        },
      }
    : null;
}
