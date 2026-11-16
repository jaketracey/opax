/** Held divisions said beside a count (public/data/vote-coverage.json, written by parli/ingest/vic_divisions.py).
 *  A count of divisions or of a member's votes over a chamber and period with held divisions is not complete:
 *  the note states how many are held, when, and why, in the words the coverage page and member pages use. */
import { voteCoverageText, VOTE_COVERAGE_PATH, type VoteCoverageNote } from '../../public/vote-tables.js'
import { readToolAsset, type ToolEnv } from './types'

const fold = (name: unknown) => String(name ?? '').normalize('NFKD').replace(/[̀-ͯ'’‘ʼ`.]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export async function heldDivisionNotes(env: ToolEnv, scope: { jurisdiction?: string | null; chamber?: string | null;
  since?: string | null; until?: string | null; member?: string[] }): Promise<string[]> {
  let coverage: unknown
  try { coverage = await readToolAsset(env, VOTE_COVERAGE_PATH) } catch { return [] }
  const notes = (coverage as { notes?: VoteCoverageNote[] } | null)?.notes
  if (!Array.isArray(notes)) return []
  const names = scope.member ? new Set(scope.member.map(fold).filter(Boolean)) : null
  return notes.filter(note =>
    (!scope.chamber || note.house === scope.chamber) &&
    (!scope.jurisdiction || scope.jurisdiction === 'all' || note.jurisdiction === scope.jurisdiction) &&
    (!scope.since || String(note.to) >= scope.since) && (!scope.until || String(note.from) <= scope.until) &&
    (!names || (note.members ?? []).some(member => names.has(fold(member)))))
    .map(note => voteCoverageText(note, names ? 'this member’s' : 'members’')).filter(Boolean)
}
