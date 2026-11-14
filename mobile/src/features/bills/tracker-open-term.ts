/**
 * Stand-in for ad-learn-guide's `openTerm(termId)` (features/learn/open-term.ts),
 * with the same signature, until that lane's foundation commit is merged.
 * At the merge: delete this file and import `openTerm` from
 * '../learn/open-term' in tracker.tsx. The term ids are the guide's glossary
 * slugs (content/learn/glossary.json), so nothing else changes.
 */
export function openTerm(termId: string): void {
  void termId;
}
