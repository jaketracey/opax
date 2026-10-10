export interface DonorEntityNode { label?: string; aliases?: string[] | null; industry?: string | null }
export function isOrganisationDonor(node: DonorEntityNode | null | undefined): boolean;
