/** Witness markers always override a stale MP link or party. */
export function isWitness(row) {
  if (row?.speaker_type === 'multi_speaker') return false;
  return row?.speaker_type === 'witness' || Boolean(row?.witness_name) ||
    (row?.speaker_type !== 'chair' && /committee/.test(String(row?.chamber || '')) && row?.person_id == null);
}

export function isUnattributed(row) {
  return isWitness(row) || ['multi_speaker', 'chair', 'unknown', 'unattributed'].includes(row?.speaker_type) || row?.speaker_attribution === 'unattributed';
}

export const isMultiSpeaker = row => row?.speaker_type === 'multi_speaker' || row?.labels?.speaker_type === 'multi_speaker';

export function groupAvatarHTML() {
  return '<svg class="speech-group-avatar" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="20" cy="13" r="4"/><path d="M12 30v-3a8 8 0 0 1 16 0v3M9 10a3.5 3.5 0 0 0 0 7M5 29v-3a7 7 0 0 1 5-6M31 10a3.5 3.5 0 0 1 0 7M35 29v-3a7 7 0 0 0-5-6"/></g></svg>';
}

/** Display identity is separate from the collaborator/person facets. */
export function speakerLabel(row) {
  if (isMultiSpeaker(row)) return 'Several speakers';
  if (isWitness(row)) return row?.speaker || row?.witness_name || 'Committee witness';
  if (row?.speaker_type === 'chair') return row.chair_role || row.speaker || 'Chair';
  if (row?.speaker) return row.speaker;
  if (row?.speaker_type === 'member') return 'Parliamentarian';
  return row?.speaker_type == null || row.speaker_type === 'unattributed' ? 'Speaker not named' : 'Unknown speaker';
}

/** Only identities resolved by the parliamentary source may be displayed. */
export function resolvedParticipants(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap(p => {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || !/^\d+$/.test(String(p.person_id ?? '')) ||
        (p.speaker_type && !['member', 'chair'].includes(p.speaker_type))) return [];
    const roles = Array.isArray(p.chair_roles) ? p.chair_roles.filter(role => typeof role === 'string') : [];
    const role = typeof p.role === 'string' ? p.role : p.speaker_type === 'chair' ? roles.join(', ') || 'Chair' : '';
    const key = `${p.person_id}:${role}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{name: p.name.trim(), person_id: String(p.person_id), ...(role ? {role} : {})}];
  });
}

export function belongsToScope(row, scope) {
  return !isWitness(row) && !['chair', 'unknown', 'multi_speaker', 'unattributed'].includes(row?.speaker_type) &&
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
    ...['witness', 'chair', 'unknown', 'multi_speaker', 'unattributed'].map(label => ({ not: { prop: 'label', labelset: 'speaker_type', label } })),
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

/** A speech's party can be inferred only from unambiguous dated service in its house. */
export function datedAffiliationParty(row, person) {
  if (isUnattributed(row) || row?.kind !== 'speech' || !row.state || !row.chamber) return null;
  const date = typeof row.date === 'string' ? row.date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) return null;
  const scope = personScope(person);
  if (scope && !belongsToScope(row, scope)) return null;
  const affiliations = (person?.affiliations || []).filter(term =>
    term.jurisdiction === row.state && term.chamber === row.chamber && term.start &&
    term.start <= date && (!term.end || date <= term.end));
  if (!affiliations.length || affiliations.some(term => !term.party)) return null;
  const parties = [...new Set(affiliations.map(term => term.party))];
  return parties.length === 1 ? parties[0] : null;
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
