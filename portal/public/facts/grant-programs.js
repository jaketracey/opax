/** Exporter key format. A normalised ID is not a lookup: keys can be suffixed. */
export function programKey(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '')
}

/** Resolve the source identity before opening a file. Never truncate a lookup.
 * Exact source IDs win over keys; a case alias is accepted only if unambiguous.
 * Legacy catalogues without explicit keys may derive them from their full IDs.
 */
export function resolveProgram(programs, id) {
  if (typeof id !== 'string' || !id) return null
  const rows = programs || []
  const exact = rows.filter(p => p.id === id)
  if (exact.length) return exact.length === 1 ? exact[0] : null
  const keyed = rows.filter(p => (p.key || programKey(p.id)) === id)
  if (keyed.length) return keyed.length === 1 ? keyed[0] : null
  const aliases = rows.filter(p => p.id.toLowerCase() === id.toLowerCase())
  return aliases.length === 1 ? aliases[0] : null
}

export function resolveProgramId(programs, id) {
  return resolveProgram(programs, id)?.id ?? null
}
