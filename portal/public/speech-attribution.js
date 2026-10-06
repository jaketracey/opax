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
    (!scope.speakers || scope.speakers.some(name => nameKey(name) === nameKey(row?.speaker))) &&
    (!scope.service || scope.service.some(t => typeof row?.date === 'string' &&
      t.start <= row.date.slice(0, 10) && row.date.slice(0, 10) <= t.end));
}

export function scopeFilter(scope) {
  return { and: [
    { prop: 'label', labelset: 'kind', label: 'speech' },
    { prop: 'label', labelset: 'state', label: scope.state },
    { prop: 'label', labelset: 'chamber', label: scope.chamber },
    ...(scope.speakers ? [{ or: scope.speakers.map(collaborator => ({ prop: 'origin_collaborator', collaborator })) }] : []),
    ...(scope.service ? [{ or: scope.service.map(t => ({ prop: 'created',
      since: `${t.start}T00:00:00Z`, until: `${t.end}T23:59:59Z` })) }] : []),
    ...['witness', 'chair', 'unknown'].map(label => ({ not: { prop: 'label', labelset: 'speaker_type', label } })),
  ] };
}

const nameKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Reviewed KB spelling; the roster identity remains Craig Crawford. */
export function splitSpeakers(person) {
  if (!person?.speech_scope || !person.full) return [];
  return [...new Set([person.full === 'Craig Crawford' ? 'Cd Crawford' : person.full, person.full, person.name])];
}

/** Only reviewed split identities acquire these aliases; ambiguous matches fail closed. */
export function splitPerson(people, name) {
  const matches = people.filter(p => splitSpeakers(p).some(n => nameKey(n) === nameKey(name)));
  return matches.length === 1 ? matches[0] : null;
}

export function personScope(person) {
  if (!person?.speech_scope) return null;
  const speakers = splitSpeakers(person);
  return { ...person.speech_scope, ...(speakers.length ? { speakers } : {}) };
}

/** Replace the requested print's exact collaborator clause before adding its scope. */
export function scopedCollaborators(filter, scope) {
  if (!scope?.speakers || !filter || typeof filter !== 'object') return filter;
  if (filter.prop === 'origin_collaborator') {
    return { or: scope.speakers.map(collaborator => ({ prop: 'origin_collaborator', collaborator })) };
  }
  if (Array.isArray(filter)) return filter.map(f => scopedCollaborators(f, scope));
  return Object.fromEntries(Object.entries(filter).map(([key, value]) => [key, scopedCollaborators(value, scope)]));
}

export function speakerHref(row, href) {
  return isUnattributed(row) ? `${href}?attribution=unattributed` : href;
}
