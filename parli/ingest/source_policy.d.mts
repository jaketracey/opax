export type SourceUse = 'documents_only' | 'search_only' | 'quote_and_cite' | 'full'
export type Capability = 'index' | 'quote' | 'narrative' | 'kb'
export type WithheldReason = 'publisher_request' | 'legal_order' | 'withdrawn' | 'amended_pending'
export interface WithheldEntry { reason: WithheldReason; date: string; label: string }
export interface SourceIds { sources?: string[]; documents?: string[] }
export interface SourcePolicy {
  use(source?: string | null, document?: string | null): SourceUse
  withheld(ids?: SourceIds): WithheldEntry | null
  can(capability: Capability, ids?: SourceIds): boolean
  summaries(ids?: SourceIds): boolean
  kbGeneration(source: string): boolean
  sourcesIn(value: unknown): string[]
  kbGenerationExcluded(value: unknown): boolean
  passageOnly(value: unknown): boolean
  listed(source: string): boolean
  withheldSources: string[]
  withheldDocuments: string[]
  kbGenerationClosed: string[]
  closedIds: string[]
  active: boolean
}
export const USES: SourceUse[]
export const CAPABILITIES: Record<SourceUse, Capability[]>
export const KB_GENERATION_NEVER: string[]
export const REASONS: WithheldReason[]
export const LABELS: Record<WithheldReason, string>
export const POLICY: SourcePolicy
export function allows(use: SourceUse, capability: Capability): boolean
export function sourcePolicy(data?: unknown): SourcePolicy
export function kbIds(resource: unknown): Required<SourceIds>
export function kbRefusal(resource: unknown, policy?: SourcePolicy): WithheldEntry | { label: string } | null
export function listingRow(commission: Record<string, unknown>, doc: Record<string, unknown>, entry: WithheldEntry): Record<string, unknown>
export function redactCommission<T extends Record<string, unknown>>(commission: T, policy?: SourcePolicy): T & Record<string, unknown>
