import type {GrantRecord, GrantDetail, AgencyDetail, TopicCounts, TopicSpeech} from '../src/seo-record-content.ts';
export function grantSource(jur: string, grant?: GrantRecord): string;
export function grantCoreBody(detail: GrantDetail, jur: string, canonical: string, program?: boolean, dataPath?: string, recipientIds?: ReadonlySet<string>): string;
export function firstAgencySuppliers(suppliers: AgencyDetail['suppliers']): AgencyDetail['suppliers'];
export function agencyCoreBody(profile: AgencyDetail, canonical: string, meta?: {source?: string; source_url?: string}): string;
export function topicSummary(name: string, counts: TopicCounts): string;
export function topicCoreBody(slug: string, counts: TopicCounts, speeches: TopicSpeech[], dataPath?: string): string;
export function kindLabel(k?: string): string;
export function recipientMetaLine(jur: string, k?: string): string;
