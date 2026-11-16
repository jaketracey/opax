// The source policy in the enrichment Worker (parli/ingest/source_policy.json, one loader in
// parli/ingest/source_policy.mjs). A resource that is withheld, or whose source is not quotable, is never
// summarised or labelled: discovery does not queue it, and every read through policyKb sees it as absent, so
// no caller can put its text in a prompt or write a brief or topic back to it.
import { POLICY, kbRefusal, type SourcePolicy } from '../../parli/ingest/source_policy.mjs'
import type { KbApi, KbResource } from './kb.ts'

export { POLICY }
export type { SourcePolicy }

/** True when this resource's text may not be sent to a model. Reads its slug and source label. */
export const closedResource = (resource: Pick<KbResource, 'slug' | 'usermetadata'> | null | undefined, policy: SourcePolicy = POLICY): boolean =>
  !!resource && kbRefusal(resource, policy) !== null

export class SourceWithheld extends Error {
  constructor(rid: string) {
    super(`source policy: ${rid.slice(0, 8)} is withheld or not quotable; nothing is written to it`)
    this.name = 'SourceWithheld'
  }
}

/** The knowledge box as the policy allows it to be seen. */
export function policyKb<T extends KbApi>(kb: T, policy: SourcePolicy = POLICY): T {
  if (!policy.active) return kb
  const closed = new Set<string>(), open = new Set<string>()
  const seen = <T extends KbResource | null>(rid: string, resource: T): T | null => {
    if (!resource) return resource
    if (closedResource(resource, policy)) { closed.add(rid); open.delete(rid); return null }
    open.add(rid)
    return resource
  }
  const writable = async (rid: string): Promise<void> => {
    if (closed.has(rid)) throw new SourceWithheld(rid)
    // A resource not read through this client is checked once before anything is written to it.
    if (!open.has(rid) && !seen(rid, await kb.getBasic(rid)) && closed.has(rid)) throw new SourceWithheld(rid)
  }
  const guarded: KbApi = {
    getResource: async (rid, timeoutMs) => seen(rid, await kb.getResource(rid, timeoutMs)),
    getBasic: async (rid, timeoutMs) => seen(rid, await kb.getBasic(rid, timeoutMs)),
    getEverything: async (rid) => {
      const all = await kb.getEverything(rid)
      return all && closedResource(all as KbResource, policy) ? null : all
    },
    getSummaryBody: async (rid) => closed.has(rid) ? '' : kb.getSummaryBody(rid),
    patchSummary: async (rid, body) => { await writable(rid); await kb.patchSummary(rid, body) },
    patchClassifications: async (rid, classifications) => { await writable(rid); await kb.patchClassifications(rid, classifications) },
    catalog: (kind, sinceIso, page, pageSize, untilIso, timeoutMs) => kb.catalog(kind, sinceIso, page, pageSize, untilIso, timeoutMs),
  }
  // Anything else the client offers (the admin slug lookup) is kept, with the same check on what it returns.
  const bySlug = (kb as { getBySlug?: (slug: string) => Promise<KbResource | null> }).getBySlug
  const extra = bySlug ? { getBySlug: async (slug: string) => { const r = await bySlug.call(kb, slug); return r && closedResource({ ...r, slug: r.slug ?? slug }, policy) ? null : r } } : {}
  return Object.assign(Object.create(kb), guarded, extra) as T
}
