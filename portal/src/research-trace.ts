/** Installed only by scripts/research_local.mjs. No logging or public payload in deployed Workers. */
export function researchTrace(stage: string, detail: unknown): void {
  (globalThis as typeof globalThis & { __opaxResearchTrace?: (stage: string, detail: unknown) => void }).__opaxResearchTrace?.(stage, detail)
}
