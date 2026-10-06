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
    row?.kind === 'speech' && row?.state === scope.state && row?.chamber === scope.chamber;
}

export function scopeFilter(scope) {
  return { and: [
    { prop: 'label', labelset: 'kind', label: 'speech' },
    { prop: 'label', labelset: 'state', label: scope.state },
    { prop: 'label', labelset: 'chamber', label: scope.chamber },
    ...['witness', 'chair', 'unknown'].map(label => ({ not: { prop: 'label', labelset: 'speaker_type', label } })),
  ] };
}

export function speakerHref(row, href) {
  return isUnattributed(row) ? `${href}?attribution=unattributed` : href;
}
