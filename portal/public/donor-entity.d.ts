export interface DonorEntityNode { label?: string; aliases?: string[] | null; industry?: string | null }
export interface DonorPrivacyIndex { organisations: Set<string>; withheld: Set<string> }
export function isOrganisationDonor(node: DonorEntityNode | null | undefined): boolean;
export function withholdIndividualDonors<G extends { nodes: { id: string; label: string; kind: string; aliases?: string[] | null; industry?: string | null }[]; edges: { source: string; target: string }[] }>(graph: G, index?: DonorPrivacyIndex, ids?: Map<string, number>): G;
export function foldDonorName(name: unknown): string;
export function donorPrivacyIndex(graphs: { nodes: { label: string; kind: string; aliases?: string[] | null; industry?: string | null }[] }[]): DonorPrivacyIndex;
export function donorNameWithheld(index: DonorPrivacyIndex, name: string): boolean;
export const MONEY_GRAPHS: string[];
export interface WithheldPhrases { withheld: [string, string[]][] }
export function withheldPhrases(graphs: { nodes: { label: string; kind: string; aliases?: string[] | null; industry?: string | null }[] }[], officeHolders: string[], index?: DonorPrivacyIndex): WithheldPhrases;
export function namesWithheldPhrase(phrases: WithheldPhrases, ...texts: unknown[]): boolean;
