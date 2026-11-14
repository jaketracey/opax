export interface DonorReturn { source_name?: string; return_type?: string; type?: string; year?: string | number; return_id?: string; transaction_id?: string; id?: string | number; url?: string; }
export interface DonorDisclosureRecord extends ReceiptCells { kind?: string; total?: number; count?: number; firstYear?: number; lastYear?: number; industry?: string; source_note?: string; id?: string; jurisdiction?: string; label?: string; name?: string; n?: string; source_name?: string; aliases?: string[]; lookup_names?: string[]; returnReferences?: DonorReturn[]; match?: { confidence: number; method: string; href?: string | null; entity_id?: string; }; associatedTag?: string; associatedWith?: { party: string; registerParties: string[]; firstYear?: string | null; lastYear?: string | null; source?: string; url?: string }[]; }
export function confidentDonorMatch(record: DonorDisclosureRecord): boolean;
export function returnReference(record: DonorReturn): string;
export function donorDisclosure(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): {name: string; href: string | null; reference: string; returns: DonorReturn[]; associated?: string; associatedUrl?: string};
export function donorAssociated(record: DonorDisclosureRecord | string | null | undefined): {associated?: string; associatedUrl?: string};
export function donorAssociatedTo(record: DonorDisclosureRecord | null | undefined, party: string): string | undefined;
export function donorPageHref(record: DonorDisclosureRecord | null | undefined, name?: string): string | null;
export function donorLabelHTML(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): string;
export function donorDisplayText(record: DonorDisclosureRecord | string, fallback?: DonorReturn & {returnReferences?: DonorReturn[]}): string;
export function donorLookup(records: DonorDisclosureRecord[]): Map<string, DonorDisclosureRecord>;
export interface ReceiptCells {total?:number;count?:number;firstYear?:number|null;lastYear?:number|null;byYear?:Record<string,unknown>;undated?:[number,number];by_type?:Record<string,number>;by_type_year?:Record<string,Record<string,[number,number]>>;donation_exclusions?:ReceiptCells}
export interface ReceiptFigures {total:number;count:number;firstYear:number|null;lastYear:number|null;byYear:Record<string,number>;cells:Record<string,[number,number]>;undated:[number,number];byType:Record<string,number>|null;typed:boolean;typeCells:Record<string,Record<string,[number,number]>>|null;typeCounts:Record<string,number>|null;publicFunding:[number,number];publicFundingCells:Record<string,[number,number]>}
export function receiptFigures(x: ReceiptCells | null | undefined): ReceiptFigures;
export function receiptScopeLabel(figures: Pick<ReceiptFigures,'typed'|'firstYear'|'lastYear'>, measure?: 'all_types' | 'donation_only'): string;
/** Whether the parties' own returns list any receipt for a donor or flow; true for a record without typed cells. */
export function receiptTypeLine(record: ReceiptCells | null | undefined): string;
export function hasPartyReceipts(x: ReceiptCells | null | undefined): boolean;
export const DONOR_DECLARED_ONLY: string;
export const PUBLIC_FUNDING_ONLY: string;
export function notListedLine(x: ReceiptCells | null | undefined): string;
export const DONATION_TYPE: 'donation_received';
export const PUBLIC_FUNDING_TYPE: 'public_funding';
/** [dollars, receipts] for each part of a typed flow in a financial-year window. */
export interface ReceiptSplit {donations:[number,number];other:[number,number];subscriptions:[number,number];untyped:[number,number];all:[number,number];publicFunding:[number,number];returned?:[number,number];otherYears:[number|null,number|null]}
/** A typed flow split by AEC receipt type in a window of FY starting years; null without typed cells. */
export function receiptSplit(x: (ReceiptCells & {typeCells?: ReceiptFigures['typeCells']}) | null | undefined, from?: number | null, to?: number | null): ReceiptSplit | null;
/** The labelled line for a source's receipts the AEC does not class as donations; empty when there are none. */
export function otherReceiptsLine(name: string, party: string, split: ReceiptSplit | null, options?: {also?: boolean; period?: string}): string;
/** The labelled line for Public Funding on a party's return. */
/** "Labor's returns", "Greens' returns". */
export function partyReturns(party: string): string;
export function publicFundingLine(source: string, party: string, amount: number, period?: string): string;
/** A typed record whose only receipts are Public Funding. */
export function publicFundingOnly(x: ReceiptCells | null | undefined): boolean;
/** A financial year from its first year: 2020 is "2020-21". */
export function financialYear(year: number): string;
export interface ReceiptGraphLike {nodes?: unknown[]; edges: unknown[]; receiptMeasure?: boolean}
/** The graph with every donor-to-party edge and donor node read through receiptFigures (same shape, typed figures). */
export function receiptGraph<G extends ReceiptGraphLike | null | undefined>(graph: G): G;
/** The scope line for a receiptGraph's donor figures; empty for a graph without typed cells. */
export function receiptGraphScope(graph: ReceiptGraphLike | null | undefined, keep?: (edge: any) => boolean): string;
