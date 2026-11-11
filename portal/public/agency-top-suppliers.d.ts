export type AgencyTopRow = {id: string; name: string; total: number};
export const AGENCY_TOP_SUPPLIERS_PATH: string;
export function agencyTopRows(suppliers: readonly AgencyTopRow[] | null | undefined): AgencyTopRow[];
