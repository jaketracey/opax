export const VIC_ELECTION_HUB_ENABLED: boolean;
export const VIC_ELECTION_PATH: string;
export const VIC_ELECTION_ASSET: string;
export const VIC_ELECTION_SITEMAP: string;
export function vicElectionEnabled(value?: string | null): boolean;
export function vicElectionAssetPath(path: string): boolean;
export function vicElectionPublicationPath(path: string): boolean;
export const vicElectionLlms: string;
export function vicElectionDiscovery(data: {pages:{path:string;lastmod:string}[]}, enabled?: boolean): Record<string,{path:string;lastmod:string}[]>;
