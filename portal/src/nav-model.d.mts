export interface NavCrumb { label: string; href?: string }
export function trail(address: string, ...records: Array<string | NavCrumb>): NavCrumb[];
export function pageTrail(address: string, record?: string, options?: { donorNamed?: boolean }): NavCrumb[];
export function navGates(env: { VIC_ELECTION_HUB_ENABLED?: string }): string;
