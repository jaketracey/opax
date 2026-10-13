/** Shared selectors for published names, slugs and IDs; never free-text queries. */
export const TOOL_IDENTIFIER_MAX_LENGTH = 200
export function validToolIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > TOOL_IDENTIFIER_MAX_LENGTH) return false
  const normalized = value.normalize('NFKC')
  return normalized.length <= TOOL_IDENTIFIER_MAX_LENGTH && !!normalized.trim() &&
    /^[\p{L}\p{M}\p{N} ._'‘’()-]+$/u.test(normalized)
}
