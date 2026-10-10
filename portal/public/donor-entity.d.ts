export interface DonorEntityNode { label?: string; aliases?: string[] | null; industry?: string | null }
export interface DonorPrivacyIndex { organisations: Set<string>; withheld: Set<string> }
export function isOrganisationDonor(node: DonorEntityNode | null | undefined): boolean;
export function withholdIndividualDonors<G extends { nodes: { id: string; label: string; kind: string; aliases?: string[] | null; industry?: string | null }[]; edges: { source: string; target: string }[] }>(graph: G): G;
export function foldDonorName(name: unknown): string;
export function donorPrivacyIndex(graphs: { nodes: { label: string; kind: string; aliases?: string[] | null; industry?: string | null }[] }[]): DonorPrivacyIndex;
export function donorNameWithheld(index: DonorPrivacyIndex, name: string): boolean;
export const MONEY_GRAPHS: string[];
