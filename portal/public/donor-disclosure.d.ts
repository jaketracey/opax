export interface DonorReturn { source_name?: string; return_type?: string; type?: string; year?: string | number; return_id?: string; transaction_id?: string; id?: string | number; url?: string; }
export interface DonorDisclosureRecord { kind?: string; total?: number; count?: number; firstYear?: number; lastYear?: number; industry?: string; source_note?: string; id?: string; jurisdiction?: string; label?: string; name?: string; n?: string; source_name?: string; aliases?: string[]; lookup_names?: string[]; returnReferences?: DonorReturn[]; match?: { confidence: number; method: string; href?: string | null; entity_id?: string; }; }
export function confidentDonorMatch(record: DonorDisclosureRecord): boolean;
export function returnReference(record: DonorReturn): string;
export function donorDisclosure(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): {name: string; href: string | null; reference: string; returns: DonorReturn[]};
export function donorLabelHTML(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): string;
export function donorDisplayText(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): string;
export function donorLookup(records: DonorDisclosureRecord[]): Map<string, DonorDisclosureRecord>;
