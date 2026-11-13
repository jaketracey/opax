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


// The browser enhances these same tables in place after its existing data loads.
export {grantCoreBody, recipientMetaLine, grantSource, firstAgencySuppliers, agencyCoreBody, topicSummary, topicCoreBody} from '../public/record-core-content.js'
