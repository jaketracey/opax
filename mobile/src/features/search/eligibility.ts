import type { Roster } from '../../api/catalog-decoders';
import { nameKey } from '../../api/ids';
import type { SearchRecord, SearchSummary } from './decoders';
import { invalid } from '../../api/validation';

// programRecord() emits this stable slug and canonical program href. Recipient
// and award rows have no legal-entity flag: fail closed rather than guess names.
export function isGrantProgram(
  row: Pick<SearchRecord, 'kind' | 'slug' | 'href' | 'source'>,
) {
  if (
    row.kind !== 'grant' ||
    !/^grant-program-(federal|qld)-[a-z0-9-]+$/.test(row.slug) ||
    row.source !== 'Grant program profile' ||
    !row.href
  )
    return false;
  const [path, query] = row.href.split('?');
  const p = new URLSearchParams(query);
  const programKey = (p.get('program') ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return (
    path === '/money/grants' &&
    ['federal', 'qld'].includes(p.get('jur') ?? '') &&
    !!p.get('program') &&
    row.slug === `grant-program-${p.get('jur')}-${programKey}` &&
    p.getAll('jur').length === 1 &&
    p.getAll('program').length === 1 &&
    [...p.keys()].every((k) => ['jur', 'program'].includes(k))
  );
}
export function eligibleRecord(row: SearchRecord, roster: Roster) {
  if (row.kind === 'grant') return isGrantProgram(row);
  if (row.kind === 'party') return !!row.href?.startsWith('/subject/party/');
  if (row.kind === 'agency') return !!row.href?.startsWith('/subject/agency/');
  if (row.kind === 'bill') return !!row.href?.match(/^\/bill\/[a-z0-9-]+$/);
  if (row.kind === 'report') return !!row.href?.startsWith('/reports/');
  if (row.href && !/^\/(?:doc|bill)\//.test(row.href)) return false;
  if (
    [
      'division',
      'bill_text',
      'legal',
      'grant_invitation',
      'grant_award',
      'election_baseline',
      'research_report',
    ].includes(row.kind)
  )
    return true;
  if (['speech', 'press_release', 'parliamentary_profile'].includes(row.kind)) {
    return (
      row.speaker_type !== 'witness' &&
      (!row.speaker
        ? row.kind !== 'speech' && row.kind !== 'parliamentary_profile'
        : roster.people.some((p) => nameKey(p.name) === nameKey(row.speaker!)))
    );
  }
  return false;
}
export function eligibleSummary(summary: SearchSummary, roster: Roster) {
  // Reject a whole overview if any citation is outside the app's evidence
  // scope. Removing individual points would misrepresent what was reviewed.
  if (
    summary.sources.some(
      (s) => !eligibleRecord({ ...s, slug: '', resource: '' }, roster),
    )
  )
    invalid(
      'This summary includes sources unavailable in the app. Open the matching records instead.',
    );
  return summary;
}
