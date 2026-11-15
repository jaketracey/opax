export interface GrantRecord {
  id: string; n?: string; v?: number; desc?: string; s?: string; fy?: string; ag?: string; pr?: string
  guid?: string; rid?: string; rn?: string; k?: string
}
export interface GrantDetail {
  id: string; n: string; k?: string; t: number; c: number; r?: number; ag?: string; y0?: string; y1?: string
  grants?: GrantRecord[]; more?: number; grants_total?: number
}
export interface AgencyDetail {
  id: string; name: string; total: number; count: number; supplier_count?: number
  suppliers: {id: string; name: string; total: number; count: number}[]
  contracts: {id: string; title?: string; supplier?: string; supplier_id?: string; amount?: number; start_date?: string; url?: string}[]
}
export interface TopicCounts {count: number; labelled: number; parties?: [string, number][]}
export interface TopicSpeech {slug: string; title?: string; speaker?: string; date?: string; url?: string; source_url?: string}

import {grantCoreBody as grantCore} from '../public/record-core-content.js'
import {nextStepsHTML, recipientNextSteps} from '../public/next-steps.js'
/**
 * A grant record's server body. A recipient's leads on, above its long list of awards, to its
 * programs (matched against the catalogue's `programs`), its agencies and its other jurisdiction
 * (public/next-steps.js); a program page has no such block.
 */
export function grantCoreBody(detail: GrantDetail, jur: string, canonical: string, program = false, dataPath?: string, recipientIds?: ReadonlySet<string>, programs: readonly unknown[] = []): string {
  const lead = program ? '' : nextStepsHTML(recipientNextSteps(detail, {jurisdiction: jur, programs,
    otherHref: other => `/money/grants/${encodeURIComponent(other)}/recipient/${encodeURIComponent(detail.id)}`,
    jurisdictionName: other => ({federal: 'Commonwealth', qld: 'Queensland'} as Record<string,string>)[other] || other}), {pageType: 'recipient', id: 'recipient-next'})
  return grantCore(detail, jur, canonical, program, dataPath, recipientIds, lead)
}

// The browser enhances these same tables in place after its existing data loads.
export {recipientMetaLine, grantSource, firstAgencySuppliers, agencyCoreBody, topicSummary, topicCoreBody} from '../public/record-core-content.js'
