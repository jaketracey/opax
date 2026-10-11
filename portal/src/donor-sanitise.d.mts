export interface DonorRegistry { names: Record<string,{id:string;label:string;exempt?:boolean}>; ids: Record<string,{id:string;label:string}>; phrases: {hash:string;words:number;first?:string;replacement?:string}[] }
export function withholdDonorText(value:string, registry:DonorRegistry, donor?:boolean):string;
export function withholdStoredDonors<T>(value:T, registry:DonorRegistry):T;
export function recordReferenceField(key:string):boolean;
export function nameLookupField(key:string):boolean;
export function publicLookupEntities(value:unknown):Map<string,{label?:string;name?:string}>;
export function rebuildPublicLookup<T extends object>(value:T, registry:DonorRegistry, entities?:Map<string,{label?:string;name?:string}>):T;
