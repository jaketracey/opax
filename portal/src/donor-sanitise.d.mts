export interface DonorRegistry { names: Record<string,{id:string;label:string;exempt?:boolean}>; ids: Record<string,{id:string;label:string}>; phrases: {hash:string;words:number;first?:string;replacement?:string}[] }
export function withholdDonorText(value:string, registry:DonorRegistry, donor?:boolean):string;
export function withholdStoredDonors<T>(value:T, registry:DonorRegistry):T;
