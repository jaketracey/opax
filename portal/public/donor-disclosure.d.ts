export interface DonorReturn { source_name?: string; return_type?: string; type?: string; year?: string | number; return_id?: string; transaction_id?: string; id?: string | number; url?: string; }
export interface DonorDisclosureRecord { kind?: string; total?: number; count?: number; firstYear?: number; lastYear?: number; industry?: string; source_note?: string; id?: string; jurisdiction?: string; label?: string; name?: string; n?: string; source_name?: string; aliases?: string[]; lookup_names?: string[]; returnReferences?: DonorReturn[]; match?: { confidence: number; method: string; href?: string | null; entity_id?: string; }; associatedTag?: string; associatedWith?: { party: string; registerParties: string[]; firstYear?: string | null; lastYear?: string | null; source?: string; url?: string }[]; }
export function confidentDonorMatch(record: DonorDisclosureRecord): boolean;
export function returnReference(record: DonorReturn): string;
export function donorDisclosure(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): {name: string; href: string | null; reference: string; returns: DonorReturn[]; associated?: string; associatedUrl?: string};
export function donorAssociated(record: DonorDisclosureRecord | string | null | undefined): {associated?: string; associatedUrl?: string};
export function donorAssociatedTo(record: DonorDisclosureRecord | null | undefined, party: string): string | undefined;
export function donorPageHref(record: DonorDisclosureRecord | null | undefined, name?: string): string | null;
export function donorLabelHTML(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): string;
export function donorDisplayText(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): string;
export function donorLookup(records: DonorDisclosureRecord[]): Map<string, DonorDisclosureRecord>;
export interface ReceiptCells {total?:number;count?:number;firstYear?:number|null;lastYear?:number|null;byYear?:Record<string,unknown>;undated?:[number,number];by_type?:Record<string,number>;by_type_year?:Record<string,Record<string,[number,number]>>}
export interface ReceiptFigures {total:number;count:number;firstYear:number|null;lastYear:number|null;byYear:Record<string,number>;cells:Record<string,[number,number]>;undated:[number,number];byType:Record<string,number>|null;typed:boolean}
export function receiptFigures(x: ReceiptCells | null | undefined): ReceiptFigures;
export function receiptScopeLabel(figures: ReceiptFigures): string;
export interface ReceiptGraphLike {nodes?: unknown[]; edges: unknown[]; receiptMeasure?: boolean}
/** The graph with every donor-to-party edge and donor node read through receiptFigures (same shape, typed figures). */
export function receiptGraph<G extends ReceiptGraphLike | null | undefined>(graph: G): G;
/** The scope line for a receiptGraph's donor figures; empty for a graph without typed cells. */
export function receiptGraphScope(graph: ReceiptGraphLike | null | undefined, keep?: (edge: any) => boolean): string;
