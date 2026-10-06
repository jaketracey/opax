/** Witness markers always override a stale MP link or party. */
export function isWitness(row) {
  return row?.speaker_type === 'witness' || Boolean(row?.witness_name) ||
    (/committee/.test(String(row?.chamber || '')) && row?.person_id == null);
}

export function isUnattributed(row) {
  return isWitness(row) || row?.speaker_attribution === 'unattributed';
}

export function belongsToScope(row, scope) {
  return !isWitness(row) && !['chair', 'unknown'].includes(row?.speaker_type) &&
    row?.kind === 'speech' && row?.state === scope.state && row?.chamber === scope.chamber &&
    (!scope.service || scope.service.some(t => typeof row?.date === 'string' &&
      t.start <= row.date.slice(0, 10) && row.date.slice(0, 10) <= t.end));
}

export function scopeFilter(scope) {
  return { and: [
    { prop: 'label', labelset: 'kind', label: 'speech' },
    { prop: 'label', labelset: 'state', label: scope.state },
    { prop: 'label', labelset: 'chamber', label: scope.chamber },
    ...(scope.service ? [{ or: scope.service.map(t => ({ prop: 'created',
      since: `${t.start}T00:00:00Z`, until: `${t.end}T23:59:59Z` })) }] : []),
    ...['witness', 'chair', 'unknown'].map(label => ({ not: { prop: 'label', labelset: 'speaker_type', label } })),
  ] };
}

export function speakerHref(row, href) {
  return isUnattributed(row) ? `${href}?attribution=unattributed` : href;
}
